import { config } from '../config';
import { createDemoBackend } from './demoBackend';
import type { Backend } from './types';

/** Web is only a preview of the app UI; it always runs on the demo backend. */
export function createBackend(): Backend {
  return createDemoBackend({ enforceAccess: config.paywall });
}
