import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, REGION_FIXTURES, buildPois, type Poi } from '@tuur/shared';
import {
  AdminError,
  moderatePoi,
  moderateTour,
  regenerateNarration,
  resolveFeedback,
  retryIngest,
  saveAiConfig,
  savePartnerConfig,
  setAreaLock,
  type AdminDeps,
} from '../src/admin/service';
import { retentionSweep } from '../src/util/retention';
import { loadAiConfig, resetAiConfigCache } from '../src/util/aiConfig';
import { loadPartnerConfig } from '../src/partners/service';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_800_000_000_000;
const enqueued: string[] = [];
const deleted: string[] = [];
const deps = (): AdminDeps => ({
  db,
  now: () => clock,
  store: { put: async () => undefined, delete: async (p) => void deleted.push(p) },
  enqueueIngest: async (g) => void enqueued.push(g),
});
let poi: Poi;

const text = (title: string) => ({
  title,
  teaser: 't',
  description: 'd',
  intro: 'i',
  transitions: [],
  outro: 'o',
});

beforeEach(async () => {
  await clearFirestore();
  resetAiConfigCache();
  enqueued.length = 0;
  deleted.length = 0;
  clock += 3600_000;
  poi = {
    ...buildPois(REGION_FIXTURES[0]!.raw, { now: clock }).pois.find((p) => p.id === 'wd_Q82425')!,
    baseScore: 60,
    score: 60,
    partnerBoost: 0,
  };
  await db.collection('pois').doc(poi.id).set(poi);
});

