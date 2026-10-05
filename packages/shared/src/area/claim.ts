import type { Area } from '../schemas';

export interface ClaimPolicy {
  /** An `ingesting` area whose job did not finish within this window is considered dead and may be re-claimed. */
  staleIngestMs: number;
  /** After a failure, wait at least this long (multiplied by attempts) before retrying. */
  retryBackoffMs: number;
  maxAttempts: number;
  /** Refresh interval for ready / low_content areas. */
  ttlMs: number;
}

export const DEFAULT_CLAIM_POLICY: ClaimPolicy = {
  staleIngestMs: 10 * 60_000,
  retryBackoffMs: 5 * 60_000,
  maxAttempts: 5,
  ttlMs: 90 * 24 * 3600_000,
};

export type ClaimDecision = 'claim' | 'skip';

/**
 * Pure decision used inside the Firestore transaction of `ensureArea`. Exactly one concurrent caller
 * observes `claim` because the transaction then writes status `ingesting`.
 */
export function decideClaim(
  area: Area | undefined,
  now: number,
  p: ClaimPolicy = DEFAULT_CLAIM_POLICY,
): ClaimDecision {
  if (!area) return 'claim';
  if (area.locked) return 'skip';
  switch (area.status) {
    case 'empty':
      return 'claim';
    case 'ingesting':
      return now - (area.ingestStartedAt ?? 0) > p.staleIngestMs ? 'claim' : 'skip';
    case 'failed':
      if (area.ingestAttempts >= p.maxAttempts) return 'skip';
      if (area.ingestRetryAt !== undefined) return now >= area.ingestRetryAt ? 'claim' : 'skip';
      return now - area.updatedAt >= p.retryBackoffMs * Math.max(1, area.ingestAttempts) ? 'claim' : 'skip';
    case 'ready':
    case 'low_content':
      return area.expiresAt !== undefined && now >= area.expiresAt ? 'claim' : 'skip';
  }
}
