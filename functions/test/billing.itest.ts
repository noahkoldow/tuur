import { generateKeyPairSync, createSign } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, REGION_FIXTURES, buildPois, type Poi } from '@tuur/shared';
import {
  BillingError,
  authorizeContent,
  createInvite,
  createRewardNonce,
  grantRewardFromSsv,
  previewInvite,
  processRevenueCatEvent,
  redeemInvite,
  spendCredit,
  verifyBearer,
} from '../src/billing/entitlements';
import { verifyAdmobSignature } from '../src/billing/ssv';
import { MockLlmProvider, type LlmProvider } from '../src/providers/llm';
import type { NarrationSourceProvider } from '../src/providers/narrationSources';
import { MockTtsProvider, Mp3AudioEncoder } from '../src/providers/tts';
import { NarrationError, getNarration, type NarrationDeps } from '../src/narration/service';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_700_000_000_000;
const deps = () => ({ db, now: () => clock });

const seedTour = async (over: Record<string, unknown> = {}, id = 'tour1') => {
  await db
    .collection('tours')
    .doc(id)
    .set({
      placeId: 'DE_berlin',
      placeName: 'Berlin',
      free: false,
      locked: false,
      texts: { en: { title: 'Great tour' } },
      stops: [{ poiId: 'wd_Q82425' }, { poiId: 'wd_Q4340' }],
      ...over,
    });
};
const wallet = (uid: string, balance: number, rewardBalance = 0) =>
  db.collection('users').doc(uid).collection('credits').doc('wallet').set({ balance, rewardBalance });
const walletOf = async (uid: string) =>
  (await db.collection('users').doc(uid).collection('credits').doc('wallet').get()).data();
const entIds = async (uid: string) =>
  (await db.collection('users').doc(uid).collection('entitlements').get()).docs.map((d) => d.id).sort();

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000;
  await db.collection('places').doc('DE_berlin').set({ name: 'Berlin' });
  await db.collection('areas').doc('u33dc0').set({ placeId: 'DE_berlin', status: 'ready' });
});

