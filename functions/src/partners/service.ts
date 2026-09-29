import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  DEFAULT_PARTNER_CONFIG,
  DEFAULT_PARTNER_PRICING,
  LatLngSchema,
  OfferInputSchema,
  OfferSchema,
  PartnerProfileSchema,
  PartnerSchema,
  PoiSchema,
  canHaveOffers,
  dayKeyUtc,
  decideCreateToken,
  decideRedeemToken,
  encodeGeohash,
  isPartnerLive,
  offerWindow,
  partnerBoostPoints,
  planFromStripeSubscription,
  priceFor,
  scoreWithPartner,
  type Interest,
  type Offer,
  type Partner,
  type PartnerConfig,
  type PartnerPricing,
  type PublicOffer,
} from '@tuur/shared';
import { consumeRateLimit, RateLimitError } from '../util/rateLimit';
import type { PaymentEvent, PaymentsProvider } from './payments';
import { parseToken, signToken, verifyToken } from './token';

export class PartnerError extends Error {
  constructor(
    readonly code:
      | 'permission-denied'
      | 'failed-precondition'
      | 'not-found'
      | 'invalid-argument'
      | 'resource-exhausted'
      | 'already-exists'
      | 'unavailable',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface PartnerDeps {
  db: Firestore;
  now: () => number;
  tokenSecret: () => string;
  payments: () => PaymentsProvider;
  webBaseUrl: string;
  /** Warms the area of a new partner POI (ingest is skipped for tiles that already exist). */
  ensureTile?: (tile: string) => Promise<void>;
}

const partners = (db: Firestore) => db.collection('partners');

export async function loadPartnerConfig(
  db: Firestore,
): Promise<{ cfg: PartnerConfig; pricing: PartnerPricing }> {
  const d = (await db.collection('config').doc('partners').get()).data() as
    (Partial<PartnerConfig> & { pricing?: Partial<PartnerPricing> }) | undefined;
  return {
    cfg: {
      ...DEFAULT_PARTNER_CONFIG,
      ...(d?.boost ? { boost: { ...DEFAULT_PARTNER_CONFIG.boost, ...d.boost } } : {}),
      ...(d?.boostCap !== undefined ? { boostCap: d.boostCap } : {}),
      ...(d?.tokenTtlMs !== undefined ? { tokenTtlMs: d.tokenTtlMs } : {}),
      ...(d?.maxRedeemDistanceM !== undefined ? { maxRedeemDistanceM: d.maxRedeemDistanceM } : {}),
    },
    pricing: { ...DEFAULT_PARTNER_PRICING, ...(d?.pricing ?? {}) },
  };
}

async function limit(db: Firestore, key: string, n: number, windowMs: number, now: number) {
  try {
    await consumeRateLimit(db, key, n, windowMs, now);
  } catch (e) {
    if (e instanceof RateLimitError)
      throw new PartnerError('resource-exhausted', 'Too many requests', { retryAfterMs: e.retryAfterMs });
    throw e;
  }
}

export async function loadPartner(db: Firestore, id: string): Promise<Partner | undefined> {
  const s = await partners(db).doc(id).get();
  if (!s.exists) return undefined;
  const p = PartnerSchema.safeParse({ ...s.data(), id: s.id });
  return p.success ? p.data : undefined;
}

async function requirePartner(db: Firestore, uid: string): Promise<Partner> {
  const p = await loadPartner(db, uid);
  if (!p) throw new PartnerError('not-found', 'No partner profile');
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Profile, POI link, approval

const LinkSchema = z.union([
  z.object({ poiId: z.string().min(1).max(120) }),
  z.object({ newPoi: z.object({ name: z.string().trim().min(1).max(120), location: LatLngSchema }) }),
]);

export const SavePartnerSchema = PartnerProfileSchema.extend({
  link: LinkSchema.optional(),
  acceptTerms: z.boolean().optional(),
});

const CATEGORY_INTERESTS: Record<string, Interest[]> = {
  cafe: ['culinary'],
  restaurant: ['culinary'],
  shop: ['shopping'],
  museum: ['art_culture', 'history'],
  hotel: ['hidden_gems'],
  activity: ['hidden_gems'],
  other: ['hidden_gems'],
};

/**
 * Creates or updates the own partner profile. Changing the name, description, category or POI link of an approved
 * partner sends it back to review (partner text is spoken to listeners, so it is never live unreviewed).
 */
export async function savePartnerProfile(deps: PartnerDeps, uid: string, raw: unknown): Promise<Partner> {
  const parsed = SavePartnerSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid profile');
  const { link, acceptTerms, ...profile } = parsed.data;
  const { db } = deps;
  await limit(db, `partner_save_${uid}`, 30, 3600_000, deps.now());
  const prev = await loadPartner(db, uid);
  const now = deps.now();
  if (!prev && acceptTerms !== true)
    throw new PartnerError('failed-precondition', 'The partner terms must be accepted', { reason: 'terms' });

  let poiId = prev?.poiId;
  let poiProposal = prev?.poiProposal;
  if (link) {
    if ('poiId' in link) {
      const poi = await db.collection('pois').doc(link.poiId).get();
      if (!poi.exists || poi.get('hidden') === true) throw new PartnerError('not-found', 'POI not found');
      const owner = poi.get('partnerId') as string | undefined;
      if (owner && owner !== uid)
        throw new PartnerError('already-exists', 'POI already belongs to a partner');
      poiId = link.poiId;
      poiProposal = undefined;
    } else {
      poiId = undefined;
      poiProposal = link.newPoi;
    }
  }

  const contentChanged =
    !prev ||
    prev.name !== profile.name ||
    prev.description !== profile.description ||
    prev.category !== profile.category ||
    prev.poiId !== poiId ||
    JSON.stringify(prev.poiProposal ?? null) !== JSON.stringify(poiProposal ?? null);

  const next: Partner = PartnerSchema.parse({
    ...profile,
    id: uid,
    ownerUid: uid,
    status: !prev ? 'pending' : contentChanged && prev.status === 'approved' ? 'pending' : prev.status,
    plan: prev?.plan ?? { tier: 'none', active: false },
    ...(poiId ? { poiId } : {}),
    ...(poiProposal ? { poiProposal } : {}),
    contentRev: (prev?.contentRev ?? 0) + (contentChanged ? 1 : 0),
    ...(prev?.termsAcceptedAt
      ? { termsAcceptedAt: prev.termsAcceptedAt }
      : acceptTerms
        ? { termsAcceptedAt: now }
        : {}),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  });
  await partners(db).doc(uid).set(next);
  // an approved partner that goes back to review loses its boost and label immediately
  if (prev && prev.status === 'approved' && next.status !== 'approved') {
    const { cfg } = await loadPartnerConfig(db);
    await syncPartnerPoi(db, next, cfg, now, prev.poiId);
  }
  if (poiProposal && contentChanged)
    await deps
      .ensureTile?.(encodeGeohash(poiProposal.location.lat, poiProposal.location.lng, 6))
      .catch(() => undefined);
  return next;
}

/**
 * Applies the partner state to its POI: label (`partnerId`), capped boost and recomputed score while the partner is
 * live, and removes both otherwise. `previousPoiId` is unlinked when the partner moved to another POI.
 */
export async function syncPartnerPoi(
  db: Firestore,
  partner: Partner,
  cfg: PartnerConfig,
  now: number,
  previousPoiId?: string,
): Promise<void> {
  if (previousPoiId && previousPoiId !== partner.poiId) {
    const old = db.collection('pois').doc(previousPoiId);
    const s = await old.get();
    if (s.exists && s.get('partnerId') === partner.id)
      await old.update({
        partnerId: FieldValue.delete(),
        partnerBoost: 0,
        score: scoreWithPartner(Number(s.get('baseScore')), Number(s.get('adminWeight') ?? 1), 0, cfg),
      });
  }
  if (!partner.poiId) return;
  const ref = db.collection('pois').doc(partner.poiId);
  const s = await ref.get();
  if (!s.exists) return;
  const live = isPartnerLive(partner, now);
  const boost = partnerBoostPoints(partner, now, cfg);
  await ref.update({
    ...(live ? { partnerId: partner.id } : { partnerId: FieldValue.delete() }),
    partnerBoost: boost,
    score: scoreWithPartner(Number(s.get('baseScore')), Number(s.get('adminWeight') ?? 1), boost, cfg),
    updatedAt: now,
  });
}

async function createPartnerPoi(db: Firestore, partner: Partner, now: number): Promise<string> {
  const proposal = partner.poiProposal!;
  const id = `partner_${partner.id}`;
  const base = 30;
  await db
    .collection('pois')
    .doc(id)
    .set(
      PoiSchema.parse({
        id,
        name: proposal.name,
        names: {},
        location: proposal.location,
        geohash: encodeGeohash(proposal.location.lat, proposal.location.lng, 9),
        tile: encodeGeohash(proposal.location.lat, proposal.location.lng, 6),
        osmTags: {},
        interests: CATEGORY_INTERESTS[partner.category] ?? ['hidden_gems'],
        rawScore: base,
        baseScore: base,
        score: base,
        hidden: false,
        adminWeight: 1,
        adminFacts: [],
        partnerBoost: 0,
        accessible: true,
        imageRefs: [],
        sources: { wikipedia: [], sitelinks: 0 },
        dwellMinutes: 8,
        updatedAt: now,
      }),
    );
  return id;
}

/** Admin: approve or suspend. Approving a new-POI request creates the POI. */
export async function setPartnerStatus(deps: PartnerDeps, raw: unknown): Promise<Partner> {
  const parsed = z
    .object({ partnerId: z.string().min(1), status: z.enum(['pending', 'approved', 'suspended']) })
    .safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  const { db } = deps;
  const p = await loadPartner(db, parsed.data.partnerId);
  if (!p) throw new PartnerError('not-found', 'Partner not found');
  const now = deps.now();
  let poiId = p.poiId;
  let proposal = p.poiProposal;
  if (parsed.data.status === 'approved') {
    if (!poiId && proposal) {
      poiId = await createPartnerPoi(db, p, now);
      proposal = undefined;
    }
    if (!poiId) throw new PartnerError('failed-precondition', 'Partner has no POI to approve');
  }
  const next: Partner = {
    ...p,
    status: parsed.data.status,
    ...(poiId ? { poiId } : {}),
    updatedAt: now,
  };
  if (proposal) next.poiProposal = proposal;
  else delete next.poiProposal;
  await partners(db).doc(p.id).set(PartnerSchema.parse(next));
  const { cfg } = await loadPartnerConfig(db);
  await syncPartnerPoi(db, next, cfg, now, p.poiId);
  return next;
}

// ---------------------------------------------------------------------------------------------------------------
// Offers

export async function saveOffer(deps: PartnerDeps, uid: string, raw: unknown): Promise<Offer> {
  const parsed = z
    .object({ offerId: z.string().min(1).max(60).optional() })
    .and(OfferInputSchema)
    .safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid offer');
  const { offerId, ...input } = parsed.data;
  const { db } = deps;
  const partner = await requirePartner(db, uid);
  const now = deps.now();
  if (!canHaveOffers(partner, now) || !partner.poiId)
    throw new PartnerError(
      'failed-precondition',
      'Offers need an approved partner with an active offers plan',
    );
  const ref = offerId ? db.collection('offers').doc(offerId) : db.collection('offers').doc();
  const prev = offerId ? await ref.get() : undefined;
  if (prev?.exists && prev.get('partnerId') !== uid)
    throw new PartnerError('permission-denied', 'Not your offer');
  const count = (await db.collection('offers').where('partnerId', '==', uid).count().get()).data().count;
  if (!prev?.exists && count >= 20) throw new PartnerError('resource-exhausted', 'Offer limit reached');
  const offer = OfferSchema.parse({
    ...input,
    id: ref.id,
    partnerId: uid,
    poiId: partner.poiId,
    createdAt: prev?.exists ? Number(prev.get('createdAt')) : now,
    updatedAt: now,
  });
  await ref.set(offer);
  return offer;
}

export async function deleteOffer(deps: PartnerDeps, uid: string, raw: unknown): Promise<void> {
  const parsed = z.object({ offerId: z.string().min(1).max(60) }).safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  const ref = deps.db.collection('offers').doc(parsed.data.offerId);
  const s = await ref.get();
  if (!s.exists) return;
  if (s.get('partnerId') !== uid) throw new PartnerError('permission-denied', 'Not your offer');
  await ref.delete();
}

/** Offers listeners may see: live partner with an offers plan, offer inside its validity window. */
export async function getOffers(deps: PartnerDeps, raw: unknown): Promise<PublicOffer[]> {
  const parsed = z.object({ poiIds: z.array(z.string().min(1).max(120)).min(1).max(10) }).safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  const { db } = deps;
  const now = deps.now();
  const snap = await db.collection('offers').where('poiId', 'in', parsed.data.poiIds).get();
  const out: PublicOffer[] = [];
  const cache = new Map<string, Partner | undefined>();
  for (const d of snap.docs) {
    const o = OfferSchema.safeParse(d.data());
    if (!o.success || offerWindow(o.data, now) !== 'open') continue;
    if (!cache.has(o.data.partnerId)) cache.set(o.data.partnerId, await loadPartner(db, o.data.partnerId));
    const p = cache.get(o.data.partnerId);
    if (!p || !canHaveOffers(p, now)) continue;
    out.push({
      id: o.data.id,
      poiId: o.data.poiId,
      partnerName: p.name,
      title: o.data.title,
      description: o.data.description,
      terms: o.data.terms,
      validUntil: o.data.validUntil,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Aggregated, anonymized statistics (no user ids; a counter per partner and day)

const statRef = (db: Firestore, partnerId: string, day: string) =>
  db.collection('partnerStats').doc(`${partnerId}_${day}`);

export async function recordPartnerEvent(deps: PartnerDeps, uid: string, raw: unknown): Promise<void> {
  const parsed = z
    .object({ poiId: z.string().min(1).max(120), type: z.enum(['impression', 'visit']) })
    .safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid event');
  const { db } = deps;
  const now = deps.now();
  const poi = await db.collection('pois').doc(parsed.data.poiId).get();
  const partnerId = poi.get('partnerId') as string | undefined;
  if (!partnerId) return;
  // one count per listener, poi and event type every 6 h keeps the numbers honest without storing who it was
  const hash = createHash('sha256')
    .update(`${uid}:${parsed.data.poiId}:${parsed.data.type}`)
    .digest('hex')
    .slice(0, 24);
  try {
    await consumeRateLimit(db, `pev_${hash}`, 1, 6 * 3600_000, now);
  } catch (e) {
    if (e instanceof RateLimitError) return;
    throw e;
  }
  await statRef(db, partnerId, dayKeyUtc(now)).set(
    {
      partnerId,
      day: dayKeyUtc(now),
      [parsed.data.type === 'visit' ? 'visits' : 'impressions']: FieldValue.increment(1),
    },
    { merge: true },
  );
}

export async function partnerStats(deps: PartnerDeps, uid: string, raw: unknown) {
  const parsed = z.object({ days: z.number().int().min(1).max(90).default(30) }).safeParse(raw ?? {});
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  await requirePartner(deps.db, uid);
  const now = deps.now();
  const from = dayKeyUtc(now - (parsed.data.days - 1) * 86_400_000);
  const snap = await deps.db
    .collection('partnerStats')
    .where('partnerId', '==', uid)
    .where('day', '>=', from)
    .get();
  const days = snap.docs
    .map((d) => ({
      day: String(d.get('day')),
      impressions: Number(d.get('impressions') ?? 0),
      visits: Number(d.get('visits') ?? 0),
      redemptions: Number(d.get('redemptions') ?? 0),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const totals = days.reduce(
    (t, d) => ({
      impressions: t.impressions + d.impressions,
      visits: t.visits + d.visits,
      redemptions: t.redemptions + d.redemptions,
    }),
    { impressions: 0, visits: 0, redemptions: 0 },
  );
  return { days, totals };
}

// ---------------------------------------------------------------------------------------------------------------
// QR redemption (spec 7.2)

const counterRef = (db: Firestore, offerId: string, day: string) =>
  db.collection('offerCounters').doc(`${offerId}_${day}`);

export async function createRedemptionToken(deps: PartnerDeps, uid: string, raw: unknown) {
  const parsed = z.object({ offerId: z.string().min(1).max(60), position: LatLngSchema }).safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  const { db } = deps;
  const now = deps.now();
  await limit(db, `redeem_token_${uid}`, 20, 3600_000, now);
  const offerSnap = await db.collection('offers').doc(parsed.data.offerId).get();
  const offer = offerSnap.exists ? OfferSchema.safeParse(offerSnap.data()) : undefined;
  if (!offer?.success) throw new PartnerError('not-found', 'Offer not found');
  const partner = await loadPartner(db, offer.data.partnerId);
  const poi = await db.collection('pois').doc(offer.data.poiId).get();
  if (!partner || !poi.exists) throw new PartnerError('not-found', 'Offer not found');
  const { cfg } = await loadPartnerConfig(db);
  const day = dayKeyUtc(now);
  const mine = await db
    .collection('redemptionTokens')
    .where('uid', '==', uid)
    .where('offerId', '==', offer.data.id)
    .where('day', '==', day)
    .get();
  const used = mine.docs.some((d) => d.get('used') === true);
  const open = mine.docs.find((d) => d.get('used') !== true && Number(d.get('expiresAt')) > now);
  const redeemedToday = Number((await counterRef(db, offer.data.id, day).get()).get('redeemed') ?? 0);
  const d = decideCreateToken({
    partner,
    offer: offer.data,
    now,
    userPosition: parsed.data.position,
    partnerLocation: poi.get('location') as { lat: number; lng: number },
    redeemedToday,
    userRedeemedToday: used,
    cfg,
  });
  if (!d.ok)
    throw new PartnerError('failed-precondition', `Cannot redeem: ${d.reason}`, { reason: d.reason });
  if (open)
    return {
      token: String(open.get('token')),
      tokenId: open.id,
      expiresAt: Number(open.get('expiresAt')),
      offerTitle: offer.data.title,
      partnerName: partner.name,
    };
  const expiresAt = now + cfg.tokenTtlMs;
  const token = signToken(deps.tokenSecret(), { expiresAt, partnerId: partner.id, offerId: offer.data.id });
  const jti = parseToken(token)!.jti;
  await db.collection('redemptionTokens').doc(jti).set({
    uid,
    partnerId: partner.id,
    offerId: offer.data.id,
    day,
    token,
    used: false,
    createdAt: now,
    expiresAt,
  });
  return {
    token,
    tokenId: jti,
    expiresAt,
    offerTitle: offer.data.title,
    partnerName: partner.name,
  };
}

/** Partner scans the QR: verifies signature, expiry, single use and limits, then marks the token used (transaction). */
export async function redeemToken(deps: PartnerDeps, uid: string, raw: unknown) {
  const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid token');
  const { db } = deps;
  const partner = await requirePartner(db, uid);
  await limit(db, `redeem_scan_${uid}`, 120, 3600_000, deps.now());
  const t = parseToken(parsed.data.token);
  if (!t) throw new PartnerError('failed-precondition', 'Invalid token', { reason: 'invalid' });
  return db.runTransaction(async (tx) => {
    const now = deps.now();
    const ref = db.collection('redemptionTokens').doc(t.jti);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PartnerError('failed-precondition', 'Invalid token', { reason: 'invalid' });
    const partnerId = String(snap.get('partnerId'));
    const offerId = String(snap.get('offerId'));
    if (
      !verifyToken(deps.tokenSecret(), t, partnerId, offerId) ||
      Number(snap.get('expiresAt')) !== t.expiresAt
    )
      throw new PartnerError('failed-precondition', 'Invalid token', { reason: 'invalid' });
    const offerSnap = await tx.get(db.collection('offers').doc(offerId));
    const offer = OfferSchema.safeParse(offerSnap.data());
    if (!offer.success) throw new PartnerError('failed-precondition', 'Invalid token', { reason: 'invalid' });
    const day = dayKeyUtc(now);
    const cRef = counterRef(db, offerId, day);
    const redeemedToday = Number((await tx.get(cRef)).get('redeemed') ?? 0);
    const d = decideRedeemToken({
      token: { partnerId, expiresAt: Number(snap.get('expiresAt')), used: snap.get('used') === true },
      scannerPartnerId: partner.id,
      partner,
      offer: offer.data,
      now,
      redeemedToday,
    });
    if (!d.ok)
      throw new PartnerError('failed-precondition', `Cannot redeem: ${d.reason}`, { reason: d.reason });
    tx.update(ref, { used: true, usedAt: now });
    tx.set(cRef, { redeemed: redeemedToday + 1, offerId, day }, { merge: true });
    // anonymized log: which partner/offer/day, never who
    tx.set(db.collection('redemptions').doc(), { partnerId, offerId, day, ts: now });
    tx.set(
      statRef(db, partnerId, day),
      { partnerId, day, redemptions: FieldValue.increment(1) },
      { merge: true },
    );
    return { offerTitle: offer.data.title, redeemedAt: now };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Stripe subscriptions

export async function createCheckoutSession(
  deps: PartnerDeps,
  uid: string,
  email: string | undefined,
  raw: unknown,
) {
  const parsed = z.object({ tier: z.enum(['visibility', 'offers']) }).safeParse(raw);
  if (!parsed.success) throw new PartnerError('invalid-argument', 'Invalid request');
  const partner = await requirePartner(deps.db, uid);
  const { pricing } = await loadPartnerConfig(deps.db);
  const price = priceFor(pricing, parsed.data.tier, partner.countryCode);
  if (!price) throw new PartnerError('unavailable', 'This package is not available yet');
  await limit(deps.db, `checkout_${uid}`, 10, 3600_000, deps.now());
  return deps.payments().createCheckout({
    partnerId: partner.id,
    ...(email ? { email } : {}),
    ...(partner.plan.stripeCustomerId ? { customerId: partner.plan.stripeCustomerId } : {}),
    priceId: price.priceId,
    tier: parsed.data.tier,
    successUrl: `${deps.webBaseUrl}/partner?checkout=success`,
    cancelUrl: `${deps.webBaseUrl}/partner?checkout=cancelled`,
  });
}

export async function createBillingPortalSession(deps: PartnerDeps, uid: string) {
  const partner = await requirePartner(deps.db, uid);
  if (!partner.plan.stripeCustomerId) throw new PartnerError('failed-precondition', 'No subscription yet');
  return deps.payments().createPortal(partner.plan.stripeCustomerId, `${deps.webBaseUrl}/partner`);
}

/** Applies a verified payment event. Events are idempotent by id; unknown partners are ignored, not failed. */
export async function processPaymentEvent(
  deps: PartnerDeps,
  ev: PaymentEvent,
): Promise<'processed' | 'duplicate' | 'ignored'> {
  if (ev.type === 'ignored') return 'ignored';
  const { db } = deps;
  const evRef = db.collection('stripeEvents').doc(ev.id);
  const claimed = await db.runTransaction(async (tx) => {
    if ((await tx.get(evRef)).exists) return false;
    tx.set(evRef, { type: ev.type, ts: deps.now() });
    return true;
  });
  if (!claimed) return 'duplicate';
  const now = deps.now();
  const { cfg } = await loadPartnerConfig(db);
  if (ev.type === 'checkout_completed') {
    const p = await loadPartner(db, ev.partnerId);
    if (!p) return 'ignored';
    await partners(db)
      .doc(p.id)
      .update({
        'plan.stripeCustomerId': ev.customerId,
        ...(ev.subscriptionId ? { 'plan.stripeSubscriptionId': ev.subscriptionId } : {}),
        updatedAt: now,
      });
    return 'processed';
  }
  let partnerId = ev.partnerId;
  if (!partnerId) {
    const q = await partners(db)
      .where('plan.stripeCustomerId', '==', ev.subscription.customer)
      .limit(1)
      .get();
    partnerId = q.docs[0]?.id;
  }
  const p = partnerId ? await loadPartner(db, partnerId) : undefined;
  if (!p) return 'ignored';
  const plan = planFromStripeSubscription(ev.subscription, ev.deleted);
  const next: Partner = { ...p, plan, updatedAt: now };
  await partners(db).doc(p.id).set(PartnerSchema.parse(next));
  await syncPartnerPoi(db, next, cfg, now, p.poiId);
  return 'processed';
}

/** Re-evaluates all partners of a tile after an ingest and after plan expiry (called by the scheduled sweep). */
export async function sweepPartnerPlans(deps: PartnerDeps): Promise<number> {
  const { db } = deps;
  const { cfg } = await loadPartnerConfig(db);
  const now = deps.now();
  const snap = await partners(db).where('status', '==', 'approved').get();
  let changed = 0;
  for (const d of snap.docs) {
    const p = PartnerSchema.safeParse({ ...d.data(), id: d.id });
    if (!p.success || !p.data.poiId) continue;
    const poi = await db.collection('pois').doc(p.data.poiId).get();
    const boost = partnerBoostPoints(p.data, now, cfg);
    if (
      poi.exists &&
      (Number(poi.get('partnerBoost') ?? 0) !== boost ||
        Boolean(poi.get('partnerId')) !== isPartnerLive(p.data, now))
    ) {
      await syncPartnerPoi(db, p.data, cfg, now);
      changed++;
    }
  }
  return changed;
}
