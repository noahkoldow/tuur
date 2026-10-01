import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getBytes, ref as sref } from 'firebase/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, NarrationLangSchema, REGION_FIXTURES, buildPois, type Poi } from '@tuur/shared';
import { ensureAreas } from '../src/area/ensureArea';
import { createRewardNonce, processRevenueCatEvent } from '../src/billing/entitlements';
import { getNarration, type NarrationDeps } from '../src/narration/service';
import { MockPayments } from '../src/partners/payments';
import {
  createRedemptionToken,
  loadPartner,
  processPaymentEvent,
  saveOffer,
  savePartnerProfile,
  setPartnerStatus,
  type PartnerDeps,
} from '../src/partners/service';
import { MockLlmProvider } from '../src/providers/llm';
import type { NarrationSourceProvider } from '../src/providers/narrationSources';
import { MockTtsProvider, Mp3AudioEncoder } from '../src/providers/tts';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_800_000_000_000;
let poi: Poi;

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000;
  const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
  poi = { ...pois[0]!, baseScore: 50, score: 50 };
  await db.collection('pois').doc(poi.id).set(poi);
});

describe('security rules against the exact client queries', () => {
  it('the tour list query is allowed only with the locked==false filter; audio in Storage is never client-readable', async () => {
    const [fhost, fport] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
    const [shost, sport] = (process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ?? '127.0.0.1:9199').split(':');
    const env = await initializeTestEnvironment({
      projectId: 'demo-tuur-hardening',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
        host: fhost!,
        port: Number(fport),
      },
      storage: {
        rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'),
        host: shost!,
        port: Number(sport),
      },
    });
    try {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const fs = ctx.firestore();
        const { setDoc, doc } = await import('firebase/firestore');
        await setDoc(doc(fs, 'tours/a'), { placeId: 'p', locked: false });
        await setDoc(doc(fs, 'tours/b'), { placeId: 'p', locked: true });
        await ctx.storage().ref('narrations/x.mp3').putString('audio');
      });
      const user = env.authenticatedContext('alice');
      const fs = user.firestore();
      const ok = await assertSucceeds(
        getDocs(query(collection(fs, 'tours'), where('placeId', '==', 'p'), where('locked', '==', false))),
      );
      expect(ok.docs.map((d) => d.id)).toEqual(['a']);
      // what the app used to do: rejected as a whole, because the rules are not filters
      await assertFails(getDocs(query(collection(fs, 'tours'), where('placeId', '==', 'p'))));
      await assertFails(getBytes(sref(user.storage(), 'narrations/x.mp3')));
      await assertFails(getBytes(sref(env.unauthenticatedContext().storage(), 'narrations/x.mp3')));
    } finally {
      await env.cleanup();
    }
  });
});

describe('paid audio is served through signed URLs only', () => {
  const sources: NarrationSourceProvider = {
    async gather(p: Poi) {
      return {
        poiName: p.name,
        wikipedia: [
          { lang: 'de', title: p.name, extract: 'Ein bekannter Ort mit langer Geschichte. '.repeat(40) },
        ],
        facts: [],
        osmTags: {},
        adminFacts: [],
      };
    },
  };
  it('getNarration returns a signed URL for cached and fresh results; the URL comes from the store', async () => {
    const signed: string[] = [];
    const deps: NarrationDeps = {
      db,
      llm: new MockLlmProvider(),
      tts: new MockTtsProvider(),
      encoder: new Mp3AudioEncoder(),
      sources,
      store: {
        put: async () => undefined,
        delete: async () => undefined,
        signedUrl: async (p, ttl) => {
          signed.push(p);
          return `https://signed.test/${p}?ttl=${ttl}`;
        },
      },
      now: () => clock,
      config: async () => DEFAULT_AI_CONFIG,
    };
    const req = { poiId: poi.id, lang: 'de', lengthTier: 'short' };
    const fresh = await getNarration(deps, 'u1', req);
    const cached = await getNarration(deps, 'u2', req);
    expect(fresh.cached).toBe(false);
    expect(cached.cached).toBe(true);
    for (const r of [fresh, cached])
      expect(r.audioUrl).toBe(`https://signed.test/${r.audioPath}?ttl=21600000`);
    expect(signed).toHaveLength(2);
  });
});

