import { describe, expect, it } from 'vitest';
import { buildPois, destinationPoint, encodeGeohash, syntheticRawPois, type Poi } from '@tuur/shared';
import { nearbyRoamPlaces } from './nearbyPlaces';

const paris = { lat: 48.8566, lng: 2.3522 };
const seed = buildPois(syntheticRawPois(encodeGeohash(paris.lat, paris.lng, 6)), { now: 1 }).pois[0]!;
const place = (id: string, meters: number, overrides: Partial<Poi> = {}): Poi => ({
  ...seed,
  id,
  name: id,
  names: {},
  sources: { wikipedia: [], sitelinks: 0 },
  osmTags: {},
  rawScore: 20,
  location: destinationPoint(paris, meters < 0 ? 270 : 90, Math.abs(meters)),
  accessible: true,
  hidden: false,
  score: 90,
  ...overrides,
});
const ids = (places: Poi[]) => places.map((poi) => poi.id);

describe('nearby destinations during free roam', () => {
  it('balances significance and distance so a major sight stays visible ahead of local details', () => {
    const candidates = [
      place('famous-landmark', 900, { score: 100, rawScore: 75 }),
      place('local-detail', 80, { score: 20 }),
      place('small-museum', 300, { score: 70, rawScore: 45 }),
    ];

    expect(ids(nearbyRoamPlaces(paris, candidates, []))).toEqual([
      'famous-landmark',
      'small-museum',
      'local-detail',
    ]);
  });

  it('updates both the order and the available destinations as the walker moves', () => {
    const candidates = [
      place('behind', -1400),
      place('first-square', 400),
      place('next-square', 1300),
      place('new-neighborhood', 1800),
    ];

    expect(ids(nearbyRoamPlaces(paris, candidates, []))).toEqual(['first-square', 'next-square', 'behind']);
    const livePosition = destinationPoint(paris, 90, 1600);
    expect(ids(nearbyRoamPlaces(livePosition, candidates, []))).toEqual([
      'new-neighborhood',
      'next-square',
      'first-square',
    ]);
  });

  it('only suggests destinations within 1500 meters of the current position', () => {
    expect(ids(nearbyRoamPlaces(paris, [place('outside', 1501), place('inside', 1499)], []))).toEqual([
      'inside',
    ]);
  });

  it('omits the current destination, past stops, hidden places and inaccessible places', () => {
    const candidates = [
      place('current', 50),
      place('visited', 60),
      place('hidden', 70, { hidden: true }),
      place('inaccessible', 80, { accessible: false }),
      place('available', 200),
    ];

    expect(ids(nearbyRoamPlaces(paris, candidates, ['current', 'visited']))).toEqual(['available']);
  });

  it('keeps the same limited selection when equally close candidates arrive in a different order', () => {
    const candidates = [place('beta', 100), place('nearest', 20), place('alpha', 100), place('farther', 300)];

    expect(ids(nearbyRoamPlaces(paris, candidates, [], 2))).toEqual(['nearest', 'alpha']);
    expect(ids(nearbyRoamPlaces(paris, [...candidates].reverse(), [], 2))).toEqual(['nearest', 'alpha']);
    expect(nearbyRoamPlaces(paris, candidates, [], 0)).toEqual([]);
  });

  it('passes session identities and interests through to deduplicated discovery', () => {
    const visitedAlias = place('new-id', 100, { name: 'Old square' });
    const candidates = [
      visitedAlias,
      place('art', 200, { interests: ['art_culture'] }),
      place('history', 200, { interests: ['history'] }),
    ];
    expect(
      ids(
        nearbyRoamPlaces(paris, candidates, ['old-id'], 8, {
          interests: ['art_culture'],
          excludedPlaces: [{ id: 'old-id', name: 'Old square', location: visitedAlias.location }],
        }),
      ),
    ).toEqual(['art', 'history']);
  });
});
