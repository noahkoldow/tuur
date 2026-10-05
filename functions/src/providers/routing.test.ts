import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrsRoutingProvider } from './routing';

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