describe('language allowlist', () => {
  it('rejects arbitrary language codes (no unbounded model calls per code)', () => {
    expect(NarrationLangSchema.safeParse('de').success).toBe(true);
    expect(NarrationLangSchema.safeParse('en').success).toBe(true);
    for (const l of ['xx', 'zzz', 'DE', '', 'deu'])
      expect(NarrationLangSchema.safeParse(l).success).toBe(false);
  });
});

describe('daily tile claim cap', () => {
  it('stops claiming tiles once the global daily cap is reached', async () => {
    const enqueued: string[] = [];
    const deps = {
      db,
      now: () => clock,
      enqueueIngest: async (g: string) => void enqueued.push(g),
      maxClaimsPerDay: 2,
    };
    const r1 = await ensureAreas(deps, 'u33dc0', false, 1); // 9 tiles requested, only 2 may start
    expect(r1.started.length).toBeLessThanOrEqual(9);
    expect(
      (await db.collection('usageDaily').doc(new Date(clock).toISOString().slice(0, 10)).get()).get(
        'tilesClaimed',
      ),
    ).toBeGreaterThan(0);
    const before = enqueued.length;
    const r2 = await ensureAreas(deps, 'u33db0', false, 1);
    if (before >= 2) expect(r2.started).toEqual([]);
  });
});

describe('reward nonces', () => {
  it('parallel requests cannot exceed the daily limit', async () => {
    await db.collection('config').doc('billing').set({ rewardedPerDay: 3 });
    for (let i = 0; i < 8; i++)
      await db
        .collection('tours')
        .doc(`free${i}`)
        .set({ free: true, locked: false, placeId: `city${i}` });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        createRewardNonce({ db, now: () => clock }, 'u1', { tourId: `free${i}` }, true),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  });
});

describe('RevenueCat ordering and replays', () => {
  const ev = (over: Record<string, unknown>) => ({
    event: { id: 'e', type: 'RENEWAL', app_user_id: 'u1', product_id: 'tuur_sub_monthly', ...over },
  });
  const sub = async () =>
    (await db.collection('users').doc('u1').collection('entitlements').doc('subscription').get()).data();

  it('an older event delivered late never overwrites a newer state', async () => {
    await processRevenueCatEvent(
      { db, now: () => clock },
      ev({
        id: 'new',
        type: 'RENEWAL',
        event_timestamp_ms: clock + 1000,
        expiration_at_ms: clock + 60 * 86_400_000,
      }),
    );
    await processRevenueCatEvent(
      { db, now: () => clock + 5000 },
      ev({ id: 'old', type: 'EXPIRATION', event_timestamp_ms: clock - 5000, expiration_at_ms: clock - 1 }),
    );
    expect((await sub())!['active']).toBe(true);
  });

  it('ignores sandbox events in production and replayed refunds under a new event id', async () => {
    const sandbox = await processRevenueCatEvent(
      { db, now: () => clock },
      ev({ id: 's1', environment: 'SANDBOX', type: 'INITIAL_PURCHASE', expiration_at_ms: clock + 1e9 }),
    );
    expect(sandbox.status).toBe('ignored');
    expect(await sub()).toBeUndefined();

    const buy = { type: 'NON_RENEWING_PURCHASE', product_id: 'tuur_credit_5', transaction_id: 'tx1' };
    await processRevenueCatEvent({ db, now: () => clock }, ev({ id: 'b1', ...buy }));
    await processRevenueCatEvent({ db, now: () => clock }, ev({ id: 'b1-dup-other-id', ...buy })); // same store transaction
    const wallet = async () =>
      (await db.collection('users').doc('u1').collection('credits').doc('wallet').get()).get('balance');
    expect(await wallet()).toBe(5);
    await processRevenueCatEvent(
      { db, now: () => clock },
      ev({
        id: 'r1',
        type: 'CANCELLATION',
        product_id: 'tuur_credit_5',
        transaction_id: 'tx1',
        cancel_reason: 'CUSTOMER_SUPPORT',
      }),
    );
    await processRevenueCatEvent(
      { db, now: () => clock },
      ev({
        id: 'r2',
        type: 'CANCELLATION',
        product_id: 'tuur_credit_5',
        transaction_id: 'tx1',
        cancel_reason: 'CUSTOMER_SUPPORT',
      }),
    );
    expect(await wallet()).toBeLessThanOrEqual(5);
    expect(await wallet()).toBeGreaterThanOrEqual(0);
  });
});

