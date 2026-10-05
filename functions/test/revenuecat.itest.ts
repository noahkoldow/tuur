import { beforeEach, describe, expect, it } from 'vitest';
import { processRevenueCatEvent, spendCredit, type BillingDeps } from '../src/billing/entitlements';
import { purchaseKey, closePurchaseAccount } from '../src/billing/purchaseLedger';
import type { RevenueCatCustomer } from '../src/billing/revenuecat';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
const now = 1_800_000_000_000;
const deps = { db, now: () => now };
const wallet = async (uid: string) =>
  (await db.collection('users').doc(uid).collection('credits').doc('wallet').get()).data();
const buy = (uid: string, id: string, type = 'NON_RENEWING_PURCHASE') => ({
  event: {
    id,
    type,
    app_user_id: uid,
    product_id: 'tuur_credit_5',
    transaction_id: 'transaction',
    environment: 'PRODUCTION',
    store: 'APP_STORE',
  },
});
const transfer = {
  event: {
    id: 'transfer',
    type: 'TRANSFER',
    transferred_from: ['alice'],
    transferred_to: ['bob'],
    environment: 'PRODUCTION',
  },
};
const customer = (id: string): RevenueCatCustomer => ({
  id,
  aliases: [id],
  purchases:
    id === 'bob'
      ? [
          {
            id: 'purchase',
            customer_id: 'bob',
            product_id: 'prod',
            productIdentifier: 'tuur_credit_5',
            store: 'app_store',
            environment: 'production',
            quantity: 1,
            status: 'owned',
            ownership: 'purchased',
            store_purchase_identifier: 'transaction',
          },
        ]
      : [],
  subscriptions: [],
});
const reconciliation: BillingDeps = {
  ...deps,
  findFirebaseUids: async (ids) => ids.filter((id) => ['alice', 'bob'].includes(id)),
  revenuecat: { customer: async (id) => customer(id) },
};

beforeEach(async () => {
  await clearFirestore();
  await db.collection('tours').doc('tour').set({ free: false, locked: false });
});

describe('purchase ledger transactions in Firestore', () => {
  it('serializes spending against transfer and never grants the five units twice', async () => {
    await processRevenueCatEvent(deps, buy('alice', 'purchase'));
    const results = await Promise.allSettled([
      spendCredit(deps, 'alice', { kind: 'tour', tourId: 'tour' }),
      processRevenueCatEvent(reconciliation, transfer),
    ]);
    expect(results[1]!.status).toBe('fulfilled');
    const spent = results[0]!.status === 'fulfilled' ? 1 : 0;
    expect((await wallet('alice'))?.['balance']).toBe(0);
    expect((await wallet('bob'))?.['balance']).toBe(5 - spent);
    const lot = (
      await db
        .collection('revenuecatPurchases')
        .doc(purchaseKey('APP_STORE', 'PRODUCTION', 'transaction'))
        .get()
    ).data();
    expect(lot).toMatchObject({ ownerUid: 'bob', remaining: 5 - spent });
  });

  it('refunds only the original lot remainder, preserving another purchase after consumption', async () => {
    await processRevenueCatEvent(deps, buy('alice', 'purchase'));
    await spendCredit(deps, 'alice', { kind: 'tour', tourId: 'tour' });
    const another = buy('alice', 'another');
    another.event.transaction_id = 'another';
    await processRevenueCatEvent(deps, another);
    await processRevenueCatEvent(deps, buy('alice', 'refund', 'CANCELLATION'));
    expect((await wallet('alice'))?.['balance']).toBe(5);
  });

  it('detects legacy grants on any account and refuses to fabricate consumption history', async () => {
    await db
      .collection('users')
      .doc('alice')
      .collection('creditLedger')
      .doc('legacy')
      .set({ ref: 'transaction', delta: 5 });
    await expect(processRevenueCatEvent(deps, buy('bob', 'legacy-replay'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(await wallet('bob')).toBeUndefined();
  });

  it('retains no UID or receipt in deletion tombstones and denies replay to a different account', async () => {
    await processRevenueCatEvent(deps, buy('alice', 'purchase'));
    await closePurchaseAccount(db, 'alice', now);
    await db.recursiveDelete(db.collection('users').doc('alice'));
    const tombstones = await db.collection('revenuecatPurchases').get();
    expect(tombstones.docs.map((d) => d.data())).toEqual([{ deleted: true, remaining: 0, updatedAt: now }]);
    await expect(processRevenueCatEvent(deps, buy('bob', 'replay'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(await wallet('bob')).toBeUndefined();
    await expect(processRevenueCatEvent(deps, buy('alice', 'deleted-replay'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
