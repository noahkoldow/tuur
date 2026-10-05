import { distanceMeters, type LatLng } from '../geo/geohash';

/** An explored tour as the badge logic needs it (kept on the device only). */
export interface WalkedTour {
  id: string;
  /** Centre of the visited stops. */
  center: LatLng;
  stopsVisited: number;
}

export type BadgeTier = 'bronze' | 'silver' | 'gold';

/** Tours needed per tier (a tour counts once it reached at least MIN_STOPS_FOR_BADGE stops). */
export const BADGE_TIERS: { tier: BadgeTier; tours: number }[] = [
  { tier: 'bronze', tours: 1 },
  { tier: 'silver', tours: 3 },
  { tier: 'gold', tours: 7 },
];
export const MIN_STOPS_FOR_BADGE = 1;

export interface EarnedBadge {
  cityId: string;
  tours: number;
  tier: BadgeTier;
  /** Tours still needed for the next tier (undefined at gold). */
  toNext?: number;
}

/** City of a tour: the nearest badge city whose radius contains the tour centre. */
export function cityOf<C extends { id: string; center: LatLng; radiusKm: number }>(
  center: LatLng,
  cities: readonly C[],
): C | undefined {
  let best: C | undefined;
  let bestD = Infinity;
  for (const c of cities) {
    const d = distanceMeters(center, c.center);
    if (d <= c.radiusKm * 1000 && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Badges earned from walked tours, best tier first, then by tour count. Pure and deterministic. */
export function earnedBadges(
  tours: readonly WalkedTour[],
  cities: readonly { id: string; center: LatLng; radiusKm: number }[],
): EarnedBadge[] {
  const count = new Map<string, number>();
  const seen = new Set<string>();
  for (const t of tours) {
    if (t.stopsVisited < MIN_STOPS_FOR_BADGE || seen.has(t.id)) continue;
    seen.add(t.id);
    const c = cityOf(t.center, cities);
    if (c) count.set(c.id, (count.get(c.id) ?? 0) + 1);
  }
  const rank = (tier: BadgeTier) => BADGE_TIERS.findIndex((b) => b.tier === tier);
  return [...count.entries()]
    .map(([cityId, n]) => {
      const reached = [...BADGE_TIERS].reverse().find((b) => n >= b.tours)!;
      const next = BADGE_TIERS.find((b) => b.tours > n);
      return { cityId, tours: n, tier: reached.tier, ...(next ? { toNext: next.tours - n } : {}) };
    })
    .sort((a, b) => rank(b.tier) - rank(a.tier) || b.tours - a.tours || a.cityId.localeCompare(b.cityId));
}
