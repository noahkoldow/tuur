import { describe, expect, it } from 'vitest';
import { decideAccess, decideDownloadAccess, decideSpend, type Entitlement } from './entitlements';

const now = 1_800_000_000_000;
const tour = (source: 'credit' | 'reward' | 'invite' | 'free', tourId = 't'): Entitlement => ({
  type: 'tour',
  tourId,
  source,
  grantedAt: now - 1000,
  expiresAt: null,
});
const subscription = (expiresAt = now + 1, active = true): Entitlement => ({
  type: 'subscription',
  active,
  productId: 'tuur_sub_monthly',
  expiresAt,
  willRenew: false,
  updatedAt: now,
});
const session = (placeId = 'berlin', expiresAt = now + 1): Entitlement => ({
  type: 'session',
  placeId,
  source: 'credit',
  expiresAt,
  grantedAt: now - 1000,
});

describe('paid access for new downloads', () => {
  it.each(['tour', 'planned'] as const)('allows active Premium for a fixed %s itinerary', (mode) => {
    expect(decideDownloadAccess([subscription()], { tourId: 't', mode }, now)).toEqual({
      allowed: true,
      reason: 'subscription',
    });
    expect(decideDownloadAccess([subscription(now)], { tourId: 't', mode }, now).allowed).toBe(false);
    expect(decideDownloadAccess([subscription(now + 1, false)], { tourId: 't', mode }, now).allowed).toBe(
      false,
    );
  });

  it('allows only the exact purchased standard tour, including a free tour explicitly bought for download', () => {
    expect(decideDownloadAccess([tour('credit')], { tourId: 't', mode: 'tour' }, now)).toEqual({
      allowed: true,
      reason: 'purchase',
    });
    expect(decideDownloadAccess([tour('credit', 'other')], { tourId: 't', mode: 'tour' }, now).allowed).toBe(
      false,
    );
    expect(decideDownloadAccess([{ ...tour('credit'), expiresAt: now }], { tourId: 't' }, now).allowed).toBe(
      false,
    );
    expect(decideAccess([tour('credit')], { tourId: 't', tourFree: true }, now)).toEqual({
      allowed: true,
      reason: 'tour',
    });
  });

  it.each(['reward', 'invite', 'free'] as const)(
    'does not turn %s access into a purchased download',
    (source) => {
      expect(decideDownloadAccess([tour(source)], { tourId: 't', mode: 'tour' }, now)).toEqual({
        allowed: false,
        reason: 'download_requires_purchase',
      });
    },
  );

  it('allows a fixed planned route only through its paid place session or Premium', () => {
    const ctx = { tourId: 'planned_t', mode: 'planned' as const, placeId: 'berlin' };
    expect(decideDownloadAccess([session()], ctx, now)).toEqual({ allowed: true, reason: 'session' });
    expect(decideDownloadAccess([session('other')], ctx, now).allowed).toBe(false);
    expect(decideDownloadAccess([session('berlin', now)], ctx, now).allowed).toBe(false);
    expect(
      decideDownloadAccess([session()], { tourId: 't', mode: 'tour', placeId: 'berlin' }, now).allowed,
    ).toBe(false);
    expect(decideDownloadAccess([tour('credit', 'planned_t')], ctx, now).allowed).toBe(false);
  });

  it('never allows dynamic sessions or missing itineraries, even for Premium', () => {
    for (const mode of ['roam', 'fork'] as const)
      expect(
        decideDownloadAccess([subscription(), session()], { tourId: 't', mode, placeId: 'berlin' }, now),
      ).toEqual({ allowed: false, reason: 'download_not_supported' });
    expect(decideDownloadAccess([subscription()], {}, now).allowed).toBe(false);
  });

  it('spends only bought credits for an explicit paid-only purchase and keeps ordinary reward-first spending', () => {
    const wallet = { balance: 2, rewardBalance: 3, seatBalance: 1 };
    expect(decideSpend(wallet, 'tour', false, false, true)).toEqual({
      ok: true,
      use: 'paid',
      wallet: { ...wallet, balance: 1 },
    });
    expect(decideSpend(wallet, 'tour', false, false)).toEqual({
      ok: true,
      use: 'reward',
      wallet: { ...wallet, rewardBalance: 2 },
    });
    expect(decideSpend({ ...wallet, balance: 0 }, 'tour', false, false, true)).toEqual({
      ok: false,
      reason: 'insufficient',
    });
    expect(decideSpend(wallet, 'tour', true, false, true)).toEqual({ ok: false, reason: 'already_unlocked' });
    expect(decideSpend(wallet, 'tour', false, true, true)).toEqual({ ok: false, reason: 'subscriber' });
  });
});
