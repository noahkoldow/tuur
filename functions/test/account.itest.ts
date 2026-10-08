import { getAuth } from 'firebase-admin/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import { REGION_FIXTURES, buildPois, type Poi } from '@tuur/shared';
import { deleteAccount, exportMyData, type AccountDeps } from '../src/account/service';
import { MockPayments } from '../src/partners/payments';
import { personalAudioPrefix } from '../src/narration/personalScope';
import {
  processPaymentEvent,
  saveOffer,
  savePartnerProfile,
  setPartnerStatus,
  type PartnerDeps,
} from '../src/partners/service';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
const clock = 1_800_000_000_000;
const payments = new MockPayments();
const deps = (): AccountDeps => ({ db, auth: getAuth(), payments, now: () => clock });
const pdeps = (): PartnerDeps => ({
  db,
  now: () => clock,
  tokenSecret: () => 'unit-test-secret-0123456789',
  payments: () => payments,
  webBaseUrl: 'https://tuur.test',
});
let poi: Poi;

async function makeUser(email: string) {
  return getAuth().createUser({ email, password: 'Passw0rd!' });
}

async function seedUserData(uid: string) {
  const u = db.collection('users').doc(uid);
  await u.set({ language: 'de', interests: ['history'] });
  await u
    .collection('entitlements')
    .doc('tour_t1')
    .set({ type: 'tour', tourId: 't1', source: 'credit', expiresAt: null });
  await u.collection('credits').doc('wallet').set({ balance: 2, rewardBalance: 1 });
  await u.collection('creditLedger').doc('l1').set({ delta: -1, kind: 'tour', ts: clock });
  await u.collection('tourTime').doc('budget').set({ month: '2026-10', usedSeconds: 60, active: null });
  await u.collection('tourTimeSessions').doc('walk').set({ mode: 'tour', tourId: 't1', sequence: 2 });
  await u.collection('tourDownloads').doc('download').set({ tourId: 't1', seconds: 5400 });
  await u.collection('consents').doc('ai').set({ granted: true, version: 'test-version', updatedAt: clock });
  await u.collection('blockedPartners').doc('blocked-partner').set({ blockedAt: clock });
  await db
    .collection('users')
    .doc('other-owner')
    .collection('tourDownloads')
    .doc('other')
    .set({ tourId: 'private-other-download' });
  await db
    .collection('revenuecatPurchases')
    .doc('transaction-fingerprint')
    .set({ ownerUid: uid, transactionId: 'private-receipt', remaining: 2 });
  await db.collection('revenuecatSubscriptions').doc('subscription-fingerprint').set({ ownerUid: uid });
  await u
    .collection('sessions')
    .doc('s1')
    .set({ kind: 'planned', expiresAt: clock + 1000, placeName: 'Berlin', secretRoute: [1, 2] });
  await db
    .collection('invites')
    .doc('hash1')
    .set({ tourId: 't1', ownerUid: uid, createdAt: clock, expiresAt: clock + 1e6 });
  await db
    .collection('invites')
    .doc('hash2')
    .set({ tourId: 't2', ownerUid: 'someoneElse', redeemedBy: uid, expiresAt: clock + 1e6 });
  await db
    .collection('redemptionTokens')
    .doc('tok1')
    .set({ uid, offerId: 'o1', day: '2026-01-01', token: 'secret-token', used: false, expiresAt: clock + 1 });
  await db
    .collection('rewardNonces')
    .doc('n1')
    .set({ uid, used: false, expiresAt: clock + 1 });
  await db.collection('feedback').doc(`${uid}__k`).set({
    uid,
    narrationKey: 'k',
    reason: 'wrong_fact',
    text: 'stimmt nicht',
    status: 'open',
    createdAt: clock,
  });
  await db.collection('rateLimits').doc(`narr_user_${uid}`).set({ count: 3 });
  await db.collection('rateLimits').doc(`narr_user_${uid}2`).set({ count: 1 }); // another user whose id starts the same way must survive... see below
  await db.collection('rateLimits').doc('narr_user_other').set({ count: 9 });
  await db.collection('rateLimits').doc(`poi_text_user_${uid}`).set({ count: 2, windowStart: clock });
  await db.collection('rateLimits').doc(`poi_text_user_${uid}2`).set({ count: 7, windowStart: clock });
  for (const prefix of ['ai_consent_read_', 'ai_consent_write_', 'content_report_']) {
    await db.collection('rateLimits').doc(`${prefix}${uid}`).set({ count: 2, windowStart: clock });
    await db.collection('rateLimits').doc(`${prefix}${uid}2`).set({ count: 7, windowStart: clock });
  }
  await db
    .collection('poiTexts')
    .doc('shared-source-text')
    .set({ poiId: poi.id, text: 'Public source text' });
  await db.collection('usageDaily').doc('2026-01-01').set({ costUsd: 3 });
  await db
    .collection('groups')
    .doc('hosted-group')
    .set({
      id: 'hosted-group',
      hostUid: uid,
      members: [uid, 'private-guest-uid'],
      inviteHash: 'private-group-hash',
      tour: { id: 't1' },
      mode: 'tour',
      status: 'live',
      createdAt: clock,
      expiresAt: clock + 1000,
    });
  await db
    .collection('groups')
    .doc('joined-group')
    .set({
      id: 'joined-group',
      hostUid: 'private-host-uid',
      members: ['private-host-uid', uid, 'other-member'],
      inviteHash: 'other-private-hash',
      tour: { id: 't2', path: 'other-private-route' },
      mode: 'tour',
      status: 'live',
      createdAt: clock,
      expiresAt: clock + 1000,
    });
  await db.collection('rateLimits').doc(`group_join_${uid}`).set({ count: 1 });
  await db
    .collection('groups')
    .doc('hosted-group')
    .collection('recordings')
    .doc('chapter')
    .set({
      doc: { ownerUid: uid, text: 'My group recording' },
    });
  await db
    .collection('groups')
    .doc('joined-group')
    .collection('recordings')
    .doc('chapter')
    .set({
      doc: { ownerUid: 'private-host-uid', text: 'Another group recording' },
    });
  await db
    .collection('narrations')
    .doc('my-personal-recording')
    .set({ ownerUid: uid, text: 'My private walk' });
  await db
    .collection('narrations')
    .doc('my-personal-recording')
    .collection('voices')
    .doc('mara')
    .set({ audioPath: `${personalAudioPrefix(uid)}chapter.mp3` });
  await db
    .collection('narrations')
    .doc('another-personal-recording')
    .set({ ownerUid: 'other-owner', text: 'Someone else private recording' });
}

