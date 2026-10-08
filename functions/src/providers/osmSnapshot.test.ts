import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { encodeGeohash, geohashBounds, type Bounds, type RawPoi } from '@tuur/shared';
import type { PoiSourceClient } from './poiSources';
import {
  decodeTileElements,
  encodeTileElements,
  OSM_META_DOC,
  pointInPolygon,
  SnapshotPoiSources,
} from './osmSnapshot';

const tile = encodeGeohash(52.5352, 13.2, 6);
const bounds = geohashBounds(tile);
const coverage: Bounds = { south: 52.28, west: 12.9, north: 52.78, east: 13.92 };
const elements = [
  {
    type: 'node',
    id: 1,
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
    tags: { name: 'Zitadelle', historic: 'castle' },
  },
];

function database(docs: Record<string, Record<string, unknown>>) {
  const get = vi.fn(async (id: string) => ({
    exists: id in docs,
    data: () => docs[id],
    get: (key: string) => docs[id]?.[key],
  }));
  const db = {
    collection: () => ({ doc: (id: string) => ({ get: () => get(id) }) }),
  } as unknown as Firestore;
  return { db, get };
}

const live: RawPoi[] = [];
function inner() {
  const client: PoiSourceClient = {
    fetchOsm: vi.fn(async () => live),
    fetchWikidata: vi.fn(async () => []),
    fetchWikipedia: vi.fn(async () => []),
    fetchImages: vi.fn(async () => new Map()),
  };
  return client;
}
const meta = { coverage, extractedAt: '2026-10-07T20:20:35Z', source: 'geofabrik brandenburg' };

describe('imported OSM tile snapshots', () => {
  it('round-trips elements through compression', () => {
    expect(decodeTileElements(encodeTileElements(elements))).toEqual(elements);
    expect(() => decodeTileElements(encodeTileElements([]).subarray(0, 4))).toThrow();
  });

  it('serves a covered tile from Firestore without touching Overpass', async () => {
    const { db } = database({
      [OSM_META_DOC]: meta,
      [tile]: { data: encodeTileElements(elements) },
    });
    const fallback = inner();
    const result = await new SnapshotPoiSources(db, fallback).fetchOsm(bounds);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'osm', name: 'Zitadelle' });
    expect(fallback.fetchOsm).not.toHaveBeenCalled();
  });

  it('treats a missing tile inside the covered region as empty, not as a failure', async () => {
    const { db } = database({ [OSM_META_DOC]: meta });
    const fallback = inner();
    expect(await new SnapshotPoiSources(db, fallback).fetchOsm(bounds)).toEqual([]);
    expect(fallback.fetchOsm).not.toHaveBeenCalled();
  });

  it('falls back to the live source outside the covered region and without an import', async () => {
    const paris = geohashBounds(encodeGeohash(48.857, 2.352, 6));
    const withMeta = database({ [OSM_META_DOC]: meta });
    const a = inner();
    await new SnapshotPoiSources(withMeta.db, a).fetchOsm(paris);
    expect(a.fetchOsm).toHaveBeenCalledWith(paris);
    const without = database({});
    const b = inner();
    await new SnapshotPoiSources(without.db, b).fetchOsm(bounds);
    expect(b.fetchOsm).toHaveBeenCalledWith(bounds);
  });

  it('ignores a malformed meta document and never guesses for non-tile bounds', async () => {
    const broken = database({ [OSM_META_DOC]: { coverage: { south: 'x' }, extractedAt: 1 } });
    const a = inner();
    await new SnapshotPoiSources(broken.db, a).fetchOsm(bounds);
    expect(a.fetchOsm).toHaveBeenCalledOnce();
    const odd = { ...bounds, east: bounds.east - 0.001 };
    const ok = database({ [OSM_META_DOC]: meta });
    const b = inner();
    await new SnapshotPoiSources(ok.db, b).fetchOsm(odd);
    expect(b.fetchOsm).toHaveBeenCalledWith(odd);
  });

  it('caches the meta document and delegates the other sources untouched', async () => {
    const { db, get } = database({ [OSM_META_DOC]: meta });
    const fallback = inner();
    const sources = new SnapshotPoiSources(db, fallback);
    await sources.fetchOsm(bounds);
    await sources.fetchOsm(bounds);
    expect(get.mock.calls.filter(([id]) => id === OSM_META_DOC)).toHaveLength(1);
    await sources.fetchWikidata(bounds);
    await sources.fetchWikipedia(bounds, 'de');
    await sources.fetchImages(['File:A.jpg']);
    expect(fallback.fetchWikidata).toHaveBeenCalledWith(bounds);
    expect(fallback.fetchWikipedia).toHaveBeenCalledWith(bounds, 'de');
    expect(fallback.fetchImages).toHaveBeenCalledWith(['File:A.jpg']);
  });

  it('uses the exact outline: bounding-box corners outside the extract still go live', async () => {
    // A triangle that contains Spandau but not the rest of the bounding box.
    const polygon = [{ p: [13.0, 52.4, 13.4, 52.4, 13.2, 52.7] }];
    const { db } = database({ [OSM_META_DOC]: { ...meta, polygon } });
    const fallback = inner();
    const sources = new SnapshotPoiSources(db, fallback);
    expect(await sources.fetchOsm(bounds)).toEqual([]);
    expect(fallback.fetchOsm).not.toHaveBeenCalled();
    const corner = geohashBounds(encodeGeohash(52.7, 13.85, 6));
    await sources.fetchOsm(corner);
    expect(fallback.fetchOsm).toHaveBeenCalledWith(corner);
  });

  it('rejects a broken polygon instead of widening the coverage', async () => {
    const { db } = database({ [OSM_META_DOC]: { ...meta, polygon: [{ p: [1, 2] }] } });
    const fallback = inner();
    await new SnapshotPoiSources(db, fallback).fetchOsm(bounds);
    expect(fallback.fetchOsm).toHaveBeenCalledOnce();
  });

  it('tests points against rings with holes', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6]];
    expect(pointInPolygon([square, hole], 2, 2)).toBe(true);
    expect(pointInPolygon([square, hole], 5, 5)).toBe(false);
    expect(pointInPolygon([square], 11, 5)).toBe(false);
  });
});
