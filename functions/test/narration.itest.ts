import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  buildPois,
  REGION_FIXTURES,
  type AiConfig,
  type Poi,
  type SourceBundle,
} from '@tuur/shared';
import { MockLlmProvider, type LlmProvider } from '../src/providers/llm';
import type { NarrationSourceProvider } from '../src/providers/narrationSources';
import { MockTtsProvider, Mp3AudioEncoder } from '../src/providers/tts';
import {
  getNarration,
  NarrationError,
  reportNarrationIssue,
  type NarrationDeps,
  type ObjectStore,
} from '../src/narration/service';
import { getTransition } from '../src/narration/transition';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_700_000_000_000;

class MemStore implements ObjectStore {
  files = new Map<string, Buffer>();
  async put(path: string, data: Buffer) {
    this.files.set(path, data);
  }
  async delete(path: string) {
    this.files.delete(path);
  }
}

class CountingLlm implements LlmProvider {
  calls = { narration: 0, facts: 0, transition: 0 };
  constructor(private readonly inner: MockLlmProvider) {}
  classifyInterests: LlmProvider['classifyInterests'] = (i) => this.inner.classifyInterests(i as never);
  async generateNarration(r: Parameters<LlmProvider['generateNarration']>[0]) {
    this.calls.narration++;
    await new Promise((res) => setTimeout(res, 30));
    return this.inner.generateNarration(r);
  }
  async checkFacts(r: Parameters<LlmProvider['checkFacts']>[0]) {
    this.calls.facts++;
    return this.inner.checkFacts(r);
  }
  generateTourConcept: LlmProvider["generateTourConcept"] = (r) => this.inner.generateTourConcept(r);
  teaser: LlmProvider["teaser"] = (r) => this.inner.teaser(r);
  async transition(r: Parameters<LlmProvider['transition']>[0]) {
    this.calls.transition++;
    return this.inner.transition(r);
  }
}

const richSources = (extractLen = 1500): NarrationSourceProvider => ({
  async gather(poi: Poi): Promise<SourceBundle> {
    const s = 'Dieser Ort hat eine bewegte Geschichte. '
      .repeat(Math.ceil(extractLen / 40))
      .slice(0, extractLen);
    return {
      poiName: poi.name,
      wikipedia: [{ lang: 'de', title: poi.name, extract: s }],
      facts: [{ label: 'inception', value: '1791' }],
      osmTags: {},
      adminFacts: [],
    };
  },
});

let poi: Poi;
const mk = (over: Partial<NarrationDeps> & { llm?: LlmProvider } = {}, cfg: Partial<AiConfig> = {}) => {
  const store = new MemStore();
  const llm = over.llm ?? new CountingLlm(new MockLlmProvider());
  const deps: NarrationDeps = {
    db,
    llm,
    tts: new MockTtsProvider(),
    encoder: new Mp3AudioEncoder(),
    sources: richSources(),
    store,
    now: () => clock,
    config: async () => ({ ...DEFAULT_AI_CONFIG, ...cfg }),
    ...over,
  };
  return { deps, store, llm: llm as CountingLlm };
};

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000; // fresh rate-limit / budget window for each test
  const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
  poi = pois.find((p) => p.id === 'wd_Q82425')!;
  await db.collection('pois').doc(poi.id).set(poi);
});

const req = { poiId: 'wd_Q82425', lang: 'de', lengthTier: 'medium', primaryInterest: 'history' };

