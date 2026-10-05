import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCTS, planRevenueCatEvent } from './entitlements';
import {
  GROUP_BASE_SIZE,
  GROUP_SEAT_PRODUCT,
  GROUP_MAX_SIZE,
  decideGroupAccess,
  decideJoin,
  groupCapacity,
  parseGroupInvite,
  type Group,
} from './groups';

const now = 1_800_000_000_000;
const group = (over: Partial<Group> = {}): Group => ({
  id: 'g1',
  hostUid: 'host',
  tour: {
    id: 't1',
    placeId: 'p',
    source: 'planned',
    version: 1,
    template: 'planned',
    profile: 'foot-walking',
    themes: [],
    stops: [
      {
        poiId: 'a',
        order: 0,
        name: 'A',
        location: { lat: 1, lng: 1 },
        dwellMinutes: 5,
        walkMinutesFromPrev: 0,
        partner: false,
      },
      {
        poiId: 'b',
        order: 1,
        name: 'B',
        location: { lat: 1, lng: 2 },
        dwellMinutes: 5,
        walkMinutesFromPrev: 5,
        partner: false,
      },
    ],
    path: '',
    durationMinutes: 60,
    walkMinutes: 30,
    distanceMeters: 2000,
    bbox: { south: 1, north: 1, west: 1, east: 2 },
    routingSource: 'mock',
    fingerprint: '',
    free: false,
    locked: false,
    pinned: false,
    hasPartner: false,
    texts: {},
    createdAt: now,
    updatedAt: now,
  },
  mode: 'planned',
  members: ['host'],
  hostSubscriber: false,
  extraSeats: 0,
  inviteHash: 'h',
  status: 'live',
  createdAt: now,
  expiresAt: now + 3600_000,
  ...over,
});

describe('group capacity', () => {
  it('is 3 people, 5 with a premium host, plus bought seats, capped', () => {
    expect(groupCapacity({ hostSubscriber: false, extraSeats: 0 })).toBe(GROUP_BASE_SIZE);
    expect(groupCapacity({ hostSubscriber: true, extraSeats: 0 })).toBe(5);
    expect(groupCapacity({ hostSubscriber: false, extraSeats: 1 })).toBe(4);
    expect(groupCapacity({ hostSubscriber: true, extraSeats: 50 })).toBe(GROUP_MAX_SIZE);
  });
});

describe('decideJoin', () => {
  it('lets two friends in and refuses the third without extra seats', () => {
    expect(decideJoin(group(), 'f1', now)).toEqual({ ok: true, alreadyMember: false });
    expect(decideJoin(group({ members: ['host', 'f1', 'f2'] }), 'f3', now)).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(decideJoin(group({ members: ['host', 'f1', 'f2'], extraSeats: 1 }), 'f3', now).ok).toBe(true);
  });

  it('is idempotent for members and refuses ended, expired and own groups', () => {
    expect(decideJoin(group({ members: ['host', 'f1'] }), 'f1', now)).toEqual({
      ok: true,
      alreadyMember: true,
    });
    expect(decideJoin(group({ status: 'ended' }), 'f1', now)).toEqual({ ok: false, reason: 'ended' });
    expect(decideJoin(group({ expiresAt: now - 1 }), 'f1', now)).toEqual({ ok: false, reason: 'ended' });
    expect(decideJoin(group(), 'host', now)).toEqual({ ok: false, reason: 'own_group' });
  });
});

describe('decideGroupAccess', () => {
  const g = group({ members: ['host', 'f1'] });
  it('serves members the stops of the group tour while the group is live', () => {
    expect(decideGroupAccess(g, 'f1', { poiIds: ['a'] }, now)).toBe(true);
    expect(decideGroupAccess(g, 'f1', { poiIds: ['a', 'b'] }, now)).toBe(true);
  });
  it('denies outsiders, other stops, downloads and ended groups', () => {
    expect(decideGroupAccess(g, 'stranger', { poiIds: ['a'] }, now)).toBe(false);
    expect(decideGroupAccess(g, 'f1', { poiIds: ['a', 'zzz'] }, now)).toBe(false);
    expect(decideGroupAccess(g, 'f1', { poiIds: [] }, now)).toBe(false);
    expect(decideGroupAccess(g, 'f1', { poiIds: ['a'], download: true }, now)).toBe(false);
    expect(decideGroupAccess({ ...g, status: 'ended' }, 'f1', { poiIds: ['a'] }, now)).toBe(false);
  });
});

describe('parseGroupInvite', () => {
  it('accepts only well-formed tokens', () => {
    const secret = 'a'.repeat(43);
    expect(parseGroupInvite(`abcdefghij1234.${secret}`)).toEqual({ groupId: 'abcdefghij1234', secret });
    expect(parseGroupInvite('abc.def')).toBeUndefined();
    expect(parseGroupInvite(`../etc.${secret}`)).toBeUndefined();
  });
});

describe('seat purchases', () => {
  it('map the seat product to seat credits and refunds back', () => {
    const ev = {
      id: 'e1',
      type: 'NON_RENEWING_PURCHASE',
      product_id: GROUP_SEAT_PRODUCT,
      transaction_id: 'tx9',
      app_user_id: 'u',
    };
    expect(planRevenueCatEvent(ev as never, DEFAULT_PRODUCTS, now)).toEqual([
      { op: 'addSeats', amount: 1, ref: 'tx9' },
    ]);
    expect(
      planRevenueCatEvent(
        { ...ev, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' } as never,
        DEFAULT_PRODUCTS,
        now,
      ),
    ).toEqual([{ op: 'removeSeats', amount: 1, ref: 'tx9' }]);
  });
});
