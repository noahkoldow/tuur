import { describe, expect, it } from 'vitest';
import { encodePolyline, type Tour } from '@tuur/shared';
import { tourGuideStops } from './tourStops';

const first = { lat: 52.52, lng: 13.4 };
const destination = { lat: 52.53, lng: 13.4 };
const makeTour = (source: Tour['source'], end = destination) =>
  ({
    id: 'planned_route',
    source,
    stops: [{ poiId: 'museum', name: 'Museum', location: first }],
    path: encodePolyline([
      [first.lat, first.lng],
      [end.lat, end.lng],
    ]),
  }) as Tour;

describe('tour guide destinations', () => {
  it('retains the final leg of a planned route without inventing narration', () => {
    const stops = tourGuideStops(makeTour('planned'), 'de');
    expect(stops).toHaveLength(2);
    expect(stops[1]).toMatchObject({ name: 'Ziel', navigationOnly: true, location: destination });
  });
  it('does not add duplicate endpoints or alter standard tours', () => {
    expect(tourGuideStops(makeTour('planned', first), 'en')).toHaveLength(1);
    expect(tourGuideStops(makeTour('auto'), 'en')).toHaveLength(1);
  });
});
