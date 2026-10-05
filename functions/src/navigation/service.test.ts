import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, PoiSchema, encodeGeohash } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { MockRoutingProvider, type RoutingProvider } from '../providers/routing';
import { composePlannedRoute } from '../tours/planned';
import { generateAutoTours } from '../tours/service';
import { getWalkingRoute, type NavigationDeps } from './service';

const time = Date.UTC(2026, 9, 5, 12);
const origin = { lat: 52.5161, lng: 13.3769 };
const destination = { lat: 52.5163, lng: 13.3777 };
const tile = encodeGeohash(destination.lat, destination.lng, 6);
const request = { origin, poiId: 'gate' };
const route = {
  path: [
    [52.5161, 13.3769],
    [52.5165, 13.3769],
    [52.5165, 13.3777],
    [52.5163, 13.3777],
  ] as [number, number][],
  meters: 125,
  minutes: 1.5,
};

function setup() {
  const { db, docs } = memoryFirestore();
  Object.assign(db, {
    getAll: async (...refs: { get: () => Promise<unknown> }[]) => Promise.all(refs.map((ref) => ref.get())),
  });
  docs.set(
    'pois/gate',
    PoiSchema.parse({
      id: 'gate',
      name: 'Gate',
      location: destination,
      tile,
      geohash: encodeGeohash(destination.lat, destination.lng, 9),
      interests: ['history'],
      score: 80,
      baseScore: 80,
      rawScore: 80,
      sources: {},
      updatedAt: time,
    }),
  );
  const directions = vi.fn(async () => route);
  const routing: RoutingProvider = { source: 'ors', matrix: new MockRoutingProvider().matrix, directions };
  const deps: NavigationDeps = {
    db,
    routing,
    now: () => time,
    config: async () => DEFAULT_AI_CONFIG,
    env: {},
  };
  return { db, docs, directions, deps };
}

