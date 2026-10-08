import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { consumeRateLimit } from '../util/rateLimit';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
export const ContentReportSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum(['ad', 'offer']),
    offerId: id.optional(),
    reason: z.enum(['offensive', 'age_inappropriate', 'misleading', 'other']),
    text: z.string().trim().min(5).max(1000),
    blockPartner: z.boolean().default(false),
  })
  .strict()
  .refine((r) => (r.kind === 'offer' ? Boolean(r.offerId) : !r.offerId && !r.blockPartner));

export class ContentReportError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}

/** Explicit user report, retained with the existing feedback policy; retried sends are idempotent. */
export async function reportContent(db: Firestore, uid: string, raw: unknown, now: number) {
  const parsed = ContentReportSchema.safeParse(raw);
  if (!parsed.success) throw new ContentReportError('invalid-argument', 'Invalid report');
  const input = parsed.data;
  const key = createHash('sha256').update(`${uid}:${input.requestId}`).digest('hex');
  const ref = db.collection('feedback').doc(`content_${key}`);
  if ((await ref.get()).exists) return { id: ref.id };
  await consumeRateLimit(db, `content_report_${uid}`, 20, 24 * 3600_000, now);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    const offer = input.offerId ? await tx.get(db.collection('offers').doc(input.offerId)) : undefined;
    if (input.kind === 'offer' && !offer?.exists)
      throw new ContentReportError('not-found', 'Offer no longer available');
    const partnerId = offer?.get('partnerId') as string | undefined;
    tx.set(ref, {
      uid,
      kind: input.kind,
      reason: input.reason,
      text: input.text,
      status: 'open',
      createdAt: now,
      ...(input.offerId ? { offerId: input.offerId } : {}),
      ...(partnerId ? { partnerId } : {}),
    });
    if (input.blockPartner && partnerId)
      tx.set(db.collection('users').doc(uid).collection('blockedPartners').doc(partnerId), {
        createdAt: now,
      });
  });
  return { id: ref.id };
}
