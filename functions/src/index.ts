import { initializeApp } from 'firebase-admin/app';
import { getFunctions } from 'firebase-admin/functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { EnsureAreaRequestSchema, rateLimitDecision } from '@tuur/shared';
import { ensureAreas } from './area/ensureArea';
import { ingestArea as runIngest } from './area/ingest';
import { db, geocoder, llm, poiSources } from './config';

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
  );
  return res;
});

export const ingestArea = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 6, maxDispatchesPerSecond: 3 },
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req) => {
    const geohash = (req.data as { geohash?: string }).geohash;
    if (!geohash || !/^[0-9bcdefghjkmnpqrstuvwxyz]{4,8}$/.test(geohash)) return;
    await runIngest(
      { db: db(), sources: poiSources(), geocoder: geocoder(), llm: llm(), now: Date.now },
      geohash,
    );
  },
);
