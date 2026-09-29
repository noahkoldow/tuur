import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCTS,
  MAX_INVITES_PER_TOUR,
  decideAccess,
  decideInvite,
  decideRedeem,
  decideSpend,
  isSubscriber,
  planRevenueCatEvent,
  type Entitlement,
  type InviteDoc,
  type RevenueCatEvent,
} from './entitlements';
import { decideInterstitial, decideReward, type InterstitialState } from './ads';

const NOW = 1_700_000_000_000;
const sub = (over: Partial<Extract<Entitlement, { type: 'subscription' }>> = {}): Entitlement => ({
  type: 'subscription',
  active: true,
  productId: 'tuur_sub_monthly',
  expiresAt: NOW + 1000,
  willRenew: true,
  updatedAt: NOW,
  ...over,
});
const tourEnt = (
  tourId: string,
  source: 'credit' | 'reward' | 'invite' | 'free' = 'credit',
  expiresAt: number | null = null,
): Entitlement => ({ type: 'tour', tourId, source, grantedAt: NOW, expiresAt });
const session = (placeId: string, expiresAt: number): Entitlement => ({
  type: 'session',
  placeId,
  expiresAt,
  source: 'credit',
  grantedAt: NOW,
});

describe('decideAccess', () => {
  it('subscribers get everything until expiry', () => {
    expect(decideAccess([sub()], { tourId: 't' }, NOW)).toEqual({ allowed: true, reason: 'subscription' });
    expect(decideAccess([sub({ expiresAt: NOW - 1 })], { tourId: 't' }, NOW).allowed).toBe(false);
    expect(decideAccess([sub({ active: false })], { tourId: 't' }, NOW).allowed).toBe(false);
    expect(isSubscriber([sub({ expiresAt: null })], NOW)).toBe(true);
  });

  it('the free tour is open for everyone; other tours need an entitlement', () => {
    expect(decideAccess([], { tourId: 't', tourFree: true }, NOW)).toEqual({ allowed: true, reason: 'free' });
    expect(decideAccess([], { tourId: 't' }, NOW).allowed).toBe(false);
    expect(decideAccess([tourEnt('t')], { tourId: 't' }, NOW)).toEqual({ allowed: true, reason: 'tour' });
    expect(decideAccess([tourEnt('other')], { tourId: 't' }, NOW).allowed).toBe(false);
    expect(decideAccess([tourEnt('t', 'credit', NOW - 1)], { tourId: 't' }, NOW).allowed).toBe(false);
  });

  it('dynamic modes need a valid 24 h session for that place', () => {
    for (const mode of ['planned', 'fork', 'roam'] as const) {
      expect(decideAccess([session('p', NOW + 1)], { mode, placeId: 'p' }, NOW)).toEqual({
        allowed: true,
        reason: 'session',
      });
      expect(decideAccess([session('p', NOW + 1)], { mode, placeId: 'q' }, NOW).allowed).toBe(false);
      expect(decideAccess([session('p', NOW - 1)], { mode, placeId: 'p' }, NOW).allowed).toBe(false);
      expect(decideAccess([tourEnt('t')], { mode, placeId: 'p' }, NOW).allowed).toBe(false);
    }
  });

  it('requests without context are denied (no free riding through direct calls)', () => {
    expect(decideAccess([], {}, NOW)).toEqual({ allowed: false, reason: 'no_context' });
  });
});

