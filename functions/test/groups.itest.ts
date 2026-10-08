import { beforeEach, describe, expect, it } from 'vitest';
import { REGION_FIXTURES, buildPois, createTourScript, encodePolyline, type Tour } from '@tuur/shared';
import { addGroupSeat, createGroup, hasGroupAccess, joinGroup, leaveGroup } from '../src/groups/service';
import { clearFirestore, testDb } from './helpers';
import { processRevenueCatEvent } from '../src/billing/entitlements';
import { purchaseKey } from '../src/billing/purchaseLedger';
import { updateTourTime } from '../src/billing/timeBudget';

const db = testDb();
let clock = 1_800_000_000_000;
const deps = () => ({ db, now: () => clock });
const { pois } = buildPois(REGION_FIXTURES[0]!.raw, { now: clock });
const stops = pois.slice(0, 3);
const audio = { lang: 'en', script: createTourScript({ lang: 'en', instanceId: 'group-walk' }) };

function tour(): Tour {
  return {
    id: 'tour_g1',
    placeId: 'p1',
    source: 'auto',
    version: 1,
    template: 'highlights',
    profile: 'foot-walking',
    themes: [],
    stops: stops.map((p, i) => ({
      poiId: p.id,
      order: i,
      name: p.name,
      location: p.location,
      dwellMinutes: 5,
      walkMinutesFromPrev: i ? 5 : 0,
      partner: false,
    })),
    path: encodePolyline(stops.map((p) => [p.location.lat, p.location.lng] as [number, number])),
    durationMinutes: 60,
    walkMinutes: 20,
    distanceMeters: 1500,
    bbox: { south: 52.5, north: 52.52, west: 13.37, east: 13.4 },
    routingSource: 'mock',
    fingerprint: 'f',
    free: false,
    locked: false,
    pinned: false,
    hasPartner: false,
    texts: {},
    createdAt: clock,
    updatedAt: clock,
  };
}

beforeEach(async () => {
  await clearFirestore();
  clock += 3 * 3600_000;
  for (const p of stops) await db.collection('pois').doc(p.id).set(p);
  await db.collection('tours').doc('tour_g1').set(tour());
  // the host bought the tour; guests own nothing
  await db
    .collection('users')
    .doc('host')
    .collection('entitlements')
    .doc('tour_tour_g1')
    .set({ type: 'tour', tourId: 'tour_g1', source: 'credit', grantedAt: clock, expiresAt: null });
});

describe('live group tours', () => {
  it.each(['free', 'reward'])('does not let a retained %s host grant fund shared audio', async (source) => {
    const { token, group } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    await joinGroup(deps(), 'friend', { token });
    const entitlement = db.doc('users/host/entitlements/tour_tour_g1');
    await entitlement.update({ source });
    expect(await hasGroupAccess(deps(), 'friend', group.id, { poiIds: [stops[0]!.id] })).toBe(false);
    await expect(
      createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      details: { reason: 'audio_requires_purchase' },
    });
    expect((await entitlement.get()).get('source')).toBe(source);
  });

  it('revokes a subscription-backed group when the host loses the subscription', async () => {
    const { token, group } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    await joinGroup(deps(), 'friend', { token });
    await db.collection('groups').doc(group.id).update({ hostSubscriber: true });
    const subscription = db.collection('users').doc('host').collection('entitlements').doc('subscription');
    await subscription.set({
      type: 'subscription',
      active: true,
      productId: 'tuur_sub_monthly',
      expiresAt: clock + 10000,
      updatedAt: clock,
    });
    await db.collection('groups').doc(group.id).update({ sessionId: 'group-time-session' });
    await updateTourTime(deps(), 'host', {
      sessionId: 'group-time-session',
      sequence: 1,
      mode: 'tour',
      tourId: 'tour_g1',
      state: 'active',
    });
    const request = { poiIds: [stops[0]!.id] };
    expect(await hasGroupAccess(deps(), 'friend', group.id, request)).toBe(true);
    await subscription.update({ active: false });
    expect(await hasGroupAccess(deps(), 'friend', group.id, request)).toBe(false);
  });

  it('preserves existing group audio rights funded by a purchase-backed legacy gift', async () => {
    await db.doc('users/host/entitlements/tour_tour_g1').update({ source: 'invite', inviteFrom: 'buyer' });
    const { token, group } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    await joinGroup(deps(), 'friend', { token });
    expect(await hasGroupAccess(deps(), 'friend', group.id, { poiIds: [stops[0]!.id] })).toBe(true);
  });

  it('lets two friends ride along for free, refuses the third and only while the group is live', async () => {
    const { token, group } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    expect(group.capacity).toBe(3);
    await joinGroup(deps(), 'f1', { token });
    await joinGroup(deps(), 'f2', { token });
    await expect(joinGroup(deps(), 'f3', { token })).rejects.toMatchObject({ reason: 'full' });

    const req = { poiIds: [stops[1]!.id] };
    expect(await hasGroupAccess(deps(), 'f1', group.id, req)).toBe(true);
    expect(await hasGroupAccess(deps(), 'f3', group.id, req)).toBe(false);
    expect(await hasGroupAccess(deps(), 'f1', group.id, { ...req, download: true })).toBe(false);
    expect(await hasGroupAccess(deps(), 'f1', group.id, { poiIds: ['not_in_tour'] })).toBe(false);

    await leaveGroup(deps(), 'host', { groupId: group.id });
    expect(await hasGroupAccess(deps(), 'f1', group.id, req)).toBe(false);
  });

  it('rejects forged links and hosts without access to the tour', async () => {
    const { token } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    const [id] = token.split('.');
    await expect(joinGroup(deps(), 'f1', { token: `${id}.${'x'.repeat(43)}` })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(joinGroup(deps(), 'f1', { token: 'garbage' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(
      createGroup(deps(), 'stranger', { tourId: 'tour_g1', mode: 'tour', audio }),
    ).rejects.toThrow();
  });

  it('ends after the TTL and adds bought seats (host only, one credit each)', async () => {
    const { token, group } = await createGroup(deps(), 'host', { tourId: 'tour_g1', mode: 'tour', audio });
    await expect(addGroupSeat(deps(), 'host', { groupId: group.id })).rejects.toMatchObject({
      reason: 'no_seat_credit',
    });
    await processRevenueCatEvent(deps(), {
      event: {
        id: 'buy-seat',
        type: 'NON_RENEWING_PURCHASE',
        app_user_id: 'host',
        product_id: 'tuur_group_seat',
        transaction_id: 'seat-transaction',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
      },
    });
    await expect(addGroupSeat(deps(), 'f1', { groupId: group.id })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(await addGroupSeat(deps(), 'host', { groupId: group.id })).toEqual({
      capacity: 4,
      seatBalance: 0,
    });
    expect(
      (
        await db
          .collection('revenuecatPurchases')
          .doc(purchaseKey('APP_STORE', 'PRODUCTION', 'seat-transaction'))
          .get()
      ).get('remaining'),
    ).toBe(0);
    for (const f of ['f1', 'f2', 'f3']) await joinGroup(deps(), f, { token });
    clock += 13 * 3600_000;
    await expect(joinGroup(deps(), 'f4', { token })).rejects.toMatchObject({ reason: 'ended' });
  });
});
