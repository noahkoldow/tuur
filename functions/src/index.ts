import { initializeApp } from 'firebase-admin/app';
import { BudgetError } from './util/usage';
import { allowSandboxBilling } from './billing/environment';
import { RevenueCatV2 } from './billing/revenuecat';
import { getFunctions } from 'firebase-admin/functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { error as logError } from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import {
  DEFAULT_CLAIM_POLICY,
  EnsureAreaRequestSchema,
  NarrationLangSchema,
  rateLimitDecision,
} from '@tuur/shared';
import { ensureAreas } from './area/ensureArea';
import { ensureBetaSnapshotArea, BetaSnapshotError } from './area/betaSnapshot';
import { ingestArea as runIngest } from './area/ingest';
import {
  GEMINI_API_KEY,
  NARRATION_SECRETS,
  ACCOUNT_SECRETS,
  ORS_API_KEY,
  db,
  geocoder,
  llm,
  narrationDeps,
  teaserDeps,
  poiTextDeps,
  objectStore,
  PARTNER_SECRETS,
  partnerDeps,
  payments,
  plannedRouteDeps,
  poiSources,
  routing,
} from './config';
import { generateAutoTours as runGenerateTours, TourError } from './tours/service';
import { composePlannedRoute as runComposeRoute } from './tours/planned';
import { getWalkingRoute as runGetWalkingRoute, NavigationError } from './navigation/service';
import { RoutingUnavailableError } from './providers/routing';
import { getNarration as runGetNarration, NarrationError, reportNarrationIssue } from './narration/service';
import { getTransition as runGetTransition } from './narration/transition';
import { getTeaser as runGetTeaser } from './narration/teaser';
import { selectNearby as runSelectNearby } from './discovery/service';
import { getPoiText as runGetPoiText, PoiTextError } from './poi/text';
import { recordVisit as runRecordVisit } from './stats/explorers';
import { GroupError, addGroupSeat, createGroup, joinGroup, leaveGroup } from './groups/service';
import { submitPartnerApplication as runSubmitApplication } from './partners/application';
import { RateLimitError } from './util/rateLimit';
import { loadAiConfig } from './util/aiConfig';
import { z } from 'zod';
import {
  AdminError,
  moderatePoi,
  moderateTour,
  regenerateNarration,
  resolveFeedback,
  retryIngest,
  saveAiConfig,
  savePartnerConfig,
  setAreaLock,
  writeAudit,
} from './admin/service';
import { deleteAccount as runDeleteAccount, exportMyData as runExportMyData } from './account/service';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { retentionSweep } from './util/retention';
import { reportContent as runReportContent, ContentReportError } from './safety/reports';
import { moderateOffer } from './safety/offers';
import {
  getAiConsent as runGetAiConsent,
  setAiConsent,
  AiConsentError,
  AiConsentChoiceSchema,
} from './privacy/aiConsent';
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
  claimTourStart as runClaimTourStart,
  createInvite as runCreateInvite,
  createRewardNonce as runCreateRewardNonce,
  grantRewardFromSsv,
  previewInvite,
  processRevenueCatEvent,
  recordWithdrawalConsent as runRecordConsent,
  redeemInvite as runRedeemInvite,
  spendCredit as runSpendCredit,
  verifyBearer,
} from './billing/entitlements';
import { completeAdmobCallback, fetchVerifierKeys, verifyAdmobSignature } from './billing/ssv';
import { prepareTourDownload as runPrepareTourDownload } from './billing/downloads';
import { updateTourTime as runUpdateTourTime } from './billing/timeBudget';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';

