import { describe, expect, it, vi } from 'vitest';
import { PoiSchema } from '@tuur/shared';
import { createDemoBackend } from './demoBackend';
import { PoiTextCache } from './poiTextCache';

const poi = PoiSchema.parse({
  id: 'gate',
  name: 'Gate',
  location: { lat: 52, lng: 13 },
  geohash: 'u33db0',
  tile: 'u33db0',
  updatedAt: 1,
  interests: ['architecture'],
  rawScore: 50,
  baseScore: 50,
  score: 50,
  sources: {},
});
function setup() {
  const backend = createDemoBackend({ latencyMs: 0 });
  let uid: string | undefined = 'first';
  backend.auth.current = () => (uid ? { uid, isAnonymous: false } : null);
  const getText = vi.spyOn(backend, 'getPoiText').mockResolvedValue(poi);
  const cache = new PoiTextCache(backend);
  return {
    cache,
    getText,
    user: (value?: string) => {
      uid = value;
    },
  };
}
const req = { poiId: poi.id, lang: 'de' };

describe('free place source cache', () => {
  it('deduplicates concurrent readers but separates language, source version and access context', async () => {
    const { cache, getText } = setup();
    const first = cache.load(poi, req);
    expect(cache.load(poi, req)).toBe(first);
    await first;
    await cache.load(poi, { ...req, lang: 'en' });
    await cache.load({ ...poi, updatedAt: 2 }, req);
    await cache.load(poi, { ...req, access: { tourId: 'private', mode: 'tour' } });
    expect(getText).toHaveBeenCalledTimes(4);
  });
  it('rejects a late response after account change and does not reuse another account cache', async () => {
    const { cache, getText, user } = setup();
    let resolve!: (value: typeof poi) => void;
    getText.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const first = cache.load(poi, req);
    user('second');
    resolve(poi);
    await expect(first).rejects.toMatchObject({ code: 'unauthenticated' });
    await cache.load(poi, req);
    expect(getText).toHaveBeenCalledTimes(2);
    user();
    await expect(cache.load(poi, req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('allows retry after source failures and when an earlier response had no extract', async () => {
    const { cache, getText } = setup();
    getText.mockRejectedValueOnce(new Error('source unavailable'));
    await expect(cache.load(poi, req)).rejects.toThrow('source unavailable');
    await cache.load(poi, req);
    await cache.load(poi, req, true);
    expect(getText).toHaveBeenCalledTimes(3);
  });
  it('rejects mismatched place responses', async () => {
    const { cache, getText } = setup();
    getText.mockResolvedValueOnce({ ...poi, id: 'another-place' });
    await expect(cache.load(poi, req)).rejects.toMatchObject({ code: 'unavailable' });
  });
});
