import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_CLAIM_POLICY, decideClaim, type Area, type ClaimPolicy, AreaSchema } from '@tuur/shared';
import { RateLimitError } from '../util/rateLimit';

export const AREAS = 'areas';

export function newArea(geohash: string, now: number): Area {
  return AreaSchema.parse({ geohash, status: 'empty', createdAt: now, updatedAt: now });
}

/**
 * Atomically claims an area for ingest. Exactly one concurrent caller gets `true`: the transaction
 * re-reads the doc and `decideClaim` is evaluated against the committed state (spec 4.1 dedup).
 * When supplied, the daily allowance is reserved in the same transaction, including across callers.
 */
export async function claimArea(
  db: Firestore,
  geohash: string,
  now: number,
  policy: ClaimPolicy = DEFAULT_CLAIM_POLICY,
  maxClaimsPerDay?: number,
): Promise<boolean> {
  const ref = db.collection(AREAS).doc(geohash);
  const day = new Date(now).toISOString().slice(0, 10);
  const counter = maxClaimsPerDay === undefined ? undefined : db.collection('usageDaily').doc(day);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? AreaSchema.parse(snap.data()) : undefined;
    if (decideClaim(current, now, policy) === 'skip') return false;
    const quota = counter ? await tx.get(counter) : undefined;
    const claimedToday = Number(quota?.get('tilesClaimed') ?? 0);
    if (maxClaimsPerDay !== undefined && claimedToday >= maxClaimsPerDay) {
      const retryAt = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
      // A deferred new area must be visible to clients as unavailable, not as an empty successful
      // lookup. Keep cached terminal areas usable even if their refresh cannot be admitted today.
      if (current?.status !== 'ready' && current?.status !== 'low_content')
        tx.set(ref, {
          ...(current ?? newArea(geohash, now)),
          status: 'failed',
          error: 'rate_limited',
          ingestRetryAt: retryAt,
          updatedAt: now,
        });
      return { retryAfterMs: retryAt - now };
    }
    const base = current ?? newArea(geohash, now);
    const next: Area = {
      ...base,
      status: 'ingesting',
      ingestStartedAt: now,
      ingestAttempts: (current?.ingestAttempts ?? 0) + 1,
      updatedAt: now,
    };
    delete next.error;
    delete next.ingestRetryAt;
    tx.set(ref, next);
    if (counter) tx.set(counter, { day, tilesClaimed: claimedToday + 1 }, { merge: true });
    return true;
  });
  if (typeof result !== 'boolean') throw new RateLimitError(result.retryAfterMs);
  return result;
}

export async function markAreaFailed(
  db: Firestore,
  geohash: string,
  error: string,
  now: number,
): Promise<void> {
  const ref = db.collection(AREAS).doc(geohash);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = { ...(snap.data() ?? {}), status: 'failed', error: error.slice(0, 500), updatedAt: now };
    // Real source/queue failures keep the normal attempt budget and backoff.
    delete (next as Partial<Area>).ingestRetryAt;
    tx.set(ref, next);
  });
}

/** Quota rejections perform no ingest, so refund the claimed attempt once and retain a retry deadline.
 * Cloud Tasks can deliver the same failed job repeatedly; already-deferred jobs never refund twice.
 */
export async function deferAreaForQuota(
  db: Firestore,
  geohash: string,
  retryAfterMs: number,
  now: number,
): Promise<void> {
  const ref = db.collection(AREAS).doc(geohash);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? AreaSchema.parse(snap.data()) : newArea(geohash, now);
    tx.set(ref, {
      ...current,
      status: 'failed',
      error: 'rate_limited',
      ingestAttempts: Math.max(0, current.ingestAttempts - (current.status === 'ingesting' ? 1 : 0)),
      ingestRetryAt: Math.max(current.ingestRetryAt ?? 0, now + Math.max(0, retryAfterMs)),
      updatedAt: now,
    });
  });
}