initializeApp();
const REGION = 'europe-west1';
const deploymentEnvironment = defineString('TUUR_DEPLOYMENT_ENV', { default: 'production' });
// Empty retains the platform default outside deployments that explicitly choose dedicated identities.
const healthServiceAccount = defineString('TUUR_HEALTH_SERVICE_ACCOUNT', { default: '' });
const revenueCatServiceAccount = defineString('TUUR_REVENUECAT_SERVICE_ACCOUNT', { default: '' });
const admobServiceAccount = defineString('TUUR_ADMOB_SERVICE_ACCOUNT', { default: '' });
const coreServiceAccount = defineString('TUUR_CORE_SERVICE_ACCOUNT', { default: '' });
const aiServiceAccount = defineString('TUUR_AI_SERVICE_ACCOUNT', { default: '' });
// Keep the isolated beta small and idle at zero. These bounds limit capacity, not the final invoice.
setGlobalOptions({
  region: REGION,
  serviceAccount: coreServiceAccount,
  minInstances: 0,
  maxInstances: deploymentEnvironment.equals('beta').thenElse(1, 20),
  concurrency: deploymentEnvironment.equals('beta').thenElse(1, 80),
});

const isEmulator = process.env['FUNCTIONS_EMULATOR'] === 'true';
// App Check is enforced in production; the emulator has no attestation provider.
const enforceAppCheck = !isEmulator;

export const health = onCall({ timeoutSeconds: 10, serviceAccount: healthServiceAccount }, () => ({
  ok: true,
  service: 'tuur-functions',
}));

async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const ref = db().collection('rateLimits').doc(key);
  const res = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = rateLimitDecision(
      snap.exists ? { windowStart: snap.get('windowStart'), count: snap.get('count') } : undefined,
      Date.now(),
      { limit, windowMs },
    );
    if (d.allowed) tx.set(ref, { ...d.next, expireAt: new Date(Date.now() + windowMs * 2) });
    return d;
  });
  if (!res.allowed)
    throw new HttpsError('resource-exhausted', 'Too many requests', { retryAfterMs: res.retryAfterMs });
}

/** Client sends only the geohash tile (never the exact position). */
export const ensureArea = onCall(
  {
    enforceAppCheck,
    // Deployed callers only enqueue work. Provider credentials belong to the worker.
    secrets: isEmulator ? [GEMINI_API_KEY, ORS_API_KEY] : [],
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in (anonymous is fine) first');
    const parsed = EnsureAreaRequestSchema.safeParse(request.data);
    if (!parsed.success || parsed.data.geohash.length !== 6)
      throw new HttpsError('invalid-argument', 'Area discovery requires a six-character geohash');
    await enforceRateLimit(`ensureArea_${request.auth.uid}`, 30, 60_000);
    try {
      const snapshot = await ensureBetaSnapshotArea(
        db(),
        parsed.data.geohash,
        parsed.data.withNeighbors,
        parsed.data.rings,
      );
      if (snapshot) return snapshot;
    } catch (error) {
      if (error instanceof BetaSnapshotError)
        throw new HttpsError('failed-precondition', error.message, { reason: error.reason });
      throw error;
    }
    const queue = getFunctions().taskQueue(`locations/${REGION}/functions/ingestArea`);
    const res = await ensureAreas(
      {
        db: db(),
        now: Date.now,
        ...(process.env['TUUR_DEPLOYMENT_ENV'] === 'beta'
          ? {
              // Matches OVERPASS_DAILY_LIMIT: a cold neighbourhood needs up to 25 tiles, each fetched once.
              maxClaimsPerDay: 1500,
              // Cold neighboring tiles wait behind the serial worker. Do not claim them again
              // while queued; after this window a new request can recover an abandoned task.
              policy: { ...DEFAULT_CLAIM_POLICY, staleIngestMs: 2 * 3600_000 },
            }
          : {}),
        // Cloud Tasks has no local emulator. Run locally so Expo Go can actually discover places.
        enqueueIngest: async (geohash) => {
          if (isEmulator) {
            const ai = await loadAiConfig(db());
            await runIngest(
              { db: db(), sources: poiSources(), geocoder: geocoder(), llm: llm(), ai, now: Date.now },
              geohash,
            );
          } else await queue.enqueue({ geohash }, { dispatchDeadlineSeconds: 540 });
        },
      },
      parsed.data.geohash,
      parsed.data.withNeighbors,
      parsed.data.rings,
    ).catch((error: unknown) => {
      if (error instanceof RateLimitError)
        throw new HttpsError('resource-exhausted', 'Area discovery is temporarily rate limited', {
          retryAfterMs: error.retryAfterMs,
        });
      throw error;
    });
    return res;
  },
);

