import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { reconciliationRequired } from './revenuecat';

export const purchaseKey = (store: string, environment: string, transactionId: string) =>
  createHash('sha256')
    .update(JSON.stringify([store.toLowerCase(), environment.toLowerCase(), transactionId]))
    .digest('hex');
export const purchaseRef = (db: Firestore, key: string) => db.collection('revenuecatPurchases').doc(key);
export const deletedBillingAccountRef = (db: Firestore, uid: string) =>
  db.collection('billingDeletedAccounts').doc(createHash('sha256').update(uid).digest('hex'));
export const purchaseLotSchema = z
  .object({
    version: z.literal(1),
    ownerUid: z.string(),
    productId: z.string(),
    kind: z.enum(['credit', 'seat']),
    quantity: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    refunded: z.boolean(),
    store: z.string(),
    environment: z.string(),
    transactionId: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .refine((p) => p.remaining <= p.quantity && (!p.refunded || p.remaining === 0));
export type PurchaseLot = z.infer<typeof purchaseLotSchema>;

/** All lots read before any writes. A hard bound prevents partial reconciliation or oversized commits. */
export async function readPurchaseLots(tx: Transaction, db: Firestore, uid: string) {
  const snapshot = await tx.get(
    db.collection('revenuecatPurchases').where('ownerUid', '==', uid).where('remaining', '>', 0).limit(201),
  );
  if (snapshot.size > 200) reconciliationRequired();
  return snapshot.docs.map((doc) => {
    const parsed = purchaseLotSchema.safeParse(doc.data());
    if (!parsed.success) reconciliationRequired();
    return { ref: doc.ref, lot: parsed.data };
  });
}

/** Consume tracked lots first; an existing untracked balance remains spendable but is never transferable. */
export async function consumePurchaseUnit(
  tx: Transaction,
  db: Firestore,
  uid: string,
  kind: 'credit' | 'seat',
  walletBalance: number,
  now: number,
): Promise<() => void> {
  const lots = (await readPurchaseLots(tx, db, uid)).filter(
    ({ lot }) => lot.kind === kind && lot.remaining > 0,
  );
  if (lots.reduce((sum, { lot }) => sum + lot.remaining, 0) > walletBalance) reconciliationRequired();
  const oldest = lots.sort(
    (a, b) => a.lot.createdAt - b.lot.createdAt || a.ref.id.localeCompare(b.ref.id),
  )[0];
  return () => {
    if (oldest) tx.set(oldest.ref, { ...oldest.lot, remaining: oldest.lot.remaining - 1, updatedAt: now });
  };
}

/** Preserve only non-reusable transaction fingerprints after deletion; never retain account IDs or receipts. */
export async function closePurchaseAccount(db: Firestore, uid: string, now: number): Promise<void> {
  await deletedBillingAccountRef(db, uid).set({ deletedAt: now });
  for (const name of ['revenuecatPurchases', 'revenuecatSubscriptions']) {
    for (;;) {
      const docs = await db.collection(name).where('ownerUid', '==', uid).limit(200).get();
      if (docs.empty) break;
      const batch = db.batch();
      for (const doc of docs.docs) batch.set(doc.ref, { deleted: true, remaining: 0, updatedAt: now });
      await batch.commit();
    }
  }
}
