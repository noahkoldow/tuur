import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_CLAIM_POLICY, decideClaim, type Area, type ClaimPolicy, AreaSchema } from '@tuur/shared';

export const AREAS = 'areas';

export function newArea(geohash: string, now: number): Area {
  return AreaSchema.parse({ geohash, status: 'empty', createdAt: now, updatedAt: now });
}

/**
 * Atomically claims an area for ingest. Exactly one concurrent caller gets `true`: the transaction
 * re-reads the doc and `decideClaim` is evaluated against the committed state (spec 4.1 dedup).
 */
export async function claimArea(
  db: Firestore,
  geohash: string,
  now: number,
  policy: ClaimPolicy = DEFAULT_CLAIM_POLICY,
): Promise<boolean> {
  const ref = db.collection(AREAS).doc(geohash);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? AreaSchema.parse(snap.data()) : undefined;
    if (decideClaim(current, now, policy) === 'skip') return false;
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
    return true;
  });
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