export const ingestArea = onTaskDispatched(
  {
    serviceAccount: aiServiceAccount,
    ...(process.env['TUUR_CORE_SERVICE_ACCOUNT']
      ? { invoker: [process.env['TUUR_CORE_SERVICE_ACCOUNT']] }
      : {}),
    secrets: [GEMINI_API_KEY, ORS_API_KEY],
    // Match the shared Overpass single-query lease and wait beyond a timed-out lease before retrying.
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 120, maxBackoffSeconds: 300 },
    rateLimits: { maxConcurrentDispatches: 1, maxDispatchesPerSecond: 1 },
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req) => {
    const geohash = (req.data as { geohash?: string }).geohash;
    if (!geohash || !/^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(geohash)) return;
    const ai = await loadAiConfig(db());
    await runIngest(
      { db: db(), sources: poiSources(), geocoder: geocoder(), llm: llm(), ai, now: Date.now },
      geohash,
    );
  },
);

function toHttpsError(e: unknown): never {
  if (
    e instanceof NarrationError ||
    e instanceof BudgetError ||
    e instanceof BillingError ||
    e instanceof PoiTextError ||
    e instanceof AiConsentError
  )
    throw new HttpsError(e.code, e.message, e.details);
  throw e;
}

const genOptions = {
  enforceAppCheck,
  serviceAccount: aiServiceAccount,
  secrets: NARRATION_SECRETS,
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
    const d = { db: db(), store: objectStore(), now: Date.now };
    return await reportNarrationIssue(d, request.auth.uid, p.data);
  } catch (e) {
    if (e instanceof Error && e.message === 'rate_limited')
      throw new HttpsError('resource-exhausted', 'Too many reports');
    throw e;
  }
});

export const reportContent = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runReportContent(db(), request.auth.uid, request.data, Date.now());
  } catch (e) {
    if (e instanceof ContentReportError) throw new HttpsError(e.code, e.message);
    if (e instanceof RateLimitError) throw new HttpsError('resource-exhausted', 'Too many reports');
    throw e;
  }
});

export const getAiConsent = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  await enforceRateLimit(`ai_consent_read_${request.auth.uid}`, 120, 3600_000);
  return runGetAiConsent(db(), request.auth.uid);
});

export const updateAiConsent = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const input = AiConsentChoiceSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError('invalid-argument', 'Invalid AI consent choice');
  await enforceRateLimit(`ai_consent_write_${request.auth.uid}`, 30, 3600_000);
  try {
    return await setAiConsent(db(), request.auth.uid, input.data, Date.now());
  } catch (e) {
    return toHttpsError(e);
  }
});

const GenerateToursSchema = z.object({
  /** Client sends the geohash tile only (privacy, D10). */
  tile: z.string().regex(/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/),
  lang: NarrationLangSchema,
  profile: z.enum(['foot-walking', 'cycling-regular']).optional(),
});

export const generateAutoTours = onCall(
  {
    enforceAppCheck,
    serviceAccount: aiServiceAccount,
    secrets: [GEMINI_API_KEY, ORS_API_KEY],
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    const p = GenerateToursSchema.safeParse(request.data);
    if (!p.success) throw new HttpsError('invalid-argument', 'Invalid request');
    try {
      return await runGenerateTours(
        {
          db: db(),
          llm: llm(),
          routing: routing(),
          now: Date.now,
        },
        request.auth.uid,
        p.data,
      );
    } catch (e) {
      if (e instanceof TourError || e instanceof BudgetError || e instanceof RoutingUnavailableError)
        throw new HttpsError(e.code, e.message, e.details);
      throw e;
    }
  },
);

