import type { Firestore } from 'firebase-admin/firestore';
import { rateLimitDecision } from '@tuur/shared';

export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('rate_limited');
  }
}

/** Transactional fixed-window limiter (state in `rateLimits/{key}`); throws RateLimitError when exceeded. */
export async function consumeRateLimit(
  db: Firestore,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<void> {
  const ref = db.collection('rateLimits').doc(key.replace(/\//g, '_'));
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = rateLimitDecision(
      snap.exists
        ? { windowStart: Number(snap.get('windowStart')), count: Number(snap.get('count')) }
        : undefined,
      now,
      { limit, windowMs },
    );
    if (d.allowed) tx.set(ref, { ...d.next, expireAt: new Date(now + windowMs * 2) });
    return d;
  });
  if (!res.allowed) throw new RateLimitError(res.retryAfterMs);
}
