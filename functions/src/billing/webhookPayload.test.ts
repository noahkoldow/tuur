import { describe, expect, it, vi } from 'vitest';
import { RevenueCatEventSchema } from '@tuur/shared';
import { processRevenueCatEvent } from './webhook';
import { memoryFirestore } from '../../test/memoryFirestore';

// Shape observed in RevenueCat's dashboard "Send test webhook"; all identities are synthetic.
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
const dashboardTest = {
  api_version: '1.0',
  event: {
    id: '00000000-0000-4000-8000-000000000001',
    app_user_id: '00000000-0000-4000-8000-000000000002',
    aliases: ['00000000-0000-4000-8000-000000000003'],
    type: 'TEST',
    product_id: 'test_product',
    store: 'APP_STORE',
    environment: 'SANDBOX',
    event_timestamp_ms: 1_800_000_000_000,
    purchased_at_ms: 1_800_000_000_000,
    expiration_at_ms: 1_800_003_600_000,
    period_type: 'NORMAL',
    transaction_id: null,
    original_transaction_id: null,
    entitlement_ids: null,
    entitlement_id: null,
    offer_code: null,
    presented_offering_id: null,
  },
};

describe('RevenueCat dashboard TEST compatibility', () => {
  it('accepts the real nullable TEST shape while stripping unused provider fields', () => {
    const parsed = RevenueCatEventSchema.parse(dashboardTest.event);
    expect(parsed.type).toBe('TEST');
    expect(parsed.transaction_id).toBeUndefined();
    expect(parsed).not.toHaveProperty('entitlement_ids');
    expect(parsed).not.toHaveProperty('original_transaction_id');
  });

  it('keeps TEST idempotency without creating user rights or contacting the provider', async () => {
    const { db, docs } = memoryFirestore();
    const customer = vi.fn();
    const findFirebaseUids = vi.fn();
    const deps = { db, now: Date.now, allowSandbox: true, revenuecat: { customer }, findFirebaseUids };
    expect(await processRevenueCatEvent(deps, dashboardTest)).toEqual({ status: 'ignored', ops: ['ignore'] });
    expect(customer).not.toHaveBeenCalled();
    expect(findFirebaseUids).not.toHaveBeenCalled();
    const markers = [...docs].filter(([path]) => path.startsWith('revenuecatEvents/'));
    expect(markers).toHaveLength(1);
    expect(markers[0]?.[1]).toMatchObject({ type: 'TEST', ops: ['ignore'] });
    expect(
      [...docs.keys()].every(
        (path) => path.startsWith('revenuecatEvents/') || path === 'billingSync/revenuecat',
      ),
    ).toBe(true);
    const beforeReplay = structuredClone([...docs]);
    expect(await processRevenueCatEvent(deps, dashboardTest)).toEqual({ status: 'duplicate', ops: [] });
    expect([...docs]).toEqual(beforeReplay);
  });

  it('retains the production sandbox gate without DB access', async () => {
    const { db, docs } = memoryFirestore();
    const collection = vi.spyOn(db, 'collection');
    expect(await processRevenueCatEvent({ db, now: Date.now, allowSandbox: false }, dashboardTest)).toEqual({
      status: 'ignored',
      ops: [],
    });
    expect(collection).not.toHaveBeenCalled();
    expect(docs.size).toBe(0);
  });

  it.each(['id', 'app_user_id'])('still rejects a malformed TEST identity: %s', async (field) => {
    const { db, docs } = memoryFirestore();
    await expect(
      processRevenueCatEvent(
        { db, now: Date.now, allowSandbox: true },
        {
          ...dashboardTest,
          event: { ...dashboardTest.event, [field]: null },
        },
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(docs.size).toBe(0);
  });

  it.each(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL', 'CANCELLATION'])(
    'does not allow null transaction IDs for real %s events',
    async (type) => {
      const { db, docs } = memoryFirestore();
      await expect(
        processRevenueCatEvent(
          { db, now: Date.now, allowSandbox: true },
          {
            ...dashboardTest,
            event: { ...dashboardTest.event, type, product_id: 'tuur_credit_1' },
          },
        ),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      expect(docs.size).toBe(0);
    },
  );

  it.each([undefined, ''])(
    'still grants no credits when a real purchase has no usable transaction ID: %s',
    async (transactionId) => {
      const { db, docs } = memoryFirestore();
      const walletPath = `users/${dashboardTest.event.app_user_id}/credits/wallet`;
      docs.set(walletPath, { balance: 4, rewardBalance: 0, seatBalance: 0 });
      const before = structuredClone([...docs]);
      await expect(
        processRevenueCatEvent(
          { db, now: Date.now, allowSandbox: true },
          {
            ...dashboardTest,
            event: {
              ...dashboardTest.event,
              type: 'NON_RENEWING_PURCHASE',
              product_id: 'tuur_credit_1',
              transaction_id: transactionId,
            },
          },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect([...docs]).toEqual(before);
    },
  );
});
