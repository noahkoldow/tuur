import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { RateLimitError } from '../util/rateLimit';
import { countryCodeAlpha2 } from './countryCodes';
import { placeFromGeocode } from './geocoding';
import { PeliasGeocoder, reservePeliasRequest } from './pelias';

const centre = { lat: 52.52, lng: 13.405 };
const feature = (properties: Record<string, unknown>) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [13.405, 52.52] }, properties }],
});
const berlin = feature({ layer: 'locality', name: 'Berlin', country: 'Germany', country_a: 'DEU' });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('HeiGIT Pelias reverse geocoding', () => {
  it('uses the server key for one coarse lookup and normalizes the place country for downstream sources', async () => {
    vi.stubEnv('PELIAS_URL', undefined);
    const fetcher = vi.fn().mockResolvedValue(Response.json(berlin));
    vi.stubGlobal('fetch', fetcher);
    const reserve = vi.fn().mockResolvedValue(undefined);

    const result = await new PeliasGeocoder('server-test-key', reserve).reverse(centre);

    expect(result).toEqual({ name: 'Berlin', country: 'Germany', countryCode: 'DE' });
    expect(placeFromGeocode(result, centre, 123)).toMatchObject({
      id: 'DE_berlin',
      sourceLangs: ['de', 'en'],
    });
    const [url, options] = fetcher.mock.calls[0]!;
    const query = new URL(url);
    expect(query.origin + query.pathname).toBe('https://api.heigit.org/pelias/v1/reverse');
    expect(Object.fromEntries(query.searchParams)).toEqual({
      'point.lat': '52.52',
      'point.lon': '13.405',
      layers: 'locality,localadmin,county,region',
      size: '1',
      lang: 'en',
    });
    expect(options.headers.Authorization).toBe('server-test-key');
    expect(url).not.toContain('server-test-key');
    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]!);
  });

  it('supports configured service paths and rural administrative responses without inventing a city', async () => {
    vi.stubEnv('PELIAS_URL', 'https://geo.example.net/pelias/');
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        feature({
          layer: 'county',
          name: 'Cumbria',
          country: 'United Kingdom',
          country_a: 'GBR',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await new PeliasGeocoder('server-test-key', async () => {}).reverse(centre);
    expect(result).toEqual({ name: 'Cumbria', country: 'United Kingdom', countryCode: 'GB' });
    expect(fetcher.mock.calls[0]![0]).toMatch(/^https:\/\/geo\.example\.net\/pelias\/v1\/reverse\?/);
  });

  it.each([
    { type: 'FeatureCollection', features: [] },
    { error: 'quota exceeded' },
    feature({ layer: 'venue', name: 'Museum', country_a: 'DEU' }),
    feature({ layer: 'locality', name: 'Unknown', country_a: 'ZZZ' }),
    feature({ layer: 'locality', country_a: 'DEU' }),
  ])('rejects empty, non-place and malformed data instead of fabricating metadata', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(new PeliasGeocoder('server-test-key', async () => {}).reverse(centre)).rejects.toThrow(
      'Pelias returned',
    );
  });

  it.each([401, 403, 503])('surfaces HTTP %s with no hidden retry or provider fallback', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(new PeliasGeocoder('server-test-key', async () => {}).reverse(centre)).rejects.toThrow(
      `HTTP ${status}`,
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, 86_400_000],
    ['invalid', 86_400_000],
    ['0', 0],
    ['120', 120_000],
    ['Mon, 05 Oct 2026 12:02:00 GMT', 120_000],
  ])('defers provider quota errors with Retry-After %s and never retries inline', async (header, delay) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T12:00:00Z'));
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 429, headers: header ? { 'Retry-After': String(header) } : {} }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = new PeliasGeocoder('server-test-key', async () => {}).reverse(centre);
    await expect(result).rejects.toBeInstanceOf(RateLimitError);
    await expect(result).rejects.toMatchObject({ retryAfterMs: delay });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('sends no request after the shared quota is exhausted or for invalid coordinates', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const reserve = vi.fn().mockRejectedValue(new RateLimitError(1000));
    const provider = new PeliasGeocoder('server-test-key', reserve);
    await expect(provider.reverse(centre)).rejects.toBeInstanceOf(RateLimitError);
    await expect(provider.reverse({ lat: NaN, lng: 13 })).rejects.toThrow('valid coordinates');
    expect(reserve).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['DEU', 'DE'],
    ['AUT', 'AT'],
    ['CHE', 'CH'],
    ['GBR', 'GB'],
    ['USA', 'US'],
    ['JPN', 'JP'],
    ['TWN', 'TW'],
    ['NZL', 'NZ'],
    ['ZAF', 'ZA'],
    ['de', 'DE'],
  ])('normalizes ISO country %s without truncating alpha-3 codes', (input, expected) => {
    expect(countryCodeAlpha2(input!)).toBe(expected);
  });
});

describe('shared Pelias quota guard', () => {
  it('caps parallel requests from workers and resumes after the minute window', async () => {
    const { db, docs } = memoryFirestore();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 41 }, () => reservePeliasRequest(db, 1000)),
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(40);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(docs.get('rateLimits/heigit_pelias_day')?.count).toBe(40);
    await expect(reservePeliasRequest(db, 61_000)).resolves.toBeUndefined();
    expect(docs.get('rateLimits/heigit_pelias_day')?.count).toBe(41);
  });

  it('does not deplete daily quota when the minute limit rejects repeated local attempts', async () => {
    const { db, docs } = memoryFirestore();
    const day = { windowStart: 1000, count: 70 };
    const minute = { windowStart: 61_000, count: 40 };
    docs.set('rateLimits/heigit_pelias_day', day);
    docs.set('rateLimits/heigit_pelias_minute', minute);
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(reservePeliasRequest(db, 62_000)).rejects.toMatchObject({ retryAfterMs: 59_000 });
    expect(docs.get('rateLimits/heigit_pelias_day')).toEqual(day);
    expect(docs.get('rateLimits/heigit_pelias_minute')).toEqual(minute);
  });

  it('stops the whole project at the daily cap even when minute quota is available', async () => {
    const { db, docs } = memoryFirestore();
    docs.set('rateLimits/heigit_pelias_day', { windowStart: 1000, count: 1000 });
    await expect(reservePeliasRequest(db, 61_000)).rejects.toBeInstanceOf(RateLimitError);
    expect(docs.has('rateLimits/heigit_pelias_minute')).toBe(false);
    await expect(reservePeliasRequest(db, 86_401_000)).resolves.toBeUndefined();
  });
});
