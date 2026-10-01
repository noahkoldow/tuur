import type { Backend } from '../backend/types';
import type { BillingProvider, Offer, ProductId } from './types';

const OFFERS: Offer[] = [
  {
    id: 'tuur_credit_1',
    kind: 'credit',
    title: '1 Tour-Guthaben',
    priceString: '1,99 €',
    price: 1.99,
    currency: 'EUR',
    credits: 1,
  },
  {
    id: 'tuur_credit_5',
    kind: 'credit',
    title: '5 Tour-Guthaben',
    priceString: '7,99 €',
    price: 7.99,
    currency: 'EUR',
    credits: 5,
  },
  {
    id: 'tuur_sub_monthly',
    kind: 'subscription',
    title: 'tuur Abo',
    priceString: '9,99 €',
    price: 9.99,
    currency: 'EUR',
    period: 'month',
  },
  {
    id: 'tuur_sub_yearly',
    kind: 'subscription',
    title: 'tuur Abo',
    priceString: '59,99 €',
    price: 59.99,
    currency: 'EUR',
    period: 'year',
  },
];

/** In-memory purchases for the demo backend (web preview, tests): grants instantly through the demo controls. */
export function createDemoBilling(backend: Backend): BillingProvider {
  return {
    init: async () => undefined,
    offers: async () => OFFERS,
    async purchase(id: ProductId) {
      // demo seats are added directly by the demo backend's addGroupSeat
      if (id === 'tuur_group_seat') return 'purchased';
      const o = OFFERS.find((x) => x.id === id)!;
      if (o.kind === 'credit') backend.demo?.grantCredits(o.credits ?? 1);
      else backend.demo?.grantSubscription();
      return 'purchased';
    },
    restore: async () => undefined,
  };
}
