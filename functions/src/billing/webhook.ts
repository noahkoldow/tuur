import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { RevenueCatEventSchema, planRevenueCatEvent, type ProductMap, type Wallet } from '@tuur/shared';
import { z } from 'zod';
import { BillingError } from './errors';
import { readTourTimeTransfer } from './timeBudget';
import { loadBillingConfig, type BillingDeps } from './entitlements';
import {
  purchaseKey,
  purchaseRef,
  purchaseLotSchema,
  readPurchaseLots,
  deletedBillingAccountRef,
  type PurchaseLot,
} from './purchaseLedger';
import { reconciliationRequired, resolveCustomerUid, type RevenueCatCustomer } from './revenuecat';

const hash = (id: string) => createHash('sha256').update(id).digest('hex');
const eventRef = (db: Firestore, id: string) => db.collection('revenuecatEvents').doc(hash(id));
const walletRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('credits').doc('wallet');
const subRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('entitlements').doc('subscription');
const syncRef = (db: Firestore) => db.collection('billingSync').doc('revenuecat');
const subscriptionRef = (db: Firestore, id: string) => db.collection('revenuecatSubscriptions').doc(hash(id));
const readWallet = async (tx: Transaction, db: Firestore, uid: string): Promise<Wallet> => {
  const snap = await tx.get(walletRef(db, uid));
  const wallet = {
    balance: Number(snap.get('balance') ?? 0),
    rewardBalance: Number(snap.get('rewardBalance') ?? 0),
    seatBalance: Number(snap.get('seatBalance') ?? 0),
  };
  if (Object.values(wallet).some((v) => !Number.isSafeInteger(v) || v < 0)) reconciliationRequired();
  return wallet;
};
type Result = { status: 'processed' | 'duplicate' | 'ignored'; ops: string[] };
const duplicate: Result = { status: 'duplicate', ops: [] };
const ignored: Result = { status: 'ignored', ops: [] };
const transferSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('TRANSFER'),
  transferred_from: z.array(z.string().min(1).max(1500)).min(1).max(100),
  transferred_to: z.array(z.string().min(1).max(1500)).min(1).max(100),
  event_timestamp_ms: z.number().optional(),
  environment: z.enum(['PRODUCTION', 'SANDBOX']).optional(),
});

function subscription(customer: RevenueCatCustomer, products: ProductMap, now: number) {
  const active = customer.subscriptions.filter(
    (s) =>
      s.gives_access &&
      s.ownership === 'purchased' &&
      s.productIdentifier &&
      products[s.productIdentifier]?.kind === 'subscription',
  );
  // V2 gives_access also covers grace periods. Without a future expiry, preserve existing local
  // state and request review; never silently revoke valid provider access or invent an indefinite grant.
  if (active.some((s) => s.ends_at === null || s.ends_at <= now))
    reconciliationRequired(undefined, 'subscription_expiry_unverified');
  const chosen = active
    .filter((s) => s.ends_at !== null && s.ends_at > now)
    .sort((a, b) => b.ends_at! - a.ends_at!)[0];
  return {
    type: 'subscription',
    active: Boolean(chosen),
    productId: chosen?.productIdentifier ?? '',
    expiresAt: chosen?.ends_at ?? now,
    updatedAt: now,
    eventTs: now,
    reconciled: true,
    willRenew: chosen?.auto_renewal_status === 'will_renew',
    ...(chosen ? { store: chosen.store } : {}),
  };
}

async function identity(deps: BillingDeps, ids: string[], env: 'production' | 'sandbox') {
  if (!deps.revenuecat || !deps.findFirebaseUids) reconciliationRequired();
  const customer = await deps.revenuecat.customer(ids[0]!, env);
  if (ids.some((id) => !customer.aliases.includes(id))) reconciliationRequired();
  const uid = await resolveCustomerUid(customer, deps.findFirebaseUids);
  return { uid, customer };
}

