import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { select: (choices: { ios: string }) => choices.ios } }));
import { createAdMobAds } from './admob';

type Ads = typeof import('react-native-google-mobile-ads');
const allowed = { canRequestAds: true, status: 'obtained', privacyOptionsRequirementStatus: 'required' };
const denied = { ...allowed, canRequestAds: false };
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};

function mockAd() {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    addAdEventListener: vi.fn((event: string, callback: () => void) => {
      listeners.set(event, callback);
      return () => listeners.delete(event);
    }),
    load: vi.fn(),
    show: vi.fn().mockResolvedValue(undefined),
    emit(event: string) {
      listeners.get(event)?.();
    },
  };
}

function setup() {
  const interstitial = mockAd();
  const rewarded = mockAd();
  const AdsConsent = {
    gatherConsent: vi.fn().mockResolvedValue(allowed),
    getConsentInfo: vi.fn().mockResolvedValue(allowed),
    requestInfoUpdate: vi.fn().mockResolvedValue(allowed),
    showPrivacyOptionsForm: vi.fn().mockResolvedValue(denied),
  };
  const sdk = {
    AdsConsent,
    AdsConsentStatus: { NOT_REQUIRED: 'not_required' },
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'required' },
    MaxAdContentRating: { T: 'T' },
    default: () => ({
      setRequestConfiguration: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    }),
    InterstitialAd: { createForAdRequest: vi.fn(() => interstitial) },
    RewardedAd: { createForAdRequest: vi.fn(() => rewarded) },
    AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' },
    RewardedAdEventType: { LOADED: 'loaded', EARNED_REWARD: 'earned' },
  };
  return { sdk, interstitial, rewarded, provider: createAdMobAds(() => sdk as unknown as Ads) };
}

describe('AdMob consent changes', () => {
  it('discards a cached interstitial and all listeners when privacy choices are changed', async () => {
    const { provider, interstitial } = setup();
    await provider.gatherConsent();
    provider.preloadInterstitial();
    await flush();
    const lateLoaded = interstitial.listeners.get('loaded')!;
    interstitial.emit('loaded');
    await expect(provider.showPrivacyOptions()).resolves.toBe(true);
    lateLoaded();
    expect(provider.consent()).toBe('denied_limited');
    expect(interstitial.listeners.size).toBe(0);
    await expect(provider.showInterstitial()).resolves.toBe(false);
    expect(interstitial.show).not.toHaveBeenCalled();
  });

  it('does not request an ad if consent changes during preload', async () => {
    const { provider, sdk } = setup();
    await provider.gatherConsent();
    let release!: (value: typeof allowed) => void;
    sdk.AdsConsent.getConsentInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    provider.preloadInterstitial();
    provider.preloadInterstitial();
    await flush();
    await provider.showPrivacyOptions();
    release(allowed);
    await flush();
    expect(sdk.InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
  });

  it('rechecks native consent immediately before presentation', async () => {
    const { provider, sdk, interstitial } = setup();
    await provider.gatherConsent();
    provider.preloadInterstitial();
    await flush();
    interstitial.emit('loaded');
    sdk.AdsConsent.getConsentInfo.mockResolvedValue(denied);
    await expect(provider.showInterstitial()).resolves.toBe(false);
    expect(interstitial.show).not.toHaveBeenCalled();
    expect(interstitial.listeners.size).toBe(0);
  });

  it('cancels a rewarded ad loading under old consent and releases its listeners', async () => {
    const { provider, rewarded } = setup();
    await provider.gatherConsent();
    const result = provider.showRewarded({ userId: 'uid', nonce: 'nonce' });
    await flush();
    const lateLoaded = rewarded.listeners.get('loaded')!;
    await provider.showPrivacyOptions();
    lateLoaded();
    await expect(result).resolves.toBe('unavailable');
    expect(rewarded.listeners.size).toBe(0);
    expect(rewarded.show).not.toHaveBeenCalled();
  });

  it('resolves a rejected native rewarded show instead of hanging', async () => {
    const { provider, rewarded } = setup();
    await provider.gatherConsent();
    rewarded.show.mockRejectedValue(new Error('cannot display'));
    const result = provider.showRewarded({ userId: 'uid', nonce: 'nonce' });
    await flush();
    rewarded.emit('loaded');
    await expect(result).resolves.toBe('unavailable');
    expect(rewarded.listeners.size).toBe(0);
  });

  it('allows only one preload and detaches listeners after close', async () => {
    const { provider, sdk, interstitial } = setup();
    await provider.gatherConsent();
    provider.preloadInterstitial();
    provider.preloadInterstitial();
    await flush();
    expect(sdk.InterstitialAd.createForAdRequest).toHaveBeenCalledOnce();
    interstitial.emit('loaded');
    await expect(provider.showInterstitial()).resolves.toBe(true);
    interstitial.emit('closed');
    expect(interstitial.listeners.size).toBe(0);
  });
});
