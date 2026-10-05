import { bearingDegrees, distanceMeters, type LatLng } from '@tuur/shared';

export function pathLength(path: LatLng[]): number {
  return path.slice(1).reduce((sum, point, i) => sum + distanceMeters(path[i]!, point), 0);
}

/** Project onto the road segment, never draw a connector from the GPS fix to the road. */
export function pathProgress(path: LatLng[], user: LatLng, maxAdvanceMeters = Infinity) {
  let nearest = path[0];
  let nearestIndex = 0;
  let distance = nearest ? distanceMeters(user, nearest) : Infinity;
  let along = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (along > maxAdvanceMeters) break;
    const segmentMeters = distanceMeters(a, b);
    const cos = Math.cos((user.lat * Math.PI) / 180);
    const dx = (b.lng - a.lng) * cos;
    const dy = b.lat - a.lat;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = Math.min(
      segmentMeters ? (maxAdvanceMeters - along) / segmentMeters : 1,
      lengthSquared
        ? Math.max(0, Math.min(1, ((user.lng - a.lng) * cos * dx + (user.lat - a.lat) * dy) / lengthSquared))
        : 0,
    );
    const point = { lat: a.lat + fraction * (b.lat - a.lat), lng: a.lng + fraction * (b.lng - a.lng) };
    const d = distanceMeters(user, point);
    if (d < distance) {
      distance = d;
      nearest = point;
      nearestIndex = i;
    }
    along += segmentMeters;
  }
  const remaining = nearest ? [nearest, ...path.slice(nearestIndex + 1)] : [];
  // Small look-ahead avoids noisy bearings at duplicated vertices without skipping a corner.
  const next = remaining.slice(1).find((p) => distanceMeters(nearest!, p) >= 3);
  return {
    remaining,
    distanceFromPath: distance,
    remainingMeters: pathLength(remaining),
    ...(nearest && next ? { bearing: bearingDegrees(nearest, next) } : {}),
  };
}

/** Retain only provider geometry, including the road-side endpoint of a POI. */
export function savedTourLeg(path: LatLng[], stops: { id: string; location: LatLng }[], targetId: string) {
  let from = 0;
  for (const stop of stops) {
    let nearest = from;
    let distance = Infinity;
    for (let i = from; i < path.length; i++) {
      const d = distanceMeters(path[i]!, stop.location);
      if (d < distance) {
        nearest = i;
        distance = d;
      }
    }
    if (stop.id === targetId) {
      if (distance > 100) return { leg: [], ahead: [] };
      return { leg: path.slice(from, nearest + 1), ahead: path.slice(nearest) };
    }
    from = nearest;
  }
  return { leg: [], ahead: [] };
}
