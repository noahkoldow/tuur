import { config } from '../config';
import { createDemoBackend } from './demoBackend';
import { createFirebaseJsBackend } from './firebaseJsBackend';
import type { Backend } from './types';

/** A configured browser/Expo Go can use the same protected backend as the installed app. */
export function createBackend(): Backend {
  return config.backend === 'demo'
    ? createDemoBackend({ enforceAccess: config.paywall })
    : createFirebaseJsBackend();
}
