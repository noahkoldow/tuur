import { describe, expect, it } from 'vitest';
import { memoryFirestore } from '../../test/memoryFirestore';
import { authorizeContent, claimTourStart, spendCredit } from './entitlements';
import { prepareTourDownload } from './downloads';
import { purchaseKey } from './purchaseLedger';

function fixture() {
  const { db, docs } = memoryFirestore();
  const now = 1_800_000_000_000;
  const walletPath = 'users/u/credits/wallet';
  const entitlementPath = 'users/u/entitlements/tour_t';
  const lotPath = `revenuecatPurchases/${purchaseKey('APP_STORE', 'PRODUCTION', 'tx')}`;
  docs.set('tours/t', {
    id: 't',
    source: 'auto',
    template: 'highlights',
    placeId: 'berlin',
    free: false,
    locked: false,
    durationMinutes: 30,
    stops: [{ poiId: 'p1' }],
  });
  docs.set(walletPath, { balance: 2, rewardBalance: 3, seatBalance: 4 });
  docs.set(lotPath, {
    version: 1,
    ownerUid: 'u',
    productId: 'tuur_credit_5',
    kind: 'credit',
    quantity: 5,
    remaining: 2,
    refunded: false,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    transactionId: 'tx',
    createdAt: now - 1000,
    updatedAt: now,
  });
  return { db, docs, now, walletPath, entitlementPath, lotPath, deps: { db, now: () => now } };
}

describe('explicit paid tour purchase for downloading', () => {
  it.each(['reward', 'invite', 'free'])(
    'upgrades a %s grant with one paid credit, preserves rewards and prevents replay charging',
    async (source) => {
      const { docs, deps, now, walletPath, entitlementPath, lotPath } = fixture();
      const previousGrantPath = source === 'free' ? 'users/u/entitlements/free_berlin' : entitlementPath;
      docs.set(previousGrantPath, {
        type: 'tour',
        tourId: 't',
        source,
        placeId: 'berlin',
        grantedAt: now - 1000,
        expiresAt: null,
      });
      if (source === 'free') docs.get('tours/t')!['free'] = true;
      await expect(
        prepareTourDownload(deps, 'u', { tourId: 't', mode: 'tour', scriptInstanceId: 'download-script' }),
      ).rejects.toMatchObject({
        details: { reason: 'download_requires_purchase' },
      });
      const request = { kind: 'tour', tourId: 't', paidOnly: true };
      expect(await spendCredit(deps, 'u', request)).toMatchObject({
        used: 'paid',
        wallet: { balance: 1, rewardBalance: 3, seatBalance: 4 },
      });
      expect(docs.get(entitlementPath)).toMatchObject({
        type: 'tour',
        tourId: 't',
        source: 'credit',
        expiresAt: null,
      });
      if (source === 'free') expect(docs.get(previousGrantPath)?.source).toBe('free');
      expect(docs.get(lotPath)?.remaining).toBe(1);
      await expect(
        prepareTourDownload(deps, 'u', { tourId: 't', mode: 'tour', scriptInstanceId: 'download-script' }),
      ).resolves.toMatchObject({
        expiresAt: null,
      });
      await expect(
        claimTourStart(deps, 'u', {
          tourId: 't',
          mode: 'tour',
          sessionId: '00000000-0000-4000-8000-000000000001',
        }),
      ).resolves.toEqual({ counted: false, remaining: 60 });
      await expect(
        authorizeContent(deps, 'u', {
          tourId: 't',
          mode: 'tour',
          poiIds: ['p1'],
          sessionId: '00000000-0000-4000-8000-000000000001',
        }),
      ).resolves.toMatchObject({ reason: 'tour' });
      const beforeReplay = structuredClone([...docs]);
      await expect(spendCredit(deps, 'u', request)).rejects.toMatchObject({
        details: { reason: 'already_unlocked' },
      });
      expect([...docs]).toEqual(beforeReplay);
      expect(docs.get(walletPath)?.balance).toBe(1);
    },
  );

  it('serializes simultaneous paid upgrades so exactly one credit is consumed', async () => {
    const { docs, deps, walletPath, lotPath } = fixture();
    const results = await Promise.allSettled(
      [1, 2].map(() => spendCredit(deps, 'u', { kind: 'tour', tourId: 't', paidOnly: true })),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(docs.get(walletPath)?.balance).toBe(1);
    expect(docs.get(walletPath)?.rewardBalance).toBe(3);
    expect(docs.get(lotPath)?.remaining).toBe(1);
  });

  it('never consumes reward credits or changes access if paid balance is insufficient', async () => {
    const { docs, deps, now, walletPath, entitlementPath } = fixture();
    docs.set(walletPath, { balance: 0, rewardBalance: 3 });
    docs.set(entitlementPath, {
      type: 'tour',
      tourId: 't',
      source: 'reward',
      grantedAt: now,
      expiresAt: null,
    });
    const before = structuredClone([...docs]);
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't', paidOnly: true })).rejects.toMatchObject(
      { details: { reason: 'insufficient' } },
    );
    expect([...docs]).toEqual(before);
  });

  it('does not charge an active subscriber for a paid-only request', async () => {
    const { docs, deps, now } = fixture();
    docs.set('users/u/entitlements/subscription', {
      type: 'subscription',
      active: true,
      productId: 'tuur_sub_monthly',
      expiresAt: now + 1000,
      updatedAt: now,
    });
    const before = structuredClone([...docs]);
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't', paidOnly: true })).rejects.toMatchObject(
      { details: { reason: 'subscriber' } },
    );
    expect([...docs]).toEqual(before);
  });

  it('uses paid audio credits by default and preserves old rewarded balances', async () => {
    const { docs, deps, lotPath } = fixture();
    expect(await spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).toMatchObject({
      used: 'paid',
      wallet: { balance: 1, rewardBalance: 3 },
    });
    expect(docs.get(lotPath)?.remaining).toBe(1);
    docs.get('tours/t')!['free'] = true;
    await expect(spendCredit(deps, 'u', { kind: 'tour', tourId: 't' })).rejects.toMatchObject({
      details: { reason: 'already_unlocked' },
    });
  });

  it('does not allow paidOnly to alter the place-session purchase API', async () => {
    const { docs, deps } = fixture();
    const before = structuredClone([...docs]);
    await expect(
      spendCredit(deps, 'u', { kind: 'session', placeId: 'berlin', paidOnly: true }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect([...docs]).toEqual(before);
  });
});
