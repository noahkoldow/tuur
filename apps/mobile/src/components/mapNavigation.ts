import { distanceMeters, type LatLng } from '@tuur/shared';

/** Keep the last GPS course through stops, missing readings and minor direction noise. */
export function navigationBearing(
  previous: number | undefined,
  heading?: number,
  speed?: number,
): number | undefined {
  if (heading === undefined || !Number.isFinite(heading) || heading < 0 || heading > 360) return previous;
  if (speed !== undefined && Number.isFinite(speed) && speed >= 0 && speed < 0.5) return previous;
  const bearing = heading % 360;
  if (previous === undefined) return bearing;
  const difference = ((bearing - previous + 540) % 360) - 180;
  return Math.abs(difference) <= 3 ? previous : bearing;
}

/** Keep the walker in view while leaving space for the next turn, capped to 40 metres of camera offset. */
export function navigationCenter(user: LatLng, leg: readonly LatLng[] = []): LatLng {
  let from = user;
  let remaining = 80;
  let ahead = user;
  for (const point of leg) {
    const length = distanceMeters(from, point);
    if (length >= remaining && length > 0) {
      const fraction = remaining / length;
      ahead = {
        lat: from.lat + (point.lat - from.lat) * fraction,
        lng: from.lng + (point.lng - from.lng) * fraction,
      };
      break;
    }
    remaining -= length;
    ahead = point;
    from = point;
  }
  return { lat: (user.lat + ahead.lat) / 2, lng: (user.lng + ahead.lng) / 2 };
}
