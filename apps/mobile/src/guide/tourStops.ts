import { decodePolyline, distanceMeters, type GuideStop, type Tour } from '@tuur/shared';

/** Planned paths include the final destination/return leg, which is not itself a narrated POI. */
export function tourGuideStops(tour: Tour, lang: string): GuideStop[] {
  const stops: GuideStop[] = tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location }));
  if (tour.source !== 'planned') return stops;
  const end = decodePolyline(tour.path).at(-1);
  const last = stops.at(-1);
  if (!end || !last) return stops;
  const location = { lat: end[0], lng: end[1] };
  if (distanceMeters(last.location, location) <= 10) return stops;
  return [
    ...stops,
    {
      id: `destination:${tour.id}`,
      name: lang.startsWith('de') ? 'Ziel' : 'Destination',
      location,
      navigationOnly: true,
    },
  ];
}
