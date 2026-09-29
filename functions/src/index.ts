import { initializeApp } from 'firebase-admin/app';
import { getFunctions } from 'firebase-admin/functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { EnsureAreaRequestSchema, rateLimitDecision } from '@tuur/shared';
import { ensureAreas } from './area/ensureArea';
import { ingestArea as runIngest } from './area/ingest';
import {
  GEMINI_API_KEY,
  ORS_API_KEY,
  db,
  geocoder,
  llm,
  narrationDeps,
  PARTNER_SECRETS,
  partnerDeps,
  payments,
  plannedRouteDeps,
  poiSources,
  routing,
} from './config';
import { generateAutoTours as runGenerateTours, TourError } from './tours/service';
import { composePlannedRoute as runComposeRoute } from './tours/planned';
import { getNarration as runGetNarration, NarrationError, reportNarrationIssue } from './narration/service';
import { getTransition as runGetTransition } from './narration/transition';
import { getTeaser as runGetTeaser } from './narration/teaser';
import { loadAiConfig } from './util/aiConfig';
import { z } from 'zod';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  PartnerError,
  createBillingPortalSession as runBillingPortal,
  createCheckoutSession as runCheckout,
  createRedemptionToken as runCreateToken,
  deleteOffer as runDeleteOffer,
  getOffers as runGetOffers,
  partnerStats as runPartnerStats,
  processPaymentEvent,
  recordPartnerEvent as runRecordEvent,
  redeemToken as runRedeemToken,
  saveOffer as runSaveOffer,
  savePartnerProfile as runSavePartner,
  setPartnerStatus as runSetPartnerStatus,
  sweepPartnerPlans,
} from './partners/service';
import {
  BillingError,
  createInvite as runCreateInvite,
  createRewardNonce as runCreateRewardNonce,
  grantRewardFromSsv,
  previewInvite,
  processRevenueCatEvent,
  redeemInvite as runRedeemInvite,
  spendCredit as runSpendCredit,
  verifyBearer,
} from './billing/entitlements';
import { fetchVerifierKeys, verifyAdmobSignature } from './billing/ssv';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

initializeApp();
const REGION = 'europe-west1';
setGlobalOptions({ region: REGION, maxInstances: 20 });

const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';
// App Check is enforced in production; the emulator has no attestation provider.
const enforceAppCheck = !isEmulator;

export const health = onCall(() => ({ ok: true, service: 'tuur-functions' }));

async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const ref = db().collection('rateLimits').doc(key);
  const res = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = rateLimitDecision(
      snap.exists ? { windowStart: snap.get('windowStart'), count: snap.get('count') } : undefined,
      Date.now(),
      { limit, windowMs },
    );
    if (d.allowed) tx.set(ref, d.next);
    return d;
  });
  if (!res.allowed)
    throw new HttpsError('resource-exhausted', 'Too many requests', { retryAfterMs: res.retryAfterMs });
}

/** Client sends only the geohash tile (never the exact position). */
export const ensureArea = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in (anonymous is fine) first');
  const parsed = EnsureAreaRequestSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid geohash');
  await enforceRateLimit(`ensureArea_${request.auth.uid}`, 30, 60_000);
  const queue = getFunctions().taskQueue(`locations/${REGION}/functions/ingestArea`);
  const res = await ensureAreas(
    {
      db: db(),
      now: Date.now,
      enqueueIngest: (geohash) => queue.enqueue({ geohash }, { dispatchDeadlineSeconds: 540 }),
    },
    parsed.data.geohash,
    parsed.data.withNeighbors,
    parsed.data.rings,
  );
  return res;
});

export const ingestArea = onTaskDispatched(
  {
    secrets: [GEMINI_API_KEY],
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 6, maxDispatchesPerSecond: 3 },
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req) => {
    const geohash = (req.data as { geohash?: string }).geohash;
    if (!geohash || !/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/.test(geohash)) return;
    const ai = await loadAiConfig(db());
    await runIngest(
      { db: db(), sources: poiSources(), geocoder: geocoder(), llm: llm(), ai, now: Date.now },
      geohash,
    );
  },
);

function toHttpsError(e: unknown): never {
  if (e instanceof NarrationError) throw new HttpsError(e.code, e.message, e.details);
  throw e;
}

const genOptions = {
  enforceAppCheck,
  secrets: [GEMINI_API_KEY],
  timeoutSeconds: 300,
  memory: '1GiB' as const,
};

export const getNarration = onCall(genOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runGetNarration(narrationDeps(), request.auth.uid, request.data);
  } catch (e) {
    return toHttpsError(e);
  }
});

export const getTransition = onCall(genOptions, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runGetTransition(narrationDeps(), request.auth.uid, request.data);
  } catch (e) {
    return toHttpsError(e);
  }
});

