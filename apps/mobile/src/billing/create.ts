import type { Backend } from '../backend/types';
import { config } from '../config';
import { createDemoBilling } from './demoBilling';
import { createRevenueCatBilling } from './revenueCat';
import type { BillingProvider } from './types';

export function createBilling(backend: Backend): BillingProvider {
  return config.backend === 'demo' || backend.kind === 'demo'
    ? createDemoBilling(backend)
    : createRevenueCatBilling();
}
