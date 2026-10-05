import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_PRODUCTS,
  EntitlementSchema,
  MAX_INVITES_PER_TOUR,
  REWARDED_DAILY_LIMIT_DEFAULT,
  SESSION_DURATION_MS,
  SUBSCRIPTION_TOUR_STARTS_PER_MONTH,
  decideAccess,
  decideDownloadAccess,
  decideInvite,
  decideRedeem,
  decideReward,
  decideSpend,
  downloadTourMode,
  isSubscriber,
  type AccessContext,
  type Entitlement,
  type InviteDoc,
  type ProductMap,
  type Tour,
  type Wallet,
} from '@tuur/shared';
import { z } from 'zod';
import { dayKey } from '../util/usage';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';

import { BillingError } from './errors';
export { BillingError } from './errors';
import { consumePurchaseUnit } from './purchaseLedger';
import type { RevenueCatReader } from './revenuecat';
export { processRevenueCatEvent } from './webhook';

export interface BillingDeps {
  db: Firestore;
  now: () => number;
  /** Accept RevenueCat SANDBOX events (emulator or explicitly isolated beta project only). */
  allowSandbox?: boolean;
  revenuecat?: RevenueCatReader;
  findFirebaseUids?: (ids: string[]) => Promise<string[]>;
}

const ents = (db: Firestore, uid: string) => db.collection('users').doc(uid).collection('entitlements');
const walletRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('credits').doc('wallet');
const ledger = (db: Firestore, uid: string) => db.collection('users').doc(uid).collection('creditLedger');

const utcMonthKey = (now: number) => new Date(now).toISOString().slice(0, 7);

export const ClaimTourStartSchema = z
  .object({
    tourId: z.string().min(1).max(200),
    sessionId: z.string().min(1).max(200),
    mode: z.enum(['tour', 'planned']),
  })
  .refine(
    (r) =>
      r.mode === 'planned'
        ? r.sessionId === r.tourId.replace(/^planned_/, '')
        : z.string().uuid().safeParse(r.sessionId).success,
    'Invalid tour start session',
  );

