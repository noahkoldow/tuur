import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_CLAIM_POLICY, tileWithNeighbors, tilesAround, type ClaimPolicy } from '@tuur/shared';
import { claimArea, deferAreaForQuota, markAreaFailed } from './store';
import { RateLimitError } from '../util/rateLimit';

/** Global safety net against tile-farming with many throw-away accounts (per UTC day). */
export const MAX_TILE_CLAIMS_PER_DAY = 3000;

export interface EnsureAreaDeps {
  db: Firestore;
  /** Enqueues the ingest job (Cloud Tasks queue in production). */
  enqueueIngest: (geohash: string) => Promise<void>;
  now: () => number;
  policy?: ClaimPolicy;
  maxClaimsPerDay?: number;
}

export interface EnsureAreaResult {
  /** Tiles for which this call started a new ingest. */
  started: string[];
  /** Tiles already being handled or ready. */
  skipped: string[];
}

/**
 * Warms the tile and (optionally) its neighbors. Concurrent callers are deduplicated by the transactional
 * claim, so only one ingest job exists per tile. If enqueueing fails the claim is released as `failed`
 * so the next request can retry after the backoff.
 */
export async function ensureAreas(
  deps: EnsureAreaDeps,
  geohash: string,
  withNeighbors: boolean,
  rings?: number,
): Promise<EnsureAreaResult> {
  const tiles =
    rings !== undefined
      ? tilesAround(geohash, rings)
      : withNeighbors
        ? tileWithNeighbors(geohash)
        : [geohash];
  const started: string[] = [];
  const skipped: string[] = [];
  let quotaRetryAfterMs: number | undefined;
  // The helpers order the current tile first, then nearby rings. Submit in that order so a small
  // daily allowance is spent on the user's immediate surroundings before more distant neighbors.
  for (const tile of tiles) {
    const now = deps.now();
    let claimed: boolean;
    try {
      claimed = await claimArea(
        deps.db,
        tile,
        now,
        deps.policy ?? DEFAULT_CLAIM_POLICY,
        deps.maxClaimsPerDay ?? MAX_TILE_CLAIMS_PER_DAY,
      );
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      quotaRetryAfterMs = Math.min(quotaRetryAfterMs ?? Infinity, error.retryAfterMs);
      skipped.push(tile);
      continue;
    }
    if (!claimed) {
      skipped.push(tile);
      continue;
    }
    try {
      await deps.enqueueIngest(tile);
      started.push(tile);
    } catch (e) {
      // Emulator ingest runs inline and must preserve the same retryable quota state as Cloud Tasks.
      if (e instanceof RateLimitError) await deferAreaForQuota(deps.db, tile, e.retryAfterMs, deps.now());
      else await markAreaFailed(deps.db, tile, `enqueue failed: ${(e as Error).message}`, deps.now());
      skipped.push(tile);
    }
  }
  if (!started.length && quotaRetryAfterMs !== undefined) throw new RateLimitError(quotaRetryAfterMs);
  return { started, skipped };
}