async function processTransfer(deps: BillingDeps, raw: unknown): Promise<Result> {
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid transfer payload');
  const event = parsed.data;
  if (event.environment === 'SANDBOX' && !deps.allowSandbox) return ignored;
  if (!deps.revenuecat || !deps.findFirebaseUids) reconciliationRequired(event.id);
  const { db } = deps;
  const ref = eventRef(db, event.id);
  if ((await ref.get()).exists) return duplicate;
  // Reject stale snapshots if any webhook commits during the external read. A retry fetches fresh state.
  const baseline = Number((await syncRef(db).get()).get('revision') ?? 0);
  // TRANSFER can omit environment and cover the whole customer. Reconcile every environment
  // permitted by this Firebase deployment together; never acknowledge a sandbox-only move as empty.
  const environments: ('production' | 'sandbox')[] = deps.allowSandbox
    ? ['production', 'sandbox']
    : ['production'];
  const allEnvironments = async (ids: string[]) => {
    const states = await Promise.all(environments.map((env) => identity(deps, ids, env)));
    const first = states[0]!;
    if (
      states.some(
        (s) =>
          s.uid !== first.uid ||
          s.customer.id !== first.customer.id ||
          s.customer.aliases.slice().sort().join('\n') !== first.customer.aliases.slice().sort().join('\n'),
      )
    )
      reconciliationRequired(event.id);
    return {
      uid: first.uid,
      customer: {
        ...first.customer,
        purchases: states.flatMap((s) => s.customer.purchases),
        subscriptions: states.flatMap((s) => s.customer.subscriptions),
      },
    };
  };
  const [from, to, { products }] = await Promise.all([
    allEnvironments(event.transferred_from),
    allEnvironments(event.transferred_to),
    loadBillingConfig(db),
  ]);
  if (from.uid === to.uid || from.customer.id === to.customer.id) reconciliationRequired(event.id);
  const now = deps.now();
  const participants = [from, to];
  const targets = new Map<string, { uid: string; purchase: RevenueCatCustomer['purchases'][number] }>();
  for (const { uid, customer } of participants)
    for (const purchase of customer.purchases) {
      const product = products[purchase.productIdentifier];
      if (!product || product.kind === 'subscription') continue;
      if (purchase.ownership !== 'purchased') reconciliationRequired(event.id);
      const key = purchaseKey(purchase.store, purchase.environment, purchase.store_purchase_identifier);
      if (targets.has(key)) reconciliationRequired(event.id);
      targets.set(key, { uid, purchase });
    }
  if (targets.size > 180) reconciliationRequired(event.id);
  const subscriptionOwners = new Map<string, string>();
  for (const { uid, customer } of participants)
    for (const sub of customer.subscriptions) {
      if (!sub.productIdentifier || products[sub.productIdentifier]?.kind !== 'subscription') continue;
      if (subscriptionOwners.has(sub.id)) reconciliationRequired(event.id);
      subscriptionOwners.set(sub.id, uid);
    }
  if (subscriptionOwners.size > 100) reconciliationRequired(event.id);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return duplicate;
    const revision = Number((await tx.get(syncRef(db))).get('revision') ?? 0);
    if (revision !== baseline) reconciliationRequired(event.id);
    const wallets = new Map<string, Wallet>();
    const lots = new Map<string, { ref: ReturnType<typeof purchaseRef>; lot: PurchaseLot }>();
    for (const { uid } of participants) {
      if ((await tx.get(deletedBillingAccountRef(db, uid))).exists) reconciliationRequired(event.id);
      wallets.set(uid, await readWallet(tx, db, uid));
      for (const entry of await readPurchaseLots(tx, db, uid)) lots.set(entry.ref.id, entry);
      const knownSubscriptions = await tx.get(
        db.collection('revenuecatSubscriptions').where('ownerUid', '==', uid).limit(101),
      );
      const keys = new Set([...subscriptionOwners.keys()].map(hash));
      if (knownSubscriptions.size > 100 || knownSubscriptions.docs.some((s) => !keys.has(s.id)))
        reconciliationRequired(event.id);
      const existingSub = await tx.get(subRef(db, uid));
      if (existingSub.get('active') === true && subscriptionOwners.size === 0)
        reconciliationRequired(event.id);
    }
    for (const [key] of targets)
      if (!lots.has(key)) {
        const snap = await tx.get(purchaseRef(db, key));
        const lot = purchaseLotSchema.safeParse(snap.data());
        // A receipt proves a purchase, never its unused balance. No automatic legacy/import grants.
        if (!lot.success) reconciliationRequired(event.id);
        lots.set(key, { ref: snap.ref, lot: lot.data });
      }
    for (const [id] of subscriptionOwners) {
      const current = await tx.get(subscriptionRef(db, id));
      if (current.exists && !participants.some((p) => p.uid === current.get('ownerUid')))
        reconciliationRequired(event.id);
    }
    for (const { uid } of participants)
      for (const kind of ['credit', 'seat'] as const) {
        const tracked = [...lots.values()]
          .filter(({ lot }) => lot.ownerUid === uid && lot.kind === kind)
          .reduce((sum, { lot }) => sum + lot.remaining, 0);
        if (tracked > (wallets.get(uid)![kind === 'credit' ? 'balance' : 'seatBalance'] ?? 0))
          reconciliationRequired(event.id);
      }
    const month = new Date(now).toISOString().slice(0, 7);
    const usageRefs = participants.map(({ uid }) =>
      db.collection('users').doc(uid).collection('tourUsage').doc(month),
    );
    const usages = await Promise.all(usageRefs.map((usage) => tx.get(usage)));
    const sessions: Record<string, string> = {};
    for (const usage of usages) {
      const records = (usage.get('sessions') ?? {}) as Record<string, string>;
      if (
        !records ||
        typeof records !== 'object' ||
        Object.values(records).some((v) => typeof v !== 'string')
      )
        reconciliationRequired(event.id);
      for (const [session, tour] of Object.entries(records)) {
        if (sessions[session] && sessions[session] !== tour) reconciliationRequired(event.id);
        sessions[session] = tour;
      }
      // Unknown historical starts have no deduplication evidence: do not erase or duplicate them on transfer.
      const recordedStarts = Number(usage.get('starts') ?? 0);
      if (
        !Number.isSafeInteger(recordedStarts) ||
        recordedStarts < 0 ||
        recordedStarts !== Object.keys(records).length
      )
        reconciliationRequired(event.id);
    }
    const starts = Object.keys(sessions).length;
    const changes: { ref: ReturnType<typeof purchaseRef>; lot: PurchaseLot }[] = [];
    for (const [key, entry] of lots) {
      const { lot } = entry;
      const target = targets.get(key);
      if (!environments.includes(lot.environment as 'production' | 'sandbox')) continue;
      if (!target) {
        if (lot.remaining > 0) reconciliationRequired(event.id);
        continue;
      }
      const product = products[target.purchase.productIdentifier]!;
      const expected =
        product.kind === 'credit' ? product.credits : product.kind === 'seat' ? product.seats : 0;
      if (
        !wallets.has(lot.ownerUid) ||
        lot.productId !== target.purchase.productIdentifier ||
        lot.quantity !== expected * target.purchase.quantity
      )
        reconciliationRequired(event.id);
      const field = lot.kind === 'credit' ? 'balance' : 'seatBalance';
      const source = wallets.get(lot.ownerUid)!;
      if ((source[field] ?? 0) < lot.remaining) reconciliationRequired(event.id);
      const refunded = lot.refunded || target.purchase.status === 'refunded';
      const remaining = refunded ? 0 : lot.remaining;
      if (lot.ownerUid !== target.uid || refunded) {
        source[field] = (source[field] ?? 0) - lot.remaining;
        const destination = wallets.get(target.uid)!;
        destination[field] = (destination[field] ?? 0) + remaining;
      }
      changes.push({
        ref: entry.ref,
        lot: { ...lot, ownerUid: target.uid, remaining, refunded, updatedAt: now },
      });
    }
    const writeTimeTransfer = subscriptionOwners.size
      ? await readTourTimeTransfer(
          tx,
          db,
          participants.map(({ uid }) => uid),
          now,
        )
      : () => {};
    // All reads have completed. Ownership, both balances, subscriptions and idempotency commit together.
    writeTimeTransfer();
    for (const entry of changes) tx.set(entry.ref, entry.lot);
    for (const { uid, customer } of participants) {
      tx.set(walletRef(db, uid), wallets.get(uid)!);
      tx.set(subRef(db, uid), subscription(customer, products, now));
      tx.set(db.collection('users').doc(uid).collection('creditLedger').doc(hash(event.id)), {
        kind: 'transfer',
        eventId: event.id,
        ts: now,
      });
    }
    for (const [id, uid] of subscriptionOwners)
      tx.set(subscriptionRef(db, id), { ownerUid: uid, updatedAt: now });
    if (subscriptionOwners.size)
      for (const usage of usageRefs) tx.set(usage, { month, sessions, starts, updatedAt: now });
    tx.set(syncRef(db), { revision: revision + 1 });
    tx.set(ref, { type: 'TRANSFER', processedAt: now, ops: ['reconcileTransfer'] });
    return { status: 'processed', ops: ['reconcileTransfer'] };
  });
}

