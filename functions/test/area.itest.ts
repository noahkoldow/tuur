import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  REGION_FIXTURES,
  encodeGeohash,
  tileWithNeighbors,
  type Bounds,
  type ImageRef,
  type RawPoi,
} from '@tuur/shared';
import { ensureAreas } from '../src/area/ensureArea';
import { ingestArea } from '../src/area/ingest';
import { MockGeocoder } from '../src/providers/geocoding';
import { MockLlmProvider } from '../src/providers/llm';
import type { PoiSourceClient } from '../src/providers/poiSources';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
const NOW = 1_700_000_000_000;

/** Serves a fixture's raw candidates split across sources, ignoring the bbox filter done by ingest. */
class FixtureSources implements PoiSourceClient {
  constructor(private readonly raw: RawPoi[]) {}
  async fetchOsm(_b: Bounds) {
    return this.raw.filter((r) => r.source === 'osm');
  }
  async fetchWikidata(_b: Bounds) {
    return this.raw.filter((r) => r.source === 'wikidata');
  }
  async fetchWikipedia(_b: Bounds, lang: string) {
    return this.raw.filter((r) => r.source === 'wikipedia' && r.wikipedia?.[0]?.lang === lang);
  }
  async fetchImages() {
    return new Map<string, ImageRef>();
  }
}

const deps = (raw: RawPoi[]) => ({
  db,
  sources: new FixtureSources(raw),
  geocoder: new MockGeocoder(),
  llm: new MockLlmProvider(),
  ai: DEFAULT_AI_CONFIG,
  now: () => NOW,
});

beforeEach(async () => {
  await clearFirestore();
});

describe('ensureAreas (dedup)', () => {
  const tile = encodeGeohash(52.5163, 13.3777, 6);

  it('20 parallel requests start exactly one ingest per tile', async () => {
    const enqueued: string[] = [];
    const d = { db, now: () => NOW, enqueueIngest: async (g: string) => void enqueued.push(g) };
    const results = await Promise.all(Array.from({ length: 20 }, () => ensureAreas(d, tile, true)));
    const started = results.flatMap((r) => r.started);
    expect(new Set(started).size).toBe(started.length);
    expect(started.sort()).toEqual(tileWithNeighbors(tile).sort());
    expect(enqueued.sort()).toEqual(tileWithNeighbors(tile).sort());
    const snap = await db.collection('areas').doc(tile).get();
    expect(snap.get('status')).toBe('ingesting');
  });

  it('releases the claim as failed if enqueueing fails so it can be retried', async () => {
    const d = { db, now: () => NOW, enqueueIngest: async () => Promise.reject(new Error('queue down')) };
    const res = await ensureAreas(d, tile, false);
    expect(res.started).toEqual([]);
    expect((await db.collection('areas').doc(tile).get()).get('status')).toBe('failed');
    const later = { ...d, now: () => NOW + 60 * 60_000, enqueueIngest: async () => {} };
    expect((await ensureAreas(later, tile, false)).started).toEqual([tile]);
  });
});

describe('ingestArea on region fixtures', () => {
  for (const f of REGION_FIXTURES) {
    it(`${f.label} -> ${f.expectedStatus}, POIs queryable by tile`, async () => {
      // Tile precision is configurable (spec 4.1): a coarse (precision 3) tile keeps each fixture inside one tile.
      const tile = encodeGeohash(f.center.lat, f.center.lng, 3);
      const centerRaw = f.raw;
      expect(new Set(f.raw.map((r) => encodeGeohash(r.location.lat, r.location.lng, 3)))).toEqual(
        new Set([tile]),
      );
      const res = await ingestArea(deps(centerRaw), tile);
      expect(res.status).toBe(f.expectedStatus);
      const pois = await db.collection('pois').where('tile', '==', tile).get();
      expect(pois.size).toBe(res.poiCount);
      expect(pois.size).toBeGreaterThan(0);
      const area = (await db.collection('areas').doc(tile).get()).data()!;
      expect(area['status']).toBe(f.expectedStatus);
      expect(area['placeId']).toMatch(/^DE_/);
      expect(area['expiresAt']).toBeGreaterThan(NOW);
      expect((await db.collection('places').get()).size).toBe(1);
    });
  }

  it('marks the area failed when the anchor source (OSM) fails', async () => {
    const tile = encodeGeohash(48.1, 11.5, 6);
    const broken = {
      ...deps([]),
      sources: {
        ...new FixtureSources([]),
        fetchOsm: async () => Promise.reject(new Error('overpass 429')),
        fetchWikidata: async () => [],
        fetchWikipedia: async () => [],
        fetchImages: async () => new Map(),
      },
    };
    await expect(ingestArea(broken, tile)).rejects.toThrow('overpass 429');
    expect((await db.collection('areas').doc(tile).get()).get('status')).toBe('failed');
  });

  it('preserves moderation (hidden, adminWeight) across re-ingest', async () => {
    const f = REGION_FIXTURES[0]!;
    const tile = encodeGeohash(f.center.lat, f.center.lng, 3);
    const raw = f.raw;
    await ingestArea(deps(raw), tile);
    const first = (await db.collection('pois').where('tile', '==', tile).limit(1).get()).docs[0]!;
    await first.ref.update({ hidden: true, adminWeight: 0.5 });
    await ingestArea(deps(raw), tile);
    const after = (await first.ref.get()).data()!;
    expect(after['hidden']).toBe(true);
    expect(after['adminWeight']).toBe(0.5);
  });
});
