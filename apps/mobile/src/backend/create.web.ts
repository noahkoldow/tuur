import { config } from '../config';
import { createDemoBackend } from './demoBackend';
import { createFirebaseJsBackend } from './firebaseJsBackend';
import type { Backend } from './types';
import { withAiConsent } from '../privacy/aiConsent';

/** A configured browser/Expo Go can use the same protected backend as the installed app. */
export function createBackend(): Backend {
  return config.backend === 'demo'
    ? createDemoBackend({ enforceAccess: true })
    : withAiConsent(createFirebaseJsBackend());
}
