import { z } from 'zod';
import { PARTNER_CATEGORIES } from './schemas';

/**
 * Performance pricing for partners (owner decision 2026-09-30, see docs/PARTNER_PRICING.md): no base fee, the partner
 * pays only for traction tuur generated - a verified visit (a listener guided there actually arrived, counted once
 * per person and day) or a redeemed offer (QR scanned) - up to a monthly budget cap the partner chooses. Amounts are
 * in minor units (cents) of the partner's currency; Firestore `config/partners.traction` overrides the defaults.
 */
export const TractionPricingSchema = z.object({
  perVisitMinor: z.number().int().nonnegative(),
  perRedemptionMinor: z.number().int().nonnegative(),
  /** Category multipliers (e.g. restaurants convert better than shops). */
  categoryFactor: z.record(z.number().positive()).default({}),
  /** Smallest monthly budget a partner can set. */
  minMonthlyCapMinor: z.number().int().nonnegative(),
  /** First visits of a new partner are free (trial), so they can see traction before paying. */
  freeVisits: z.number().int().nonnegative(),
});
export type TractionPricing = z.infer<typeof TractionPricingSchema>;

export const DEFAULT_TRACTION_PRICING: TractionPricing = {
  perVisitMinor: 40,
  perRedemptionMinor: 80,
  categoryFactor: { restaurant: 1.25, cafe: 1, shop: 0.75, museum: 1, hotel: 1.5, activity: 1, other: 1 },
  minMonthlyCapMinor: 2500,
  freeVisits: 25,
};

export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export interface TractionPeriod {
  category: PartnerCategory;
  verifiedVisits: number;
  redemptions: number;
  monthlyCapMinor: number;
  /** Free visits of the trial still left at the start of the period. */
  freeVisitsLeft: number;
}

export interface TractionInvoice {
  billableVisits: number;
  visitsMinor: number;
  redemptionsMinor: number;
  /** Amount charged after the cap. */
  totalMinor: number;
  capped: boolean;
  freeVisitsUsed: number;
}

/** Unit prices for a category (rounded to whole minor units). */
export function unitPrices(p: TractionPricing, category: PartnerCategory) {
  const f = p.categoryFactor[category] ?? 1;
  return {
    visitMinor: Math.round(p.perVisitMinor * f),
    redemptionMinor: Math.round(p.perRedemptionMinor * f),
  };
}

/** Monthly charge: free trial visits first, then visits and redemptions at category prices, never above the cap. */
export function tractionInvoice(p: TractionPricing, period: TractionPeriod): TractionInvoice {
  const { visitMinor, redemptionMinor } = unitPrices(p, period.category);
  const freeVisitsUsed = Math.min(period.freeVisitsLeft, period.verifiedVisits);
  const billableVisits = period.verifiedVisits - freeVisitsUsed;
  const visitsMinor = billableVisits * visitMinor;
  const redemptionsMinor = period.redemptions * redemptionMinor;
  const cap = Math.max(period.monthlyCapMinor, p.minMonthlyCapMinor);
  const raw = visitsMinor + redemptionsMinor;
  return {
    billableVisits,
    visitsMinor,
    redemptionsMinor,
    totalMinor: Math.min(raw, cap),
    capped: raw > cap,
    freeVisitsUsed,
  };
}

/** Once the month's traction reached the cap, the partner boost pauses until the next period (organic listing stays). */
export function budgetExhausted(p: TractionPricing, period: TractionPeriod): boolean {
  return tractionInvoice(p, period).totalMinor >= Math.max(period.monthlyCapMinor, p.minMonthlyCapMinor);
}

/** Partner application sent from the app's business onboarding (reviewed by an admin, then continued in the portal). */
export const PartnerApplicationSchema = z.object({
  placeName: z.string().trim().min(2).max(80),
  category: z.enum(PARTNER_CATEGORIES),
  address: z.string().trim().min(5).max(200),
  contactEmail: z.string().trim().email().max(200),
  website: z.string().trim().url().max(200).optional(),
  pitch: z.string().trim().min(10).max(600),
  /** Explicit consent: partner terms, "Partner/advertising" labelling, pay-per-traction pricing. */
  acceptedTerms: z.literal(true),
});
export type PartnerApplication = z.infer<typeof PartnerApplicationSchema>;
