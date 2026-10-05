import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CachedRoutingProvider,
  MockRoutingProvider,
  OrsRoutingProvider,
  type RoutingProvider,
} from './routing';
import { memoryFirestore } from '../../test/memoryFirestore';
import { BudgetError } from '../util/usage';

const points = [
  { lat: 52.52, lng: 13.405 },
  { lat: 52.521, lng: 13.407 },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('HeiGIT routing gateway', () => {
  it('requests GeoJSON directions with the service prefix and a server-side authorization header', async () => {
    vi.stubEnv('ORS_URL', undefined);
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        features: [
          {
            geometry: {
              coordinates: [
                [13.405, 52.52],
                [13.407, 52.521],
              ],
            },
            properties: { summary: { distance: 210, duration: 180 } },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = await new OrsRoutingProvider('test-server-key').directions(points, 'foot-walking');

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'test-server-key',
          Accept: 'application/geo+json',
        }),
        body: JSON.stringify({
          coordinates: [
            [13.405, 52.52],
            [13.407, 52.521],
          ],
          instructions: false,
        }),
      }),
    );
    expect(result).toEqual({
      path: [
        [52.52, 13.405],
        [52.521, 13.407],
      ],
      meters: 210,
      minutes: 3,
    });
  });

  it('requests distance and duration matrices through the same gateway', async () => {
    vi.stubEnv('ORS_URL', undefined);
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        durations: [
          [0, 90],
          [120, 0],
        ],
        distances: [
          [0, 105.4],
          [122.8, 0],
        ],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = await new OrsRoutingProvider('test-server-key').matrix(points, 'foot-walking');

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/matrix/foot-walking',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          locations: [
            [13.405, 52.52],
            [13.407, 52.521],
          ],
          metrics: ['duration', 'distance'],
        }),
      }),
    );
    expect(result).toEqual({
      minutes: [
        [0, 1.5],
        [2, 0],
      ],
      meters: [
        [0, 105],
        [123, 0],
      ],
    });
  });

  it('preserves a configured service path without duplicating trailing separators', async () => {
    vi.stubEnv('ORS_URL', 'https://routing.example/ors/');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ durations: [[0]], distances: [[0]] }));
    vi.stubGlobal('fetch', fetcher);

    await new OrsRoutingProvider('test-server-key').matrix(points.slice(0, 1), 'foot-walking');

    expect(fetcher).toHaveBeenCalledWith(
      'https://routing.example/ors/v2/matrix/foot-walking',
      expect.anything(),
    );
  });
});

describe('route geometry cache', () => {
  it('keeps mock cached paths out of the live provider namespace', async () => {
    const { db } = memoryFirestore();
    await new CachedRoutingProvider(new MockRoutingProvider(), db).directions(points, 'foot-walking');
    const directions = vi.fn(async () => ({
      path: [
        [52.52, 13.405],
        [52.52, 13.407],
        [52.521, 13.407],
      ] as [number, number][],
      meters: 250,
      minutes: 3,
    }));
    const provider: RoutingProvider = { source: 'ors', directions, matrix: new MockRoutingProvider().matrix };
    const cached = new CachedRoutingProvider(provider, db);
    const route = await cached.directions(points, 'foot-walking');
    expect(route.path).toHaveLength(3);
    expect(await cached.directions(points, 'foot-walking')).toEqual(route);
    expect(directions).toHaveBeenCalledTimes(1);
  });

  it('rejects provider failures and malformed paths without caching fabricated geometry', async () => {
    const { db, docs } = memoryFirestore();
    const directions = vi.fn().mockRejectedValue(new Error('offline'));
    const provider: RoutingProvider = { source: 'ors', directions, matrix: new MockRoutingProvider().matrix };
    const cached = new CachedRoutingProvider(provider, db);
    await expect(cached.directions(points, 'foot-walking')).rejects.toMatchObject({ code: 'unavailable' });
    directions.mockResolvedValue({ path: [[52.52, 13.405]], meters: 10, minutes: 1 });
    await expect(cached.directions(points, 'foot-walking')).rejects.toMatchObject({ code: 'unavailable' });
    expect(docs.size).toBe(0);
  });

  it('does not swallow budget brakes into matrix or directions estimates', async () => {
    const { db } = memoryFirestore();
    const fail = async () => {
      throw new BudgetError('daily_budget');
    };
    const cached = new CachedRoutingProvider({ source: 'ors', directions: fail, matrix: fail }, db);
    await expect(cached.matrix(points, 'foot-walking')).rejects.toMatchObject({
      details: { reason: 'daily_budget' },
    });
    await expect(cached.directions(points, 'foot-walking')).rejects.toMatchObject({
      details: { reason: 'daily_budget' },
    });
  });
});
