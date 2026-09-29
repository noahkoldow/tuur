import type { Backend } from '../backend/types';
import { createDemoBilling } from './demoBilling';
import type { BillingProvider } from './types';

/** Web is preview-only: demo purchases, no store SDK is bundled. */
export function createBilling(backend: Backend): BillingProvider {
  return createDemoBilling(backend);
}