export const composePlannedRoute = onCall(
  {
    enforceAppCheck,
    serviceAccount: aiServiceAccount,
    secrets: [GEMINI_API_KEY, ORS_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runComposeRoute(plannedRouteDeps(), request.auth.uid, request.data);
    } catch (e) {
      if (e instanceof TourError || e instanceof BudgetError || e instanceof RoutingUnavailableError)
        throw new HttpsError(e.code, e.message, e.details);
      throw e;
    }
  },
);

export const getWalkingRoute = onCall(
  { enforceAppCheck, serviceAccount: aiServiceAccount, secrets: [ORS_API_KEY], timeoutSeconds: 45 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runGetWalkingRoute(
        { db: db(), routing: routing(), now: Date.now },
        request.auth.uid,
        request.data,
      );
    } catch (error) {
      if (
        error instanceof NavigationError ||
        error instanceof BudgetError ||
        error instanceof RoutingUnavailableError
      )
        throw new HttpsError(error.code, error.message, error.details);
      throw error;
    }
  },
);

export const getTeaser = onCall(
  { enforceAppCheck, serviceAccount: aiServiceAccount, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runGetTeaser(teaserDeps(), request.auth.uid, request.data);
    } catch (e) {
      return toHttpsError(e);
    }
  },
);

export const getPoiText = onCall({ enforceAppCheck, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runGetPoiText(poiTextDeps(), request.auth.uid, request.data);
  } catch (error) {
    return toHttpsError(error);
  }
});

export const selectNearby = onCall(
  { enforceAppCheck, serviceAccount: aiServiceAccount, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await runSelectNearby(teaserDeps(), request.auth.uid, request.data);
    } catch (error) {
      return toHttpsError(error);
    }
  },
);

// ---- Monetization (spec 6): all entitlement writes happen here, never on the client ----

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');
const REVENUECAT_API_V2_KEY = defineSecret('REVENUECAT_API_V2_KEY');
const REVENUECAT_PROJECT_ID = defineString('REVENUECAT_PROJECT_ID', { default: '' });
const ADMOB_REWARDED_UNIT = defineString('TUUR_ADMOB_REWARDED_UNIT', { default: '' });

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

