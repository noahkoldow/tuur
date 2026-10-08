import { Platform } from 'react-native';
import type { AdsProvider, ConsentState, RewardedOutcome } from './types';

/** Development and explicitly configured TestFlight builds always use Google's public test units. */
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
const unit = (kind: 'rewarded' | 'interstitial') => {
  if ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_ADMOB_TEST_ADS === 'true')
    return TEST[kind]!;
  return (
    (kind === 'rewarded'
      ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT
      : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT) ?? TEST[kind]!
  );
};

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
  let preloadGeneration = 0;
  let interstitialRequest:
    | {
        done: (closed: boolean) => void;
        cancel: () => void;
        attempt: () => void;
        shown: boolean;
        finished: Promise<void>;
      }
    | undefined;
  const cancelRewards = new Set<() => void>();

  const allowed = () => consent === 'granted' || consent === 'not_required';
  const clearInterstitial = () => {
    preloadGeneration++;
    preloading = undefined;
    interstitialOff.forEach((off) => off());
    interstitialOff = [];
    interstitial = undefined;
    interstitialReady = false;
  };
  const invalidate = () => {
    consentRevision++;
    const current = interstitialRequest;
    current?.cancel();
    // The SDK cannot dismiss a presented ad. Keep its CLOSED listener and exclusive
    // presentation until the user closes it, even when its initiating flow is gone.
    if (!current?.shown) clearInterstitial();
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
      if (interstitialRequest?.shown)
        return interstitialRequest.finished.then(() => provider.gatherConsent());
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
      if (interstitialRequest?.shown) await interstitialRequest.finished;
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
      const generation = ++preloadGeneration;
      preloading = generation;
      void (async () => {
        await ensureInit();
        if (
          !(await confirmConsent(revision)) ||
          revision !== consentRevision ||
          generation !== preloadGeneration ||
          !allowed()
        )
          return;
        const { InterstitialAd, AdEventType } = sdk();
        const ad = InterstitialAd.createForAdRequest(unit('interstitial'));
        interstitial = ad;
        const finish = (closed: boolean) => {
          if (interstitial !== ad) return;
          interstitialRequest?.done(closed && interstitialRequest.shown);
          clearInterstitial();
        };
        interstitialOff = [
          ad.addAdEventListener(AdEventType.LOADED, () => {
            if (interstitial === ad && revision === consentRevision && allowed()) {
              interstitialReady = true;
              interstitialRequest?.attempt();
            }
          }),
          ad.addAdEventListener(AdEventType.ERROR, () => finish(false)),
          ad.addAdEventListener(AdEventType.CLOSED, () => finish(true)),
        ];
        ad.load();
      })()
        .catch(() => {
          if (generation === preloadGeneration) {
            interstitialRequest?.done(false);
            clearInterstitial();
          }
        })
        .finally(() => {
          if (preloading === generation) preloading = undefined;
        });
    },
    showInterstitial({ waitForReadyMs = 0, signal } = {}) {
      if (interstitialRequest) {
        return interstitialRequest.finished.then(() =>
          signal?.aborted ? false : provider.showInterstitial({ waitForReadyMs, signal }),
        );
      }
      const waitMs = Number.isFinite(waitForReadyMs) ? Math.min(30_000, Math.max(0, waitForReadyMs)) : 0;
      if (!allowed() || signal?.aborted || (!interstitialReady && waitMs === 0))
        return Promise.resolve(false);
      const revision = consentRevision;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let presenting = false;
        let canceled = false;
        let finish!: () => void;
        const finished = new Promise<void>((complete) => {
          finish = complete;
        });
        const done = (closed: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal?.removeEventListener('abort', abort);
          if (interstitialRequest === request) interstitialRequest = undefined;
          clearInterstitial();
          finish();
          resolve(closed && !canceled);
        };
        const abort = () => {
          canceled = true;
          if (!request.shown) done(false);
        };
        const request = {
          done,
          cancel: abort,
          shown: false,
          finished,
          attempt: () => {
            if (settled || presenting || !interstitialReady || !interstitial) return;
            presenting = true;
            const ad = interstitial;
            interstitialReady = false;
            void confirmConsent(revision).then(async (ok) => {
              if (settled) return;
              if (!ok || signal?.aborted || revision !== consentRevision || interstitial !== ad)
                return done(false);
              request.shown = true;
              // The readiness timeout must never continue the tour while the ad is still visible.
              clearTimeout(timeout);
              try {
                await ad.show();
                // Native show() resolves when presented, not when closed. CLOSED settles the request.
              } catch {
                done(false);
              }
            });
          },
        };
        // Also bound the final consent check for an already cached ad.
        const timeout = setTimeout(abort, waitMs || 8_000);
        interstitialRequest = request;
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return abort();
        request.attempt();
        if (!presenting) provider.preloadInterstitial();
      });
    },
  };
  return provider;
}
