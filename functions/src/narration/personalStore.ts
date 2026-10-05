import type { Firestore } from 'firebase-admin/firestore';
import { personalAudioPrefix } from './personalScope';

/** Remove personal scripts, voice variants and audio when their owner deletes the account. */
export async function deletePersonalNarrations(
  db: Firestore,
  uid: string,
  deleteFiles?: (prefix: string) => Promise<void>,
): Promise<number> {
  await deleteFiles?.(personalAudioPrefix(uid));
  let count = 0;
  for (;;) {
    const page = await db.collection('narrations').where('ownerUid', '==', uid).limit(100).get();
    if (page.empty) return count;
    for (const doc of page.docs) {
      await db.recursiveDelete(doc.ref);
      count++;
    }
  }
}
