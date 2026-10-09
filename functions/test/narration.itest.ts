import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CONSENT_VERSION,
  DEFAULT_AI_CONFIG,
  createTourScript,
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
  selectNearby: LlmProvider['selectNearby'] = (r) => this.inner.selectNearby(r);
  async generateNarration(r: Parameters<LlmProvider['generateNarration']>[0]) {
    this.calls.narration++;
    await new Promise((res) => setTimeout(res, 30));
    return this.inner.generateNarration(r);
  }
  async checkFacts(r: Parameters<LlmProvider['checkFacts']>[0]) {
    this.calls.facts++;
    return this.inner.checkFacts(r);
  }
  generateTourConcept: LlmProvider['generateTourConcept'] = (r) => this.inner.generateTourConcept(r);
  teaser: LlmProvider['teaser'] = (r) => this.inner.teaser(r);
  factSheet: LlmProvider['factSheet'] = (r) => this.inner.factSheet(r);
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
  for (const uid of ['u1', 'u2'])
    await db
      .collection('users')
      .doc(uid)
      .collection('consents')
      .doc('ai')
      .set({ granted: true, version: AI_CONSENT_VERSION, updatedAt: clock });
  clock += 3 * 3600_000; // fresh rate-limit / budget window for each test
  const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
  poi = pois.find((p) => p.id === 'wd_Q82425')!;
  await db.collection('pois').doc(poi.id).set(poi);
});

const req = {
  poiId: 'wd_Q82425',
  lang: 'de',
  lengthTier: 'medium',
  primaryInterest: 'history',
  context: {
    script: createTourScript({ lang: 'de', interests: ['history'], instanceId: 'personal-test-walk' }),
  },
};

