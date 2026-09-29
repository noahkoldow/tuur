import { Platform } from 'react-native';
import type { AdsProvider, ConsentState } from './types';

/** Google's public test units are the default so a dev build can never show (or bill) real ads by accident. */
const TEST = {
  rewarded: Platform.select({
    ios: 'ca-app-pub-3940256099942544/1712485313',
    default: 'ca-app-pub-3940256099942544/5224354917',
  }),
  interstitial: Platform.select({
    ios: 'ca-app-pub-3940256099942544/4411468910',
    default: 'ca-app-pub-3940256099942544/1033173712',
  }),
};
const unit = (kind: 'rewarded' | 'interstitial') =>
  (kind === 'rewarded'
    ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT
    : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT) ?? TEST[kind]!;

type Ads = typeof import('react-native-google-mobile-ads');
const ads = () => require('react-native-google-mobile-ads') as Ads;

export function createAdMobAds(): AdsProvider {
  let consent: ConsentState = 'unknown';
  let initialized = false;
  let interstitial: ReturnType<Ads['InterstitialAd']['createForAdRequest']> | undefined;
  let interstitialReady = false;

  const ensureInit = async () => {
    if (initialized) return;
    await ads().default().initialize();
    initialized = true;
  };

  const provider: AdsProvider = {
    async gatherConsent() {
      try {
        const { AdsConsent, AdsConsentStatus } = ads();
        const info = await AdsConsent.gatherConsent();
        consent =
          info.status === AdsConsentStatus.NOT_REQUIRED
            ? 'not_required'
            : info.canRequestAds
              ? 'granted'
              : 'denied_limited';
        if (info.canRequestAds) await ensureInit();
      } catch {
        consent = 'unknown';
      }
      return consent;
    },
    consent: () => consent,
    async showRewarded({ userId, nonce }) {
      if (consent === 'unknown' || consent === 'denied_limited') return 'unavailable';
      await ensureInit();
      const { RewardedAd, RewardedAdEventType, AdEventType } = ads();
      const ad = RewardedAd.createForAdRequest(unit('rewarded'), {
        serverSideVerificationOptions: { userId, customData: nonce },
      });
      return new Promise((resolve) => {
        let earned = false;
        const off: (() => void)[] = [];
        const done = (r: 'earned' | 'dismissed' | 'unavailable') => {
          off.forEach((f) => f());
          resolve(r);
        };
        off.push(
          ad.addAdEventListener(RewardedAdEventType.LOADED, () => void ad.show()),
          ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => (earned = true)),
          ad.addAdEventListener(AdEventType.CLOSED, () => done(earned ? 'earned' : 'dismissed')),
          ad.addAdEventListener(AdEventType.ERROR, () => done('unavailable')),
        );
        ad.load();
      });
    },
    preloadInterstitial() {
      if (consent === 'unknown' || consent === 'denied_limited' || interstitial) return;
      void ensureInit().then(() => {
        const { InterstitialAd, AdEventType } = ads();
        const ad = InterstitialAd.createForAdRequest(unit('interstitial'));
        interstitial = ad;
        ad.addAdEventListener(AdEventType.LOADED, () => (interstitialReady = true));
        ad.addAdEventListener(AdEventType.ERROR, () => {
          interstitial = undefined;
          interstitialReady = false;
        });
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          interstitial = undefined;
          interstitialReady = false;
        });
        ad.load();
      });
    },
    async showInterstitial() {
      if (!interstitial || !interstitialReady) return false;
      await interstitial.show();
      return true;
    },
  };
  return provider;
}