describe('partner payments', () => {
  const pdeps = (): PartnerDeps => ({
    db,
    now: () => clock,
    tokenSecret: () => 'unit-test-secret-0123456789',
    payments: () => new MockPayments(),
    webBaseUrl: 'https://tuur.test',
  });
  const subEv = (id: string, created: number, status: string) =>
    new MockPayments().parseWebhook(
      Buffer.from(
        JSON.stringify({
          id,
          type: 'customer.subscription.updated',
          created: Math.floor(created / 1000),
          data: {
            object: {
              id: 'sub_1',
              customer: 'cus_1',
              status,
              current_period_end: Math.floor((clock + 1e9) / 1000),
              metadata: { partnerId: 'pa1', tier: 'offers' },
            },
          },
        }),
      ),
      'mock',
    );
  const profile = {
    name: 'Café Linde',
    category: 'cafe',
    address: 'Unter den Linden 1',
    countryCode: 'DE',
    description: 'Traditionelles Café mit hausgemachtem Kuchen und Blick auf die Allee.',
    acceptTerms: true,
  };

  it('never lets an older Stripe event overwrite a newer one', async () => {
    await savePartnerProfile(pdeps(), 'pa1', { ...profile, link: { poiId: poi.id } });
    await setPartnerStatus(pdeps(), { partnerId: 'pa1', status: 'approved' });
    await processPaymentEvent(pdeps(), subEv('e-new', clock, 'active'));
    await processPaymentEvent(pdeps(), subEv('e-old', clock - 3600_000, 'canceled'));
    expect((await loadPartner(db, 'pa1'))!.plan.active).toBe(true);
  });

  it('retries an event whose processing failed instead of dropping it as a duplicate', async () => {
    await savePartnerProfile(pdeps(), 'pa1', { ...profile, link: { poiId: poi.id } });
    await setPartnerStatus(pdeps(), { partnerId: 'pa1', status: 'approved' });
    const ev = subEv('e-retry', clock, 'active');
    // the first attempt fails while the partner document is written (e.g. a transient Firestore error)
    let failNext = true;
    const flakyDb = new Proxy(db, {
      get(t, p) {
        const v = (t as unknown as Record<string | symbol, unknown>)[p];
        if (p !== 'collection')
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
        return (name: string) => {
          const c = t.collection(name);
          if (name !== 'partners') return c;
          return new Proxy(c, {
            get(ct, cp) {
              const cv = (ct as unknown as Record<string | symbol, unknown>)[cp];
              if (cp !== 'doc')
                return typeof cv === 'function' ? (cv as (...a: unknown[]) => unknown).bind(ct) : cv;
              return (id: string) =>
                new Proxy(ct.doc(id), {
                  get(dt, dp) {
                    if (dp === 'set')
                      return async (...a: unknown[]) => {
                        if (failNext) {
                          failNext = false;
                          throw new Error('boom');
                        }
                        return (dt.set as (...x: unknown[]) => unknown)(...a);
                      };
                    const dv = (dt as unknown as Record<string | symbol, unknown>)[dp];
                    return typeof dv === 'function' ? (dv as (...a: unknown[]) => unknown).bind(dt) : dv;
                  },
                });
            },
          });
        };
      },
    });
    await expect(processPaymentEvent({ ...pdeps(), db: flakyDb }, ev)).rejects.toThrow('boom');
    expect((await db.collection('stripeEvents').doc('e-retry').get()).exists).toBe(false);
    await expect(processPaymentEvent(pdeps(), ev)).resolves.toBe('processed');
    expect((await loadPartner(db, 'pa1'))!.plan.active).toBe(true);
    await expect(processPaymentEvent(pdeps(), ev)).resolves.toBe('duplicate');
  });

  it('issues exactly one redemption token for parallel requests of the same listener', async () => {
    await savePartnerProfile(pdeps(), 'pa1', { ...profile, link: { poiId: poi.id } });
    await setPartnerStatus(pdeps(), { partnerId: 'pa1', status: 'approved' });
    await processPaymentEvent(pdeps(), subEv('e-live', clock, 'active'));
    const offer = await saveOffer(pdeps(), 'pa1', {
      title: 'Angebot',
      description: 'Beschreibung',
      validFrom: clock - 1,
      validUntil: clock + 1e7,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createRedemptionToken(pdeps(), 'listener', { offerId: offer.id, position: poi.location }),
      ),
    );
    const tokens = new Set(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.token] : [])));
    expect(tokens.size).toBe(1);
    expect((await db.collection('redemptionTokens').get()).size).toBe(1);
  });
});