/** Every transaction has a global owner. Event IDs and user-local ledgers alone cannot prevent restore duplication. */
export async function processRevenueCatEvent(deps: BillingDeps, body: unknown): Promise<Result> {
  const envelope = z.object({ event: z.object({ type: z.string() }).passthrough() }).safeParse(body);
  if (envelope.success && envelope.data.event.type === 'TRANSFER')
    return processTransfer(deps, envelope.data.event);
  const parsed = z.object({ event: RevenueCatEventSchema }).safeParse(body);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Invalid webhook payload');
  const event = parsed.data.event;
  if (event.environment === 'SANDBOX' && !deps.allowSandbox) return ignored;
  const { db } = deps;
  const ref = eventRef(db, event.id);
  if ((await ref.get()).exists) return duplicate;
  // Respect event markers written before the global-ledger rollout too.
  const legacyRef = db.collection('revenuecatEvents').doc(event.id.replace(/[^A-Za-z0-9_-]/g, '_'));
  const { products } = await loadBillingConfig(db);
  const now = deps.now();
  const ops = planRevenueCatEvent(event, products, now);
  const refundOnly =
    ops.some((op) => op.op === 'removeCredits' || op.op === 'removeSeats') &&
    ops.every((op) => op.op === 'removeCredits' || op.op === 'removeSeats');
  const baseline = Number((await syncRef(db).get()).get('revision') ?? 0);
  const resolved =
    deps.revenuecat && deps.findFirebaseUids && !refundOnly && ops.some((op) => op.op !== 'ignore')
      ? await identity(deps, [event.app_user_id], event.environment === 'SANDBOX' ? 'sandbox' : 'production')
      : undefined;
  const uid = resolved?.uid ?? event.app_user_id;
  if (!refundOnly && (!uid || uid.includes('/') || uid.length > 128 || uid.startsWith('$RCAnonymousID:')))
    reconciliationRequired(event.id);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists || (await tx.get(legacyRef)).exists) return duplicate;
    if (!refundOnly && (await tx.get(deletedBillingAccountRef(db, uid))).exists)
      reconciliationRequired(event.id);
    const revision = Number((await tx.get(syncRef(db))).get('revision') ?? 0);
    if (resolved && revision !== baseline) reconciliationRequired(event.id);
    const writes: (() => void)[] = [];
    for (const op of ops) {
      if (op.op === 'setSubscription') {
        const current = await tx.get(subRef(db, uid));
        if (resolved) {
          for (const sub of resolved.customer.subscriptions) {
            if (!sub.productIdentifier || products[sub.productIdentifier]?.kind !== 'subscription') continue;
            const owned = await tx.get(subscriptionRef(db, sub.id));
            if (owned.exists && owned.get('ownerUid') !== uid) reconciliationRequired(event.id);
            writes.push(() => tx.set(subscriptionRef(db, sub.id), { ownerUid: uid, updatedAt: now }));
          }
          writes.push(() => tx.set(subRef(db, uid), subscription(resolved.customer, products, now)));
        } else {
          if (current.get('reconciled') === true) reconciliationRequired(event.id);
          const eventTs = event.event_timestamp_ms ?? now;
          if (Number(current.get('eventTs') ?? 0) <= eventTs)
            writes.push(() => tx.set(subRef(db, uid), { ...op.entitlement, eventTs }));
        }
      } else if (op.op !== 'ignore') {
        if (!event.transaction_id) reconciliationRequired(event.id);
        const key = purchaseKey(
          event.store ?? 'UNKNOWN',
          event.environment ?? 'PRODUCTION',
          event.transaction_id,
        );
        const pRef = purchaseRef(db, key);
        const snap = await tx.get(pRef);
        // The authenticated store refund follows the transaction's current owner, even if its old UID was deleted.
        if (refundOnly && snap.get('deleted') === true) continue;
        const parsedLot = snap.exists ? purchaseLotSchema.safeParse(snap.data()) : undefined;
        if (parsedLot && !parsedLot.success) reconciliationRequired(event.id);
        const old = parsedLot?.success ? parsedLot.data : undefined;
        const add = op.op === 'addCredits' || op.op === 'addSeats';
        const kind = op.op === 'addCredits' || op.op === 'removeCredits' ? 'credit' : 'seat';
        if (resolved && add) {
          const matching = resolved.customer.purchases.filter(
            (p) => purchaseKey(p.store, p.environment, p.store_purchase_identifier) === key,
          );
          if (
            matching.length !== 1 ||
            matching[0]!.status !== 'owned' ||
            matching[0]!.ownership !== 'purchased' ||
            matching[0]!.productIdentifier !== event.product_id ||
            matching[0]!.quantity !== 1
          )
            reconciliationRequired(event.id);
        }
        if (old && (old.productId !== event.product_id || old.kind !== kind || old.quantity !== op.amount))
          reconciliationRequired(event.id);
        if (!old) {
          // Fail closed for pre-migration histories, including histories attached to another app UID.
          const legacy = await tx.get(
            db.collectionGroup('creditLedger').where('ref', '==', event.transaction_id).limit(1),
          );
          if (!legacy.empty) reconciliationRequired(event.id);
        }
        if (old && add) {
          if (old.ownerUid !== uid) reconciliationRequired(event.id);
          continue;
        }
        if (old?.refunded) continue;
        const ownerUid = old?.ownerUid ?? uid;
        if (
          !ownerUid ||
          ownerUid.includes('/') ||
          ownerUid.length > 128 ||
          ownerUid.startsWith('$RCAnonymousID:')
        )
          reconciliationRequired(event.id);
        if ((await tx.get(deletedBillingAccountRef(db, ownerUid))).exists) reconciliationRequired(event.id);
        const wallet = await readWallet(tx, db, ownerUid);
        const field = kind === 'credit' ? 'balance' : 'seatBalance';
        const delta = add ? op.amount : -(old?.remaining ?? 0);
        if ((wallet[field] ?? 0) + delta < 0) reconciliationRequired(event.id);
        wallet[field] = (wallet[field] ?? 0) + delta;
        const lot: PurchaseLot = {
          version: 1,
          ownerUid,
          productId: event.product_id!,
          kind,
          quantity: op.amount,
          remaining: add ? op.amount : 0,
          refunded: !add,
          store: (event.store ?? 'UNKNOWN').toLowerCase(),
          environment: (event.environment ?? 'PRODUCTION').toLowerCase(),
          transactionId: event.transaction_id,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
        writes.push(() => {
          tx.set(pRef, lot);
          tx.set(walletRef(db, ownerUid), wallet);
          tx.set(
            db
              .collection('users')
              .doc(ownerUid)
              .collection('creditLedger')
              .doc(hash(`${op.op}:${key}`)),
            {
              kind: add ? 'purchase' : 'refund',
              ref: event.transaction_id,
              purchaseKey: key,
              delta,
              ts: now,
            },
          );
        });
      }
    }
    writes.forEach((write) => write());
    tx.set(syncRef(db), { revision: revision + 1 });
    tx.set(ref, {
      type: event.type,
      ...(refundOnly ? {} : { uid }),
      processedAt: now,
      ops: ops.map((op) => op.op),
    });
    return {
      status: ops.some((op) => op.op !== 'ignore') ? 'processed' : 'ignored',
      ops: ops.map((op) => op.op),
    };
  });
}