describe('getNarration', () => {
  it('generates once, then the second identical call hits the cache without model calls', async () => {
    const { deps, store, llm } = mk();
    const first = await getNarration(deps, 'u1', req);
    expect(first.cached).toBe(false);
    expect(first.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(first.aiGenerated).toBe(true);
    expect(store.files.has(first.audioPath)).toBe(true);
    const callsAfterFirst = { ...llm.calls };

    const second = await getNarration(deps, 'u2', req);
    expect(second.cached).toBe(true);
    expect(second.key).toBe(first.key);
    expect(llm.calls).toEqual(callsAfterFirst);
    expect(second.images).toEqual(first.images);
  });

  it('a different length tier, language or interest is a different cache entry', async () => {
    const { deps, llm } = mk();
    await getNarration(deps, 'u1', req);
    await getNarration(deps, 'u1', { ...req, lengthTier: 'short' });
    await getNarration(deps, 'u1', { ...req, lang: 'en' });
    expect(llm.calls.narration).toBe(3);
  });

  it('lays out paragraph timings on a monotonic timeline that matches the audio duration', async () => {
    const { deps } = mk();
    const r = await getNarration(deps, 'u1', { ...req, lengthTier: 'long' });
    let prevEnd = -1;
    for (const p of r.paragraphs) {
      expect(p.startMs).toBeGreaterThan(prevEnd);
      expect(p.durationMs).toBeGreaterThan(0);
      prevEnd = p.startMs + p.durationMs;
    }
    expect(r.audioDurationMs).toBe(prevEnd);
  });

  it('discards narrations with unsupported facts and stores nothing (mock hallucination)', async () => {
    const { deps, store } = mk({ llm: new CountingLlm(new MockLlmProvider({ hallucinate: true })) });
    await expect(getNarration(deps, 'u1', req)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db.collection('narrations').get()).size).toBe(0);
    expect(store.files.size).toBe(0);
  });

  it('stops paying for a repeatedly unverifiable narration', async () => {
    const llm = new CountingLlm(new MockLlmProvider({ hallucinate: true }));
    const { deps } = mk({ llm });
    for (let i = 0; i < 3; i++)
      await expect(getNarration(deps, 'u1', req)).rejects.toBeInstanceOf(NarrationError);
    const before = llm.calls.narration;
    await expect(getNarration(deps, 'u1', req)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(llm.calls.narration).toBe(before);
  });

  it('refuses places with too little source material without calling the model', async () => {
    const { deps, llm } = mk({ sources: richSources(0) as never });
    await expect(
      getNarration(
        {
          ...deps,
          sources: {
            gather: async (p) => ({ poiName: p.name, wikipedia: [], facts: [], osmTags: {}, adminFacts: [] }),
          },
        },
        'u1',
        req,
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(llm.calls.narration).toBe(0);
  });

  it('caps the tier for thin sources instead of padding', async () => {
    const { deps } = mk({ sources: richSources(300) });
    const r = await getNarration(deps, 'u1', { ...req, lengthTier: 'long' });
    expect(r.paragraphs).toHaveLength(1);
  });

  it('runs 5 parallel requests for one key with a single generation (single flight)', async () => {
    const { deps, llm } = mk();
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => getNarration(deps, `u${i}`, req)));
    expect(new Set(results.map((r) => r.key)).size).toBe(1);
    expect(llm.calls.narration).toBe(1);
  });

  it('rate limits generation per user but still serves cache hits', async () => {
    const { deps } = mk({}, { rateLimits: { perUserPerHour: 2, perAreaPerHour: 100 } });
    await getNarration(deps, 'u1', req);
    await getNarration(deps, 'u1', { ...req, lengthTier: 'short' });
    await expect(getNarration(deps, 'u1', { ...req, lang: 'en' })).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect((await getNarration(deps, 'u1', req)).cached).toBe(true);
  });

  it('honors the kill switch and budgets for new generation, cache stays available', async () => {
    const warm = mk();
    await getNarration(warm.deps, 'u1', req);
    const off = mk({}, { killSwitch: true });
    await expect(getNarration(off.deps, 'u1', { ...req, lang: 'en' })).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'kill_switch' },
    });
    expect((await getNarration(off.deps, 'u1', req)).cached).toBe(true);
    const broke = mk({}, { dailyBudgetUsd: 0.0000001 });
    await expect(getNarration(broke.deps, 'u1', { ...req, lang: 'fr' }))
      .resolves.toBeDefined()
      .catch(() => undefined);
  });

  it('logs usage with cost per call and aggregates per day and area', async () => {
    const { deps } = mk();
    await getNarration(deps, 'u1', req);
    const logs = await db.collection('usageLogs').get();
    const kinds = logs.docs.map((d) => d.get('kind')).sort();
    expect(kinds).toEqual(['factcheck', 'narration', 'tts']);
    expect(logs.docs.every((d) => typeof d.get('costUsd') === 'number')).toBe(true);
    expect(logs.docs.some((d) => 'uid' in d.data())).toBe(false);
    const day = new Date(clock).toISOString().slice(0, 10);
    expect(Number((await db.collection('usageDaily').doc(day).get()).get('calls'))).toBe(3);
    expect((await db.collection('usageDailyAreas').doc(`${day}_${poi.tile}`).get()).exists).toBe(true);
  });

  it('does not serve hidden POIs and validates input', async () => {
    const { deps } = mk();
    await db.collection('pois').doc(poi.id).update({ hidden: true });
    await expect(getNarration(deps, 'u1', req)).rejects.toMatchObject({ code: 'not-found' });
    await expect(getNarration(deps, 'u1', { poiId: '', lang: 'DE' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('reported narrations are blocked, their audio removed, and regenerated on the next request', async () => {
    const { deps, store, llm } = mk();
    const first = await getNarration(deps, 'u1', req);
    await reportNarrationIssue(deps, 'u2', { narrationKey: first.key, reason: 'wrong_fact' });
    expect((await db.collection('narrations').doc(first.key).get()).get('status')).toBe('pending_review');
    expect(store.files.has(first.audioPath)).toBe(false);
    const again = await getNarration(deps, 'u3', req);
    expect(again.cached).toBe(false);
    expect(llm.calls.narration).toBe(2);
    expect((await db.collection('narrations').doc(first.key).get()).get('status')).toBe('ok');
  });

  it('uses per-user storage for grounded output and never shares it', async () => {
    const { deps } = mk({}, { groundingEnabled: true });
    const a = await getNarration(deps, 'alice', req);
    expect(a.audioPath).toContain('narrations-grounded/alice/');
    expect((await db.collection('narrations').get()).size).toBe(0);
    const again = await getNarration(deps, 'alice', req);
    expect(again.cached).toBe(true);
    const other = await getNarration(deps, 'bob', req);
    expect(other.cached).toBe(false);
  });
});

describe('getTransition', () => {
  it('generates a short cached hand-over between two stops', async () => {
    const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
    const to = pois.find((p) => p.id === 'wd_Q154591')!;
    await db.collection('pois').doc(to.id).set(to);
    const { deps, llm } = mk();
    const r = { fromPoiId: poi.id, toPoiId: to.id, lang: 'de', walkMinutes: 7 };
    const a = await getTransition(deps, 'u1', r);
    const b = await getTransition(deps, 'u2', r);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(llm.calls.transition).toBe(1);
    expect(a.text.length).toBeGreaterThan(10);
  });
});

import { getTeaser } from '../src/narration/teaser';
describe('getTeaser', () => {
  it('creates a short verified teaser once and serves it from the cache afterwards', async () => {
    const { deps } = mk();
    const a = await getTeaser(deps, 'u1', { poiId: 'wd_Q82425', lang: 'de' });
    const b = await getTeaser(deps, 'u2', { poiId: 'wd_Q82425', lang: 'de' });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(a.text.length).toBeGreaterThan(10);
    expect(a.text.split(/\s+/).length).toBeLessThanOrEqual(40);
  });
  it('rejects teasers with invented numbers or markup', async () => {
    class Bad extends MockLlmProvider {
      override async teaser() {
        return { text: 'Gebaut im Jahr 1888 und **golden**.', usage: {} };
      }
    }
    const { deps } = mk({ llm: new Bad() });
    await expect(getTeaser(deps, 'u1', { poiId: 'wd_Q82425', lang: 'de' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(getTeaser(deps, 'u1', { poiId: 'nope', lang: 'de' })).rejects.toMatchObject({ code: 'not-found' });
  });
});
