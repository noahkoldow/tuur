import { describe, expect, it, vi } from 'vitest';
import { PoiSchema, destinationPoint, type Poi } from '@tuur/shared';
import { nearbyPausePlaces, openApplePauseSearch, openPauseDirections, pauseKind } from './pauseDestination';

const center = { lat: 52.52, lng: 13.4 };
const place = (id: string, distance: number, osmTags: Record<string, string> = { amenity: 'cafe' }): Poi =>
  PoiSchema.parse({
    id,
    name: id,
    location: destinationPoint(center, 90, distance),
    geohash: '',
    tile: '',
    osmTags,
    interests: ['culinary'],
    rawScore: 10,
    baseScore: 10,
    score: 10,
    sources: {},
    updatedAt: 0,
  });

describe('pause destinations', () => {
  it('uses explicit place data, not narrative interests or partner scores', () => {
    const story = place('food-history', 30, { historic: 'monument' });
    const cafe = place('cafe', 80);
    const restaurant = place('restaurant', 50, { amenity: 'restaurant' });
    cafe.partnerBoost = 80;
    expect(pauseKind(story)).toBeUndefined();
    expect(nearbyPausePlaces(center, [cafe, story, restaurant]).map(({ poi }) => poi.id)).toEqual([
      'restaurant',
      'cafe',
    ]);
    expect(nearbyPausePlaces(center, [cafe, restaurant], 'coffee').map(({ poi }) => poi.id)).toEqual([
      'cafe',
    ]);
  });

  it('excludes hidden, private, disused and far-away places', () => {
    const hidden = { ...place('hidden', 20), hidden: true };
    const privateGarden = place('private', 20, { leisure: 'garden', access: 'private' });
    const closed = place('closed', 20, { amenity: 'cafe', disused: 'yes' });
    const far = place('far', 1600);
    const park = place('park', 300, { leisure: 'park' });
    expect(
      nearbyPausePlaces(center, [hidden, privateGarden, closed, far, park]).map(({ poi }) => poi.id),
    ).toEqual(['park']);
  });

  it('includes public toilets and filters out private toilets', () => {
    const toilet = place('toilet', 80, { amenity: 'toilets' });
    const privateToilet = place('private-toilet', 20, { amenity: 'toilets', access: 'private' });
    expect(
      nearbyPausePlaces(center, [toilet, privateToilet, place('cafe', 40)], 'toilets').map(
        ({ poi }) => poi.id,
      ),
    ).toEqual(['toilet']);
  });

  it('pauses the tour before handing off directions without replacing its route', async () => {
    const tour = { getState: () => ({ paused: false }), pause: vi.fn(), resume: vi.fn() };
    const open = vi.fn(async (url: string) => {
      expect(tour.pause).toHaveBeenCalledOnce();
      const params = new URL(url).searchParams;
      expect(params.get('destination')).toBe(`${center.lat},${center.lng}`);
      expect(params.get('travelmode')).toBe('walking');
      expect(params.has('origin')).toBe(false);
    });
    await openPauseDirections({ ...place('cafe', 0), location: center }, open, tour);
    expect(tour.resume).not.toHaveBeenCalled();
  });

  it.each([false, true])('restores the previous paused=%s state if maps cannot open', async (paused) => {
    const tour = { getState: () => ({ paused }), pause: vi.fn(), resume: vi.fn() };
    await expect(
      openPauseDirections(
        place('cafe', 0),
        async () => {
          throw new Error('unavailable');
        },
        tour,
      ),
    ).rejects.toThrow('unavailable');
    expect(tour.pause).toHaveBeenCalledTimes(paused ? 0 : 1);
    expect(tour.resume).toHaveBeenCalledTimes(paused ? 0 : 1);
  });

  it('opens walking directions in Apple Maps using only the transient destination', async () => {
    const tour = { getState: () => ({ paused: false }), pause: vi.fn(), resume: vi.fn() };
    const open = vi.fn(async (url: string) => {
      expect(tour.pause).toHaveBeenCalledOnce();
      const target = new URL(url);
      expect(target.hostname).toBe('maps.apple.com');
      expect(target.searchParams.get('daddr')).toBe(`${center.lat},${center.lng}`);
      expect(target.searchParams.get('dirflg')).toBe('w');
      expect(target.searchParams.has('saddr')).toBe(false);
    });
    await openPauseDirections(
      { id: 'apple-session-place', name: 'Coffee', location: center },
      open,
      tour,
      'apple',
    );
    expect(tour.resume).not.toHaveBeenCalled();
  });

  it('opens an encoded Apple search fallback and restores playback if handoff fails', async () => {
    const tour = { getState: () => ({ paused: false }), pause: vi.fn(), resume: vi.fn() };
    const open = vi.fn(async (url: string) => {
      const target = new URL(url);
      expect(target.hostname).toBe('maps.apple.com');
      expect(target.searchParams.get('q')).toBe('Cafés & Bäckereien');
      expect(target.searchParams.get('sll')).toBe(`${center.lat},${center.lng}`);
      throw new Error('Maps unavailable');
    });
    await expect(openApplePauseSearch(center, 'Cafés & Bäckereien', open, tour)).rejects.toThrow(
      'Maps unavailable',
    );
    expect(tour.pause).toHaveBeenCalledOnce();
    expect(tour.resume).toHaveBeenCalledOnce();
  });
});
