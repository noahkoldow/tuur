import { z } from 'zod';
import type { Interest } from '../constants';
import type { LatLng } from '../geo/geohash';
import type { ImageRef } from '../schemas';

/**
 * Anonymous popularity of a POI ("explored by other users"), written only by Cloud Functions: a daily-deduplicated
 * explorer count and a decaying heat value. No user ids are stored (spec 10: aggregated and anonymous).
 */
export const PoiStatsSchema = z.object({
  poiId: z.string(),
  tile: z.string(),
  explorers: z.number().int().nonnegative(),
  heat: z.number().nonnegative(),
  lastAt: z.number(),
});
export type PoiStats = z.infer<typeof PoiStatsSchema>;

/** A spot is only shown once this many distinct explorer-days exist, so no single walk can be traced. */
export const MIN_EXPLORERS_SHOWN = 3;
/** Heat halves every week without new explorers. */
export const HEAT_HALF_LIFE_MS = 7 * 24 * 3600_000;
/** From this heat on a spot counts as "hot" (roughly 20 explorers within the last week or two). */
export const HOT_HEAT = 20;

/** Adds one explorer to the decayed heat. */
export function bumpHeat(prev: { heat: number; lastAt: number } | undefined, now: number): number {
  if (!prev) return 1;
  const age = Math.max(0, now - prev.lastAt);
  return prev.heat * 0.5 ** (age / HEAT_HALF_LIFE_MS) + 1;
}

/** Current heat without a new explorer (for reading). */
export function currentHeat(s: { heat: number; lastAt: number }, now: number): number {
  return s.heat * 0.5 ** (Math.max(0, now - s.lastAt) / HEAT_HALF_LIFE_MS);
}

export interface ExploredSpot {
  poiId: string;
  name: string;
  location: LatLng;
  interest?: Interest;
  image?: ImageRef;
  explorers: number;
  heat: number;
  hot: boolean;
}

/** Filters to showable spots (k-anonymity threshold) and marks the hot ones; sorted hottest first. */
export function toExploredSpots(
  stats: PoiStats[],
  pois: Map<string, { name: string; location: LatLng; interest?: Interest; image?: ImageRef }>,
  now: number,
): ExploredSpot[] {
  return stats
    .filter((s) => s.explorers >= MIN_EXPLORERS_SHOWN && pois.has(s.poiId))
    .map((s) => {
      const p = pois.get(s.poiId)!;
      const heat = currentHeat(s, now);
      return {
        poiId: s.poiId,
        name: p.name,
        location: p.location,
        ...(p.interest ? { interest: p.interest } : {}),
        ...(p.image ? { image: p.image } : {}),
        explorers: s.explorers,
        heat,
        hot: heat >= HOT_HEAT,
      };
    })
    .sort((a, b) => b.heat - a.heat);
}

/** Marker scale 0..1 on a log curve, so one very busy landmark does not shrink everything else to dots. */
export function spotScale(explorers: number, maxExplorers: number): number {
  if (maxExplorers <= MIN_EXPLORERS_SHOWN) return 0.5;
  const v = Math.log1p(explorers - MIN_EXPLORERS_SHOWN) / Math.log1p(maxExplorers - MIN_EXPLORERS_SHOWN);
  return Math.max(0, Math.min(1, v));
}

/**
 * Input for the day-scoped anonymous visitor key (hashed by the server): the same person counts once per spot and
 * day, and keys of different days cannot be linked to each other.
 */
export function explorerDaySeed(uid: string, poiId: string, now: number): string {
  return `${uid}|${poiId}|${Math.floor(now / 86_400_000)}`;
}