describe('area administration', () => {
  it('retries a failed area immediately (ignoring backoff and attempt limits) and audits it', async () => {
    await db.collection('areas').doc('u33dc0').set({
      geohash: 'u33dc0',
      status: 'failed',
      createdAt: 1,
      updatedAt: clock,
      ingestAttempts: 9,
      poiCount: 0,
    });
    await expect(retryIngest(deps(), 'admin1', { geohash: 'u33dc0' })).resolves.toEqual({ started: true });
    expect(enqueued).toEqual(['u33dc0']);
    expect((await db.collection('areas').doc('u33dc0').get()).get('status')).toBe('ingesting');
    const audit = await db.collection('adminAudit').get();
    expect(audit.docs[0]!.data()).toMatchObject({ actor: 'admin1', action: 'retryIngest', target: 'u33dc0' });
  });

  it('starts ingest for a tile that does not exist yet', async () => {
    await expect(retryIngest(deps(), 'a', { geohash: 'u33dc1' })).resolves.toEqual({ started: true });
    expect(enqueued).toEqual(['u33dc1']);
  });

  it('refuses locked areas and locking survives; rejects invalid geohashes', async () => {
    await db
      .collection('areas')
      .doc('u33dc0')
      .set({ geohash: 'u33dc0', status: 'ready', createdAt: 1, updatedAt: 1 });
    await setAreaLock(deps(), 'a', { geohash: 'u33dc0', locked: true });
    await expect(retryIngest(deps(), 'a', { geohash: 'u33dc0' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await setAreaLock(deps(), 'a', { geohash: 'u33dc0', locked: false });
    await expect(retryIngest(deps(), 'a', { geohash: 'u33dc0' })).resolves.toEqual({ started: true });
    await expect(retryIngest(deps(), 'a', { geohash: 'not a hash!' })).rejects.toBeInstanceOf(AdminError);
    await expect(setAreaLock(deps(), 'a', { geohash: 'u33dcz', locked: true })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('POI moderation', () => {
  it('hides, weights and adds facts; the score keeps the capped partner boost', async () => {
    await db.collection('pois').doc(poi.id).update({ partnerBoost: 12 });
    await moderatePoi(deps(), 'a', { poiId: poi.id, adminWeight: 0.5 });
    const s = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(s['adminWeight']).toBe(0.5);
    expect(s['score']).toBe(42); // 60 * 0.5 + 12
    await moderatePoi(deps(), 'a', { poiId: poi.id, hidden: true });
    expect((await db.collection('pois').doc(poi.id).get()).get('hidden')).toBe(true);
  });

  it('sends existing narrations back for regeneration when facts change', async () => {
    await db
      .collection('narrations')
      .doc('k1')
      .set({ poiId: poi.id, status: 'ok', audioPath: 'narrations/k1.mp3' });
    await db
      .collection('narrations')
      .doc('k2')
      .set({ poiId: 'other', status: 'ok', audioPath: 'narrations/k2.mp3' });
    const r = await moderatePoi(deps(), 'a', {
      poiId: poi.id,
      adminFacts: ['Gebaut 1791 laut Denkmalliste.'],
    });
    expect(r.invalidated).toBe(1);
    expect((await db.collection('narrations').doc('k1').get()).get('status')).toBe('blocked');
    expect((await db.collection('narrations').doc('k2').get()).get('status')).toBe('ok');
    expect(deleted).toEqual(['narrations/k1.mp3']);
  });

  it('validates input', async () => {
    await expect(moderatePoi(deps(), 'a', { poiId: poi.id, adminWeight: 5 })).rejects.toBeInstanceOf(
      AdminError,
    );
    await expect(
      moderatePoi(deps(), 'a', { poiId: poi.id, adminFacts: Array(11).fill('x') }),
    ).rejects.toBeInstanceOf(AdminError);
    await expect(moderatePoi(deps(), 'a', { poiId: 'ghost', hidden: true })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('tour moderation', () => {
  const seed = (over: Record<string, unknown> = {}) =>
    db
      .collection('tours')
      .doc('t1')
      .set({ source: 'auto', locked: false, pinned: false, texts: { de: text('Alt') }, ...over });

  it('locks, pins and edits texts (an edited tour is never regenerated)', async () => {
    await seed();
    await moderateTour(deps(), 'a', { tourId: 't1', locked: true, pinned: true });
    let t = (await db.collection('tours').doc('t1').get()).data()!;
    expect(t['locked']).toBe(true);
    expect(t['pinned']).toBe(true);
    expect(t['source']).toBe('auto');
    await moderateTour(deps(), 'a', { tourId: 't1', texts: { de: text('Neu') } });
    t = (await db.collection('tours').doc('t1').get()).data()!;
    expect(t['source']).toBe('edited');
    expect(t['texts'].de.title).toBe('Neu');
  });

  it('does not touch planned routes and rejects incomplete texts', async () => {
    await seed({ source: 'planned' });
    await expect(moderateTour(deps(), 'a', { tourId: 't1', locked: true })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await seed();
    await expect(
      moderateTour(deps(), 'a', { tourId: 't1', texts: { de: { title: 'x' } } }),
    ).rejects.toBeInstanceOf(AdminError);
  });
});

describe('narrations and feedback', () => {
  it('regenerates a narration and resolves feedback', async () => {
    await db
      .collection('narrations')
      .doc('n1')
      .set({ poiId: poi.id, status: 'pending_review', audioPath: 'narrations/n1.mp3' });
    await db
      .collection('feedback')
      .doc('f1')
      .set({ narrationKey: 'n1', status: 'open', reason: 'wrong_fact', createdAt: 1 });
    await resolveFeedback(deps(), 'a', { id: 'f1', resolution: 'fixed' });
    const f = (await db.collection('feedback').doc('f1').get()).data()!;
    expect(f).toMatchObject({ status: 'fixed', resolvedBy: 'a' });
    expect((await db.collection('narrations').doc('n1').get()).get('status')).toBe('blocked');

    await db
      .collection('narrations')
      .doc('n2')
      .set({ poiId: poi.id, status: 'ok', audioPath: 'narrations/n2.mp3' });
    await regenerateNarration(deps(), 'a', { key: 'n2' });
    expect((await db.collection('narrations').doc('n2').get()).get('status')).toBe('blocked');
    await expect(regenerateNarration(deps(), 'a', { key: 'ghost' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('configuration', () => {
  it('merges AI config edits, takes effect immediately and rejects invalid values', async () => {
    const cfg = await saveAiConfig(deps(), 'a', {
      killSwitch: true,
      models: { narration: 'gemini-test' },
      dailyBudgetUsd: 5,
    });
    expect(cfg.killSwitch).toBe(true);
    expect(cfg.models).toEqual({ ...DEFAULT_AI_CONFIG.models, narration: 'gemini-test' });
    expect((await loadAiConfig(db, clock + 1)).killSwitch).toBe(true);
    await saveAiConfig(deps(), 'a', { killSwitch: false });
    expect((await loadAiConfig(db, clock + 200_000)).models.narration).toBe('gemini-test');
    await expect(saveAiConfig(deps(), 'a', { dailyBudgetUsd: -1 })).rejects.toBeInstanceOf(AdminError);
    await expect(saveAiConfig(deps(), 'a', { models: { narration: '' } })).rejects.toBeInstanceOf(AdminError);
    await expect(saveAiConfig(deps(), 'a', { unknownField: 1 })).rejects.toBeInstanceOf(AdminError);
  });

  it('stores partner config with a hard boost cap and validates price ids', async () => {
    await savePartnerConfig(deps(), 'a', {
      boost: { offers: 10 },
      boostCap: 12,
      pricing: {
        prices: { visibility: { EUR: 'price_vis_eur' }, offers: { EUR: 'price_off_eur' } },
        currencyByCountry: { CH: 'CHF' },
        defaultCurrency: 'EUR',
      },
    });
    const { cfg, pricing } = await loadPartnerConfig(db);
    expect(cfg.boost).toEqual({ visibility: 8, offers: 10 });
    expect(cfg.boostCap).toBe(12);
    expect(pricing.prices.offers['EUR']).toBe('price_off_eur');
    await expect(savePartnerConfig(deps(), 'a', { boostCap: 31 })).rejects.toBeInstanceOf(AdminError);
    await expect(savePartnerConfig(deps(), 'a', { boost: { offers: 99 } })).rejects.toBeInstanceOf(
      AdminError,
    );
    await expect(
      savePartnerConfig(deps(), 'a', {
        pricing: {
          prices: { visibility: { EUR: 'not-a-price' }, offers: {} },
          currencyByCountry: {},
          defaultCurrency: 'EUR',
        },
      }),
    ).rejects.toBeInstanceOf(AdminError);
  });
});

describe('retention', () => {
  it('deletes reports, cost logs and audit entries past their retention and keeps the rest', async () => {
    const day = 86_400_000;
    await db
      .collection('feedback')
      .doc('old')
      .set({ createdAt: clock - 400 * day });
    await db
      .collection('feedback')
      .doc('new')
      .set({ createdAt: clock - 10 * day });
    await db
      .collection('usageLogs')
      .doc('old')
      .set({ ts: clock - 100 * day });
    await db
      .collection('usageLogs')
      .doc('new')
      .set({ ts: clock - 5 * day });
    await db
      .collection('adminAudit')
      .doc('old')
      .set({ ts: clock - 800 * day });
    await db
      .collection('adminAudit')
      .doc('new')
      .set({ ts: clock - 5 * day });
    expect(await retentionSweep(db, clock)).toEqual({ feedback: 1, usageLogs: 1, adminAudit: 1 });
    expect((await db.collection('feedback').get()).docs.map((d) => d.id)).toEqual(['new']);
    expect((await db.collection('usageLogs').get()).docs.map((d) => d.id)).toEqual(['new']);
    expect((await db.collection('adminAudit').get()).docs.map((d) => d.id)).toEqual(['new']);
  });
});