describe('bounded walking navigation', () => {
  it('returns real provider geometry and canonical POI coordinates without persisting GPS fixes', async () => {
    const { deps, directions, docs } = setup();
    expect(await getWalkingRoute(deps, 'visitor', request)).toEqual({
      poiId: 'gate',
      origin,
      destination,
      profile: 'foot-walking',
      path: route.path,
      distanceMeters: 125,
      durationSeconds: 90,
      routingSource: 'ors',
    });
    expect(directions).toHaveBeenCalledWith([origin, destination], 'foot-walking');
    expect([...docs.keys()].some((key) => key.startsWith('routingCache/'))).toBe(false);
    expect(JSON.stringify([...docs])).not.toContain(String(origin.lat));
    expect(docs.get('usageDaily/2026-10-05')?.['calls']).toBe(1);
  });

  it('supports a bounded pause/finish coordinate and uses the selected activity profile', async () => {
    const { deps, directions } = setup();
    const result = await getWalkingRoute(deps, 'visitor', {
      origin,
      destination,
      profile: 'cycling-regular',
    });
    expect(result.poiId).toBeUndefined();
    expect(result.profile).toBe('cycling-regular');
    expect(directions).toHaveBeenCalledWith([origin, destination], 'cycling-regular');
  });

  it.each([
    { origin },
    { ...request, destination },
    { ...request, origin: { lat: 91, lng: 13 } },
    { ...request, poiId: '../collection' },
    { ...request, poiId: 'x'.repeat(161) },
    { origin, destination: { lat: 48.8566, lng: 2.3522 } },
    { ...request, profile: 'driving-car' },
    { ...request, waypoints: [destination] },
  ])('rejects invalid or unbounded input before provider use: %j', async (raw) => {
    const { deps, directions } = setup();
    await expect(getWalkingRoute(deps, 'visitor', raw)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(directions).not.toHaveBeenCalled();
  });

  it.each([{ hidden: true }, { accessible: false }, { id: 'another' }])(
    'rejects unavailable canonical POIs: %j',
    async (changes) => {
      const { deps, directions, docs } = setup();
      docs.set('pois/gate', { ...docs.get('pois/gate'), ...changes });
      await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({ code: 'not-found' });
      expect(directions).not.toHaveBeenCalled();
    },
  );

  it('enforces imported beta areas for both ends and rejects a missing snapshot', async () => {
    const { deps, directions, docs } = setup();
    deps.env = {
      TUUR_DEPLOYMENT_ENV: 'beta',
      GCLOUD_PROJECT: 'tuur-beta-test',
      TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta-test',
      TUUR_BETA_SNAPSHOT_TILES: tile,
    };
    await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'beta_snapshot_unavailable' },
    });
    docs.set(`areas/${tile}`, { locked: true, status: 'ready' });
    await expect(
      getWalkingRoute(deps, 'visitor', { ...request, origin: { lat: 52.53, lng: 13.41 } }),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'beta_area_unavailable' },
    });
    await expect(
      getWalkingRoute(deps, 'visitor', { origin, destination: { lat: 52.53, lng: 13.41 } }),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'beta_area_unavailable' },
    });
    expect(directions).not.toHaveBeenCalled();
    await expect(getWalkingRoute(deps, 'visitor', request)).resolves.toMatchObject({ routingSource: 'ors' });
  });

  it('returns an explicit unavailable error instead of a straight line when routing fails', async () => {
    const { deps, directions, docs } = setup();
    directions.mockRejectedValue(new Error('routing down'));
    await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'routing_unavailable' },
    });
    expect(docs.get('usageDaily/2026-10-05')?.['calls']).toBe(1);
  });

  it('reserves budget before calling the provider and preserves budget failure details', async () => {
    const { deps, directions } = setup();
    deps.config = async () => ({ ...DEFAULT_AI_CONFIG, dailyBudgetUsd: 0 });
    await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'daily_budget' },
    });
    expect(directions).not.toHaveBeenCalled();
  });

  it('bounds each user to 12 requests per minute and 120 per hour before provider use', async () => {
    const { deps, directions, docs } = setup();
    docs.set('rateLimits/navigation_minute_visitor', { windowStart: time, count: 12 });
    await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { retryAfterMs: 60_000 },
    });
    docs.delete('rateLimits/navigation_minute_visitor');
    docs.set('rateLimits/navigation_hour_visitor', { windowStart: time, count: 120 });
    await expect(getWalkingRoute(deps, 'visitor', request)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { retryAfterMs: 3600_000 },
    });
    expect(directions).not.toHaveBeenCalled();
  });

  it('does not save a planned tour when its walking directions are unavailable', async () => {
    const { deps, directions, docs } = setup();
    directions.mockRejectedValue(new Error('routing down'));
    await expect(
      composePlannedRoute({ ...deps, llm: new MockLlmProvider() }, 'visitor', {
        stops: ['gate'],
        start: origin,
        budgetMinutes: 60,
        profile: 'foot-walking',
        lang: 'de',
        interests: [],
      }),
    ).rejects.toMatchObject({ code: 'unavailable', details: { reason: 'routing_unavailable' } });
    expect([...docs.keys()].some((key) => key.startsWith('users/'))).toBe(false);
  });

  it('does not create automatic tours or retain their generation lock when directions fail', async () => {
    const { deps, directions, docs } = setup();
    docs.set(`areas/${tile}`, { status: 'ready', placeId: 'berlin' });
    docs.set('places/berlin', { name: 'Berlin' });
    const first = docs.get('pois/gate')!;
    docs.set('pois/second', {
      ...first,
      id: 'second',
      name: 'Second place',
      location: { lat: 52.5183, lng: 13.3777 },
    });
    directions.mockRejectedValue(new Error('routing down'));
    await expect(
      generateAutoTours(
        {
          ...deps,
          llm: new MockLlmProvider(),
          templates: [{ id: 'local_walk', budgetMinutes: 30, minScore: 1, minStops: 2, minCandidates: 2 }],
        },
        'visitor',
        { tile, lang: 'de' },
      ),
    ).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'routing_unavailable' },
    });
    expect(directions).toHaveBeenCalledTimes(1);
    expect(
      [...docs.keys()].some((key) => key.startsWith('tours/') || key.startsWith('tourGeneration/')),
    ).toBe(false);
  });
});
