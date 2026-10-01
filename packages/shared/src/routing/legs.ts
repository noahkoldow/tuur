import { distanceMeters, type LatLng } from '../geo/geohash';

/**
 * Splits a tour path into one leg per stop: leg i runs from stop i-1 (or the path start) to stop i. Stops are
 * matched to their nearest path vertex, moving forward only, so loops and out-and-back paths split correctly.
 */
export function splitPathAtStops(path: LatLng[], stops: LatLng[]): LatLng[][] {
  const legs: LatLng[][] = [];
  let from = 0;
  for (const stop of stops) {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < path.length; i++) {
      const d = distanceMeters(path[i]!, stop);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const leg = path.slice(from, best + 1);
    const last = leg[leg.length - 1];
    if (!last || distanceMeters(last, stop) > 1) leg.push(stop);
    legs.push(leg);
    from = best;
  }
  return legs;
}

export interface NavigationView {
  /** Legs already walked (drawn muted). */
  done: LatLng[];
  /** From the user (or the previous stop) to the current target (drawn prominently). */
  leg: LatLng[];
  /** Everything after the target. */
  ahead: LatLng[];
}

const join = (legs: LatLng[][]) => legs.reduce<LatLng[]>((all, l) => [...all, ...l], []);

/**
 * Navigation split of a tour path for the map: the current leg starts at the user's nearest point on it, so the
 * highlighted line always shows the way still to walk. Without a path (open routes) the leg is a straight line.
 */
export function navigationView(
  path: LatLng[],
  stops: LatLng[],
  targetIndex: number | undefined,
  user?: LatLng,
): NavigationView {
  if (targetIndex === undefined || targetIndex < 0 || targetIndex >= stops.length)
    return { done: path, leg: [], ahead: [] };
  const target = stops[targetIndex]!;
  if (path.length < 2) return { done: [], leg: user ? [user, target] : [], ahead: [] };
  const legs = splitPathAtStops(path, stops);
  let leg = legs[targetIndex] ?? [];
  if (user && leg.length > 0) {
    let nearest = 0;
    let nearestD = Infinity;
    leg.forEach((p, i) => {
      const d = distanceMeters(p, user);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    });
    leg = [user, ...leg.slice(Math.min(nearest + 1, leg.length - 1))];
  }
  return { done: join(legs.slice(0, targetIndex)), leg, ahead: join(legs.slice(targetIndex + 1)) };
}