beforeEach(async () => {
  await clearFirestore();
  await fetch(
    `http://${process.env['FIREBASE_AUTH_EMULATOR_HOST']}/emulator/v1/projects/demo-tuur/accounts`,
    { method: 'DELETE' },
  );
  const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
  poi = pois[0]!;
  await db.collection('pois').doc(poi.id).set(poi);
});

describe('account export', () => {
  it('contains the account data without secrets or other users’ data', async () => {
    const u = await makeUser('me@example.com');
    await getAuth().updateUser(u.uid, {
      phoneNumber: '+16505550123',
      displayName: 'Export test account',
      photoURL: 'https://example.com/avatar.png',
      emailVerified: true,
    });
    await seedUserData(u.uid);
    const out = await exportMyData(
      {
        ...deps(),
        payments: () => {
          throw new Error('Stripe not configured');
        },
      },
      u.uid,
    );
    expect(out.account).toMatchObject({
      uid: u.uid,
      email: 'me@example.com',
      emailVerified: true,
      phoneNumber: '+16505550123',
      displayName: 'Export test account',
      photoURL: 'https://example.com/avatar.png',
      linkedAccounts: expect.arrayContaining([
        expect.objectContaining({ providerId: 'phone', phoneNumber: '+16505550123' }),
      ]),
    });
    expect(JSON.stringify(out.account)).not.toMatch(/passwordHash|passwordSalt|refreshToken|customClaims/);
    expect(out.wallet).toEqual({ balance: 2, rewardBalance: 1 });
    expect(out.entitlements).toHaveLength(1);
    expect(out.creditLedger).toHaveLength(1);
    expect(out.rateLimits).toContainEqual({ id: `poi_text_user_${u.uid}`, count: 2, windowStart: clock });
    expect(out.rateLimits.some((entry) => entry.id === `poi_text_user_${u.uid}2`)).toBe(false);
    expect(out.rateLimits.some((entry) => entry.id === 'narr_user_other')).toBe(false);
    for (const prefix of ['ai_consent_read_', 'ai_consent_write_', 'content_report_']) {
      expect(out.rateLimits).toContainEqual({ id: `${prefix}${u.uid}`, count: 2, windowStart: clock });
      expect(out.rateLimits.some((entry) => entry.id === `${prefix}${u.uid}2`)).toBe(false);
    }
    expect(out.tourTime).toEqual([{ id: 'budget', month: '2026-10', usedSeconds: 60, active: null }]);
    expect(out.tourTimeSessions).toHaveLength(1);
    expect(out.tourDownloads).toEqual([{ id: 'download', tourId: 't1', seconds: 5400 }]);
    expect(out.consents).toContainEqual({
      id: 'ai',
      granted: true,
      version: 'test-version',
      updatedAt: clock,
    });
    expect(out.blockedPartners).toEqual([{ id: 'blocked-partner', blockedAt: clock }]);
    expect(out.purchases).toHaveLength(1);
    expect(out.subscriptions).toHaveLength(1);
    expect(out.personalNarrations).toHaveLength(1);
    expect(out.personalNarrations[0]).toMatchObject({ ownerUid: u.uid, text: 'My private walk' });
    expect(out.groups).toHaveLength(2);
    expect(out.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'hosted-group', role: 'host', tourId: 't1' }),
        expect.objectContaining({ id: 'joined-group', role: 'member', tourId: 't2' }),
      ]),
    );
    expect(out.invitesCreated).toEqual([
      { tourId: 't1', createdAt: clock, expiresAt: clock + 1e6, redeemed: false },
    ]);
    expect(out.feedback[0]).toMatchObject({ reason: 'wrong_fact', text: 'stimmt nicht' });
    const json = JSON.stringify(out);
    expect(json).not.toContain('secret-token');
    expect(json).not.toContain('hash1');
    expect(json).not.toContain('secretRoute');
    expect(json).not.toContain('someoneElse');
    expect(json).not.toContain('private-group-hash');
    expect(json).not.toContain('private-guest-uid');
    expect(json).not.toContain('private-host-uid');
    expect(json).not.toContain('other-private-route');
    expect(json).not.toContain('Someone else private recording');
    expect(json).not.toContain('private-other-download');
  });
});

