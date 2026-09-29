import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export function testDb(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-tuur' });
  return getFirestore();
}

export async function clearFirestore(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (!host) throw new Error('Run via `pnpm test:integration` (Firestore emulator required)');
  await fetch(`http://${host}/emulator/v1/projects/demo-tuur/databases/(default)/documents`, {
    method: 'DELETE',
  });
}
