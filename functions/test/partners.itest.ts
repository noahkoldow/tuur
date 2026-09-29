import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_CONFIG,
  REGION_FIXTURES,
  buildPois,
  partnerIntro,
  type Poi,
  type SourceBundle,
} from '@tuur/shared';
import { MockLlmProvider } from '../src/providers/llm';
import type { NarrationSourceProvider } from '../src/providers/narrationSources';
import { MockTtsProvider, Mp3AudioEncoder } from '../src/providers/tts';
import { getNarration, type NarrationDeps } from '../src/narration/service';
import { MockPayments } from '../src/partners/payments';
import {
  PartnerError,
  createRedemptionToken,
  getOffers,
  loadPartner,
  partnerStats,
  processPaymentEvent,
  recordPartnerEvent,
  redeemToken,
  saveOffer,
  savePartnerProfile,
  setPartnerStatus,
  sweepPartnerPlans,
  type PartnerDeps,
} from '../src/partners/service';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_800_000_000_000;
const deps = (): PartnerDeps => ({
  db,
  now: () => clock,
  tokenSecret: () => 'unit-test-secret-0123456789',
  payments: () => new MockPayments(),
  webBaseUrl: 'https://tuur.test',
});

let poi: Poi;
const profile = {
  name: 'Café Linde',
  category: 'cafe',
  address: 'Unter den Linden 1, Berlin',
  countryCode: 'DE',
  openingHours: 'Mo-Fr 8-18',
  description: 'Traditionelles Café mit hausgemachtem Kuchen und Blick auf die Allee.',
};

const subEvent = (id: string, over: Record<string, unknown> = {}, type = 'customer.subscription.updated') =>
  new MockPayments().parseWebhook(
    Buffer.from(
      JSON.stringify({
        id,
        type,
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            current_period_end: Math.floor((clock + 30 * 86_400_000) / 1000),
            metadata: { partnerId: 'pa1', tier: 'offers' },
            ...over,
          },
        },
      }),
    ),
    'mock',
  );

/** Registers, links, approves and subscribes a partner, so most tests start from a live partner. */
async function livePartner(uid = 'pa1', tier: 'offers' | 'visibility' = 'offers') {
  await savePartnerProfile(deps(), uid, { ...profile, link: { poiId: poi.id } });
  await setPartnerStatus(deps(), { partnerId: uid, status: 'approved' });
  await processPaymentEvent(
    deps(),
    subEvent(`evt_${uid}_${tier}`, { metadata: { partnerId: uid, tier } }, 'customer.subscription.created'),
  );
}

const offerInput = (over: Record<string, unknown> = {}) => ({
  title: '10 % auf Kuchen',
  description: 'Gegen Vorlage des QR-Codes.',
  terms: 'Nicht kombinierbar.',
  validFrom: clock - 1000,
  validUntil: clock + 7 * 86_400_000,
  ...over,
});

const near = { lat: 52.5163, lng: 13.3777 };

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000;
  const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
  poi = pois.find((p) => p.id === 'wd_Q82425')!;
  poi = { ...poi, location: near, baseScore: 50, score: 50 };
  await db.collection('pois').doc(poi.id).set(poi);
});

