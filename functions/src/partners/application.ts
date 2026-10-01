import type { Firestore } from 'firebase-admin/firestore';
import { PartnerApplicationSchema } from '@tuur/shared';
import { consumeRateLimit } from '../util/rateLimit';

/** Applications per user and day (spam guard; the form is deliberately low-key in the app). */
export const APPLICATIONS_PER_DAY = 3;

/**
 * Partner application from the app's business onboarding: stored for admin review (`partnerApplications`, never
 * client-readable). Approved applicants continue in the partner portal (profile, POI link, billing).
 */
export async function submitPartnerApplication(
  deps: { db: Firestore; now: () => number },
  uid: string,
  raw: unknown,
): Promise<{ id: string }> {
  const app = PartnerApplicationSchema.parse(raw);
  const now = deps.now();
  await consumeRateLimit(deps.db, `partnerApply_${uid}`, APPLICATIONS_PER_DAY, 86_400_000, now);
  const ref = deps.db.collection('partnerApplications').doc();
  await ref.set({
    ...app,
    uid,
    status: 'pending',
    pricingModel: 'traction',
    createdAt: now,
  });
  return { id: ref.id };
}