describe('spendCredit', () => {
  it('unlocks a tour permanently with one credit and never charges twice', async () => {
    await seedTour();
    await wallet('u1', 2);
    const r = await spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' });
    expect(r.used).toBe('paid');
    expect(await walletOf('u1')).toEqual({ balance: 1, rewardBalance: 0 });
    expect(await entIds('u1')).toEqual(['tour_tour1']);
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' })).rejects.toMatchObject({
      code: 'already-exists',
    });
    expect(await walletOf('u1')).toEqual({ balance: 1, rewardBalance: 0 });
  });

  it('uses reward credits first for tours and unlocks a 24 h session with a paid credit', async () => {
    await seedTour();
    await wallet('u1', 1, 1);
    expect((await spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' })).used).toBe('reward');
    const s = await spendCredit(deps(), 'u1', { kind: 'session', placeId: 'DE_berlin' });
    expect(s.used).toBe('paid');
    const ent = (
      await db.collection('users').doc('u1').collection('entitlements').doc('session_DE_berlin').get()
    ).data()!;
    expect(ent['expiresAt']).toBe(clock + 24 * 3600_000);
    await expect(spendCredit(deps(), 'u1', { kind: 'session', placeId: 'DE_berlin' })).rejects.toMatchObject({
      code: 'already-exists',
    });
  });

  it('rejects without credits, for free/locked/unknown tours and for subscribers', async () => {
    await seedTour();
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' })).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'insufficient' },
    });
    await seedTour({ free: true }, 'free1');
    await wallet('u1', 3);
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'free1' })).rejects.toMatchObject({
      details: { reason: 'free' },
    });
    await seedTour({ locked: true }, 'locked1');
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'locked1' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'nope' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await db
      .collection('users')
      .doc('u1')
      .collection('entitlements')
      .doc('subscription')
      .set({
        type: 'subscription',
        active: true,
        productId: 'tuur_sub_monthly',
        expiresAt: clock + 1e6,
        willRenew: true,
        updatedAt: clock,
      });
    await expect(spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' })).rejects.toMatchObject({
      details: { reason: 'subscriber' },
    });
    expect(await walletOf('u1')).toEqual({ balance: 3, rewardBalance: 0 });
    await expect(spendCredit(deps(), 'u1', { kind: 'tour' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('parallel spends with a balance of one succeed exactly once', async () => {
    await seedTour();
    await seedTour({}, 'tour2');
    await wallet('u1', 1);
    const results = await Promise.allSettled([
      spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' }),
      spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour2' }),
      spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' }),
      spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour2' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await walletOf('u1'))!['balance']).toBe(0);
  });
});

describe('authorizeContent', () => {
  it('serves the free tour to everyone but only its own stops', async () => {
    await seedTour({ free: true });
    expect(
      (await authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] })).reason,
    ).toBe('free');
    await expect(
      authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q999'] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('locks paid tours until unlocked, and never trusts a missing context', async () => {
    await seedTour();
    await expect(
      authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(authorizeContent(deps(), 'u1', { poiIds: ['wd_Q82425'] })).rejects.toMatchObject({
      code: 'permission-denied',
      details: { reason: 'no_context' },
    });
    await wallet('u1', 1);
    await spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' });
    expect(
      (await authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] })).reason,
    ).toBe('tour');
    await expect(
      authorizeContent(deps(), 'u2', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('dynamic modes require a session for the place derived from the POI area', async () => {
    await wallet('u1', 1);
    await expect(
      authorizeContent(deps(), 'u1', { mode: 'roam', poiIds: [], tile: 'u33dc0' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await spendCredit(deps(), 'u1', { kind: 'session', placeId: 'DE_berlin' });
    expect((await authorizeContent(deps(), 'u1', { mode: 'roam', poiIds: [], tile: 'u33dc0' })).reason).toBe(
      'session',
    );
    clock += 25 * 3600_000;
    await expect(
      authorizeContent(deps(), 'u1', { mode: 'fork', poiIds: [], tile: 'u33dc0' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('invites', () => {
  const buy = async (uid = 'alice') => {
    await seedTour();
    await wallet(uid, 1);
    await spendCredit(deps(), uid, { kind: 'tour', tourId: 'tour1' });
  };

  it('creates at most two single-use invites for a bought tour and stores only token hashes', async () => {
    await buy();
    const a = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    const b = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    expect(a.remaining).toBe(1);
    expect(b.remaining).toBe(0);
    await expect(createInvite(deps(), 'alice', { tourId: 'tour1' })).rejects.toMatchObject({
      details: { reason: 'limit_reached' },
    });
    const docs = await db.collection('invites').get();
    expect(docs.size).toBe(2);
    expect(docs.docs.map((d) => d.id)).not.toContain(a.token);
    expect(JSON.stringify(docs.docs.map((d) => d.data()))).not.toContain(a.token);
  });

  it('only bought tours can be shared (not rewards, invites or unknown tours)', async () => {
    await seedTour();
    await db
      .collection('users')
      .doc('bob')
      .collection('entitlements')
      .doc('tour_tour1')
      .set({ type: 'tour', tourId: 'tour1', source: 'reward', grantedAt: clock, expiresAt: null });
    await expect(createInvite(deps(), 'bob', { tourId: 'tour1' })).rejects.toMatchObject({
      details: { reason: 'not_purchased' },
    });
    await expect(createInvite(deps(), 'carol', { tourId: 'tour1' })).rejects.toMatchObject({
      details: { reason: 'not_purchased' },
    });
  });

  it('redeems once, unlocks exactly that tour, and rejects reuse, own tokens and expiry', async () => {
    await buy();
    await seedTour({}, 'tour2');
    const { token } = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    expect(await previewInvite(deps(), token)).toMatchObject({
      valid: true,
      tourTitle: 'Great tour',
      placeName: 'Berlin',
    });
    await expect(redeemInvite(deps(), 'alice', { token })).rejects.toMatchObject({
      details: { reason: 'own_invite' },
    });
    expect(await redeemInvite(deps(), 'bob', { token })).toEqual({ tourId: 'tour1' });
    expect(await entIds('bob')).toEqual(['tour_tour1']);
    expect(
      (await db.collection('users').doc('bob').collection('entitlements').doc('tour_tour1').get()).get(
        'source',
      ),
    ).toBe('invite');
    await expect(redeemInvite(deps(), 'carol', { token })).rejects.toMatchObject({
      details: { reason: 'already_redeemed' },
    });
    expect(await previewInvite(deps(), token)).toEqual({ valid: false });
    await expect(redeemInvite(deps(), 'bob', { token: 'x'.repeat(32) })).rejects.toMatchObject({
      code: 'not-found',
    });
    const second = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    clock += 31 * 24 * 3600_000;
    await expect(redeemInvite(deps(), 'dave', { token: second.token })).rejects.toMatchObject({
      details: { reason: 'expired' },
    });
  });

  it('two friends racing for one token: exactly one wins', async () => {
    await buy();
    const { token } = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    const r = await Promise.allSettled(
      ['bob', 'carol', 'dave'].map((u) => redeemInvite(deps(), u, { token })),
    );
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('a redeemed invite cannot be shared again by the friend', async () => {
    await buy();
    const { token } = await createInvite(deps(), 'alice', { tourId: 'tour1' });
    await redeemInvite(deps(), 'bob', { token });
    await expect(createInvite(deps(), 'bob', { tourId: 'tour1' })).rejects.toMatchObject({
      details: { reason: 'not_purchased' },
    });
  });
});

describe('RevenueCat webhook processing', () => {
  const body = (over: Record<string, unknown>) => ({
    event: {
      id: 'evt1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'u1',
      product_id: 'tuur_sub_monthly',
      expiration_at_ms: clock + 30 * 86400_000,
      ...over,
    },
  });

  it('verifies the bearer secret in constant time', () => {
    expect(verifyBearer('Bearer s3cret', 's3cret')).toBe(true);
    expect(verifyBearer('Bearer nope', 's3cret')).toBe(false);
    expect(verifyBearer(undefined, 's3cret')).toBe(false);
    expect(verifyBearer('Bearer ', '')).toBe(false);
  });

  it('activates a subscription and is idempotent for duplicate deliveries', async () => {
    expect(await processRevenueCatEvent(deps(), body({}))).toMatchObject({ status: 'processed' });
    expect(await processRevenueCatEvent(deps(), body({}))).toMatchObject({ status: 'duplicate' });
    const s = (
      await db.collection('users').doc('u1').collection('entitlements').doc('subscription').get()
    ).data()!;
    expect(s['active']).toBe(true);
    await seedTour();
    expect(
      (await authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] })).reason,
    ).toBe('subscription');
    await processRevenueCatEvent(
      deps(),
      body({ id: 'evt2', type: 'EXPIRATION', expiration_at_ms: clock - 1 }),
    );
    await expect(
      authorizeContent(deps(), 'u1', { tourId: 'tour1', mode: 'tour', poiIds: ['wd_Q82425'] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('credits consumable purchases once per event and never below zero on refund', async () => {
    await processRevenueCatEvent(
      deps(),
      body({ id: 'p1', type: 'NON_RENEWING_PURCHASE', product_id: 'tuur_credit_5', transaction_id: 't1' }),
    );
    await processRevenueCatEvent(
      deps(),
      body({ id: 'p1', type: 'NON_RENEWING_PURCHASE', product_id: 'tuur_credit_5', transaction_id: 't1' }),
    );
    expect((await walletOf('u1'))!['balance']).toBe(5);
    await processRevenueCatEvent(
      deps(),
      body({ id: 'r1', type: 'REFUND', product_id: 'tuur_credit_5', transaction_id: 't1' }),
    );
    expect((await walletOf('u1'))!['balance']).toBe(0);
    await processRevenueCatEvent(
      deps(),
      body({ id: 'r2', type: 'REFUND', product_id: 'tuur_credit_5', transaction_id: 't1' }),
    );
    expect((await walletOf('u1'))!['balance']).toBe(0);
  });

  it('ignores unknown products and rejects malformed payloads', async () => {
    expect(await processRevenueCatEvent(deps(), body({ id: 'x', product_id: 'mystery' }))).toMatchObject({
      status: 'ignored',
    });
    await expect(processRevenueCatEvent(deps(), { nope: true })).rejects.toBeInstanceOf(BillingError);
  });
});

describe('rewarded ads (server-side verification)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const sign = (content: string) =>
    createSign('SHA256').update(content).sign(privateKey).toString('base64url');
  const callback = (params: Record<string, string>) => {
    const content = new URLSearchParams(params).toString();
    return `${content}&signature=${sign(content)}&key_id=123`;
  };

  it('verifies the Google signature and rejects tampering, wrong keys and missing signatures', () => {
    const q = callback({
      ad_network: '1',
      ad_unit: 'u',
      custom_data: 'n',
      reward_amount: '1',
      timestamp: '1',
      transaction_id: 't',
      user_id: 'u1',
    });
    expect(verifyAdmobSignature(q, [{ keyId: 123, pem }]).ok).toBe(true);
    expect(verifyAdmobSignature(q.replace('user_id=u1', 'user_id=u2'), [{ keyId: 123, pem }]).ok).toBe(false);
    expect(verifyAdmobSignature(q, [{ keyId: 999, pem }]).ok).toBe(false);
    expect(verifyAdmobSignature(q.replace(/&signature=[^&]+/, ''), [{ keyId: 123, pem }]).ok).toBe(false);
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    expect(verifyAdmobSignature(q, [{ keyId: 123, pem: other }]).ok).toBe(false);
  });

  it('grants one reward credit per nonce and enforces the daily limit', async () => {
    let tx = 0;
    const grant = async (uid: string, nonce: string) =>
      grantRewardFromSsv(deps(), { userId: uid, nonce, transactionId: `tx${++tx}` });
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { nonce } = await createRewardNonce(deps(), 'u1').catch(() => ({ nonce: '' }));
      results.push(nonce ? (await grant('u1', nonce)).granted : false);
    }
    expect(results).toEqual([true, true, true, false]);
    expect((await walletOf('u1'))!['rewardBalance']).toBe(3);
  });

  it('rejects reused, foreign, expired and unknown nonces and duplicate transactions', async () => {
    const { nonce } = await createRewardNonce(deps(), 'u1');
    expect(await grantRewardFromSsv(deps(), { userId: 'u2', nonce, transactionId: 'a' })).toMatchObject({
      granted: false,
      reason: 'unknown_nonce',
    });
    expect((await grantRewardFromSsv(deps(), { userId: 'u1', nonce, transactionId: 'b' })).granted).toBe(
      true,
    );
    expect(await grantRewardFromSsv(deps(), { userId: 'u1', nonce, transactionId: 'c' })).toMatchObject({
      granted: false,
      reason: 'nonce_used',
    });
    expect(await grantRewardFromSsv(deps(), { userId: 'u1', nonce, transactionId: 'b' })).toMatchObject({
      granted: false,
      reason: 'duplicate',
    });
    expect(
      await grantRewardFromSsv(deps(), { userId: 'u1', nonce: 'unknown', transactionId: 'd' }),
    ).toMatchObject({ granted: false, reason: 'unknown_nonce' });
    const { nonce: n2 } = await createRewardNonce(deps(), 'u1');
    clock += 31 * 60_000;
    expect(await grantRewardFromSsv(deps(), { userId: 'u1', nonce: n2, transactionId: 'e' })).toMatchObject({
      granted: false,
      reason: 'nonce_expired',
    });
  });
});

describe('getNarration is locked before generation (spec 6.4)', () => {
  const pois = buildPois(REGION_FIXTURES[0]!.raw, { now: 1 }).pois;
  const poi: Poi = pois.find((p) => p.id === 'wd_Q82425')!;
  class Counting extends MockLlmProvider {
    calls = 0;
    override async generateNarration(...a: Parameters<LlmProvider['generateNarration']>) {
      this.calls++;
      return super.generateNarration(...a);
    }
  }
  const sources: NarrationSourceProvider = {
    gather: async (p) => ({
      poiName: p.name,
      wikipedia: [{ lang: 'de', title: p.name, extract: 'Ein Ort mit langer Geschichte. '.repeat(50) }],
      facts: [],
      osmTags: {},
      adminFacts: [],
    }),
  };

  it('denies locked content without spending any model budget, then serves it after unlocking', async () => {
    await db.collection('pois').doc(poi.id).set(poi);
    await seedTour();
    const llm = new Counting();
    const nd: NarrationDeps = {
      db,
      llm,
      tts: new MockTtsProvider(),
      encoder: new Mp3AudioEncoder(),
      sources,
      now: () => clock,
      config: async () => DEFAULT_AI_CONFIG,
      store: { put: async () => undefined, delete: async () => undefined },
      authorize: async (uid, p, access) => {
        try {
          await authorizeContent(deps(), uid, {
            tourId: access?.tourId,
            mode: access?.mode,
            poiIds: [p.id],
            tile: p.tile,
          });
        } catch (e) {
          if (e instanceof BillingError) throw new NarrationError('permission-denied', e.message, e.details);
          throw e;
        }
      },
    };
    const req = { poiId: poi.id, lang: 'de', lengthTier: 'short', access: { tourId: 'tour1', mode: 'tour' } };
    await expect(getNarration(nd, 'u1', req)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getNarration(nd, 'u1', { ...req, access: undefined })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(llm.calls).toBe(0);
    await wallet('u1', 1);
    await spendCredit(deps(), 'u1', { kind: 'tour', tourId: 'tour1' });
    expect((await getNarration(nd, 'u1', req)).cached).toBe(false);
    // a different user hitting the cache is still locked
    await expect(getNarration(nd, 'u2', req)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(llm.calls).toBe(1);
  });
});
