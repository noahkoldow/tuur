import type { Interest, TravelMode } from '../constants';
import { DEFAULT_GEOHASH_PRECISION } from '../constants';
import {
  angleDiff,
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  encodeGeohash,
  type LatLng,
} from '../geo/geohash';
import { normalizeName } from '../poi/merge';
import type { Poi } from '../schemas';
import { weightedScore } from '../routing/orienteering';

export type NarrationFrequency = 'low' | 'normal' | 'high';

/** Streifzug tuning per "tell me a lot / normal / little" setting (spec 5.4). */
export const ROAM_PROFILES: Record<
  NarrationFrequency,
  { minScore: number; minGapM: number; cooldownSec: number }
> = {
  high: { minScore: 15, minGapM: 60, cooldownSec: 15 },
  normal: { minScore: 30, minGapM: 150, cooldownSec: 45 },
  low: { minScore: 50, minGapM: 350, cooldownSec: 120 },
};

const HALF_ANGLE = 40;
const NEAR_FIELD_M = 60;
/** POIs farther than this from the line of travel are not "on the way" (roam does not navigate anywhere). */
export const MAX_CROSS_TRACK_M = 110;

/** How far ahead to look: depends on the speed (spec 5.4). Vehicles do not roam. */
export function corridorLengthM(mode: TravelMode, speedMps: number): number {
  if (mode === 'vehicle') return 0;
  if (mode === 'cycling') return Math.max(800, Math.min(2500, speedMps * 150));
  return Math.max(300, Math.min(700, Math.max(speedMps, 1.2) * 240));
}

/** Geohash tiles covering the corridor ahead so that missing areas can be ingested before we get there. */
export function tilesAhead(
  pos: LatLng,
  heading: number,
  lengthM: number,
  precision = DEFAULT_GEOHASH_PRECISION,
): string[] {
  if (lengthM <= 0) return [encodeGeohash(pos.lat, pos.lng, precision)];
  const tiles = new Set<string>();
  const step = 120;
  for (let d = 0; d <= lengthM + step; d += step) {
    for (const side of [-HALF_ANGLE, 0, HALF_ANGLE]) {
      const p = destinationPoint(pos, heading + side * (d > 0 ? 1 : 0), d);
      tiles.add(encodeGeohash(p.lat, p.lng, precision));
    }
  }
  return [...tiles];
}

export interface RoamInput {
  pos: LatLng;
  heading: number | undefined;
  mode: TravelMode;
  speedMps: number;
  candidates: Poi[];
  /** Ids of everything narrated/visited/skipped in this session (dedup). */
  seenIds: string[];
  interests: Interest[];
  frequency: NarrationFrequency;
  /** Location of the last narrated stop, to keep narrations spread out. */
  lastNarratedAt?: LatLng;
}

/**
 * Picks the next POI for roam mode: a cone ahead (plus a small near field), no repeats (id or same name), spread
 * out by the frequency setting, best interest-weighted score per distance. Deterministic.
 */
export function pickRoamTarget(inp: RoamInput): Poi | undefined {
  const cfg = ROAM_PROFILES[inp.frequency];
  const length = corridorLengthM(inp.mode, inp.speedMps);
  if (length <= 0) return undefined;
  const seen = new Set(inp.seenIds);
  const seenNames = new Set(inp.candidates.filter((p) => seen.has(p.id)).map((p) => normalizeName(p.name)));
  let best: { p: Poi; v: number } | undefined;
  for (const p of inp.candidates) {
    if (seen.has(p.id) || p.hidden || !p.accessible || p.interests.length === 0 || p.score < cfg.minScore)
      continue;
    if (seenNames.has(normalizeName(p.name))) continue;
    const dist = distanceMeters(inp.pos, p.location);
    if (dist > length) continue;
    const inNear = dist <= NEAR_FIELD_M;
    if (!inNear) {
      if (inp.heading === undefined) continue;
      const off = angleDiff(bearingDegrees(inp.pos, p.location), inp.heading);
      if (off > HALF_ANGLE) continue;
      if (dist * Math.sin((off * Math.PI) / 180) > MAX_CROSS_TRACK_M) continue;
    }
    if (inp.lastNarratedAt && distanceMeters(inp.lastNarratedAt, p.location) < cfg.minGapM) continue;
    const c = {
      id: p.id,
      location: p.location,
      score: p.score,
      dwellMinutes: p.dwellMinutes,
      interests: p.interests,
    };
    const align =
      inp.heading === undefined
        ? 1
        : 1 + Math.cos((angleDiff(bearingDegrees(inp.pos, p.location), inp.heading) * Math.PI) / 180) * 0.3;
    const v = (weightedScore(c, inp.interests) * align) / (1 + dist / 250);
    if (!best || v > best.v + 1e-9 || (Math.abs(v - best.v) <= 1e-9 && p.id < best.p.id)) best = { p, v };
  }
  return best?.p;
}
