import { distanceMeters, type LatLng } from '@tuur/shared';

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
