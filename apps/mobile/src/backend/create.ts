import { config } from '../config';
import { createDemoBackend } from './demoBackend';
import { createFirebaseBackend } from './firebaseBackend';
import type { Backend } from './types';
import { withAiConsent } from '../privacy/aiConsent';

/** Native: Firebase (or emulators), or the in-memory demo backend when EXPO_PUBLIC_BACKEND=demo. */
export function createBackend(): Backend {
  return config.backend === 'demo'
    ? createDemoBackend({ enforceAccess: true })
    : withAiConsent(createFirebaseBackend());
}
