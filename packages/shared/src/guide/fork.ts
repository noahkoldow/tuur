import type { Interest } from '../constants';
import { angleDiff, bearingDegrees, distanceMeters, type LatLng } from '../geo/geohash';
import type { Poi } from '../schemas';
import { haversineMatrix, type RoutingProfile } from '../routing/matrix';
import { weightedScore } from '../routing/orienteering';

export interface ForkOption {
  poi: Poi;
  walkMinutes: number;
  /** Direction from the listener to the option in degrees. */
  bearing: number;
  distanceM: number;
}

export interface ForkInput {
  here: LatLng;
  candidates: Poi[];
  visitedIds: string[];
  /** Time left for the walk (walking + visiting). */
  remainingMinutes: number;
  /** Route destination, if set: options must roughly lead toward it. */
  destination?: LatLng;
  interests: Interest[];
  profile: RoutingProfile;
  maxWalkMinutes?: number;
  /** Options closer than this are considered "where we already are". */
  minDistanceM?: number;
}

const walkMinutes = (a: LatLng, b: LatLng, profile: RoutingProfile) =>
  haversineMatrix([a, b], profile).minutes[0]![1]!;

/**
 * Crossroads (spec 5.3): proposes two next stops that fit the remaining time, roughly the direction to the
 * destination (if any) and the interests, and that differ from each other (category or direction).
 * Returns fewer than two only if no distinct alternative exists.
 */
export function pickForkOptions(inp: ForkInput): ForkOption[] {
  const visited = new Set(inp.visitedIds);
  const maxWalk = inp.maxWalkMinutes ?? 12;
  const minDist = inp.minDistanceM ?? 60;
  const destBearing = inp.destination ? bearingDegrees(inp.here, inp.destination) : undefined;

  const options: (ForkOption & { value: number })[] = [];
  for (const poi of inp.candidates) {
    if (visited.has(poi.id) || poi.hidden || !poi.accessible || poi.interests.length === 0) continue;
    const dist = distanceMeters(inp.here, poi.location);
    if (dist < minDist) continue;
    const walk = walkMinutes(inp.here, poi.location, inp.profile);
    if (walk > maxWalk) continue;
    const onward = inp.destination ? walkMinutes(poi.location, inp.destination, inp.profile) : 0;
    if (walk + poi.dwellMinutes + onward > inp.remainingMinutes + 1e-6) continue;
    const bearing = bearingDegrees(inp.here, poi.location);
    if (destBearing !== undefined && angleDiff(bearing, destBearing) > 100) continue;
    const c = {
      id: poi.id,
      location: poi.location,
      score: poi.score,
      dwellMinutes: poi.dwellMinutes,
      interests: poi.interests,
    };
    const value = weightedScore(c, inp.interests) / (1 + walk / 10);
    options.push({
      poi,
      walkMinutes: Math.round(walk * 10) / 10,
      bearing,
      distanceM: Math.round(dist),
      value,
    });
  }
  options.sort((a, b) => b.value - a.value || a.poi.id.localeCompare(b.poi.id));
  const first = options[0];
  if (!first) return [];
  const distinct = (a: ForkOption, b: ForkOption) =>
    a.poi.primaryInterest !== b.poi.primaryInterest || angleDiff(a.bearing, b.bearing) >= 60;
  const second = options.slice(1).find((o) => distinct(first, o));
  const strip = ({ value: _v, ...o }: ForkOption & { value: number }): ForkOption => {
    void _v;
    return o;
  };
  return second ? [strip(first), strip(second)] : [strip(first)];
}

/** Remaining minutes after having spent `usedMinutes`. */
export const remainingAfter = (budgetMinutes: number, usedMinutes: number) =>
  Math.max(0, budgetMinutes - usedMinutes);