const FeedbackSchema = z.object({
  narrationKey: z.string().min(1).max(300),
  reason: z.enum(['wrong_fact', 'offensive', 'audio_issue', 'other']),
  text: z.string().max(1000).optional(),
});

export const reportNarration = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const p = FeedbackSchema.safeParse(request.data);
  if (!p.success) throw new HttpsError('invalid-argument', 'Invalid report');
  try {
    const d = narrationDeps();
    return await reportNarrationIssue(d, request.auth.uid, p.data);
  } catch (e) {
    if (e instanceof Error && e.message === 'rate_limited')
      throw new HttpsError('resource-exhausted', 'Too many reports');
    throw e;
  }
});

const GenerateToursSchema = z.object({
  /** Client sends the geohash tile only (privacy, D10). */
  tile: z.string().regex(/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/),
  lang: z.string().regex(/^[a-z]{2,3}$/),
  profile: z.enum(['foot-walking', 'cycling-regular']).optional(),
});

export const generateAutoTours = onCall(
  { enforceAppCheck, secrets: [GEMINI_API_KEY, ORS_API_KEY], timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    const p = GenerateToursSchema.safeParse(request.data);
    if (!p.success) throw new HttpsError('invalid-argument', 'Invalid request');
    const nd = narrationDeps();
    try {
      return await runGenerateTours(
        {
          db: db(),
          llm: llm(),
          routing: routing(),
          now: Date.now,
          pregenerate: async (ids, lang) => {
            for (const poiId of ids)
              await runGetNarration(nd, 'system-pregen', { poiId, lang, lengthTier: 'medium' }).catch(
                () => undefined,
              );
          },
        },
        request.auth.uid,
        p.data,
      );
    } catch (e) {
      if (e instanceof TourError) throw new HttpsError(e.code, e.message, e.details);
      throw e;
    }
  },
);

export const composePlannedRoute = onCall(
  { enforceAppCheck, secrets: [GEMINI_API_KEY, ORS_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runComposeRoute(plannedRouteDeps(), request.auth.uid, request.data);
    } catch (e) {
      if (e instanceof TourError) throw new HttpsError(e.code, e.message, e.details);
      throw e;
    }
  },
);

export const getTeaser = onCall(
  { enforceAppCheck, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runGetTeaser(narrationDeps(), request.auth.uid, request.data);
    } catch (e) {
      return toHttpsError(e);
    }
  },
);

// ---- Monetization (spec 6): all entitlement writes happen here, never on the client ----

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');

function toBilling(e: unknown): never {
  if (e instanceof BillingError) throw new HttpsError(e.code, e.message, e.details);
  throw e;
}

export const spendCredit = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runSpendCredit({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const createInvite = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runCreateInvite({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const redeemInvite = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runRedeemInvite({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const createRewardNonce = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runCreateRewardNonce({ db: db(), now: Date.now }, request.auth.uid);
  } catch (e) {
    return toBilling(e);
  }
});

/** RevenueCat webhook: authenticated by a shared bearer secret; events are idempotent. */
export const revenueCatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') return void res.status(405).send('method not allowed');
    if (!verifyBearer(req.get('authorization'), REVENUECAT_WEBHOOK_SECRET.value()))
      return void res.status(401).send('unauthorized');
    try {
      const out = await processRevenueCatEvent({ db: db(), now: Date.now }, req.body);
      res.status(200).json(out);
    } catch (e) {
      if (e instanceof BillingError && e.code === 'invalid-argument')
        return void res.status(400).send('bad request');
      res.status(500).send('error'); // RevenueCat retries with backoff
    }
  },
);

/** AdMob rewarded-ad server-side verification callback (spec 6.2): signature-checked, single-use nonce. */
export const admobSsv = onRequest({ cors: false }, async (req, res) => {
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
  let keys = await fetchVerifierKeys().catch(() => []);
  let check = verifyAdmobSignature(query, keys);
  if (!check.ok && !keys.some((k) => String(k.keyId) === check.params.get('key_id'))) {
    keys = await fetchVerifierKeys(fetch, Date.now(), true).catch(() => keys);
    check = verifyAdmobSignature(query, keys);
  }
  if (!check.ok) return void res.status(403).send('invalid signature');
  const userId = check.params.get('user_id');
  const nonce = check.params.get('custom_data');
  const transactionId = check.params.get('transaction_id');
  if (!userId || !nonce || !transactionId) return void res.status(400).send('missing params');
  const out = await grantRewardFromSsv({ db: db(), now: Date.now }, { userId, nonce, transactionId });
  res.status(200).json(out);
});

/** Public invite preview for the landing page (no personal data). */
export const invitePreview = onRequest({ cors: true }, async (req, res) => {
  const token = String(req.query['token'] ?? '');
  res.set('Cache-Control', 'no-store');
  res.status(200).json(await previewInvite({ db: db(), now: Date.now }, token));
});

// ---------------------------------------------------------------------------------------------------------------
// B2B partners (spec 7)

function toPartner(e: unknown): never {
  if (e instanceof PartnerError) throw new HttpsError(e.code, e.message, e.details);
  throw e;
}

/** Partner portal callers must have a real account (email/password or federated), never an anonymous one. */
function requirePartnerAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | undefined }) {
  const a = request.auth;
  if (!a) throw new HttpsError('unauthenticated', 'Sign in first');
  const provider = (a.token['firebase'] as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  if (provider === 'anonymous') throw new HttpsError('permission-denied', 'Create an account first');
  return a;
}

function requireAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } | undefined }) {
  const a = request.auth;
  if (!a) throw new HttpsError('unauthenticated', 'Sign in first');
  if (a.token['admin'] !== true) throw new HttpsError('permission-denied', 'Admin only');
  return a;
}

