import { describe, expect, it } from 'vitest';
import { processRevenueCatEvent } from './entitlements';
import { memoryFirestore } from '../../test/memoryFirestore';

describe('RevenueCat consumable refunds', () => {
  it.each([
    { product: 'tuur_credit_5', field: 'balance', amount: 5 },
    { product: 'tuur_group_seat', field: 'seatBalance', amount: 1 },
  ])(
    'handles actual cancellation, replays and out-of-order refunds for $product',
    async ({ product, field, amount }) => {
      const { db, docs } = memoryFirestore();
      const deps = { db, now: () => 1_800_000_000_000 };
      const event = (id: string, type: string, transaction = 'tx1') => ({
        event: {
          id,
          type,
          app_user_id: 'u',
          product_id: product,
          transaction_id: transaction,
          environment: 'PRODUCTION',
          ...(type === 'CANCELLATION' ? { cancel_reason: 'CUSTOMER_SUPPORT' } : {}),
        },
      });
      const balance = () => Number(docs.get('users/u/credits/wallet')?.[field] ?? 0);
      await processRevenueCatEvent(deps, event('buy', 'NON_RENEWING_PURCHASE'));
      expect(balance()).toBe(amount);
      await processRevenueCatEvent(deps, event('refund', 'CANCELLATION'));
      expect(balance()).toBe(0);
      await processRevenueCatEvent(deps, event('refund-again', 'CANCELLATION'));
      await processRevenueCatEvent(deps, event('buy-again', 'NON_RENEWING_PURCHASE'));
      expect(balance()).toBe(0);

      await processRevenueCatEvent(deps, event('other-purchase', 'NON_RENEWING_PURCHASE', 'other'));
      await processRevenueCatEvent(deps, event('early-refund', 'CANCELLATION', 'late'));
      expect(balance()).toBe(amount); // Never deduct unrelated credits for a purchase that was not yet granted.
      await processRevenueCatEvent(deps, event('late-purchase', 'NON_RENEWING_PURCHASE', 'late'));
      expect(balance()).toBe(amount);
    },
  );
});
