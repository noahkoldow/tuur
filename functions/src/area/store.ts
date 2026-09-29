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
  await db
    .collection(AREAS)
    .doc(geohash)
    .set({ status: 'failed', error: error.slice(0, 500), updatedAt: now }, { merge: true });
}
