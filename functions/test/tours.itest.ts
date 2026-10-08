import { beforeEach, describe, expect, it } from 'vitest';
import {
  decodePolyline,
  DEFAULT_AI_CONFIG,
  REGION_FIXTURES,
  TourSchema,
  encodeGeohash,
  type Bounds,
  type ImageRef,
  type RawPoi,
} from '@tuur/shared';
import { ingestArea } from '../src/area/ingest';
import { MockGeocoder } from '../src/providers/geocoding';
import { MockLlmProvider, type LlmProvider } from '../src/providers/llm';
import type { PoiSourceClient } from '../src/providers/poiSources';
import { MockRoutingProvider, type RoutingProvider } from '../src/providers/routing';
import { generateAutoTours, type TourDeps } from '../src/tours/service';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_700_000_000_000;

class Fixture implements PoiSourceClient {
  constructor(private readonly raw: RawPoi[]) {}
  fetchOsm = async (_b: Bounds) => this.raw.filter((r) => r.source === 'osm');
  fetchWikidata = async (_b: Bounds) => this.raw.filter((r) => r.source === 'wikidata');
  fetchWikipedia = async (_b: Bounds, lang: string) =>
    this.raw.filter((r) => r.source === 'wikipedia' && r.wikipedia?.[0]?.lang === lang);
  fetchImages = async () => new Map<string, ImageRef>();
}

const berlin = REGION_FIXTURES[0]!;
const tile = encodeGeohash(berlin.center.lat, berlin.center.lng, 3);

class CountingLlm extends MockLlmProvider {
  concepts = 0;
  override async generateTourConcept(...a: Parameters<LlmProvider['generateTourConcept']>) {
    this.concepts++;
    await new Promise((r) => setTimeout(r, 20));
    return super.generateTourConcept(...a);
  }
}

const mk = (over: Partial<TourDeps> = {}) => {
  const llm = new CountingLlm();
  const deps: TourDeps = {
    db,
    llm,
    routing: new MockRoutingProvider(),
    now: () => clock,
    config: async () => DEFAULT_AI_CONFIG,
    ...over,
  };
  return { deps, llm };
};

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000;
  await ingestArea(
    {
      db,
      sources: new Fixture(berlin.raw),
      geocoder: new MockGeocoder(),
      llm: new MockLlmProvider(),
      ai: DEFAULT_AI_CONFIG,
      now: () => clock,
    },
    tile,
  );
});

const req = { tile, lang: 'de' };

