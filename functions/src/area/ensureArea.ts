import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_CLAIM_POLICY, tileWithNeighbors, type ClaimPolicy } from '@tuur/shared';
import { claimArea, markAreaFailed } from './store';

export interface EnsureAreaDeps {
  db: Firestore;
  /** Enqueues the ingest job (Cloud Tasks queue in production). */
  enqueueIngest: (geohash: string) => Promise<void>;
  now: () => number;
  policy?: ClaimPolicy;
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
): Promise<EnsureAreaResult> {
  const tiles = withNeighbors ? tileWithNeighbors(geohash) : [geohash];
  const started: string[] = [];
  const skipped: string[] = [];
  await Promise.all(
    tiles.map(async (tile) => {
      const now = deps.now();
      const claimed = await claimArea(deps.db, tile, now, deps.policy ?? DEFAULT_CLAIM_POLICY);
      if (!claimed) {
        skipped.push(tile);
        return;
      }
      try {
        await deps.enqueueIngest(tile);
        started.push(tile);
      } catch (e) {
        await markAreaFailed(deps.db, tile, `enqueue failed: ${(e as Error).message}`, deps.now());
        skipped.push(tile);
      }
    }),
  );
  return { started, skipped };
}
