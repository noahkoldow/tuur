import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, encodeGeohash, tileWithNeighbors } from '@tuur/shared';
import { RateLimitError } from '../util/rateLimit';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { MockPoiSources } from '../providers/poiSources';
import { MockGeocoder } from '../providers/geocoding';
import { ingestArea } from './ingest';
import { newArea } from './store';

function fixture() {
  const { db, docs } = memoryFirestore();
  const sources = new MockPoiSources();
  const geocoder = new MockGeocoder();
  const osm = vi.spyOn(sources, 'fetchOsm');
  const reverse = vi.spyOn(geocoder, 'reverse');
  const wiki = vi.spyOn(sources, 'fetchWikidata');
  return {
    docs,
    osm,
    reverse,
    wiki,
    deps: { db, sources, geocoder, llm: new MockLlmProvider(), ai: DEFAULT_AI_CONFIG, now: () => 1000 },
  };
}

describe('on-demand area ingestion', () => {
  const tile = encodeGeohash(48.86, 2.335, 6);

  it.each([
    { locked: true, expiresAt: 0 },
    { locked: false, expiresAt: 2000 },
  ])('duplicate task delivery preserves cached/imported places without provider calls %j', async (state) => {
    const f = fixture();
    f.docs.set(`areas/${tile}`, { ...newArea(tile, 0), status: 'ready', poiCount: 7, ...state });
    expect(await ingestArea(f.deps, tile)).toEqual({ status: 'ready', poiCount: 7, warnings: [] });
    expect(f.osm).not.toHaveBeenCalled();
    expect(f.reverse).not.toHaveBeenCalled();
  });

  it('does not call enrichment/geocoding or publish an empty area when OSM fails', async () => {
    const f = fixture();
    f.docs.set(`areas/${tile}`, { ...newArea(tile, 0), status: 'ingesting' });
    f.osm.mockRejectedValue(new Error('OSM unavailable'));
    await expect(ingestArea(f.deps, tile)).rejects.toThrow('OSM unavailable');
    expect(f.reverse).not.toHaveBeenCalled();
    expect(f.wiki).not.toHaveBeenCalled();
    expect(f.docs.get(`areas/${tile}`)).toMatchObject({ status: 'failed' });
  });

  it('keeps the tile usable when the geocoder is rate limited but a neighbor already knows the place', async () => {
    const f = fixture();
    const neighbor = tileWithNeighbors(tile).find((t) => t !== tile)!;
    f.docs.set(`areas/${tile}`, { ...newArea(tile, 0), status: 'ingesting' });
    f.docs.set(`areas/${neighbor}`, { ...newArea(neighbor, 0), status: 'ready', placeId: 'FR_paris' });
    f.docs.set('places/FR_paris', {
      id: 'FR_paris',
      name: 'Paris',
      countryCode: 'FR',
      location: { lat: 48.86, lng: 2.335 },
      sourceLangs: ['fr'],
      createdAt: 0,
    });
    f.reverse.mockRejectedValue(new RateLimitError(60_000));
    const result = await ingestArea(f.deps, tile);
    expect(result.poiCount).toBeGreaterThan(0);
    expect(f.docs.get(`areas/${tile}`)).toMatchObject({ status: result.status, placeId: 'FR_paris' });
  });

  it('persists provider places outside Berlin without a manually imported region', async () => {
    const f = fixture();
    f.docs.set(`areas/${tile}`, { ...newArea(tile, 0), status: 'ingesting' });
    f.docs.set('pois/stale-place', { tile });
    const result = await ingestArea(f.deps, tile);
    expect(result.poiCount).toBeGreaterThan(0);
    expect(['ready', 'low_content']).toContain(result.status);
    expect(f.docs.get(`areas/${tile}`)).toMatchObject({ status: result.status, poiCount: result.poiCount });
    expect([...f.docs.entries()].filter(([path]) => path.startsWith('pois/')).length).toBe(result.poiCount);
    expect(f.docs.has('pois/stale-place')).toBe(false);
  });
});
