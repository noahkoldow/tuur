import type { Backend } from '../backend/types';
import { config } from '../config';
import { createAdMobAds } from './admob';
import { createDemoAds } from './demoAds';
import type { AdsProvider } from './types';

export function createAds(backend: Backend): AdsProvider {
  return config.backend === 'demo' || backend.kind === 'demo' ? createDemoAds(backend) : createAdMobAds();
}
