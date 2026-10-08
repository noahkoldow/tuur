import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AdminError, writeAudit } from '../admin/service';

/** Approval always applies to the exact text revision the moderator saw. */
export async function moderateOffer(db: Firestore, actor: string, raw: unknown, now: number) {
  const parsed = z
    .object({
      offerId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
      revision: z.string().max(100),
      status: z.enum(['approved', 'rejected']),
    })
    .strict()
    .safeParse(raw);
  if (!parsed.success) throw new AdminError('invalid-argument', 'Invalid moderation request');
  const input = parsed.data;
  const ref = db.collection('offers').doc(input.offerId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AdminError('not-found', 'Offer no longer available');
    if ((snap.get('reviewRevision') ?? '') !== input.revision)
      throw new AdminError('failed-precondition', 'Offer changed; review the latest version');
    tx.set(ref, { moderationStatus: input.status, moderatedAt: now }, { merge: true });
  });
  await writeAudit(db, now, actor, 'moderateOffer', input.offerId, { status: input.status });
  return { ok: true };
}
