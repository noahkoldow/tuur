export type ProductId =
  | 'tuur_credit_1'
  | 'tuur_credit_5'
  | 'tuur_sub_monthly'
  | 'tuur_sub_yearly'
  /** Extra place in a live group tour (D47), bought from the player, not listed on the paywall. */
  | 'tuur_group_seat';

/** A purchasable product. Prices always come from the store (localized, incl. tax), never from our code. */
export interface Offer {
  id: ProductId;
  kind: 'credit' | 'subscription' | 'seat';
  title: string;
  priceString: string;
  /** Numeric price and ISO currency (for the per-month equivalent and the savings badge). */
  price?: number;
  currency?: string;
  /** Subscription period for the mandatory price disclosure. */
  period?: 'month' | 'year';
  credits?: number;
}

export type PurchaseResult = 'purchased' | 'cancelled';

/**
 * Purchases (RevenueCat). Entitlements are never derived from this result: the RevenueCat webhook writes them on the
 * server and the app only listens to Firestore (spec 6.4). A purchase only triggers the wait for that write.
 */
export interface BillingProvider {
  init(uid: string): Promise<void>;
  offers(): Promise<Offer[]>;
  purchase(id: ProductId): Promise<PurchaseResult>;
  restore(): Promise<void>;
}