/** Server-side standard-tour start check and monthly subscription quota, serialized in one transaction. */
export async function claimTourStart(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<{ counted: boolean; remaining: number | null }> {
  const parsed = ClaimTourStartSchema.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid tour start');
  const { tourId, sessionId, mode } = parsed.data;
  const { db } = deps;
  const now = deps.now();
  const month = utcMonthKey(now);
  const usageRef = db.collection('users').doc(uid).collection('tourUsage').doc(month);
  return db.runTransaction(async (tx) => {
    const planned = mode === 'planned';
    const plannedSessionRef = planned
      ? db
          .collection('users')
          .doc(uid)
          .collection('sessions')
          .doc(tourId.replace(/^planned_/, ''))
      : undefined;
    if (planned && !tourId.startsWith('planned_'))
      throw new BillingError('invalid-argument', 'Invalid planned route id');
    const [tourSnap, plannedSessionSnap, all, usageSnap] = await Promise.all([
      planned ? Promise.resolve(undefined) : tx.get(db.collection('tours').doc(tourId)),
      plannedSessionRef ? tx.get(plannedSessionRef) : Promise.resolve(undefined),
      readEntitlements(tx, db, uid),
      tx.get(usageRef),
    ]);
    if (planned) {
      if (
        !plannedSessionSnap?.exists ||
        plannedSessionSnap.get('kind') !== 'planned' ||
        !(Number(plannedSessionSnap.get('expiresAt')) > now)
      )
        throw new BillingError('not-found', 'Planned route is no longer available');
    } else if (!tourSnap?.exists || tourSnap.get('locked') === true) {
      throw new BillingError('not-found', 'Tour not available');
    }
    const usage = usageSnap.data() as { starts?: number; sessions?: Record<string, string> } | undefined;
    const sessions = usage?.sessions ?? {};
    const existingTourId = sessions[sessionId];
    if (existingTourId) {
      if (existingTourId !== tourId) throw new BillingError('already-exists', 'Session already used');
      return {
        counted: true,
        remaining: Math.max(0, SUBSCRIPTION_TOUR_STARTS_PER_MONTH - Number(usage?.starts ?? 0)),
      };
    }

    const subscriber = isSubscriber(all, now);
    const placeId = String((planned ? plannedSessionSnap : tourSnap)?.get('placeId') ?? '');
    const allowedBySession = all.some(
      (e) => e.type === 'session' && e.placeId === placeId && e.expiresAt > now,
    );
    const tourFree = !planned && tourSnap?.get('free') === true;
    const tourEntitled =
      !planned &&
      all.some(
        (e) =>
          e.type === 'tour' &&
          e.tourId === tourId &&
          (e.expiresAt === null || e.expiresAt > now) &&
          (!tourFree || e.source === 'credit' || (e.source === 'free' && e.placeId === placeId)),
      );
    if (!subscriber && (planned ? !allowedBySession : !tourEntitled))
      throw new BillingError('permission-denied', 'Tour is locked', {
        reason: tourFree ? 'ad_required' : 'denied',
      });
    if (!subscriber) return { counted: false, remaining: null };

    const starts = Number(usage?.starts ?? 0);
    if (starts >= SUBSCRIPTION_TOUR_STARTS_PER_MONTH)
      throw new BillingError('resource-exhausted', 'Monthly tour limit reached', {
        reason: 'monthly_tour_limit',
        limit: SUBSCRIPTION_TOUR_STARTS_PER_MONTH,
        month,
      });
    tx.set(usageRef, {
      month,
      starts: starts + 1,
      sessions: { ...sessions, [sessionId]: tourId },
      updatedAt: now,
    });
    return { counted: true, remaining: SUBSCRIPTION_TOUR_STARTS_PER_MONTH - starts - 1 };
  });
}

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
  return {
    balance: Number(s.get('balance') ?? 0),
    rewardBalance: Number(s.get('rewardBalance') ?? 0),
    seatBalance: Number(s.get('seatBalance') ?? 0),
  };
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
  download?: boolean | undefined;
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
  if (req.download && (!req.tourId || (req.mode && req.mode !== 'tour' && req.mode !== 'planned')))
    throw new BillingError('permission-denied', 'Only fixed itineraries can be downloaded', {
      reason: 'download_not_supported',
    });
  if (req.mode && req.mode !== 'tour') {
    ctx.mode = req.mode;
    const planned =
      req.mode === 'planned' && req.tourId
        ? await db
            .collection('users')
            .doc(uid)
            .collection('sessions')
            .doc(req.tourId.replace(/^planned_/, ''))
            .get()
        : undefined;
    if (planned) {
      if (
        !req.tourId?.startsWith('planned_') ||
        !planned.exists ||
        planned.get('kind') !== 'planned' ||
        !(Number(planned.get('expiresAt')) > now)
      )
        throw new BillingError('not-found', 'Planned route is no longer available');
      const stops = (planned.get('stops') as { poiId: string }[] | undefined) ?? [];
      if (!req.poiIds.every((id) => stops.some((s) => s.poiId === id)))
        throw new BillingError('permission-denied', 'Stop is not part of this planned route');
      ctx.tourId = req.tourId;
    }
    const area = !planned && req.tile ? await db.collection('areas').doc(req.tile).get() : undefined;
    const placeId = (planned ?? area)?.get('placeId') as string | undefined;
    if (placeId) ctx.placeId = placeId;
    if (!req.download && req.tourId && isSubscriber(all, now)) {
      const usage = await db.collection('users').doc(uid).collection('tourUsage').doc(utcMonthKey(now)).get();
      const sessions = usage.get('sessions') as Record<string, string> | undefined;
      if (!Object.values(sessions ?? {}).includes(req.tourId))
        throw new BillingError('permission-denied', 'Start the tour before requesting tour content', {
          reason: 'tour_start_required',
        });
    }
  } else if (req.tourId) {
    const tour = await db.collection('tours').doc(req.tourId).get();
    const stops = (tour.get('stops') as { poiId: string }[] | undefined) ?? [];
    if (!tour.exists || tour.get('locked') === true)
      throw new BillingError('not-found', 'Tour not available');
    if (req.download && downloadTourMode({ ...(tour.data() as Tour), id: req.tourId }) !== 'tour')
      throw new BillingError('permission-denied', 'This route cannot be downloaded', {
        reason: 'download_not_supported',
      });
    // A tour context only counts for the tour's own stops (no free riding on a free or bought tour id).
    if (!req.poiIds.every((id) => stops.some((s) => s.poiId === id)))
      throw new BillingError('permission-denied', 'Stop is not part of this tour');
    ctx.tourId = req.tourId;
    ctx.tourFree = tour.get('free') === true;
    ctx.placeId = String(tour.get('placeId') ?? '');
    ctx.mode = 'tour';
  }
  if (req.download) {
    const download = decideDownloadAccess(all, ctx, now);
    if (!download.allowed)
      throw new BillingError('permission-denied', 'Downloads require Premium or paid tour access', {
        reason: download.reason,
      });
    return { reason: download.reason };
  }
  const d = decideAccess(all, ctx, now);
  if (!d.allowed) throw new BillingError('permission-denied', 'Content is locked', { reason: d.reason });
  if (!req.download && ctx.mode === 'tour' && ctx.tourId && isSubscriber(all, now)) {
    const usage = await db.collection('users').doc(uid).collection('tourUsage').doc(utcMonthKey(now)).get();
    const sessions = usage.get('sessions') as Record<string, string> | undefined;
    if (!Object.values(sessions ?? {}).includes(ctx.tourId))
      throw new BillingError('permission-denied', 'Start the tour before requesting tour content', {
        reason: 'tour_start_required',
      });
  }
  return { reason: d.reason };
}

