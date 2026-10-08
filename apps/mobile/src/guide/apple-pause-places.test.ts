import { describe, expect, it } from 'vitest';
import { destinationPoint } from '@tuur/shared';
import type { ApplePlace } from '../../modules/tuur-apple-places';
import {
  applePauseCategory,
  applePausePlaces,
  appleSightPlaces,
  shouldOfferAppleFallback,
} from './apple-pause-places';

const center = { lat: 48.8566, lng: 2.3522 };
function place(id: string, meters: number, category: ApplePlace['category'] = 'coffee'): ApplePlace {
  const coordinate = destinationPoint(center, 90, meters);
  return { id, name: id, latitude: coordinate.lat, longitude: coordinate.lng, category };
}

describe('transient Apple pause places', () => {
  it('keeps category mapping explicit and includes nearby toilets', () => {
    expect(applePauseCategory('rest')).toBe('park');
    expect(applePauseCategory('toilets')).toBe('toilets');
    expect(applePausePlaces(center, [place('park', 80, 'park')], 'rest')[0]?.kind).toBe('rest');
    expect(
      applePausePlaces(center, [place('wc', 60, 'toilets'), place('cafe', 50)], 'toilets').map(
        ({ destination }) => destination.id,
      ),
    ).toEqual(['wc']);
  });

  it('filters invalid, duplicate and far results and sorts by distance', () => {
    const places = [
      place('far', 1600),
      place('second', 100),
      place('first', 40),
      place('first', 40),
      { ...place('invalid', 50), latitude: NaN },
      { ...place('unnamed', 10), name: ' ' },
    ];
    expect(applePausePlaces(center, places).map(({ destination }) => destination.id)).toEqual([
      'first',
      'second',
    ]);
  });

  it('creates only a navigation destination, without Poi or tour fields', () => {
    const result = applePausePlaces(center, [place('coffee', 50)])[0]!;
    expect(Object.keys(result.destination).sort()).toEqual(['id', 'location', 'name']);
    expect(result.destination).not.toHaveProperty('sources');
    expect(result.destination).not.toHaveProperty('tile');
    expect(result.destination).not.toHaveProperty('osmTags');
  });

  it('keeps sights out of the break list', () => {
    expect(applePausePlaces(center, [place('museum', 50, 'museum'), place('cafe', 60)])).toHaveLength(1);
  });
});

describe('Apple discovery fallback', () => {
  const base = { available: true, hasPosition: true, osmPlaceCount: 0, osmReady: true, osmFailed: false };

  it('is offered only when OSM has nothing to show, on a native build with a real position', () => {
    expect(shouldOfferAppleFallback(base)).toBe(true);
    expect(shouldOfferAppleFallback({ ...base, osmReady: false, osmFailed: true })).toBe(true);
    expect(shouldOfferAppleFallback({ ...base, osmReady: false })).toBe(false);
    expect(shouldOfferAppleFallback({ ...base, osmPlaceCount: 1 })).toBe(false);
    expect(shouldOfferAppleFallback({ ...base, available: false })).toBe(false);
    expect(shouldOfferAppleFallback({ ...base, hasPosition: false })).toBe(false);
  });

  it('lists only nearby museums and culture, nearest first, without duplicates', () => {
    const result = appleSightPlaces(center, [
      place('culture', 300, 'culture'),
      place('museum', 100, 'museum'),
      place('museum', 100, 'museum'),
      place('cafe', 20),
      place('far', 1700, 'museum'),
    ]);
    expect(result.map(({ destination }) => destination.id)).toEqual(['museum', 'culture']);
    expect(Object.keys(result[0]!.destination).sort()).toEqual(['id', 'location', 'name']);
  });
});
