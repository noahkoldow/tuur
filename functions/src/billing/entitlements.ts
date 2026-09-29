import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_PRODUCTS,
  EntitlementSchema,
  MAX_INVITES_PER_TOUR,
  REWARDED_DAILY_LIMIT_DEFAULT,
  RevenueCatEventSchema,
  SESSION_DURATION_MS,
  decideAccess,
  decideInvite,
  decideRedeem,
  decideReward,
  decideSpend,
  isSubscriber,
  planRevenueCatEvent,
  type AccessContext,
  type Entitlement,
  type InviteDoc,
  type ProductMap,
  type Wallet,
} from '@tuur/shared';
import { z } from 'zod';
import { dayKey } from '../util/usage';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';

export class BillingError extends Error {
  constructor(
    readonly code:
      | 'permission-denied'
      | 'failed-precondition'
      | 'not-found'
      | 'invalid-argument'
      | 'resource-exhausted'
      | 'already-exists',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface BillingDeps {
  db: Firestore;
  now: () => number;
}

const ents = (db: Firestore, uid: string) => db.collection('users').doc(uid).collection('entitlements');
const walletRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('credits').doc('wallet');
const ledger = (db: Firestore, uid: string) => db.collection('users').doc(uid).collection('creditLedger');

export async function loadEntitlements(db: Firestore, uid: string): Promise<Entitlement[]> {
  const snap = await ents(db, uid).get();
  return snap.docs.flatMap((d) => {
    const p = EntitlementSchema.safeParse(d.data());
    return p.success ? [p.data] : [];
  });
}

export async function loadBillingConfig(
  db: Firestore,
): Promise<{ products: ProductMap; rewardedPerDay: number }> {
  const snap = await db.collection('config').doc('billing').get();
  const data = snap.data() as { products?: ProductMap; rewardedPerDay?: number } | undefined;
  return {
    products: { ...DEFAULT_PRODUCTS, ...(data?.products ?? {}) },
    rewardedPerDay: data?.rewardedPerDay ?? REWARDED_DAILY_LIMIT_DEFAULT,
  };
}

async function readEntitlements(tx: Transaction, db: Firestore, uid: string): Promise<Entitlement[]> {
  const snap = await tx.get(ents(db, uid));
  return snap.docs.flatMap((d) => {
    const p = EntitlementSchema.safeParse(d.data());
    return p.success ? [p.data] : [];
  });
}

const readWallet = async (tx: Transaction, db: Firestore, uid: string): Promise<Wallet> => {
  const s = await tx.get(walletRef(db, uid));
  return { balance: Number(s.get('balance') ?? 0), rewardBalance: Number(s.get('rewardBalance') ?? 0) };
};

// ---------------------------------------------------------------------------------------------------------------
// Access check used before any content is generated or served.

export interface AccessRequest {
  tourId?: string | undefined;
  mode?: 'tour' | 'planned' | 'fork' | 'roam' | undefined;
  /** POIs the request concerns; they must belong to the tour when a tour context is claimed. */
  poiIds: string[];
  /** Tile of the first POI, used to derive the place for dynamic sessions server-side. */
  tile?: string | undefined;
}

export async function authorizeContent(
  deps: BillingDeps,
  uid: string,
  req: AccessRequest,
): Promise<{ reason: string }> {
  const { db } = deps;
  const now = deps.now();
  const all = await loadEntitlements(db, uid);
  const ctx: AccessContext = {};
  if (req.mode && req.mode !== 'tour') {
    ctx.mode = req.mode;
    const area = req.tile ? await db.collection('areas').doc(req.tile).get() : undefined;
    const placeId = area?.get('placeId') as string | undefined;
    if (placeId) ctx.placeId = placeId;
  } else if (req.tourId) {
    const tour = await db.collection('tours').doc(req.tourId).get();
    const stops = (tour.get('stops') as { poiId: string }[] | undefined) ?? [];
    if (!tour.exists || tour.get('locked') === true)
      throw new BillingError('not-found', 'Tour not available');
    // A tour context only counts for the tour's own stops (no free riding on a free or bought tour id).
    if (!req.poiIds.every((id) => stops.some((s) => s.poiId === id)))
      throw new BillingError('permission-denied', 'Stop is not part of this tour');
    ctx.tourId = req.tourId;
    ctx.tourFree = tour.get('free') === true;
    ctx.mode = 'tour';
  }
  const d = decideAccess(all, ctx, now);
  if (!d.allowed) throw new BillingError('permission-denied', 'Content is locked', { reason: d.reason });
  return { reason: d.reason };
}

// ---------------------------------------------------------------------------------------------------------------
// Credits

export const SpendRequestSchema = z.object({
  kind: z.enum(['tour', 'session']),
  tourId: z.string().max(200).optional(),
  placeId: z.string().max(200).optional(),
});

export async function spendCredit(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<{ used: 'reward' | 'paid'; wallet: Wallet; entitlementId: string }> {
  const parsed = SpendRequestSchema.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid request');
  const { kind, tourId, placeId } = parsed.data;
  if (kind === 'tour' && !tourId) throw new BillingError('invalid-argument', 'tourId required');
  if (kind === 'session' && !placeId) throw new BillingError('invalid-argument', 'placeId required');
  const { db } = deps;
  if (kind === 'tour') {
    const t = await db.collection('tours').doc(tourId!).get();
    if (!t.exists || t.get('locked') === true) throw new BillingError('not-found', 'Tour not available');
    if (t.get('free') === true)
      throw new BillingError('failed-precondition', 'This tour is free', { reason: 'free' });
  } else {
    const p = await db.collection('places').doc(placeId!).get();
    if (!p.exists) throw new BillingError('not-found', 'Place not found');
  }
  const entId = kind === 'tour' ? `tour_${tourId}` : `session_${placeId}`;
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const all = await readEntitlements(tx, db, uid);
    const wallet = await readWallet(tx, db, uid);
    const alreadyUnlocked =
      kind === 'tour'
        ? all.some(
            (e) => e.type === 'tour' && e.tourId === tourId && (e.expiresAt === null || e.expiresAt > now),
          )
        : all.some((e) => e.type === 'session' && e.placeId === placeId && e.expiresAt > now);
    const d = decideSpend(wallet, kind, alreadyUnlocked, isSubscriber(all, now));
    if (!d.ok)
      throw new BillingError(
        d.reason === 'insufficient' ? 'failed-precondition' : 'already-exists',
        `Cannot spend credit: ${d.reason}`,
        { reason: d.reason },
      );
    tx.set(walletRef(db, uid), d.wallet);
    tx.set(
      ents(db, uid).doc(entId),
      kind === 'tour'
        ? {
            type: 'tour',
            tourId,
            source: d.use === 'reward' ? 'reward' : 'credit',
            grantedAt: now,
            expiresAt: null,
          }
        : {
            type: 'session',
            placeId,
            source: 'credit',
            grantedAt: now,
            expiresAt: now + SESSION_DURATION_MS,
          },
    );
    tx.set(ledger(db, uid).doc(), {
      delta: -1,
      kind,
      ref: kind === 'tour' ? tourId : placeId,
      use: d.use,
      ts: now,
    });
    return { used: d.use, wallet: d.wallet, entitlementId: entId };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Invites (max 2 per bought tour, single-use tokens bound to the tour)

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const INVITE_TTL_MS = 30 * 24 * 3600_000;

export async function createInvite(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<{ token: string; remaining: number; expiresAt: number }> {
  const parsed = z.object({ tourId: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid request');
  const { tourId } = parsed.data;
  const { db } = deps;
  try {
    await consumeRateLimit(db, `invite_${uid}`, 10, 24 * 3600_000, deps.now());
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new BillingError('resource-exhausted', 'Too many invites', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const token = randomBytes(24).toString('base64url');
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const all = await readEntitlements(tx, db, uid);
    const existing = await tx.get(
      db.collection('invites').where('ownerUid', '==', uid).where('tourId', '==', tourId),
    );
    const d = decideInvite(all, tourId, existing.size);
    if (!d.ok)
      throw new BillingError('failed-precondition', `Cannot invite: ${d.reason}`, {
        reason: d.reason,
        max: MAX_INVITES_PER_TOUR,
      });
    const doc: InviteDoc = { tourId, ownerUid: uid, createdAt: now, expiresAt: now + INVITE_TTL_MS };
    tx.set(db.collection('invites').doc(hashToken(token)), doc);
    return { token, remaining: d.remaining, expiresAt: doc.expiresAt };
  });
}

export async function redeemInvite(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<{ tourId: string }> {
  const parsed = z.object({ token: z.string().min(16).max(128) }).safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid token');
  const { db } = deps;
  try {
    await consumeRateLimit(db, `redeem_${uid}`, 20, 3600_000, deps.now());
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new BillingError('resource-exhausted', 'Too many attempts', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
  const ref = db.collection('invites').doc(hashToken(parsed.data.token));
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const snap = await tx.get(ref);
    const invite = snap.exists ? (snap.data() as InviteDoc) : undefined;
    const all = await readEntitlements(tx, db, uid);
    const unlocked = invite
      ? all.some(
          (e) =>
            e.type === 'tour' && e.tourId === invite.tourId && (e.expiresAt === null || e.expiresAt > now),
        ) || isSubscriber(all, now)
      : false;
    const d = decideRedeem(invite, uid, unlocked, now);
    if (!d.ok)
      throw new BillingError(
        d.reason === 'not_found' ? 'not-found' : 'failed-precondition',
        `Invite invalid: ${d.reason}`,
        { reason: d.reason },
      );
    tx.update(ref, { redeemedBy: uid, redeemedAt: now });
    tx.set(ents(db, uid).doc(`tour_${invite!.tourId}`), {
      type: 'tour',
      tourId: invite!.tourId,
      source: 'invite',
      grantedAt: now,
      expiresAt: null,
      inviteFrom: invite!.ownerUid,
    });
    return { tourId: invite!.tourId };
  });
}

/** Public preview for the landing page / app before signing in (no personal data). */
export async function previewInvite(
  deps: BillingDeps,
  token: string,
): Promise<{ valid: boolean; tourTitle?: string; placeName?: string }> {
  if (token.length < 16 || token.length > 128) return { valid: false };
  const snap = await deps.db.collection('invites').doc(hashToken(token)).get();
  if (!snap.exists) return { valid: false };
  const invite = snap.data() as InviteDoc;
  if (invite.redeemedBy || invite.expiresAt <= deps.now()) return { valid: false };
  const tour = await deps.db.collection('tours').doc(invite.tourId).get();
  const texts = (tour.get('texts') as Record<string, { title: string }> | undefined) ?? {};
  const title = texts['en']?.title ?? Object.values(texts)[0]?.title;
  const placeName = tour.get('placeName') as string | undefined;
  return { valid: true, ...(title ? { tourTitle: title } : {}), ...(placeName ? { placeName } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// RevenueCat webhook

export function verifyBearer(header: string | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Idempotent: every RevenueCat event id is processed at most once (ledger `revenuecatEvents`). */
export async function processRevenueCatEvent(
  deps: BillingDeps,
  body: unknown,
): Promise<{ status: 'processed' | 'duplicate' | 'ignored'; ops: string[] }> {
  const parsed = z.object({ event: RevenueCatEventSchema }).safeParse(body);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid webhook payload');
  const event = parsed.data.event;
  const { db } = deps;
  const { products } = await loadBillingConfig(db);
  const now = deps.now();
  const ops = planRevenueCatEvent(event, products, now);
  const eventRef = db.collection('revenuecatEvents').doc(event.id.replace(/[^A-Za-z0-9_-]/g, '_'));
  return db.runTransaction(async (tx) => {
    const seen = await tx.get(eventRef);
    if (seen.exists) return { status: 'duplicate' as const, ops: [] };
    const uid = event.app_user_id;
    let wallet: Wallet | undefined;
    for (const op of ops) {
      if (op.op === 'setSubscription') {
        const ref = ents(db, uid).doc('subscription');
        const cur = await tx.get(ref);
        // ignore out-of-order events that are older than what we already know
        if (cur.exists && Number(cur.get('updatedAt')) > now + 60_000) continue;
        tx.set(ref, op.entitlement);
      } else if (op.op === 'addCredits' || op.op === 'removeCredits') {
        wallet ??= await readWallet(tx, db, uid);
        wallet = {
          ...wallet,
          balance: Math.max(0, wallet.balance + (op.op === 'addCredits' ? op.amount : -op.amount)),
        };
        tx.set(ledger(db, uid).doc(), {
          delta: op.op === 'addCredits' ? op.amount : -op.amount,
          kind: 'purchase',
          ref: op.ref,
          ts: now,
        });
      }
    }
    if (wallet) tx.set(walletRef(db, uid), wallet);
    tx.set(eventRef, { type: event.type, uid, processedAt: now, ops: ops.map((o) => o.op) });
    const acting = ops.filter((o) => o.op !== 'ignore');
    return {
      status: acting.length ? ('processed' as const) : ('ignored' as const),
      ops: ops.map((o) => o.op),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Rewarded ads (server-side verification)

const NONCE_TTL_MS = 30 * 60_000;

/** Creates a single-use nonce that the client passes as SSV `customData`; the ad network echoes it back to us. */
export async function createRewardNonce(
  deps: BillingDeps,
  uid: string,
): Promise<{ nonce: string; remainingToday: number }> {
  const { db } = deps;
  const { rewardedPerDay } = await loadBillingConfig(db);
  const now = deps.now();
  const counter = await db.collection('users').doc(uid).collection('rewardCounters').doc(dayKey(now)).get();
  const granted = Number(counter.get('granted') ?? 0);
  const pending = await db
    .collection('rewardNonces')
    .where('uid', '==', uid)
    .where('used', '==', false)
    .where('expiresAt', '>', now)
    .get();
  const d = decideReward(granted + pending.size, rewardedPerDay);
  if (!d.ok)
    throw new BillingError('resource-exhausted', 'Daily rewarded limit reached', { reason: d.reason });
  const nonce = randomBytes(18).toString('base64url');
  await db
    .collection('rewardNonces')
    .doc(nonce)
    .set({ uid, used: false, createdAt: now, expiresAt: now + NONCE_TTL_MS });
  return { nonce, remainingToday: d.remaining };
}

/** Called after a verified SSV callback: grants one reward credit if nonce and daily limit allow. */
export async function grantRewardFromSsv(
  deps: BillingDeps,
  params: { userId: string; nonce: string; transactionId: string },
): Promise<{ granted: boolean; reason?: string }> {
  const { db } = deps;
  const { rewardedPerDay } = await loadBillingConfig(db);
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const nonceRef = db.collection('rewardNonces').doc(params.nonce);
    const txRef = db
      .collection('rewardTransactions')
      .doc(params.transactionId.replace(/[^A-Za-z0-9_-]/g, '_'));
    const [nonce, seen] = await Promise.all([tx.get(nonceRef), tx.get(txRef)]);
    if (seen.exists) return { granted: false, reason: 'duplicate' };
    if (!nonce.exists || nonce.get('uid') !== params.userId)
      return { granted: false, reason: 'unknown_nonce' };
    if (nonce.get('used') === true) return { granted: false, reason: 'nonce_used' };
    if (Number(nonce.get('expiresAt')) <= now) return { granted: false, reason: 'nonce_expired' };
    const counterRef = db
      .collection('users')
      .doc(params.userId)
      .collection('rewardCounters')
      .doc(dayKey(now));
    const counter = await tx.get(counterRef);
    const granted = Number(counter.get('granted') ?? 0);
    if (!decideReward(granted, rewardedPerDay).ok) return { granted: false, reason: 'daily_limit' };
    const wallet = await readWallet(tx, db, params.userId);
    tx.set(walletRef(db, params.userId), { ...wallet, rewardBalance: wallet.rewardBalance + 1 });
    tx.set(counterRef, { granted: granted + 1, day: dayKey(now) });
    tx.update(nonceRef, { used: true, usedAt: now });
    tx.set(txRef, { uid: params.userId, ts: now });
    tx.set(ledger(db, params.userId).doc(), { delta: 1, kind: 'reward', ref: params.transactionId, ts: now });
    return { granted: true };
  });
}