describe('partner lifecycle and boost', () => {
  it('starts pending; approval alone gives neither label nor boost until a paid plan is active', async () => {
    const p = await savePartnerProfile(deps(), 'pa1', { ...profile, link: { poiId: poi.id } });
    expect(p.status).toBe('pending');
    await setPartnerStatus(deps(), { partnerId: 'pa1', status: 'approved' });
    let doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerId']).toBeUndefined();
    expect(doc['score']).toBe(50);

    await processPaymentEvent(deps(), subEvent('e1', {}, 'customer.subscription.created'));
    doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerId']).toBe('pa1');
    expect(doc['partnerBoost']).toBe(12);
    expect(doc['score']).toBe(62);
  });

  it('caps the boost at the configured cap even if the configured points are higher', async () => {
    await db
      .collection('config')
      .doc('partners')
      .set({ boost: { offers: 90, visibility: 90 }, boostCap: 15 });
    await livePartner();
    const doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerBoost']).toBe(15);
    expect(doc['score']).toBe(65);
  });

  it('removes label and boost when the subscription ends, is past due or the plan period ran out', async () => {
    await livePartner();
    await processPaymentEvent(deps(), subEvent('e2', {}, 'customer.subscription.deleted'));
    let doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerId']).toBeUndefined();
    expect(doc['score']).toBe(50);

    await processPaymentEvent(deps(), subEvent('e3', {}, 'customer.subscription.updated'));
    expect((await db.collection('pois').doc(poi.id).get()).get('partnerId')).toBe('pa1');
    await processPaymentEvent(deps(), subEvent('e4', { status: 'past_due' }));
    expect((await db.collection('pois').doc(poi.id).get()).get('partnerId')).toBeUndefined();

    // webhook never arrived: the sweep still retires an expired plan
    await processPaymentEvent(
      deps(),
      subEvent('e5', { current_period_end: Math.floor((clock + 1000) / 1000) }),
    );
    expect((await db.collection('pois').doc(poi.id).get()).get('partnerId')).toBe('pa1');
    clock += 3600_000;
    expect(await sweepPartnerPlans(deps())).toBe(1);
    doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerId']).toBeUndefined();
    expect(doc['partnerBoost']).toBe(0);
  });

  it('processes each Stripe event once and ignores unknown partners', async () => {
    await livePartner();
    const ev = subEvent('same', { status: 'past_due' });
    await expect(processPaymentEvent(deps(), ev)).resolves.toBe('processed');
    await expect(processPaymentEvent(deps(), ev)).resolves.toBe('duplicate');
    await expect(
      processPaymentEvent(deps(), subEvent('x', { metadata: { partnerId: 'ghost' }, customer: 'cus_ghost' })),
    ).resolves.toBe('ignored');
  });

  it('rejects Stripe webhooks with a bad signature', () => {
    expect(() => new MockPayments().parseWebhook(Buffer.from('{}'), 'nope')).toThrow();
  });

  it('sends an approved partner back to review when spoken content changes (label and boost vanish)', async () => {
    await livePartner();
    const p = await savePartnerProfile(deps(), 'pa1', {
      ...profile,
      description: 'Ganz neuer Text, der erst geprüft werden muss und lang genug ist.',
    });
    expect(p.status).toBe('pending');
    expect(p.contentRev).toBe(2);
    const doc = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(doc['partnerId']).toBeUndefined();
    expect(doc['score']).toBe(50);
    // unrelated edits (opening hours) do not
    await setPartnerStatus(deps(), { partnerId: 'pa1', status: 'approved' });
    const again = await savePartnerProfile(deps(), 'pa1', {
      ...profile,
      description: p.description,
      openingHours: 'täglich',
    });
    expect(again.status).toBe('approved');
  });

  it('creates a new POI for a proposal on approval and refuses linking a POI of another partner', async () => {
    await savePartnerProfile(deps(), 'pa2', {
      ...profile,
      link: { newPoi: { name: 'Neue Bäckerei', location: { lat: 52.51, lng: 13.38 } } },
    });
    const approved = await setPartnerStatus(deps(), { partnerId: 'pa2', status: 'approved' });
    expect(approved.poiId).toBe('partner_pa2');
    expect((await db.collection('pois').doc('partner_pa2').get()).exists).toBe(true);

    await livePartner('pa1');
    await expect(
      savePartnerProfile(deps(), 'pa3', { ...profile, link: { poiId: poi.id } }),
    ).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('cannot approve a partner without a POI', async () => {
    await savePartnerProfile(deps(), 'pa4', profile);
    await expect(setPartnerStatus(deps(), { partnerId: 'pa4', status: 'approved' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('offers', () => {
  it('need an active offers plan', async () => {
    await livePartner('pa1', 'visibility');
    await expect(saveOffer(deps(), 'pa1', offerInput())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('are listed to listeners only while valid and only for live partners', async () => {
    await livePartner();
    const o = await saveOffer(deps(), 'pa1', offerInput());
    await saveOffer(
      deps(),
      'pa1',
      offerInput({ title: 'abgelaufen', validFrom: clock - 5000, validUntil: clock - 1000 }),
    );
    await saveOffer(deps(), 'pa1', offerInput({ title: 'pausiert', active: false }));
    const list = await getOffers(deps(), { poiIds: [poi.id] });
    expect(list.map((x) => x.id)).toEqual([o.id]);
    expect(list[0]).toMatchObject({ partnerName: 'Café Linde', title: '10 % auf Kuchen' });
    expect(JSON.stringify(list)).not.toContain('pa1');

    await processPaymentEvent(deps(), subEvent('gone', {}, 'customer.subscription.deleted'));
    expect(await getOffers(deps(), { poiIds: [poi.id] })).toEqual([]);
  });

  it('cannot be changed by another partner', async () => {
    await livePartner('pa1');
    const o = await saveOffer(deps(), 'pa1', offerInput());
    await db.collection('poisTmp').doc('x').set({});
    await savePartnerProfile(deps(), 'pa9', profile);
    await expect(saveOffer(deps(), 'pa9', { ...offerInput(), offerId: o.id })).rejects.toBeInstanceOf(
      PartnerError,
    );
  });
});

describe('QR redemption', () => {
  const setup = async (over: Record<string, unknown> = {}) => {
    await livePartner();
    return saveOffer(deps(), 'pa1', offerInput(over));
  };

  it('issues a token near the partner, the partner redeems it once and both sides see the result', async () => {
    const offer = await setup();
    const t = await createRedemptionToken(deps(), 'listener1', { offerId: offer.id, position: near });
    expect(t.expiresAt).toBe(clock + 10 * 60_000);
    expect(t.token.startsWith('tuur1.')).toBe(true);

    const r = await redeemToken(deps(), 'pa1', { token: t.token });
    expect(r.offerTitle).toBe(offer.title);
    expect((await db.collection('redemptionTokens').doc(t.tokenId).get()).get('used')).toBe(true);
    await expect(redeemToken(deps(), 'pa1', { token: t.token })).rejects.toMatchObject({
      details: { reason: 'already_used' },
    });
    // the log never says who
    const logs = await db.collection('redemptions').get();
    expect(logs.size).toBe(1);
    expect(JSON.stringify(logs.docs[0]!.data())).not.toContain('listener1');
    // a listener can redeem an offer only once per day
    await expect(
      createRedemptionToken(deps(), 'listener1', { offerId: offer.id, position: near }),
    ).rejects.toMatchObject({ details: { reason: 'already_redeemed_today' } });
  });

  it('requires proximity, does not store the position and reuses an open token', async () => {
    const offer = await setup();
    await expect(
      createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: { lat: 52.6, lng: 13.5 } }),
    ).rejects.toMatchObject({ details: { reason: 'too_far' } });
    const a = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    const b = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    expect(b.token).toBe(a.token);
    const stored = JSON.stringify((await db.collection('redemptionTokens').get()).docs.map((d) => d.data()));
    expect(stored).not.toContain('52.5163');
  });

  it('rejects expired tokens and tokens for another partner', async () => {
    const offer = await setup();
    const t = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    await savePartnerProfile(deps(), 'other', profile);
    await expect(redeemToken(deps(), 'other', { token: t.token })).rejects.toBeInstanceOf(PartnerError);
    clock += 10 * 60_000 + 1;
    await expect(redeemToken(deps(), 'pa1', { token: t.token })).rejects.toMatchObject({
      details: { reason: 'expired' },
    });
    // an expired unused token is replaced by a fresh one
    const fresh = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    expect(fresh.token).not.toBe(t.token);
  });

  it('rejects forged and tampered tokens', async () => {
    const offer = await setup();
    const t = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    const parts = t.token.split('.');
    const tampered = [parts[0], parts[1], String(Number(parts[2]) + 60_000), parts[3]].join('.');
    await expect(redeemToken(deps(), 'pa1', { token: tampered })).rejects.toMatchObject({
      details: { reason: 'invalid' },
    });
    await expect(
      redeemToken(deps(), 'pa1', { token: 'tuur1.AAAAAAAAAAAA.1800000000000.' + 'A'.repeat(43) }),
    ).rejects.toMatchObject({
      details: { reason: 'invalid' },
    });
    await expect(
      redeemToken(deps(), 'pa1', { token: 'not a token at all, definitely' }),
    ).rejects.toMatchObject({
      details: { reason: 'invalid' },
    });
  });

  it('enforces the daily limit at creation and at scan time', async () => {
    const offer = await setup({ dailyLimit: 1 });
    // both listeners get a token while the limit is still free, only one scan can succeed
    const a = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    const b = await createRedemptionToken(deps(), 'l2', { offerId: offer.id, position: near });
    await redeemToken(deps(), 'pa1', { token: a.token });
    await expect(redeemToken(deps(), 'pa1', { token: b.token })).rejects.toMatchObject({
      details: { reason: 'daily_limit' },
    });
    await expect(
      createRedemptionToken(deps(), 'l3', { offerId: offer.id, position: near }),
    ).rejects.toMatchObject({ details: { reason: 'daily_limit' } });
    // next day the limit resets
    clock += 24 * 3600_000;
    await db
      .collection('offers')
      .doc(offer.id)
      .update({ validUntil: clock + 86_400_000 });
    await expect(
      createRedemptionToken(deps(), 'l3', { offerId: offer.id, position: near }),
    ).resolves.toBeDefined();
  });

  it('is refused once the plan is gone or the offer expired', async () => {
    const offer = await setup();
    const t = await createRedemptionToken(deps(), 'l1', { offerId: offer.id, position: near });
    await db.collection('offers').doc(offer.id).update({ active: false });
    await expect(redeemToken(deps(), 'pa1', { token: t.token })).rejects.toMatchObject({
      details: { reason: 'offer_inactive' },
    });
    await db.collection('offers').doc(offer.id).update({ active: true });
    await processPaymentEvent(deps(), subEvent('end', {}, 'customer.subscription.deleted'));
    await expect(redeemToken(deps(), 'pa1', { token: t.token })).rejects.toMatchObject({
      details: { reason: 'partner_inactive' },
    });
  });
});

describe('aggregated statistics', () => {
  it('count impressions and visits once per listener and poi, and redemptions, without user ids', async () => {
    await livePartner();
    const offer = await saveOffer(deps(), 'pa1', offerInput());
    for (const uid of ['a', 'a', 'b'])
      await recordPartnerEvent(deps(), uid, { poiId: poi.id, type: 'impression' });
    await recordPartnerEvent(deps(), 'a', { poiId: poi.id, type: 'visit' });
    await recordPartnerEvent(deps(), 'a', { poiId: 'wd_Q4340', type: 'visit' }); // not a partner poi: ignored
    const t = await createRedemptionToken(deps(), 'a', { offerId: offer.id, position: near });
    await redeemToken(deps(), 'pa1', { token: t.token });
    const s = await partnerStats(deps(), 'pa1', { days: 7 });
    expect(s.totals).toEqual({ impressions: 2, visits: 1, redemptions: 1 });
    const raw = JSON.stringify((await db.collection('partnerStats').get()).docs.map((d) => d.data()));
    expect(raw).not.toMatch(/"a"|"b"/);
  });
});

describe('partner narration', () => {
  const sources: NarrationSourceProvider = {
    async gather(p: Poi): Promise<SourceBundle> {
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
  const narrationDeps = (): NarrationDeps => ({
    db,
    llm: new MockLlmProvider(),
    tts: new MockTtsProvider(),
    encoder: new Mp3AudioEncoder(),
    sources,
    store: { put: async () => undefined, delete: async () => undefined },
    now: () => clock,
    config: async () => DEFAULT_AI_CONFIG,
  });
  const req = { poiId: 'wd_Q82425', lang: 'de', lengthTier: 'short' };

  it('announces partner introductions, marks them sponsored and keys them by profile revision', async () => {
    const plain = await getNarration(narrationDeps(), 'u1', req);
    expect(plain.sponsored).toBeUndefined();

    await livePartner();
    const sp = await getNarration(narrationDeps(), 'u1', req);
    expect(sp.sponsored).toBe(true);
    expect(sp.text.startsWith(partnerIntro('de'))).toBe(true);
    expect(sp.key).not.toBe(plain.key);
    expect(sp.key).toContain('-p1');

    const en = await getNarration(narrationDeps(), 'u1', { ...req, lang: 'en' });
    expect(en.text.startsWith(partnerIntro('en'))).toBe(true);

    // plan lapses: back to the neutral narration, no partner text
    await processPaymentEvent(deps(), subEvent('lapse', {}, 'customer.subscription.deleted'));
    const after = await getNarration(narrationDeps(), 'u1', req);
    expect(after.sponsored).toBeUndefined();
    expect(after.key).toBe(plain.key);
    expect((await loadPartner(db, 'pa1'))!.plan.active).toBe(false);
  });
});
