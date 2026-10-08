import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { RateLimitError } from '../util/rateLimit';
import { HttpPoiSources } from './poiSources';
import {
  fetchOverpass,
  OVERPASS_DAILY_LIMIT,
  OVERPASS_LEASE_MS,
  OVERPASS_MAX_BYTES,
  OVERSPAN_ENDPOINT,
  reserveOverpassRequest,
} from './overpass';

const bounds = { south: 52.51, west: 13.37, north: 52.52, east: 13.38 };
const now = Date.parse('2026-10-05T12:00:00Z');
const quotaPath = 'rateLimits/overpass_requests';
const response = {
  elements: [
    {
      type: 'way',
      id: 123,
      center: { lat: 52.516, lon: 13.377 },
      tags: {
        name: 'Test monument',
        'name:de': 'Testdenkmal',
        historic: 'monument',
        access: 'private',
        fee: 'yes',
        wikipedia: 'de:Testdenkmal',
        wikidata: 'Q123',
        wikimedia_commons: 'File:Test.jpg',
      },
    },
  ],
};
const permit = () => {
  const release = vi.fn().mockResolvedValue(undefined);
  return { release, reserveRequest: vi.fn().mockResolvedValue({ release }) };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('optional Overspan POI source', () => {
  it('authenticates only by server bearer header and preserves full OSM access/source/image tags', async () => {
    const guard = permit();
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetcher);
    const source = new HttpPoiSources(OVERSPAN_ENDPOINT, undefined, {
      apiKey: 'server-only-test-key',
      reserveRequest: guard.reserveRequest,
    });
    const result = await source.fetchOsm(bounds);
    expect(result).toEqual([
      expect.objectContaining({
        source: 'osm',
        sourceId: 'way/123',
        name: 'Test monument',
        names: { de: 'Testdenkmal' },
        location: { lat: 52.516, lng: 13.377 },
        osmTags: response.elements[0]!.tags,
        wikidataId: 'Q123',
        wikipedia: [{ lang: 'de', title: 'Testdenkmal', length: 0 }],
        imageFile: 'File:Test.jpg',
      }),
    ]);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(OVERSPAN_ENDPOINT);
    expect(url).not.toContain('server-only-test-key');
    expect(options.headers.Authorization).toBe('Bearer server-only-test-key');
    expect(options.redirect).toBe('error');
    const query = new URLSearchParams(options.body).get('data');
    expect(query).toContain('[timeout:60]');
    expect(query).toContain('out center tags 1500;');
    expect(query).toContain('out body geom 500;');
    expect(guard.reserveRequest).toHaveBeenCalledOnce();
    expect(guard.reserveRequest.mock.invocationCallOrder[0]).toBeLessThan(
      fetcher.mock.invocationCallOrder[0]!,
    );
    expect(guard.release).toHaveBeenCalledWith(0);
  });

  it('fails before network access when the configured vendor lacks a real key or request guard', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { reserveRequest: permit().reserveRequest }),
    ).rejects.toThrow('requires');
    await expect(fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key' })).rejects.toThrow(
      'requires',
    );
    await expect(
      fetchOverpass('https://other.example/api/interpreter', bounds, { apiKey: 'test-key' }),
    ).rejects.toThrow('canonical');
    await expect(
      fetchOverpass('http://api.overspan.dev/api/interpreter', bounds, { apiKey: 'test-key' }),
    ).rejects.toThrow('canonical');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('makes no request after a local quota rejection', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, {
        apiKey: 'test-key',
        reserveRequest: async () => {
          throw new RateLimitError(1000);
        },
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { remark: 'runtime error', elements: [] },
    {},
    { elements: [{ type: 'way', id: 1, center: { lat: 999, lon: 0 } }] },
  ])('rejects incomplete and invalid HTTP200 data instead of publishing an empty area', async (body) => {
    const guard = permit();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key', reserveRequest: guard.reserveRequest }),
    ).rejects.toThrow('incomplete or invalid');
    expect(guard.release).toHaveBeenCalledWith(0);
  });

  it.each([false, true])('bounds response bytes even without Content-Length (%s)', async (header) => {
    const guard = permit();
    const body = new Response('x'.repeat(OVERPASS_MAX_BYTES + 1), {
      headers: header ? { 'Content-Length': String(OVERPASS_MAX_BYTES + 1) } : {},
    });
    const fetcher = vi.fn().mockResolvedValue(body);
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key', reserveRequest: guard.reserveRequest }),
    ).rejects.toThrow('byte limit');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(guard.release).not.toHaveBeenCalled();
  });

  it('honors a429 backoff without retrying, even when its body is not JSON', async () => {
    const guard = permit();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('rate limited', { status: 429, headers: { 'Retry-After': '42' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key', reserveRequest: guard.reserveRequest }),
    ).rejects.toMatchObject({ retryAfterMs: 42_000 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(guard.release).toHaveBeenCalledWith(42_000);
  });

  it('uses the exact monthly reset instead of the one-hour retry header when the paid quota is exhausted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const guard = permit();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: 'quota_exceeded' } },
          {
            status: 429,
            headers: { 'Retry-After': '3600', 'X-Overspan-Quota-Reset': '2026-11-01T00:00:00Z' },
          },
        ),
      ),
    );
    const delay = Date.parse('2026-11-01T00:00:00Z') - now;
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key', reserveRequest: guard.reserveRequest }),
    ).rejects.toMatchObject({ retryAfterMs: delay });
    expect(guard.release).toHaveBeenCalledWith(delay);
  });

  it('never retries a failed transport or releases a lease while the remote query may still run', async () => {
    const guard = permit();
    const fetcher = vi.fn().mockRejectedValue(new Error('network failure'));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      fetchOverpass(OVERSPAN_ENDPOINT, bounds, { apiKey: 'test-key', reserveRequest: guard.reserveRequest }),
    ).rejects.toThrow('network failure');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(guard.release).not.toHaveBeenCalled();
  });
});

