import type { Offer } from './types';

/** Yearly vs. 12 monthly payments: the per-month equivalent and the saved share in percent (rounded down, 0 = none). */
export function yearlyValue(monthly: Offer | undefined, yearly: Offer | undefined, lang: string) {
  if (!monthly?.price || !yearly?.price || !yearly.currency) return undefined;
  const perMonth = yearly.price / 12;
  const saved = Math.floor((1 - yearly.price / (monthly.price * 12)) * 100);
  let perMonthString: string;
  try {
    perMonthString = new Intl.NumberFormat(lang, { style: 'currency', currency: yearly.currency }).format(
      perMonth,
    );
  } catch {
    perMonthString = perMonth.toFixed(2);
  }
  return { perMonthString, savedPercent: Math.max(0, saved) };
}
