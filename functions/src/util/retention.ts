import type { Firestore } from 'firebase-admin/firestore';

/** Retention periods (documented in the privacy policy): reports 12 months, cost logs 90 days, admin audit 24 months. */
export const RETENTION_DAYS = { feedback: 365, usageLogs: 90, adminAudit: 730 } as const;

async function purge(db: Firestore, q: FirebaseFirestore.Query): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await q.limit(400).get();
    if (snap.empty) return n;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if (snap.size < 400) return n;
  }
}

/** Deletes records past their retention period; returns how many documents were removed per collection. */
export async function retentionSweep(db: Firestore, now: number) {
  const before = (days: number) => now - days * 86_400_000;
  return {
    feedback: await purge(
      db,
      db.collection('feedback').where('createdAt', '<', before(RETENTION_DAYS.feedback)),
    ),
    usageLogs: await purge(db, db.collection('usageLogs').where('ts', '<', before(RETENTION_DAYS.usageLogs))),
    adminAudit: await purge(
      db,
      db.collection('adminAudit').where('ts', '<', before(RETENTION_DAYS.adminAudit)),
    ),
  };
}
