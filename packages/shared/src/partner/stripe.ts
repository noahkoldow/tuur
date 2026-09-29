import { z } from 'zod';
import type { PartnerPlan, PartnerTier } from './schemas';

/** Minimal shape of a Stripe subscription object we depend on (the webhook payload is validated with it). */
export const StripeSubscriptionSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean().default(false),
  current_period_end: z.number().optional(),
  currency: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  items: z
    .object({
      data: z.array(z.object({ current_period_end: z.number().optional() }).passthrough()).default([]),
    })
    .optional(),
});
export type StripeSubscription = z.infer<typeof StripeSubscriptionSchema>;

const ACTIVE = new Set(['active', 'trialing']);

/** Stripe moved `current_period_end` to the subscription items in newer API versions; accept both. */
const periodEnd = (s: StripeSubscription): number | null => {
  const sec = s.current_period_end ?? s.items?.data[0]?.current_period_end;
  return sec ? sec * 1000 : null;
};

/** Maps a Stripe subscription to the partner plan. Only `active` and `trialing` count as paid. */
export function planFromStripeSubscription(s: StripeSubscription, deleted = false): PartnerPlan {
  const tier = (s.metadata['tier'] === 'offers' ? 'offers' : 'visibility') satisfies PartnerTier;
  return {
    tier,
    active: !deleted && ACTIVE.has(s.status),
    currentPeriodEnd: periodEnd(s),
    cancelAtPeriodEnd: s.cancel_at_period_end,
    stripeCustomerId: s.customer,
    stripeSubscriptionId: s.id,
    ...(s.currency ? { currency: s.currency.toUpperCase() } : {}),
  };
}

/** Stripe price ids per tier and currency (configured in the admin area, Firestore `config/partners`). */
export interface PartnerPricing {
  prices: Record<'visibility' | 'offers', Record<string, string>>;
  currencyByCountry: Record<string, string>;
  defaultCurrency: string;
}

export const DEFAULT_PARTNER_PRICING: PartnerPricing = {
  prices: { visibility: {}, offers: {} },
  currencyByCountry: { CH: 'CHF', GB: 'GBP', US: 'USD' },
  defaultCurrency: 'EUR',
};

export function priceFor(
  pricing: PartnerPricing,
  tier: 'visibility' | 'offers',
  countryCode: string,
): { priceId: string; currency: string } | undefined {
  const currency = pricing.currencyByCountry[countryCode.toUpperCase()] ?? pricing.defaultCurrency;
  const priceId = pricing.prices[tier][currency] ?? pricing.prices[tier][pricing.defaultCurrency];
  return priceId
    ? { priceId, currency: pricing.prices[tier][currency] ? currency : pricing.defaultCurrency }
    : undefined;
}