describe('getNarration', () => {
  it('generates once, then the second identical call hits the cache without model calls', async () => {
    const { deps, store, llm } = mk();
    const first = await getNarration(deps, 'u1', req);
    expect(first.cached).toBe(false);
    expect(first.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(first.aiGenerated).toBe(true);
    expect(store.files.has(first.audioPath)).toBe(true);
    const callsAfterFirst = { ...llm.calls };

    const second = await getNarration(deps, 'u1', req);
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

  it('renders another voice as audio only inside the same personal walk', async () => {
    const { deps, store, llm } = mk();
    const mara = await getNarration(deps, 'u1', { ...req, voice: 'mara' });
    const calls = { ...llm.calls };
    const jonas = await getNarration(deps, 'u1', { ...req, voice: 'jonas' });
    expect(jonas.key).toBe(mara.key);
    expect(jonas.text).toBe(mara.text);
    expect(jonas.audioPath).not.toBe(mara.audioPath);
    expect(store.files.has(jonas.audioPath)).toBe(true);
    expect(llm.calls).toEqual(calls);
    // second request for the same voice is a plain cache hit; unknown voices fall back to the default
    expect((await getNarration(deps, 'u1', { ...req, voice: 'jonas' })).audioPath).toBe(jonas.audioPath);
    expect((await getNarration(deps, 'u1', { ...req, voice: 'nobody' })).audioPath).toBe(mara.audioPath);
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
    const results = await Promise.all(Array.from({ length: 5 }, () => getNarration(deps, 'u1', req)));
    expect(new Set(results.map((r) => r.key)).size).toBe(1);
    expect(llm.calls.narration).toBe(1);
  });

  it('rate limits generation per user but still serves cache hits', async () => {
    const { deps } = mk(
      {},
      { rateLimits: { perUserPerHour: 2, perAreaPerHour: 100, downloadPerUserPerHour: 5 } },
    );
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
    expect(off.llm.calls.narration).toBe(0);
    const broke = mk({}, { dailyBudgetUsd: 0.0000001 });
    await expect(getNarration(broke.deps, 'u1', { ...req, lang: 'en' })).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'daily_budget' },
    });
    expect(broke.llm.calls.narration).toBe(0);
    expect((await getNarration(broke.deps, 'u1', req)).cached).toBe(true);
  });

  it('logs usage with cost per call and aggregates per day and area', async () => {
    const tts = new MockTtsProvider();
    const synthesize = vi.spyOn(tts, 'synthesize');
    const { deps, llm } = mk({ tts });
    const narration = await getNarration(deps, 'u1', req);
    expect(llm.calls.narration).toBe(1);
    expect(llm.calls.facts).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(narration.paragraphs.length);
    const logs = await db.collection('usageLogs').get();
    const kinds = logs.docs.map((d) => d.get('kind')).sort();
    expect(kinds).toEqual(['factcheck', 'narration', ...narration.paragraphs.map(() => 'tts')]);
    expect(logs.docs.every((d) => Number.isFinite(d.get('costUsd')) && d.get('costUsd') > 0)).toBe(true);
    expect(logs.docs.some((d) => 'uid' in d.data())).toBe(false);
    const totalCost = logs.docs.reduce((sum, d) => sum + Number(d.get('costUsd')), 0);
    const day = new Date(clock).toISOString().slice(0, 10);
    const global = await db.collection('usageDaily').doc(day).get();
    const area = await db.collection('usageDailyAreas').doc(`${day}_${poi.tile}`).get();
    for (const aggregate of [global, area]) {
      expect(aggregate.get('calls')).toBe(2 + narration.paragraphs.length);
      expect(aggregate.get('costUsd')).toBeCloseTo(totalCost, 10);
      expect(aggregate.get('reservedUsd')).toBeCloseTo(0, 10);
    }
    const reservations = await db.collection('usageReservations').get();
    expect(reservations.size).toBe(logs.size);
    expect(reservations.docs.every((d) => d.get('status') === 'settled')).toBe(true);
  });

  it('does not serve hidden POIs and validates input', async () => {
    const { deps } = mk();
    await db.collection('pois').doc(poi.id).update({ hidden: true });
    await expect(getNarration(deps, 'u1', req)).rejects.toMatchObject({ code: 'not-found' });
    await expect(getNarration(deps, 'u1', { poiId: '', lang: 'DE' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('only the owner can flag their private recording, which is then regenerated for that same walk', async () => {
    const { deps, store, llm } = mk();
    const first = await getNarration(deps, 'u1', req);
    await reportNarrationIssue(deps, 'u2', { narrationKey: first.key, reason: 'wrong_fact' });
    await reportNarrationIssue(deps, 'u2', { narrationKey: first.key, reason: 'offensive' }); // same reporter twice
    expect((await db.collection('narrations').doc(first.key).get()).get('status')).toBe('ok');
    expect(store.files.has(first.audioPath)).toBe(true);
    // reports for keys that do not exist are ignored
    await reportNarrationIssue(deps, 'u9', { narrationKey: 'does__not__exist', reason: 'wrong_fact' });
    expect((await db.collection('feedback').get()).size).toBe(0);
    await reportNarrationIssue(deps, 'u1', { narrationKey: first.key, reason: 'wrong_fact' });
    expect((await db.collection('narrations').doc(first.key).get()).get('status')).toBe('pending_review');
    expect(store.files.has(first.audioPath)).toBe(false);
    const again = await getNarration(deps, 'u1', req);
    expect(again.cached).toBe(false);
    expect(llm.calls.narration).toBe(2);
    expect((await db.collection('narrations').doc(first.key).get()).get('status')).toBe('ok');
  });

  it('refuses unbounded grounding before any model call, cost reservation or audio is produced', async () => {
    const tts = new MockTtsProvider();
    const synthesize = vi.spyOn(tts, 'synthesize');
    const { deps, llm, store } = mk({ tts }, { groundingEnabled: true });
    for (const uid of ['alice', 'alice', 'bob']) {
      await expect(getNarration(deps, uid, req)).rejects.toMatchObject({
        code: 'unavailable',
        details: { reason: 'grounding_budget_unsupported' },
      });
      expect((await db.collection('users').doc(uid).collection('groundedNarrations').get()).size).toBe(0);
    }
    expect(llm.calls).toEqual({ narration: 0, facts: 0, transition: 0 });
    expect(synthesize).not.toHaveBeenCalled();
    expect(store.files.size).toBe(0);
    expect((await db.collection('narrations').get()).size).toBe(0);
    expect((await db.collection('usageReservations').get()).size).toBe(0);
    expect((await db.collection('usageLogs').get()).size).toBe(0);
    expect((await db.collection('usageDaily').get()).size).toBe(0);
    expect((await db.collection('usageDailyAreas').get()).size).toBe(0);
  });
});

describe('getTransition', () => {
  it('generates a short cached hand-over between two stops', async () => {
    const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
    const to = pois.find((p) => p.id === 'wd_Q154591')!;
    await db.collection('pois').doc(to.id).set(to);
    const { deps, llm } = mk();
    const r = {
      fromPoiId: poi.id,
      toPoiId: to.id,
      lang: 'de',
      walkMinutes: 7,
      scriptInstanceId: 'personal-test-walk',
    };
    const a = await getTransition(deps, 'u1', r);
    const b = await getTransition(deps, 'u1', r);
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
    await expect(getTeaser(deps, 'u1', { poiId: 'wd_Q82425', lang: 'de' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await expect(getTeaser(deps, 'u1', { poiId: 'nope', lang: 'de' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