export const claimTourStart = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runClaimTourStart({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const updateTourTime = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runUpdateTourTime({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const prepareTourDownload = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runPrepareTourDownload({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    return toBilling(e);
  }
});

export const recordPurchaseConsent = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runRecordConsent({ db: db(), now: Date.now }, request.auth.uid, request.data);
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
  if (typeof request.auth.token['phone_number'] !== 'string')
    throw new HttpsError('failed-precondition', 'Verify a phone number before claiming a free city tour', {
      reason: 'phone_verification_required',
    });
  try {
    return await runCreateRewardNonce(
      { db: db(), now: Date.now },
      request.auth.uid,
      request.data,
      typeof request.auth.token['phone_number'] === 'string',
    );
  } catch (e) {
    return toBilling(e);
  }
});

/** RevenueCat webhook: authenticated by a shared bearer secret; events are idempotent. */
export const revenueCatWebhook = onRequest(
  {
    secrets: [REVENUECAT_WEBHOOK_SECRET, REVENUECAT_API_V2_KEY],
    cors: false,
    timeoutSeconds: 120,
    serviceAccount: revenueCatServiceAccount,
  },
  async (req, res) => {
    if (req.method !== 'POST') return void res.status(405).send('method not allowed');
    if (!verifyBearer(req.get('authorization'), REVENUECAT_WEBHOOK_SECRET.value()))
      return void res.status(401).send('unauthorized');
    try {
      const out = await processRevenueCatEvent(
        {
          db: db(),
          now: Date.now,
          allowSandbox: allowSandboxBilling(process.env),
          revenuecat: new RevenueCatV2(REVENUECAT_PROJECT_ID.value(), REVENUECAT_API_V2_KEY.value()),
          findFirebaseUids: async (ids) => {
            if (!ids.length) return [];
            const found: string[] = [];
            for (let offset = 0; offset < ids.length; offset += 100) {
              const users = await getAuth().getUsers(ids.slice(offset, offset + 100).map((uid) => ({ uid })));
              found.push(...users.users.filter((user) => !user.disabled).map((user) => user.uid));
            }
            return found;
          },
        },
        req.body,
      );
      res.status(200).json(out);
    } catch (e) {
      if (e instanceof BillingError && e.code === 'invalid-argument')
        return void res.status(400).send('bad request');
      if (e instanceof BillingError && e.details?.reason === 'revenuecat_transfer_reconciliation_required') {
        logError(
          'RevenueCat event awaits verified reconciliation; retry after resolving the provider state.',
          {
            eventId: e.details.eventId,
            reason: e.details.reason,
            issue: e.details.issue,
          },
        );
        return void res.status(503).json({ error: 'reconciliation_required' });
      }
      res.status(500).send('error'); // RevenueCat retries with backoff
    }
  },
);

/** AdMob rewarded-ad server-side verification callback (spec 6.2): signature-checked, single-use nonce. */
export const admobSsv = onRequest(
  { cors: false, timeoutSeconds: 30, serviceAccount: admobServiceAccount },
  async (req, res) => {
    if (req.method !== 'GET') return void res.status(405).send('method not allowed');
    const query = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1)
      : '';
    // Malformed envelopes cannot trigger network requests for public verifier keys.
    if (!verifyAdmobSignature(query, []).keyId) return void res.status(403).send('invalid signature');
    let keys = await fetchVerifierKeys().catch(() => []);
    let check = verifyAdmobSignature(query, keys);
    if (!check.ok && check.keyId && !keys.some((k) => String(k.keyId) === check.keyId)) {
      keys = await fetchVerifierKeys(fetch, Date.now(), true).catch(() => keys);
      check = verifyAdmobSignature(query, keys);
    }
    const out = await completeAdmobCallback(
      check,
      ADMOB_REWARDED_UNIT.value(),
      async ({ userId, nonce, transactionId }) => {
        const user = await getAuth()
          .getUser(userId)
          .catch(() => undefined);
        return grantRewardFromSsv(
          { db: db(), now: Date.now },
          { userId, nonce, transactionId, phoneNumberVerified: Boolean(user?.phoneNumber) },
        );
      },
    );
    if (typeof out.body === 'string') res.status(out.status).send(out.body);
    else res.status(out.status).json(out.body);
  },
);

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
    return await runGetOffers(partnerDeps(), request.data, request.auth.uid);
  } catch (e) {
    return toPartner(e);
  }
});

/** App: arrival at a stop -> anonymous, per-day deduplicated explorer count for the explore map (`poiStats`). */
export const recordVisit = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runRecordVisit({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    if (e instanceof z.ZodError) throw new HttpsError('invalid-argument', 'Invalid visit');
    throw e;
  }
});

/** Live group tours (D47): host creates/extends, guests join by link or leave. All checks run server-side. */
const groupCall = <T>(run: (uid: string, data: unknown) => Promise<T>) =>
  onCall({ enforceAppCheck }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
    try {
      return await run(request.auth.uid, request.data);
    } catch (e) {
      if (e instanceof GroupError)
        throw new HttpsError(e.code, e.message, e.reason ? { reason: e.reason } : undefined);
      if (e instanceof BillingError) throw new HttpsError('permission-denied', e.message, e.details);
      throw e;
    }
  });
