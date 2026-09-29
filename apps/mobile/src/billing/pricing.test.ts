import { describe, expect, it } from 'vitest';
import { yearlyValue } from './pricing';
import type { Offer } from './types';

const o = (over: Partial<Offer>): Offer => ({
  id: 'tuur_sub_monthly',
  kind: 'subscription',
  title: 't',
  priceString: 'x',
  ...over,
});

describe('yearlyValue', () => {
  it('computes the per-month equivalent and the savings against monthly billing', () => {
    const v = yearlyValue(
      o({ price: 9.99, currency: 'EUR' }),
      o({ id: 'tuur_sub_yearly', price: 59.99, currency: 'EUR' }),
      'de',
    )!;
    expect(v.savedPercent).toBe(49);
    expect(v.perMonthString).toContain('5,00');
  });
  it('is undefined without numeric prices and never negative', () => {
    expect(yearlyValue(o({}), o({ price: 5, currency: 'EUR' }), 'de')).toBeUndefined();
    const v = yearlyValue(o({ price: 1, currency: 'EUR' }), o({ price: 50, currency: 'EUR' }), 'en')!;
    expect(v.savedPercent).toBe(0);
  });
});