const partnerCall = { enforceAppCheck: false, secrets: PARTNER_SECRETS } as const;

const ensureTileQueued = async (tile: string) => {
  const queue = getFunctions().taskQueue(`locations/${REGION}/functions/ingestArea`);
  await ensureAreas(
    {
      db: db(),
      now: Date.now,
      enqueueIngest: (geohash) => queue.enqueue({ geohash }, { dispatchDeadlineSeconds: 540 }),
    },
    tile,
    true,
  );
};

export const savePartnerProfile = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runSavePartner(partnerDeps(ensureTileQueued), a.uid, request.data);
  } catch (e) {
    return toPartner(e);
  }
});

export const saveOffer = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runSaveOffer(partnerDeps(), a.uid, request.data);
  } catch (e) {
    return toPartner(e);
  }
});

export const deleteOffer = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    await runDeleteOffer(partnerDeps(), a.uid, request.data);
    return { ok: true };
  } catch (e) {
    return toPartner(e);
  }
});

export const partnerStats = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runPartnerStats(partnerDeps(), a.uid, request.data);
  } catch (e) {
    return toPartner(e);
  }
});

export const createCheckoutSession = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runCheckout(partnerDeps(), a.uid, a.token['email'] as string | undefined, request.data);
  } catch (e) {
    return toPartner(e);
  }
});

export const createBillingPortalSession = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runBillingPortal(partnerDeps(), a.uid);
  } catch (e) {
    return toPartner(e);
  }
});

/** Partner scanner: verifies and consumes a redemption token for the calling partner. */
export const redeemToken = onCall(partnerCall, async (request) => {
  const a = requirePartnerAuth(request);
  try {
    return await runRedeemToken(partnerDeps(), a.uid, request.data);
  } catch (e) {
    return toPartner(e);
  }
});

/** App: offers of partner stops (only live partners, only inside the validity window). */
export const getOffers = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runGetOffers(partnerDeps(), request.data);
  } catch (e) {
    return toPartner(e);
  }
});

/** App: anonymous, deduplicated impression/visit counters for partner stops. */
export const recordPartnerEvent = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    await runRecordEvent(partnerDeps(), request.auth.uid, request.data);
    return { ok: true };
  } catch (e) {
    return toPartner(e);
  }
});

/** App: signed single-use QR token, only near the partner (position is used for the check and never stored). */
export const createRedemptionToken = onCall(
  { enforceAppCheck, secrets: PARTNER_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runCreateToken(partnerDeps(), request.auth.uid, request.data);
    } catch (e) {
      return toPartner(e);
    }
  },
);

/** Admin: approve, suspend or send a partner back to review. */
export const setPartnerStatus = onCall(partnerCall, async (request) => {
  requireAdmin(request);
  try {
    return await runSetPartnerStatus(partnerDeps(), request.data);
  } catch (e) {
    return toPartner(e);
  }
});

/** Stripe webhook: signature-verified, idempotent by event id. */
export const stripeWebhook = onRequest({ secrets: PARTNER_SECRETS, cors: false }, async (req, res) => {
  if (req.method !== 'POST') return void res.status(405).send('method not allowed');
  try {
    const ev = payments().parseWebhook(req.rawBody, req.get('stripe-signature'));
    const out = await processPaymentEvent(partnerDeps(), ev);
    res.status(200).json({ status: out });
  } catch (e) {
    if (e instanceof PartnerError) return void res.status(400).send(e.message);
    // signature failures are 400 (Stripe must not retry them forever); everything else is 500 and retried
    const msg = (e as Error).message ?? '';
    if (/signature|payload/i.test(msg)) return void res.status(400).send('bad request');
    res.status(500).send('error');
  }
});

/** Daily: partners whose plan lapsed lose boost and label even if the webhook never arrived. */
export const sweepPartners = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Europe/Berlin' },
  async () => {
    await sweepPartnerPlans(partnerDeps());
  },
);
