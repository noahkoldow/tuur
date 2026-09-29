import type { Backend } from '../backend/types';
import { createDemoAds } from './demoAds';
import type { AdsProvider } from './types';

export function createAds(backend: Backend): AdsProvider {
  return createDemoAds(backend);
}