describe('global Overpass request guard', () => {
  it('admits only one concurrent reservation and does not consume daily quota for local rejections', async () => {
    const { db, docs } = memoryFirestore();
    const results = await Promise.allSettled([
      reserveOverpassRequest(db, now, () => now),
      reserveOverpassRequest(db, now, () => now),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(docs.get(quotaPath)?.count).toBe(1);
    const accepted = results.find((r) => r.status === 'fulfilled')!;
    if (accepted.status !== 'fulfilled') throw new Error('expected permit');
    await accepted.value.release();
    await expect(reserveOverpassRequest(db, now, () => now)).resolves.toBeDefined();
    expect(docs.get(quotaPath)?.count).toBe(2);
  });

  it('stops at the daily attempt limit per UTC day and resumes after midnight', async () => {
    const { db, docs } = memoryFirestore();
    for (let i = 0; i < OVERPASS_DAILY_LIMIT; i++)
      await (await reserveOverpassRequest(db, now, () => now)).release();
    await expect(reserveOverpassRequest(db, now, () => now)).rejects.toMatchObject({
      retryAfterMs: 43_200_000,
    });
    expect(docs.get(quotaPath)?.count).toBe(OVERPASS_DAILY_LIMIT);
    const tomorrow = now + 43_200_000;
    await expect(reserveOverpassRequest(db, tomorrow, () => tomorrow)).resolves.toBeDefined();
    expect(docs.get(quotaPath)?.count).toBe(1);
  });

  it('keeps the global lease across midnight and ignores completion from an expired permit', async () => {
    const { db, docs } = memoryFirestore();
    const beforeMidnight = Date.parse('2026-10-05T23:59:59Z');
    const old = await reserveOverpassRequest(db, beforeMidnight, () => beforeMidnight);
    await expect(reserveOverpassRequest(db, beforeMidnight + 1000)).rejects.toBeInstanceOf(RateLimitError);
    const later = beforeMidnight + OVERPASS_LEASE_MS;
    await reserveOverpassRequest(db, later, () => later);
    const current = structuredClone(docs.get(quotaPath));
    await old.release();
    expect(docs.get(quotaPath)).toEqual(current);
  });

  it('shares upstream backoff across workers and retains it beyond the usual TTL', async () => {
    const { db, docs } = memoryFirestore();
    const delay = 20 * 86_400_000;
    const lease = await reserveOverpassRequest(db, now, () => now);
    await lease.release(delay);
    await expect(reserveOverpassRequest(db, now + 1000)).rejects.toMatchObject({
      retryAfterMs: delay - 1000,
    });
    expect((docs.get(quotaPath)?.expireAt as Date).getTime()).toBeGreaterThan(now + delay);
    expect(docs.get(quotaPath)?.count).toBe(1);
  });
});