// ---------------------------------------------------------------------------------------------------------------
// Credits

export const SpendRequestSchema = z
  .object({
    kind: z.enum(['tour', 'session']),
    tourId: z.string().max(200).optional(),
    placeId: z.string().max(200).optional(),
    /** Explicit paid tour purchase for downloads, including upgrades from reward/invite/free access. */
    paidOnly: z.boolean().optional(),
  })
  .refine((request) => !request.paidOnly || request.kind === 'tour', 'Paid-only purchases require a tour');

export async function spendCredit(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<{ used: 'reward' | 'paid'; wallet: Wallet; entitlementId: string }> {
  const parsed = SpendRequestSchema.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid request');
  const { kind, tourId, placeId, paidOnly = false } = parsed.data;
  if (kind === 'tour' && !tourId) throw new BillingError('invalid-argument', 'tourId required');
  if (kind === 'session' && !placeId) throw new BillingError('invalid-argument', 'placeId required');
  const { db } = deps;
  if (kind === 'tour') {
    const t = await db.collection('tours').doc(tourId!).get();
    if (!t.exists || t.get('locked') === true) throw new BillingError('not-found', 'Tour not available');
    if (t.get('free') === true && !paidOnly)
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
            (e) =>
              e.type === 'tour' &&
              e.tourId === tourId &&
              (e.expiresAt === null || e.expiresAt > now) &&
              (!paidOnly || e.source === 'credit'),
          )
        : all.some((e) => e.type === 'session' && e.placeId === placeId && e.expiresAt > now);
    const d = decideSpend(wallet, kind, alreadyUnlocked, isSubscriber(all, now), paidOnly);
    if (!d.ok)
      throw new BillingError(
        d.reason === 'insufficient' ? 'failed-precondition' : 'already-exists',
        `Cannot spend credit: ${d.reason}`,
        { reason: d.reason },
      );
    const consume =
      d.use === 'paid' ? await consumePurchaseUnit(tx, db, uid, 'credit', wallet.balance, now) : () => {};
    consume();
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

// Rewarded ads (server-side verification)

const NONCE_TTL_MS = 30 * 60_000;

/** Creates a single-use nonce that the client passes as SSV `customData`; the ad network echoes it back to us. */
export async function createRewardNonce(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
  phoneNumberVerified: boolean,
): Promise<{ nonce: string; remainingToday: number; purpose: 'free_tour' }> {
  if (!phoneNumberVerified)
    throw new BillingError('failed-precondition', 'Verify a phone number before claiming a free city tour', {
      reason: 'phone_verification_required',
    });
  const { db } = deps;
  const parsed = z.object({ tourId: z.string().min(1).max(200) }).safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid rewarded request');
  const tourId = parsed.data.tourId;
  const { rewardedPerDay } = await loadBillingConfig(db);
  const now = deps.now();
  const nonce = randomBytes(18).toString('base64url');
  const remainingToday = await db.runTransaction(async (tx) => {
    const counterRef = db.collection('users').doc(uid).collection('rewardCounters').doc(dayKey(now));
    const counter = await tx.get(counterRef);
    const pending = await tx.get(
      db
        .collection('rewardNonces')
        .where('uid', '==', uid)
        .where('used', '==', false)
        .where('expiresAt', '>', now),
    );
    const d = decideReward(Number(counter.get('granted') ?? 0) + pending.size, rewardedPerDay);
    if (!d.ok)
      throw new BillingError('resource-exhausted', 'Daily rewarded limit reached', { reason: d.reason });
    const tourRef = db.collection('tours').doc(tourId);
    const tour = await tx.get(tourRef);
    const all = await readEntitlements(tx, db, uid);
    if (!tour.exists || tour.get('locked') === true || tour.get('free') !== true)
      throw new BillingError('failed-precondition', 'Free tour is not available', { reason: 'not_free' });
    if (isSubscriber(all, now))
      throw new BillingError('failed-precondition', 'Subscribers do not need an ad unlock', {
        reason: 'subscriber',
      });
    const placeId = String(tour.get('placeId') ?? '');
    if (!placeId) throw new BillingError('failed-precondition', 'Tour has no city');
    if (all.some((e) => e.type === 'tour' && e.source === 'free' && e.placeId === placeId))
      throw new BillingError('already-exists', 'Free tour already used in this city', {
        reason: 'free_city_used',
      });
    const freeClaimRef = db.collection('users').doc(uid).collection('freeTourClaims').doc(placeId);
    const freeClaim = await tx.get(freeClaimRef);
    if (freeClaim.exists && Number(freeClaim.get('expiresAt') ?? Number.POSITIVE_INFINITY) > now)
      throw new BillingError('already-exists', 'Free tour already claimed in this city', {
        reason: 'free_city_used',
      });
    tx.set(db.collection('rewardNonces').doc(nonce), {
      uid,
      used: false,
      purpose: 'free_tour',
      tourId,
      placeId,
      createdAt: now,
      expiresAt: now + NONCE_TTL_MS,
      expireAt: new Date(now + 24 * 3600_000),
    });
    tx.set(freeClaimRef, { state: 'pending', nonce, tourId, expiresAt: now + NONCE_TTL_MS });
    return d.remaining;
  });
  return { nonce, remainingToday, purpose: 'free_tour' };
}

/** Called after a verified SSV callback: grants one reward credit if nonce and daily limit allow. */
export async function grantRewardFromSsv(
  deps: BillingDeps,
  params: { userId: string; nonce: string; transactionId: string; phoneNumberVerified?: boolean },
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
    if (nonce.get('purpose') !== 'free_tour') return { granted: false, reason: 'invalid_purpose' };
    if (!params.phoneNumberVerified) return { granted: false, reason: 'phone_verification_required' };
    if (Number(nonce.get('expiresAt')) <= now) return { granted: false, reason: 'nonce_expired' };
    const counterRef = db
      .collection('users')
      .doc(params.userId)
      .collection('rewardCounters')
      .doc(dayKey(now));
    const counter = await tx.get(counterRef);
    const granted = Number(counter.get('granted') ?? 0);
    if (!decideReward(granted, rewardedPerDay).ok) return { granted: false, reason: 'daily_limit' };
    const tourId = String(nonce.get('tourId') ?? '');
    const placeId = String(nonce.get('placeId') ?? '');
    if (!tourId || !placeId) return { granted: false, reason: 'invalid_free_tour' };
    const tourRef = db.collection('tours').doc(tourId);
    const claimRef = db.collection('users').doc(params.userId).collection('freeTourClaims').doc(placeId);
    const [tour, claim, all] = await Promise.all([
      tx.get(tourRef),
      tx.get(claimRef),
      readEntitlements(tx, db, params.userId),
    ]);
    if (!tour.exists || tour.get('free') !== true || tour.get('locked') === true)
      return { granted: false, reason: 'tour_unavailable' };
    if (claim.get('nonce') !== params.nonce || claim.get('state') !== 'pending')
      return { granted: false, reason: 'claim_mismatch' };
    if (all.some((e) => e.type === 'tour' && e.source === 'free' && e.placeId === placeId))
      return { granted: false, reason: 'free_city_used' };
    tx.set(ents(db, params.userId).doc(`tour_${tourId}`), {
      type: 'tour',
      tourId,
      placeId,
      source: 'free',
      grantedAt: now,
      expiresAt: null,
    });
    tx.set(claimRef, { state: 'granted', nonce: params.nonce, tourId, grantedAt: now });
    tx.set(counterRef, { granted: granted + 1, day: dayKey(now) });
    tx.update(nonceRef, { used: true, usedAt: now });
    tx.set(txRef, { uid: params.userId, purpose: 'free_tour', ts: now });
    return { granted: true, purpose: 'free_tour' };
  });
}

/**
 * Proof of the express consent required by Sec. 356(5) German Civil Code: the app calls this before it opens the store
 * purchase sheet; the record (who, what, when, which wording) lives in the account and is part of the data export.
 */
export async function recordWithdrawalConsent(deps: BillingDeps, uid: string, raw: unknown) {
  const p = z
    .object({ productId: z.string().min(1).max(80), textVersion: z.string().min(1).max(40) })
    .safeParse(raw);
  if (!p.success) throw new BillingError('invalid-argument', 'Invalid request');
  const now = deps.now();
  await deps.db.collection('users').doc(uid).collection('consents').add({
    kind: 'withdrawal_waiver',
    productId: p.data.productId,
    textVersion: p.data.textVersion,
    ts: now,
  });
  return { recordedAt: now };
}
