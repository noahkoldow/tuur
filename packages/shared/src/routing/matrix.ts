import { distanceMeters, type LatLng } from '../geo/geohash';

export const ROUTING_PROFILES = ['foot-walking', 'cycling-regular'] as const;
export type RoutingProfile = (typeof ROUTING_PROFILES)[number];

/** Travel time/distance between points; rows/cols follow the input point order. */
export interface TravelMatrix {
  /** minutes */
  minutes: number[][];
  /** meters */
  meters: number[][];
}

const SPEED_KMH: Record<RoutingProfile, number> = { 'foot-walking': 4.5, 'cycling-regular': 14 };
/** Street network vs. straight line. */
const DETOUR = 1.3;

/** Offline approximation (also the fallback when the routing service is unavailable). Symmetric, deterministic. */
export function haversineMatrix(points: LatLng[], profile: RoutingProfile): TravelMatrix {
  const n = points.length;
  const minutes = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const meters = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = distanceMeters(points[i]!, points[j]!) * DETOUR;
      const min = (m / 1000 / SPEED_KMH[profile]) * 60;
      minutes[i]![j] = minutes[j]![i] = Math.round(min * 100) / 100;
      meters[i]![j] = meters[j]![i] = Math.round(m);
    }
  }
  return { minutes, meters };
}

/** Rounds coordinates to ~1 m so that equal requests share a cache entry. */
export function matrixCacheKey(points: LatLng[], profile: RoutingProfile): string {
  const s = `${profile}|${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1234567;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${profile}_${points.length}_${h1.toString(16)}${h2.toString(16)}`;
}
