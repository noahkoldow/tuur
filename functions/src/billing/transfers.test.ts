import { describe, expect, it } from 'vitest';
import { processRevenueCatEvent } from './entitlements';
import { memoryFirestore } from '../../test/memoryFirestore';
import { consumePurchaseUnit, deletedBillingAccountRef, purchaseKey } from './purchaseLedger';
import type { BillingDeps } from './entitlements';
import type { RevenueCatCustomer, RevenueCatPurchase } from './revenuecat';

// The actual RevenueCat transfer format has ID arrays, not app_user_id/product_id.
// https://www.revenuecat.com/docs/integrations/webhooks/sample-events#transfer
const transfer = {
  api_version: '1.0',
  event: {
    app_id: '1234567890',
    event_timestamp_ms: 78789789798798,
    id: 'CD489E0E-5D52-4E03-966B-A7F17788E432',
    store: 'APP_STORE',
    transferred_from: ['00005A1C-6091-4F81-BE77-F0A83A271AB6'],
    transferred_to: ['4BEDB450-8EF2-11E9-B475-0800200C9A66'],
    type: 'TRANSFER',
    environment: 'PRODUCTION',
  },
};

describe('RevenueCat transfers requiring provider reconciliation', () => {
  it('rejects the provider payload on every retry without marking it processed or moving rights', async () => {
    const { db, docs } = memoryFirestore();
    docs.set(`users/${transfer.event.transferred_from[0]}/credits/wallet`, { balance: 4 });
    docs.set(`users/${transfer.event.transferred_to[0]}/credits/wallet`, { balance: 2 });
    const before = structuredClone([...docs]);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(processRevenueCatEvent({ db, now: Date.now }, transfer)).rejects.toMatchObject({
        code: 'failed-precondition',
        details: {
          reason: 'revenuecat_transfer_reconciliation_required',
          eventId: transfer.event.id,
        },
      });
      expect([...docs]).toEqual(before);
    }
  });

  it('does not silently acknowledge transfers with aliases or extra purchase fields', async () => {
    const { db, docs } = memoryFirestore();
    await expect(
      processRevenueCatEvent(
        { db, now: Date.now },
        {
          ...transfer,
          event: {
            ...transfer.event,
            app_user_id: 'destination',
            product_id: 'tuur_sub_monthly',
            transferred_to: ['$RCAnonymousID:anonymous', 'destination'],
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(docs.size).toBe(0);
  });

  it('only ignores sandbox transfers when sandbox billing is disabled', async () => {
    const { db, docs } = memoryFirestore();
    const sandbox = { ...transfer, event: { ...transfer.event, environment: 'SANDBOX' } };
    await expect(processRevenueCatEvent({ db, now: Date.now }, sandbox)).resolves.toEqual({
      status: 'ignored',
      ops: [],
    });
    await expect(
      processRevenueCatEvent({ db, now: Date.now, allowSandbox: true }, sandbox),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(docs.size).toBe(0);
  });

  it('rejects malformed transfers even when generic purchase fields would parse', async () => {
    const { db, docs } = memoryFirestore();
    await expect(
      processRevenueCatEvent(
        { db, now: Date.now },
        { event: { id: 'bad', type: 'TRANSFER', app_user_id: 'u', product_id: 'tuur_credit_1' } },
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(docs.size).toBe(0);
  });
});

const now = 1_800_000_000_000;
const purchase = (transaction: string, product = 'tuur_credit_5'): RevenueCatPurchase => ({
  id: `purchase_${transaction}`,
  customer_id: 'bob',
  product_id: `prod_${product}`,
  store_purchase_identifier: transaction,
  store: 'app_store',
  environment: 'production',
  quantity: 1,
  status: 'owned',
  ownership: 'purchased',
  productIdentifier: product,
});
const customer = (id: string, purchases: RevenueCatPurchase[] = []): RevenueCatCustomer => ({
  id,
  aliases: [id, `$RCAnonymousID:${id}`],
  purchases,
  subscriptions: [],
});
const transferBody = (id = 'move') => ({
  event: {
    id,
    type: 'TRANSFER',
    environment: 'PRODUCTION',
    event_timestamp_ms: now,
    transferred_from: ['$RCAnonymousID:alice', 'alice'],
    transferred_to: ['$RCAnonymousID:bob', 'bob'],
  },
});
const buy = (
  uid: string,
  transaction: string,
  product = 'tuur_credit_5',
  type = 'NON_RENEWING_PURCHASE',
) => ({
  event: {
    id: `${uid}_${transaction}_${type}`,
    type,
    app_user_id: uid,
    product_id: product,
    transaction_id: transaction,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
  },
});

function setup() {
  const memory = memoryFirestore();
  const snapshots = new Map<string, RevenueCatCustomer>([
    ['alice', customer('alice')],
    ['bob', customer('bob')],
  ]);
  const deps: BillingDeps = {
    db: memory.db,
    now: () => now,
    findFirebaseUids: async (ids) => ids.filter((id) => id === 'alice' || id === 'bob'),
    revenuecat: { customer: async (id) => snapshots.get(id.replace('$RCAnonymousID:', ''))! },
  };
  const seedDeps = { db: memory.db, now: () => now };
  const wallet = (uid: string) => memory.docs.get(`users/${uid}/credits/wallet`);
  return { ...memory, deps, seedDeps, snapshots, wallet };
}

describe('verified RevenueCat transfers', () => {
  it('moves only tracked unused credits and seats, preserving rewards and untracked balance', async () => {
    const { db, docs, deps, seedDeps, snapshots, wallet } = setup();
    await processRevenueCatEvent(seedDeps, buy('alice', 'credits'));
    await processRevenueCatEvent(seedDeps, buy('alice', 'seat', 'tuur_group_seat'));
    await db.runTransaction(async (tx) => {
      const consume = await consumePurchaseUnit(tx, db, 'alice', 'credit', 5, now);
      consume();
      tx.set(db.collection('users').doc('alice').collection('credits').doc('wallet'), {
        balance: 6,
        seatBalance: 1,
        rewardBalance: 3,
      });
    });
    snapshots.set('bob', customer('bob', [purchase('credits'), purchase('seat', 'tuur_group_seat')]));
    expect(await processRevenueCatEvent(deps, transferBody())).toEqual({
      status: 'processed',
      ops: ['reconcileTransfer'],
    });
    expect(wallet('alice')).toEqual({ balance: 2, rewardBalance: 3, seatBalance: 0 });
    expect(wallet('bob')).toEqual({ balance: 4, rewardBalance: 0, seatBalance: 1 });
    expect(
      docs.get(`revenuecatPurchases/${purchaseKey('app_store', 'production', 'credits')}`),
    ).toMatchObject({ ownerUid: 'bob', quantity: 5, remaining: 4 });
    expect((await processRevenueCatEvent(deps, transferBody())).status).toBe('duplicate');
    expect(wallet('bob')?.balance).toBe(4);
    await expect(
      processRevenueCatEvent(seedDeps, buy('alice', 'credits', 'tuur_credit_5', 'INITIAL_PURCHASE')),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await processRevenueCatEvent(deps, buy('bob', 'credits'));
    expect(wallet('bob')?.balance).toBe(4);
  });

  it('refunds transferred unused units on their current owner even when the event names the old owner', async () => {
    const { deps, seedDeps, snapshots, wallet } = setup();
    await processRevenueCatEvent(seedDeps, buy('alice', 'credits'));
    snapshots.set('bob', customer('bob', [purchase('credits')]));
    await processRevenueCatEvent(deps, transferBody());
    await processRevenueCatEvent(deps, buy('alice', 'credits', 'tuur_credit_5', 'CANCELLATION'));
    expect(wallet('alice')?.balance).toBe(0);
    expect(wallet('bob')?.balance).toBe(0);
    await processRevenueCatEvent(seedDeps, buy('bob', 'credits', 'tuur_credit_5', 'CANCELLATION'));
    expect(wallet('bob')?.balance).toBe(0);
  });

  it('routes a late refund to the current owner after the original Firebase account is deleted', async () => {
    const { deps, seedDeps, snapshots, wallet, db } = setup();
    await processRevenueCatEvent(seedDeps, buy('alice', 'credits'));
    snapshots.set('bob', customer('bob', [purchase('credits')]));
    await processRevenueCatEvent(deps, transferBody());
    await deletedBillingAccountRef(db, 'alice').set({ deletedAt: now });
    deps.findFirebaseUids = async (ids) => ids.filter((id) => id === 'bob');
    deps.revenuecat = {
      customer: async () => {
        throw new Error('Former customer no longer resolves');
      },
    };
    await processRevenueCatEvent(deps, buy('alice', 'credits', 'tuur_credit_5', 'CANCELLATION'));
    expect(wallet('bob')?.balance).toBe(0);
  });

  it('reconciles sandbox purchases for an environment-less TRANSFER in an isolated beta', async () => {
    const { deps, seedDeps, wallet } = setup();
    deps.allowSandbox = true;
    const sandboxPurchase = buy('alice', 'sandbox-credit');
    sandboxPurchase.event.environment = 'SANDBOX';
    await processRevenueCatEvent({ ...seedDeps, allowSandbox: true }, sandboxPurchase);
    deps.revenuecat = {
      customer: async (id, env) => {
        const uid = id.replace('$RCAnonymousID:', '');
        return customer(
          uid,
          uid === 'bob' && env === 'sandbox'
            ? [{ ...purchase('sandbox-credit'), environment: 'sandbox' }]
            : [],
        );
      },
    };
    const noEnvironment = transferBody();
    const { environment: _environment, ...event } = noEnvironment.event;
    expect((await processRevenueCatEvent(deps, { event })).status).toBe('processed');
    expect(wallet('alice')?.balance).toBe(0);
    expect(wallet('bob')?.balance).toBe(5);
  });

  it('keeps balances and previous access unchanged when provider grace access has no verified future expiry', async () => {
    const { deps, docs, snapshots } = setup();
    docs.set('users/alice/entitlements/subscription', { active: true });
    snapshots.get('bob')!.subscriptions.push({
      id: 'grace',
      customer_id: 'bob',
      product_id: 'prod_sub',
      productIdentifier: 'tuur_sub_monthly',
      store: 'app_store',
      environment: 'production',
      gives_access: true,
      ends_at: now - 1,
      current_period_ends_at: now - 1,
      auto_renewal_status: 'will_renew',
      ownership: 'purchased',
    });
    const before = structuredClone([...docs]);
    await expect(processRevenueCatEvent(deps, transferBody())).rejects.toMatchObject({
      details: { issue: 'subscription_expiry_unverified' },
    });
    expect([...docs]).toEqual(before);
  });

  it('refuses unproven legacy monthly counts instead of duplicating them on each transfer', async () => {
    const { deps, docs } = setup();
    docs.set(`users/alice/tourUsage/${new Date(now).toISOString().slice(0, 7)}`, { starts: 2, sessions: {} });
    const before = structuredClone([...docs]);
    await expect(processRevenueCatEvent(deps, transferBody())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect([...docs]).toEqual(before);
  });

  it('does not resurrect fully spent or refunded lots on transfer', async () => {
    const { db, deps, seedDeps, snapshots, wallet } = setup();
    await processRevenueCatEvent(seedDeps, buy('alice', 'seat', 'tuur_group_seat'));
    await processRevenueCatEvent(seedDeps, buy('alice', 'refunded'));
    await processRevenueCatEvent(seedDeps, buy('alice', 'refunded', 'tuur_credit_5', 'CANCELLATION'));
    await db.runTransaction(async (tx) => {
      const consume = await consumePurchaseUnit(tx, db, 'alice', 'seat', 1, now);
      consume();
      tx.set(db.collection('users').doc('alice').collection('credits').doc('wallet'), {
        balance: 0,
        rewardBalance: 0,
        seatBalance: 0,
      });
    });
    snapshots.set('bob', customer('bob', [purchase('seat', 'tuur_group_seat'), purchase('refunded')]));
    await processRevenueCatEvent(deps, transferBody());
    expect(wallet('bob')).toEqual({ balance: 0, seatBalance: 0, rewardBalance: 0 });
  });

  it('fails atomically on missing historical consumption, and can be retried without an event marker', async () => {
    const { docs, deps, snapshots } = setup();
    snapshots.set('bob', customer('bob', [purchase('old')]));
    docs.set('users/alice/credits/wallet', { balance: 5 });
    const before = structuredClone([...docs]);
    for (let i = 0; i < 2; i++) {
      await expect(processRevenueCatEvent(deps, transferBody())).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect([...docs]).toEqual(before);
    }
  });

  it('rejects ambiguous Firebase aliases and incomplete provider ownership', async () => {
    const { deps, snapshots, docs } = setup();
    snapshots.set('bob', { ...customer('bob'), aliases: ['bob', 'alice', '$RCAnonymousID:bob'] });
    await expect(processRevenueCatEvent(deps, transferBody())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(docs.size).toBe(0);
  });

  it('removes old subscription access and ignores stale event grants using current provider state', async () => {
    const { deps, docs, snapshots } = setup();
    const month = new Date(now).toISOString().slice(0, 7);
    docs.set(`users/alice/tourUsage/${month}`, { starts: 2, sessions: { startA: 'tourA', startB: 'tourB' } });
    docs.set(`users/bob/tourUsage/${month}`, { starts: 1, sessions: { startC: 'tourC' } });
    docs.set('users/alice/entitlements/subscription', {
      active: true,
      type: 'subscription',
      productId: 'tuur_sub_monthly',
      expiresAt: now + 9999,
      updatedAt: now - 1,
    });
    snapshots.get('bob')!.subscriptions.push({
      id: 'subscription1',
      customer_id: 'bob',
      product_id: 'prod_sub',
      productIdentifier: 'tuur_sub_monthly',
      store: 'app_store',
      environment: 'production',
      gives_access: true,
      ends_at: now + 9999,
      current_period_ends_at: now + 9999,
      auto_renewal_status: 'will_renew',
      ownership: 'purchased',
    });
    await processRevenueCatEvent(deps, transferBody());
    expect(docs.get('users/alice/entitlements/subscription')?.active).toBe(false);
    expect(docs.get('users/bob/entitlements/subscription')?.active).toBe(true);
    expect(docs.get(`users/bob/tourUsage/${month}`)).toMatchObject({
      starts: 3,
      sessions: { startA: 'tourA', startB: 'tourB', startC: 'tourC' },
    });
    await processRevenueCatEvent(deps, {
      event: {
        id: 'late-sub',
        type: 'RENEWAL',
        app_user_id: 'alice',
        product_id: 'tuur_sub_monthly',
        expiration_at_ms: now + 999999,
      },
    });
    expect(docs.get('users/alice/entitlements/subscription')?.active).toBe(false);
  });

  it('rejects a snapshot read concurrently with another webhook commit', async () => {
    const { deps, seedDeps, snapshots, wallet } = setup();
    await processRevenueCatEvent(seedDeps, buy('alice', 'credits'));
    snapshots.set('bob', customer('bob', [purchase('credits')]));
    const original = deps.revenuecat!.customer;
    let raced = false;
    deps.revenuecat = {
      customer: async (id, env) => {
        if (!raced) {
          raced = true;
          await processRevenueCatEvent(seedDeps, buy('alice', 'credits', 'tuur_credit_5', 'CANCELLATION'));
        }
        return original(id, env);
      },
    };
    await expect(processRevenueCatEvent(deps, transferBody())).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(wallet('alice')?.balance).toBe(0);
    expect(wallet('bob')).toBeUndefined();
    await processRevenueCatEvent(deps, transferBody());
    expect(wallet('bob')?.balance).toBe(0);
  });
});