describe('generateAutoTours', () => {
  it('creates plausible, valid tours: time budget kept, no duplicate stops, shortest is free', async () => {
    const { deps } = mk();
    const res = await generateAutoTours(deps, 'u1', req);
    expect(res.status).toBe('ready');
    expect(res.tours.length).toBeGreaterThanOrEqual(1);
    const docs = (await db.collection('tours').get()).docs.map((d) => TourSchema.parse(d.data()));
    const budget: Record<string, number> = { highlights60: 60, grand120: 120 };
    for (const t of docs) {
      expect(t.stops.length).toBeGreaterThanOrEqual(4);
      expect(new Set(t.stops.map((s) => s.poiId)).size).toBe(t.stops.length);
      expect(t.durationMinutes).toBeLessThanOrEqual(budget[t.template] ?? 75);
      expect(t.stops.every((s) => s.walkMinutesFromPrev <= 15)).toBe(true);
      expect(t.texts['de']?.title).toBeTruthy();
      expect(t.texts['de']?.transitions).toHaveLength(t.stops.length - 1);
      expect(decodePolyline(t.path).length).toBeGreaterThan(1);
      expect(t.version).toBe(1);
    }
    const free = docs.filter((t) => t.free);
    expect(free).toHaveLength(1);
    expect(free[0]!.durationMinutes).toBe(Math.min(...docs.map((t) => t.durationMinutes)));
  });

  it('reuses fresh tours, adds texts only for a new language and does not replan', async () => {
    const { deps, llm } = mk();
    await generateAutoTours(deps, 'u1', req);
    const before = (await db.collection('tours').get()).docs.map((d) => TourSchema.parse(d.data()));
    const conceptsAfterFirst = llm.concepts;
    const again = await generateAutoTours(deps, 'u2', req);
    expect(again.status).toBe('ready');
    expect(llm.concepts).toBe(conceptsAfterFirst);
    await generateAutoTours(deps, 'u3', { ...req, lang: 'en' });
    expect(llm.concepts).toBe(conceptsAfterFirst + before.length);
    const after = (await db.collection('tours').get()).docs.map((d) => TourSchema.parse(d.data()));
    for (const t of after) {
      expect(Object.keys(t.texts).sort()).toEqual(['de', 'en']);
      const b = before.find((x) => x.id === t.id)!;
      expect(t.stops.map((s) => s.poiId)).toEqual(b.stops.map((s) => s.poiId));
      expect(t.version).toBe(b.version);
    }
  });

  it('deduplicates parallel generation for one place with a lock', async () => {
    const { deps, llm } = mk();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => generateAutoTours(deps, `u${i}`, req)),
    );
    expect(results.filter((r) => r.status === 'ready').length).toBeGreaterThanOrEqual(1);
    const perGeneration = (await db.collection('tours').get()).size;
    expect(llm.concepts).toBeLessThanOrEqual(perGeneration * 2);
    expect((await db.collection('tours').get()).size).toBe(perGeneration);
  });

  it('never overwrites edited, pinned or locked tours and snapshots versions on change', async () => {
    const { deps } = mk();
    await generateAutoTours(deps, 'u1', req);
    const first = (await db.collection('tours').get()).docs[0]!;
    await first.ref.update({ source: 'edited', pinned: true, 'texts.de.title': 'Handmade' });
    await generateAutoTours(deps, 'u1', { ...req, force: true } as never);
    const after = (await first.ref.get()).data()!;
    expect(after['source']).toBe('edited');
    expect(after['texts'].de.title).toBe('Handmade');
  });

  it('answers area_not_ready for unknown or not yet ingested areas', async () => {
    const { deps } = mk();
    expect(
      (await generateAutoTours(deps, 'u1', { tile: encodeGeohash(48.1, 11.5, 3), lang: 'de' })).status,
    ).toBe('area_not_ready');
  });

  it('keeps tours unavailable instead of creating straight-line directions when routing fails', async () => {
    const broken: RoutingProvider = {
      source: 'ors',
      matrix: async () => Promise.reject(new Error('ors down')),
      directions: async () => Promise.reject(new Error('ors down')),
    };
    const { deps } = mk({ routing: broken });
    await expect(generateAutoTours(deps, 'u1', req)).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'routing_unavailable' },
    });
    const docs = (await db.collection('tours').get()).docs;
    expect(docs).toHaveLength(0);
  });

  it('replaces markup-laden model output by a safe fallback and ignores implausible suggested orders', async () => {
    class Bad extends MockLlmProvider {
      override async generateTourConcept(...a: Parameters<LlmProvider['generateTourConcept']>) {
        const r = await super.generateTourConcept(...a);
        return {
          ...r,
          output: { ...r.output, intro: '**Hallo** https://evil.example', suggestedOrder: ['nope', 'nada'] },
        };
      }
    }
    const { deps } = mk({ llm: new Bad() });
    await generateAutoTours(deps, 'u1', req);
    for (const d of (await db.collection('tours').get()).docs) {
      const t = TourSchema.parse(d.data());
      expect(t.texts['de']!.intro).not.toContain('http');
      expect(t.stops.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('respects the kill switch', async () => {
    const { deps } = mk({ config: async () => ({ ...DEFAULT_AI_CONFIG, killSwitch: true }) });
    await expect(generateAutoTours(deps, 'u1', req)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('never pre-generates audio during free tour creation', async () => {
    const calls: string[][] = [];
    const { deps } = mk({ pregenerate: async (ids) => void calls.push(ids) });
    await generateAutoTours(deps, 'u1', req);
    expect(calls).toHaveLength(0);
  });
});

import { composePlannedRoute } from '../src/tours/planned';

describe('composePlannedRoute', () => {
  const pick = async (n: number) =>
    (await db.collection('pois').where('tile', '>=', '').get()).docs
      .map((d) => d.data())
      .filter((p) => p['interests'].length && p['score'] > 30)
      .slice(0, n)
      .map((p) => p['id'] as string);

  it('re-checks the plan with routing times, keeps the budget and stores a private session', async () => {
    const { deps } = mk();
    const ids = await pick(6);
    const res = await composePlannedRoute(deps, 'u1', {
      stops: ids,
      budgetMinutes: 90,
      profile: 'foot-walking',
      lang: 'de',
      interests: [],
    });
    expect(res.tour.source).toBe('planned');
    expect(res.tour.durationMinutes).toBeLessThanOrEqual(90);
    expect(res.tour.stops.length + res.dropped.length).toBe(ids.length);
    expect(res.tour.texts['de']?.title).toBeTruthy();
    const session = await db
      .collection('users')
      .doc('u1')
      .collection('sessions')
      .doc(res.tour.id.replace('planned_', ''))
      .get();
    expect(session.exists).toBe(true);
    expect(JSON.stringify(session.data())).not.toContain('"start"');
  });

  it('drops the least valuable stops when real travel times exceed the budget', async () => {
    const slow: RoutingProvider = {
      source: 'mock',
      matrix: async (pts, profile) => {
        const m = await new MockRoutingProvider().matrix(pts, profile);
        return { meters: m.meters, minutes: m.minutes.map((r) => r.map((v) => v * 4)) };
      },
      directions: (pts, profile) => new MockRoutingProvider().directions(pts, profile),
    };
    const { deps } = mk({ routing: slow });
    const ids = await pick(6);
    const res = await composePlannedRoute(deps, 'u1', {
      stops: ids,
      budgetMinutes: 40,
      profile: 'foot-walking',
      lang: 'de',
      interests: [],
    });
    expect(res.dropped.length).toBeGreaterThan(0);
    expect(res.tour.durationMinutes).toBeLessThanOrEqual(40);
  });

  it('rejects unknown, hidden and duplicate stops and invalid input', async () => {
    const { deps } = mk();
    await expect(
      composePlannedRoute(deps, 'u1', {
        stops: ['nope'],
        budgetMinutes: 60,
        profile: 'foot-walking',
        lang: 'de',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    const ids = await pick(2);
    await expect(
      composePlannedRoute(deps, 'u1', {
        stops: [ids[0], ids[0]],
        budgetMinutes: 60,
        profile: 'foot-walking',
        lang: 'de',
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      composePlannedRoute(deps, 'u1', { stops: [], budgetMinutes: 60, profile: 'foot-walking', lang: 'de' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