const groupDeps = () => ({ db: db(), now: Date.now });
export const createTourGroup = groupCall((uid, d) => createGroup(groupDeps(), uid, d));
export const joinTourGroup = groupCall((uid, d) => joinGroup(groupDeps(), uid, d));
export const addTourGroupSeat = groupCall((uid, d) => addGroupSeat(groupDeps(), uid, d));
export const leaveTourGroup = groupCall((uid, d) => leaveGroup(groupDeps(), uid, d));

/** App: business onboarding -> partner application for admin review (pay-per-traction model, D43). */
export const submitPartnerApplication = onCall({ enforceAppCheck }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  try {
    return await runSubmitApplication({ db: db(), now: Date.now }, request.auth.uid, request.data);
  } catch (e) {
    if (e instanceof z.ZodError) throw new HttpsError('invalid-argument', 'Invalid application');
    if (e instanceof RateLimitError) throw new HttpsError('resource-exhausted', 'Too many applications');
    throw e;
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
  const a = requireAdmin(request);
  try {
    const p = await runSetPartnerStatus(partnerDeps(), request.data);
    await writeAudit(db(), Date.now(), a.uid, 'setPartnerStatus', p.id, { status: p.status });
    return p;
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

// ---------------------------------------------------------------------------------------------------------------
// Admin area (spec 8). Reads happen directly in Firestore (rules: admin claim); writes go through these callables,
// which re-check the claim on the server and leave an audit entry.

const adminDeps = () => ({
  db: db(),
  now: Date.now,
  store: objectStore(),
  enqueueIngest: (geohash: string) =>
    getFunctions()
      .taskQueue(`locations/${REGION}/functions/ingestArea`)
      .enqueue({ geohash }, { dispatchDeadlineSeconds: 540 }),
});

function adminCallable<T>(
  run: (deps: ReturnType<typeof adminDeps>, actor: string, data: unknown) => Promise<T>,
) {
  return onCall({ enforceAppCheck: false }, async (request) => {
    const a = requireAdmin(request);
    try {
      return (await run(adminDeps(), a.uid, request.data)) ?? { ok: true };
    } catch (e) {
      if (e instanceof AdminError) throw new HttpsError(e.code, e.message, e.details);
      throw e;
    }
  });
}

export const adminRetryIngest = adminCallable(retryIngest);
export const adminSetAreaLock = adminCallable(setAreaLock);
export const adminModeratePoi = adminCallable(moderatePoi);
export const adminModerateTour = adminCallable(moderateTour);
export const adminRegenerateNarration = adminCallable(regenerateNarration);
export const adminResolveFeedback = adminCallable(resolveFeedback);
export const adminModerateOffer = adminCallable((deps, actor, data) =>
  moderateOffer(deps.db, actor, data, deps.now()),
);
export const adminSaveAiConfig = adminCallable(saveAiConfig);
export const adminSavePartnerConfig = adminCallable(savePartnerConfig);

// ---------------------------------------------------------------------------------------------------------------
// GDPR: account deletion and data export (available in the app settings and the partner portal)

const accountDeps = () => ({
  db: db(),
  auth: getAuth(),
  payments,
  now: Date.now,
  deleteFiles: async (prefix: string) => {
    await getStorage().bucket().deleteFiles({ prefix });
  },
});

export const deleteAccount = onCall({ enforceAppCheck, secrets: ACCOUNT_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  await enforceRateLimit(`delete_account_${request.auth.uid}`, 3, 3600_000);
  return runDeleteAccount(accountDeps(), request.auth.uid);
});

export const exportMyData = onCall({ enforceAppCheck, secrets: ACCOUNT_SECRETS }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  await enforceRateLimit(`export_data_${request.auth.uid}`, 5, 3600_000);
  return runExportMyData(accountDeps(), request.auth.uid);
});

/** Daily retention purge (privacy policy periods); separate from the partner sweep so one failure cannot skip the other. */
export const retentionPurge = onSchedule(
  { schedule: 'every day 04:30', timeZone: 'Europe/Berlin', timeoutSeconds: 540 },
  async () => {
    await retentionSweep(db(), Date.now());
  },
);