describe('credits', () => {
  it('spends reward credits first for tours, paid credits otherwise, never below zero', () => {
    expect(decideSpend({ balance: 1, rewardBalance: 1 }, 'tour', false, false)).toEqual({
      ok: true,
      use: 'reward',
      wallet: { balance: 1, rewardBalance: 0 },
    });
    expect(decideSpend({ balance: 1, rewardBalance: 1 }, 'session', false, false)).toEqual({
      ok: true,
      use: 'paid',
      wallet: { balance: 0, rewardBalance: 1 },
    });
    expect(decideSpend({ balance: 0, rewardBalance: 1 }, 'session', false, false)).toEqual({
      ok: false,
      reason: 'insufficient',
    });
    expect(decideSpend({ balance: 0, rewardBalance: 0 }, 'tour', false, false)).toEqual({
      ok: false,
      reason: 'insufficient',
    });
  });
  it('does not charge subscribers or already unlocked content', () => {
    expect(decideSpend({ balance: 5, rewardBalance: 0 }, 'tour', false, true)).toEqual({
      ok: false,
      reason: 'subscriber',
    });
    expect(decideSpend({ balance: 5, rewardBalance: 0 }, 'tour', true, false)).toEqual({
      ok: false,
      reason: 'already_unlocked',
    });
  });
});

describe('invites', () => {
  it('only bought tours can be shared, at most twice', () => {
    expect(decideInvite([tourEnt('t', 'credit')], 't', 0)).toEqual({ ok: true, remaining: 1 });
    expect(decideInvite([tourEnt('t', 'credit')], 't', 1)).toEqual({ ok: true, remaining: 0 });
    expect(decideInvite([tourEnt('t', 'credit')], 't', MAX_INVITES_PER_TOUR)).toEqual({
      ok: false,
      reason: 'limit_reached',
    });
    for (const source of ['reward', 'invite', 'free'] as const)
      expect(decideInvite([tourEnt('t', source)], 't', 0)).toEqual({ ok: false, reason: 'not_purchased' });
    expect(decideInvite([tourEnt('other', 'credit')], 't', 0)).toEqual({
      ok: false,
      reason: 'not_purchased',
    });
  });

  it('a token can be redeemed once, before expiry, by someone else who does not own the tour yet', () => {
    const inv: InviteDoc = { tourId: 't', ownerUid: 'alice', createdAt: NOW, expiresAt: NOW + 1000 };
    expect(decideRedeem(inv, 'bob', false, NOW)).toEqual({ ok: true });
    expect(decideRedeem(undefined, 'bob', false, NOW)).toEqual({ ok: false, reason: 'not_found' });
    expect(decideRedeem({ ...inv, redeemedBy: 'carol' }, 'bob', false, NOW)).toEqual({
      ok: false,
      reason: 'already_redeemed',
    });
    expect(decideRedeem(inv, 'bob', false, NOW + 1000)).toEqual({ ok: false, reason: 'expired' });
    expect(decideRedeem(inv, 'alice', false, NOW)).toEqual({ ok: false, reason: 'own_invite' });
    expect(decideRedeem(inv, 'bob', true, NOW)).toEqual({ ok: false, reason: 'already_unlocked' });
  });
});

