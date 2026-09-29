import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARTNER_CONFIG,
  decideCreateToken,
  decideRedeemToken,
  partnerBoostPoints,
  scoreWithPartner,
  type Partner,
} from '..';

const now = 1_800_000_000_000;
const live = {
  status: 'approved',
  plan: { tier: 'offers', active: true, currentPeriodEnd: now + 1e9 },
} as Pick<Partner, 'status' | 'plan'>;
const offer = { active: true, validFrom: now - 1000, validUntil: now + 1e7 };
const here = { lat: 52.52, lng: 13.405 };
const base = {
  partner: live,
  offer,
  now,
  userPosition: here,
  partnerLocation: here,
  redeemedToday: 0,
  userRedeemedToday: false,
};

describe('partner boost', () => {
  it('only applies for approved partners with an active, unexpired plan', () => {
    expect(partnerBoostPoints(live, now)).toBe(12);
    expect(partnerBoostPoints({ ...live, status: 'pending' }, now)).toBe(0);
    expect(partnerBoostPoints({ ...live, status: 'suspended' }, now)).toBe(0);
    expect(partnerBoostPoints({ ...live, plan: { ...live.plan, active: false } }, now)).toBe(0);
    expect(partnerBoostPoints({ ...live, plan: { ...live.plan, currentPeriodEnd: now - 1 } }, now)).toBe(0);
    expect(partnerBoostPoints({ ...live, plan: { ...live.plan, tier: 'none' } }, now)).toBe(0);
  });

  it('is hard-capped even if the configured boost is larger', () => {
    const cfg = { ...DEFAULT_PARTNER_CONFIG, boost: { visibility: 40, offers: 90 }, boostCap: 15 };
    expect(partnerBoostPoints(live, now, cfg)).toBe(15);
    expect(scoreWithPartner(50, 1, 90, cfg)).toBe(65);
    expect(scoreWithPartner(95, 1, 15, cfg)).toBe(100);
  });
});

describe('redemption token creation', () => {
  it('allows a nearby listener for a valid offer', () => {
    expect(decideCreateToken(base)).toEqual({ ok: true });
  });
  it('checks proximity', () => {
    const far = { lat: 52.52, lng: 13.41 };
    expect(decideCreateToken({ ...base, userPosition: far })).toEqual({ ok: false, reason: 'too_far' });
  });
  it('rejects inactive partners, offers outside their window and exhausted limits', () => {
    expect(decideCreateToken({ ...base, partner: { ...live, status: 'suspended' } })).toMatchObject({
      reason: 'partner_inactive',
    });
    expect(
      decideCreateToken({ ...base, partner: { ...live, plan: { ...live.plan, tier: 'visibility' } } }),
    ).toMatchObject({ reason: 'partner_inactive' });
    expect(decideCreateToken({ ...base, offer: { ...offer, active: false } })).toMatchObject({
      reason: 'offer_inactive',
    });
    expect(decideCreateToken({ ...base, offer: { ...offer, validFrom: now + 5 } })).toMatchObject({
      reason: 'offer_not_started',
    });
    expect(decideCreateToken({ ...base, offer: { ...offer, validUntil: now } })).toMatchObject({
      reason: 'offer_expired',
    });
    expect(
      decideCreateToken({ ...base, offer: { ...offer, dailyLimit: 3 }, redeemedToday: 3 }),
    ).toMatchObject({
      reason: 'daily_limit',
    });
    expect(decideCreateToken({ ...base, userRedeemedToday: true })).toMatchObject({
      reason: 'already_redeemed_today',
    });
  });
});

describe('redeeming a scanned token', () => {
  const token = { partnerId: 'p1', expiresAt: now + 60_000, used: false };
  const input = { token, scannerPartnerId: 'p1', partner: live, offer, now, redeemedToday: 0 };
  it('accepts a fresh token at the right partner', () => {
    expect(decideRedeemToken(input)).toEqual({ ok: true });
  });
  it('rejects other partners, expired and used tokens', () => {
    expect(decideRedeemToken({ ...input, scannerPartnerId: 'p2' })).toMatchObject({
      reason: 'wrong_partner',
    });
    expect(decideRedeemToken({ ...input, token: { ...token, expiresAt: now } })).toMatchObject({
      reason: 'expired',
    });
    expect(decideRedeemToken({ ...input, token: { ...token, used: true } })).toMatchObject({
      reason: 'already_used',
    });
  });
  it('re-checks the offer and its daily limit at scan time', () => {
    expect(decideRedeemToken({ ...input, offer: { ...offer, validUntil: now } })).toMatchObject({
      reason: 'offer_expired',
    });
    expect(
      decideRedeemToken({ ...input, offer: { ...offer, dailyLimit: 1 }, redeemedToday: 1 }),
    ).toMatchObject({
      reason: 'daily_limit',
    });
    expect(decideRedeemToken({ ...input, partner: { ...live, status: 'suspended' } })).toMatchObject({
      reason: 'partner_inactive',
    });
  });
});

import { DEFAULT_PARTNER_PRICING, StripeSubscriptionSchema, planFromStripeSubscription, priceFor } from '..';

describe('stripe mapping', () => {
  const sub = StripeSubscriptionSchema.parse({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    current_period_end: 1_900_000_000,
    metadata: { tier: 'offers', partnerId: 'p1' },
    currency: 'eur',
  });
  it('maps active subscriptions and reads the tier from metadata', () => {
    expect(planFromStripeSubscription(sub)).toMatchObject({
      tier: 'offers',
      active: true,
      currentPeriodEnd: 1_900_000_000_000,
      currency: 'EUR',
    });
  });
  it('treats past_due, canceled and deleted subscriptions as inactive', () => {
    expect(planFromStripeSubscription({ ...sub, status: 'past_due' }).active).toBe(false);
    expect(planFromStripeSubscription({ ...sub, status: 'canceled' }).active).toBe(false);
    expect(planFromStripeSubscription(sub, true).active).toBe(false);
  });
  it('picks currency by country with fallback', () => {
    const pricing = {
      ...DEFAULT_PARTNER_PRICING,
      prices: { visibility: { EUR: 'price_eur', CHF: 'price_chf' }, offers: { EUR: 'price_o' } },
    };
    expect(priceFor(pricing, 'visibility', 'CH')).toEqual({ priceId: 'price_chf', currency: 'CHF' });
    expect(priceFor(pricing, 'visibility', 'DE')).toEqual({ priceId: 'price_eur', currency: 'EUR' });
    expect(priceFor(pricing, 'offers', 'CH')).toEqual({ priceId: 'price_o', currency: 'EUR' });
    expect(priceFor(DEFAULT_PARTNER_PRICING, 'offers', 'DE')).toBeUndefined();
  });
});
