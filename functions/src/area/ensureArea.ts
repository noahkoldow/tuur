import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_CLAIM_POLICY, tileWithNeighbors, tilesAround, type ClaimPolicy } from '@tuur/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { claimArea, markAreaFailed } from './store';

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
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  const counter = deps.db.collection('usageDaily').doc(day);
  if (
    Number((await counter.get()).get('tilesClaimed') ?? 0) >=
    (deps.maxClaimsPerDay ?? MAX_TILE_CLAIMS_PER_DAY)
  )
    return { started, skipped: tiles };
  await Promise.all(
    tiles.map(async (tile) => {
      const now = deps.now();
      const claimed = await claimArea(deps.db, tile, now, deps.policy ?? DEFAULT_CLAIM_POLICY);
      if (!claimed) {
        skipped.push(tile);
        return;
      }
      await counter.set({ day, tilesClaimed: FieldValue.increment(1) }, { merge: true });
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