describe('RevenueCat events', () => {
  const ev = (over: Partial<RevenueCatEvent>): RevenueCatEvent => ({
    id: 'e1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u',
    product_id: 'tuur_sub_monthly',
    expiration_at_ms: NOW + 30 * 86400_000,
    ...over,
  });

  it('activates a subscription on purchase and renewal, keeps access after cancellation until expiry, ends on expiration', () => {
    const active = planRevenueCatEvent(ev({}), DEFAULT_PRODUCTS, NOW);
    expect(active[0]).toMatchObject({
      op: 'setSubscription',
      entitlement: { active: true, willRenew: true },
    });
    const renewal = planRevenueCatEvent(ev({ type: 'RENEWAL' }), DEFAULT_PRODUCTS, NOW);
    expect(renewal[0]).toMatchObject({ entitlement: { active: true } });
    const cancelled = planRevenueCatEvent(ev({ type: 'CANCELLATION' }), DEFAULT_PRODUCTS, NOW);
    expect(cancelled[0]).toMatchObject({ entitlement: { active: true, willRenew: false } });
    const expired = planRevenueCatEvent(
      ev({ type: 'EXPIRATION', expiration_at_ms: NOW - 1 }),
      DEFAULT_PRODUCTS,
      NOW,
    );
    expect(expired[0]).toMatchObject({ entitlement: { active: false } });
    const stale = planRevenueCatEvent(ev({ expiration_at_ms: NOW - 5 }), DEFAULT_PRODUCTS, NOW);
    expect(stale[0]).toMatchObject({ entitlement: { active: false } });
  });

  it('adds credits for consumable purchases (with the transaction as reference) and removes them on refund', () => {
    const buy = planRevenueCatEvent(
      ev({ type: 'NON_RENEWING_PURCHASE', product_id: 'tuur_credit_5', transaction_id: 'tx9' }),
      DEFAULT_PRODUCTS,
      NOW,
    );
    expect(buy).toEqual([{ op: 'addCredits', amount: 5, ref: 'tx9' }]);
    expect(
      planRevenueCatEvent(
        ev({ type: 'REFUND', product_id: 'tuur_credit_1', transaction_id: 'tx1' }),
        DEFAULT_PRODUCTS,
        NOW,
      ),
    ).toEqual([{ op: 'removeCredits', amount: 1, ref: 'tx1' }]);
  });

  it('follows product changes and ignores unknown products, tests and unknown event types', () => {
    const change = planRevenueCatEvent(
      ev({ type: 'PRODUCT_CHANGE', new_product_id: 'tuur_sub_yearly' }),
      DEFAULT_PRODUCTS,
      NOW,
    );
    expect(change[0]).toMatchObject({ entitlement: { productId: 'tuur_sub_yearly' } });
    expect(planRevenueCatEvent(ev({ product_id: 'mystery' }), DEFAULT_PRODUCTS, NOW)[0]!.op).toBe('ignore');
    expect(planRevenueCatEvent(ev({ type: 'TEST' }), DEFAULT_PRODUCTS, NOW)[0]!.op).toBe('ignore');
    expect(planRevenueCatEvent(ev({ type: 'SOMETHING_NEW' }), DEFAULT_PRODUCTS, NOW)[0]!.op).toBe('ignore');
  });
});

describe('ads policy', () => {
  const base: InterstitialState = {
    now: NOW,
    lastShownAt: undefined,
    shownToday: 0,
    stopsSinceLast: 3,
    subscriber: false,
    consent: 'granted',
    audioPlaying: false,
    betweenWaypoints: true,
  };
  it('shows only between waypoints, without audio, with consent, capped, never for subscribers', () => {
    expect(decideInterstitial(base)).toEqual({ show: true });
    expect(decideInterstitial({ ...base, subscriber: true })).toEqual({ show: false, reason: 'subscriber' });
    expect(decideInterstitial({ ...base, consent: 'unknown' })).toEqual({ show: false, reason: 'consent' });
    expect(decideInterstitial({ ...base, audioPlaying: true })).toEqual({ show: false, reason: 'audio' });
    expect(decideInterstitial({ ...base, betweenWaypoints: false })).toEqual({
      show: false,
      reason: 'not_between',
    });
    expect(decideInterstitial({ ...base, shownToday: 4 })).toEqual({ show: false, reason: 'cap_daily' });
    expect(decideInterstitial({ ...base, lastShownAt: NOW - 60_000 })).toEqual({
      show: false,
      reason: 'cap_gap',
    });
    expect(decideInterstitial({ ...base, stopsSinceLast: 1 })).toEqual({ show: false, reason: 'too_soon' });
    expect(decideInterstitial({ ...base, consent: 'not_required' })).toEqual({ show: true });
  });
  it('limits rewarded-ad tours per day', () => {
    expect(decideReward(0)).toEqual({ ok: true, remaining: 2 });
    expect(decideReward(2)).toEqual({ ok: true, remaining: 0 });
    expect(decideReward(3)).toEqual({ ok: false, reason: 'daily_limit' });
    expect(decideReward(1, 1)).toEqual({ ok: false, reason: 'daily_limit' });
  });
});
