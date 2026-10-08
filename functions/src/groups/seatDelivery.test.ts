import { describe, expect, it } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { addGroupSeat } from './service';

function fixture() {
  const { db, docs } = memoryFirestore();
  const now = 1_800_000_000_000;
  const groupId = 'group000001';
  const groupPath = `groups/${groupId}`;
  const walletPath = 'users/host/credits/wallet';
  const lotPath = 'revenuecatPurchases/seat-purchase';
  docs.set(groupPath, {
    id: groupId,
    hostUid: 'host',
    mode: 'tour',
    members: ['host', 'friend1', 'friend2'],
    hostSubscriber: false,
    extraSeats: 0,
    inviteHash: 'test',
    status: 'live',
    createdAt: now,
    expiresAt: now + 12 * 3600_000,
    tour: {
      id: 'tour',
      placeId: 'berlin',
      source: 'auto',
      version: 1,
      template: 'highlights',
      profile: 'foot-walking',
      themes: [],
      path: '',
      durationMinutes: 30,
      walkMinutes: 10,
      distanceMeters: 500,
      bbox: { south: 52, north: 53, west: 13, east: 14 },
      stops: [
        {
          poiId: 'poi',
          order: 0,
          name: 'Place',
          location: { lat: 52.5, lng: 13.4 },
          dwellMinutes: 5,
          walkMinutesFromPrev: 0,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  });
  docs.set(walletPath, { balance: 1, seatBalance: 2 });
  docs.set(lotPath, {
    version: 1,
    ownerUid: 'host',
    productId: 'tuur_group_seat',
    kind: 'seat',
    quantity: 2,
    remaining: 2,
    refunded: false,
    store: 'APP_STORE',
    environment: 'SANDBOX',
    transactionId: 'seat-purchase',
    createdAt: now,
    updatedAt: now,
  });
  return { deps: { db, now: () => now }, docs, groupId, groupPath, walletPath, lotPath };
}

describe('idempotent group seat delivery', () => {
  it('spends only one credit and one purchase unit for concurrent retries of a persisted request', async () => {
    const t = fixture();
    const request = { groupId: t.groupId, requestId: 'checkout-request-one' };
    const results = await Promise.all(Array.from({ length: 3 }, () => addGroupSeat(t.deps, 'host', request)));
    expect(results).toEqual(Array(3).fill({ capacity: 4, seatBalance: 1 }));
    expect(t.docs.get(t.walletPath)).toMatchObject({ balance: 1, seatBalance: 1 });
    expect(t.docs.get(t.lotPath)?.remaining).toBe(1);
    expect(t.docs.get(t.groupPath)).toMatchObject({ extraSeats: 1, seatRequestIds: [request.requestId] });
  });

  it('acknowledges a previously completed request even after the group ends', async () => {
    const t = fixture();
    const request = { groupId: t.groupId, requestId: 'checkout-request-one' };
    await addGroupSeat(t.deps, 'host', request);
    t.docs.get(t.groupPath)!.status = 'ended';
    expect(await addGroupSeat(t.deps, 'host', request)).toEqual({ capacity: 4, seatBalance: 1 });
    await expect(
      addGroupSeat(t.deps, 'host', { ...request, requestId: 'another-request' }),
    ).rejects.toMatchObject({ reason: 'ended' });
    expect(t.docs.get(t.lotPath)?.remaining).toBe(1);
  });

  it('does not consume or mark a request while its webhook credit is missing', async () => {
    const t = fixture();
    t.docs.get(t.walletPath)!.seatBalance = 0;
    t.docs.delete(t.lotPath);
    const request = { groupId: t.groupId, requestId: 'checkout-request-one' };
    await expect(addGroupSeat(t.deps, 'host', request)).rejects.toMatchObject({ reason: 'no_seat_credit' });
    expect(t.docs.get(t.groupPath)?.seatRequestIds).toBeUndefined();
    t.docs.get(t.walletPath)!.seatBalance = 1;
    expect(await addGroupSeat(t.deps, 'host', request)).toEqual({ capacity: 4, seatBalance: 0 });
  });

  it('never acknowledges or spends another host’s request for a different user', async () => {
    const t = fixture();
    const request = { groupId: t.groupId, requestId: 'checkout-request-one' };
    await addGroupSeat(t.deps, 'host', request);
    await expect(addGroupSeat(t.deps, 'guest', request)).rejects.toMatchObject({ code: 'not-found' });
    expect(t.docs.get(t.walletPath)?.seatBalance).toBe(1);
  });

  it('keeps old clients compatible and treats different requests as separate authorized places', async () => {
    const t = fixture();
    expect(await addGroupSeat(t.deps, 'host', { groupId: t.groupId })).toEqual({
      capacity: 4,
      seatBalance: 1,
    });
    expect(
      await addGroupSeat(t.deps, 'host', { groupId: t.groupId, requestId: 'new-client-request' }),
    ).toEqual({ capacity: 5, seatBalance: 0 });
    expect(t.docs.get(t.lotPath)?.remaining).toBe(0);
  });
});
