import { Platform } from 'react-native';
import type { AdsProvider, ConsentState, RewardedOutcome } from './types';

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

export function createAdMobAds(sdk: () => Ads = ads): AdsProvider {
  let consent: ConsentState = 'unknown';
  let initialized = false;
  let initializing: Promise<void> | undefined;
  let consentRevision = 0;
  let gathering: Promise<ConsentState> | undefined;
  let interstitial: ReturnType<Ads['InterstitialAd']['createForAdRequest']> | undefined;
  let interstitialReady = false;
  let interstitialOff: (() => void)[] = [];
  let preloading: number | undefined;
  const cancelRewards = new Set<() => void>();

  const allowed = () => consent === 'granted' || consent === 'not_required';
  const clearInterstitial = () => {
    interstitialOff.forEach((off) => off());
    interstitialOff = [];
    interstitial = undefined;
    interstitialReady = false;
  };
  const invalidate = () => {
    consentRevision++;
    clearInterstitial();
    preloading = undefined;
    for (const cancel of cancelRewards) cancel();
    return consentRevision;
  };
  const applyConsent = (info: Awaited<ReturnType<Ads['AdsConsent']['getConsentInfo']>>) => {
    consent = !info.canRequestAds
      ? 'denied_limited'
      : info.status === sdk().AdsConsentStatus.NOT_REQUIRED
        ? 'not_required'
        : 'granted';
    if (!allowed()) invalidate();
  };
  // UMP may change while an ad loads. Check again before requesting or presenting an ad.
  const confirmConsent = async (revision: number) => {
    if (revision !== consentRevision || !allowed()) return false;
    try {
      const info = await sdk().AdsConsent.getConsentInfo();
      if (revision !== consentRevision) return false;
      applyConsent(info);
      return revision === consentRevision && allowed();
    } catch {
      if (revision === consentRevision) {
        consent = 'unknown';
        invalidate();
      }
      return false;
    }
  };

  const ensureInit = async () => {
    if (initialized) return;
    initializing ??= (async () => {
      const { default: MobileAds, MaxAdContentRating } = sdk();
      await MobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.T,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await MobileAds().initialize();
      initialized = true;
    })().finally(() => {
      initializing = undefined;
    });
    return initializing;
  };

  const provider: AdsProvider = {
    gatherConsent() {
      if (gathering) return gathering;
      const revision = invalidate();
      consent = 'unknown';
      gathering = (async () => {
        try {
          const info = await sdk().AdsConsent.gatherConsent();
          if (revision !== consentRevision) return consent;
          applyConsent(info);
          if (allowed()) await ensureInit();
        } catch {
          if (revision === consentRevision) consent = 'unknown';
        }
        return consent;
      })().finally(() => {
        gathering = undefined;
      });
      return gathering;
    },
    consent: () => consent,
    async showRewarded({ userId, nonce }) {
      if (!allowed()) return 'unavailable';
      const revision = consentRevision;
      try {
        await ensureInit();
      } catch {
        return 'unavailable';
      }
      if (!(await confirmConsent(revision)) || revision !== consentRevision || !allowed())
        return 'unavailable';
      const { RewardedAd, RewardedAdEventType, AdEventType } = sdk();
      const ad = RewardedAd.createForAdRequest(unit('rewarded'), {
        serverSideVerificationOptions: { userId, customData: nonce },
      });
      return new Promise((resolve) => {
        let earned = false;
        let settled = false;
        const off: (() => void)[] = [];
        const done = (r: RewardedOutcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          off.forEach((f) => f());
          cancelRewards.delete(cancel);
          resolve(r);
        };
        const cancel = () => done('unavailable');
        const timeout = setTimeout(cancel, 60_000);
        cancelRewards.add(cancel);
        off.push(
          ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
            void confirmConsent(revision).then(async (ok) => {
              if (settled) return;
              if (!ok) return done('unavailable');
              clearTimeout(timeout);
              try {
                await ad.show();
              } catch {
                done('unavailable');
              }
            });
          }),
          ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => (earned = true)),
          ad.addAdEventListener(AdEventType.CLOSED, () => done(earned ? 'earned' : 'dismissed')),
          ad.addAdEventListener(AdEventType.ERROR, () => done('unavailable')),
        );
        try {
          ad.load();
        } catch {
          done('unavailable');
        }
      });
    },
    async showPrivacyOptions() {
      // Discard already loaded ads even if the new consent also permits ads: targeting choices may have changed.
      const revision = invalidate();
      consent = 'unknown';
      try {
        const { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus } = sdk();
        const info = await AdsConsent.requestInfoUpdate();
        if (revision !== consentRevision) return false;
        if (info.privacyOptionsRequirementStatus !== AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) {
          applyConsent(info);
          return false;
        }
        const updated = await AdsConsent.showPrivacyOptionsForm();
        if (revision === consentRevision) applyConsent(updated);
        return true;
      } catch {
        return false;
      }
    },
    preloadInterstitial() {
      if (!allowed() || interstitial || preloading !== undefined) return;
      const revision = consentRevision;
      preloading = revision;
      void (async () => {
        await ensureInit();
        if (!(await confirmConsent(revision)) || revision !== consentRevision || !allowed()) return;
        const { InterstitialAd, AdEventType } = sdk();
        const ad = InterstitialAd.createForAdRequest(unit('interstitial'));
        interstitial = ad;
        const clear = () => {
          if (interstitial === ad) clearInterstitial();
        };
        interstitialOff = [
          ad.addAdEventListener(AdEventType.LOADED, () => {
            if (interstitial === ad && revision === consentRevision && allowed()) interstitialReady = true;
          }),
          ad.addAdEventListener(AdEventType.ERROR, clear),
          ad.addAdEventListener(AdEventType.CLOSED, clear),
        ];
        ad.load();
      })()
        .catch(() => {
          if (revision === consentRevision) clearInterstitial();
        })
        .finally(() => {
          if (preloading === revision) preloading = undefined;
        });
    },
    async showInterstitial() {
      const ad = interstitial;
      if (!ad || !interstitialReady || !allowed()) return false;
      interstitialReady = false;
      if (!(await confirmConsent(consentRevision)) || interstitial !== ad) return false;
      try {
        await ad.show();
        return true;
      } catch {
        if (interstitial === ad) clearInterstitial();
        return false;
      }
    },
  };
  return provider;
}
