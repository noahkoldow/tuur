import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** Smoke-test endpoint used by the emulator setup and CI; real functions arrive from Phase 1 on. */
export const health = onCall(() => ({ ok: true, service: 'tuur-functions' }));
