import type { Backend } from '../backend/types';
import type { AdsProvider, ConsentState } from './types';

/** Demo ads: the "ad" is instantly watched and the reward is granted through the demo controls. */
export function createDemoAds(backend: Backend): AdsProvider {
  let consent: ConsentState = 'unknown';
  return {
    async gatherConsent() {
      consent = 'not_required';
      return consent;
    },
    consent: () => consent,
    async showRewarded() {
      backend.demo?.grantRewardCredit();
      return 'earned';
    },
    showPrivacyOptions: async () => false,
    preloadInterstitial: () => undefined,
    showInterstitial: async () => false,
  };
}