describe('account deletion', () => {
  it('removes all user data and the auth record, anonymizes feedback and keeps other users’ data', async () => {
    const u = await makeUser('me@example.com');
    const other = await makeUser('other@example.com');
    await seedUserData(u.uid);
    await db.collection('users').doc(other.uid).set({ language: 'en' });
    const r = await deleteAccount(
      {
        ...deps(),
        payments: () => {
          throw new Error('Stripe not configured');
        },
      },
      u.uid,
    );
    expect(r.deleted).toBe(true);
    expect((await db.collection('narrations').doc('my-personal-recording').get()).exists).toBe(false);
    expect(
      (await db.collection('narrations').doc('my-personal-recording').collection('voices').get()).empty,
    ).toBe(true);
    expect((await db.collection('narrations').doc('another-personal-recording').get()).exists).toBe(true);
    expect((await db.collection('groups').doc('hosted-group').collection('recordings').get()).empty).toBe(
      true,
    );
    expect((await db.collection('groups').doc('joined-group').collection('recordings').get()).size).toBe(1);

    expect((await db.collection('users').doc(u.uid).get()).exists).toBe(false);
    expect((await db.collection('users').doc(u.uid).collection('entitlements').get()).size).toBe(0);
    expect((await db.collection('users').doc(u.uid).collection('sessions').get()).size).toBe(0);
    for (const name of ['tourTime', 'tourTimeSessions', 'tourDownloads'])
      expect((await db.collection('users').doc(u.uid).collection(name).get()).size).toBe(0);
    expect(
      (await db.collection('users').doc('other-owner').collection('tourDownloads').doc('other').get()).exists,
    ).toBe(true);
    expect((await db.collection('revenuecatPurchases').doc('transaction-fingerprint').get()).data()).toEqual({
      deleted: true,
      remaining: 0,
      updatedAt: clock,
    });
    expect(
      (await db.collection('revenuecatSubscriptions').doc('subscription-fingerprint').get()).data(),
    ).toEqual({ deleted: true, remaining: 0, updatedAt: clock });
    expect((await db.collection('invites').doc('hash1').get()).exists).toBe(false);
    expect((await db.collection('invites').doc('hash2').get()).get('redeemedBy')).toBe('deleted');
    expect((await db.collection('redemptionTokens').get()).size).toBe(0);
    expect((await db.collection('rewardNonces').get()).size).toBe(0);
    // the report (its id contains the uid and its text may identify the user) is deleted, not just stripped
    expect((await db.collection('feedback').doc(`${u.uid}__k`).get()).exists).toBe(false);
    expect((await db.collection('rateLimits').doc(`narr_user_${u.uid}`).get()).exists).toBe(false);
    expect((await db.collection('rateLimits').doc(`narr_user_${u.uid}2`).get()).exists).toBe(true);
    expect((await db.collection('rateLimits').doc(`group_join_${u.uid}`).get()).exists).toBe(false);
    expect((await db.collection('rateLimits').doc(`poi_text_user_${u.uid}`).get()).exists).toBe(false);
    expect((await db.collection('rateLimits').doc(`poi_text_user_${u.uid}2`).get()).exists).toBe(true);
    for (const prefix of ['ai_consent_read_', 'ai_consent_write_', 'content_report_']) {
      expect((await db.collection('rateLimits').doc(`${prefix}${u.uid}`).get()).exists).toBe(false);
      expect((await db.collection('rateLimits').doc(`${prefix}${u.uid}2`).get()).exists).toBe(true);
    }
    expect((await db.collection('poiTexts').doc('shared-source-text').get()).exists).toBe(true);
    expect((await db.collection('groups').doc('hosted-group').get()).exists).toBe(false);
    expect((await db.collection('groups').doc('joined-group').get()).get('members')).toEqual([
      'private-host-uid',
      'other-member',
    ]);
    expect((await db.collection('rateLimits').doc('narr_user_other').get()).exists).toBe(true);
    expect((await db.collection('usageDaily').doc('2026-01-01').get()).exists).toBe(true);
    expect((await db.collection('users').doc(other.uid).get()).exists).toBe(true);
    await expect(getAuth().getUser(u.uid)).rejects.toBeTruthy();
    await expect(getAuth().getUser(other.uid)).resolves.toBeTruthy();
    // running it again is harmless
    await expect(deleteAccount(deps(), u.uid).catch((e: { code?: string }) => e.code)).resolves.toBeDefined();
  });

  it('deletes a partner account: cancels the subscription, unlinks the POI and removes profile, offers and statistics', async () => {
    const u = await makeUser('partner@example.com');
    await savePartnerProfile(pdeps(), u.uid, {
      name: 'Café Linde',
      category: 'cafe',
      address: 'Unter den Linden 1',
      countryCode: 'DE',
      description: 'Traditionelles Café mit hausgemachtem Kuchen und Blick auf die Allee.',
      acceptTerms: true,
      link: { poiId: poi.id },
    });
    await setPartnerStatus(pdeps(), { partnerId: u.uid, status: 'approved' });
    const ev = new MockPayments().parseWebhook(
      Buffer.from(
        JSON.stringify({
          id: 'e1',
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_9',
              customer: 'cus_9',
              status: 'active',
              current_period_end: Math.floor((clock + 1e9) / 1000),
              metadata: { partnerId: u.uid, tier: 'offers' },
            },
          },
        }),
      ),
      'mock',
    );
    await processPaymentEvent(pdeps(), ev);
    await saveOffer(pdeps(), u.uid, {
      title: 'Angebot',
      description: 'Beschreibung',
      validFrom: clock - 1,
      validUntil: clock + 1e7,
    });
    await db
      .collection('partnerStats')
      .doc(`${u.uid}_2026-01-01`)
      .set({ partnerId: u.uid, day: '2026-01-01', impressions: 4 });
    expect((await db.collection('pois').doc(poi.id).get()).get('partnerId')).toBe(u.uid);

    await deleteAccount(deps(), u.uid);
    expect(payments.cancelled).toEqual(['sub_9']);
    expect((await db.collection('partners').doc(u.uid).get()).exists).toBe(false);
    expect((await db.collection('offers').get()).size).toBe(0);
    expect((await db.collection('partnerStats').get()).size).toBe(0);
    const p = (await db.collection('pois').doc(poi.id).get()).data()!;
    expect(p['partnerId']).toBeUndefined();
    expect(p['partnerBoost']).toBe(0);
  });
});
