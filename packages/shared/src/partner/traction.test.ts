import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRACTION_PRICING as P,
  PartnerApplicationSchema,
  budgetExhausted,
  tractionInvoice,
  unitPrices,
} from './traction';

const period = {
  category: 'cafe' as const,
  verifiedVisits: 0,
  redemptions: 0,
  monthlyCapMinor: 10_000,
  freeVisitsLeft: 0,
};

describe('pay-per-traction pricing', () => {
  it('charges nothing without traction and uses the trial visits first', () => {
    expect(tractionInvoice(P, period).totalMinor).toBe(0);
    const trial = tractionInvoice(P, { ...period, verifiedVisits: 30, freeVisitsLeft: 25 });
    expect(trial).toMatchObject({ freeVisitsUsed: 25, billableVisits: 5, totalMinor: 5 * 40 });
  });

  it('prices visits and redemptions by category', () => {
    expect(unitPrices(P, 'restaurant')).toEqual({ visitMinor: 50, redemptionMinor: 100 });
    const inv = tractionInvoice(P, { ...period, category: 'restaurant', verifiedVisits: 10, redemptions: 3 });
    expect(inv).toMatchObject({ visitsMinor: 500, redemptionsMinor: 300, totalMinor: 800, capped: false });
  });

  it('never charges above the monthly cap (at least the minimum cap) and then pauses the boost', () => {
    const inv = tractionInvoice(P, { ...period, verifiedVisits: 1000, monthlyCapMinor: 5000 });
    expect(inv).toMatchObject({ totalMinor: 5000, capped: true });
    expect(budgetExhausted(P, { ...period, verifiedVisits: 1000, monthlyCapMinor: 5000 })).toBe(true);
    expect(tractionInvoice(P, { ...period, verifiedVisits: 1000, monthlyCapMinor: 100 }).totalMinor).toBe(
      P.minMonthlyCapMinor,
    );
    expect(budgetExhausted(P, { ...period, verifiedVisits: 3 })).toBe(false);
  });
});

describe('PartnerApplicationSchema', () => {
  const ok = {
    placeName: 'Café Linde',
    category: 'cafe',
    address: 'Lindenstraße 1, 10969 Berlin',
    contactEmail: 'hallo@cafe-linde.de',
    pitch: 'Kleines Café mit eigener Rösterei seit 1928.',
    acceptedTerms: true,
  };
  it('requires the explicit consent and a valid contact', () => {
    expect(PartnerApplicationSchema.safeParse(ok).success).toBe(true);
    expect(PartnerApplicationSchema.safeParse({ ...ok, acceptedTerms: false }).success).toBe(false);
    expect(PartnerApplicationSchema.safeParse({ ...ok, contactEmail: 'nope' }).success).toBe(false);
  });
});
