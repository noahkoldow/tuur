import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { select: (choices: { ios: string }) => choices.ios } }));
import { createAdMobAds } from './admob';

type Ads = typeof import('react-native-google-mobile-ads');
const allowed = { canRequestAds: true, status: 'obtained', privacyOptionsRequirementStatus: 'required' };
const denied = { ...allowed, canRequestAds: false };
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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
    const result = provider.showInterstitial();
    const settled = vi.fn();
    void result.then(settled);
    await flush();
    expect(interstitial.show).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    interstitial.emit('closed');
    await expect(result).resolves.toBe(true);
    expect(interstitial.listeners.size).toBe(0);
  });

  it('waits for preload, then waits for closure rather than the native show promise', async () => {
    vi.useFakeTimers();
    const { provider, interstitial } = setup();
    await provider.gatherConsent();
    const result = provider.showInterstitial({ waitForReadyMs: 8_000 });
    const settled = vi.fn();
    void result.then(settled);
    await flush();
    expect(interstitial.load).toHaveBeenCalledOnce();
    expect(interstitial.show).not.toHaveBeenCalled();
    interstitial.emit('loaded');
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(interstitial.show).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    const duplicate = provider.showInterstitial();
    const duplicateSettled = vi.fn();
    void duplicate.then(duplicateSettled);
    await flush();
    expect(duplicateSettled).not.toHaveBeenCalled();
    interstitial.emit('closed');
    await expect(result).resolves.toBe(true);
    await expect(duplicate).resolves.toBe(false);
  });

  it('keeps a canceled visible ad exclusive until CLOSED and blocks a later fallback', async () => {
    const { provider, interstitial, sdk } = setup();
    await provider.gatherConsent();
    const firstController = new AbortController();
    const first = provider.showInterstitial({ waitForReadyMs: 8_000, signal: firstController.signal });
    const firstSettled = vi.fn();
    void first.then(firstSettled);
    await flush();
    interstitial.emit('loaded');
    await flush();
    firstController.abort();
    const later = provider.showInterstitial();
    const laterSettled = vi.fn();
    void later.then(laterSettled);
    await flush();
    expect(firstSettled).not.toHaveBeenCalled();
    expect(laterSettled).not.toHaveBeenCalled();
    expect(interstitial.listeners.has('closed')).toBe(true);
    expect(sdk.InterstitialAd.createForAdRequest).toHaveBeenCalledOnce();
    interstitial.emit('closed');
    await expect(first).resolves.toBe(false);
    await expect(later).resolves.toBe(false);
    expect(interstitial.listeners.size).toBe(0);
  });

  it('does not start a queued ad whose caller cancels while another ad is visible', async () => {
    const { provider, interstitial, sdk } = setup();
    await provider.gatherConsent();
    const first = provider.showInterstitial({ waitForReadyMs: 8_000 });
    await flush();
    interstitial.emit('loaded');
    await flush();
    const laterController = new AbortController();
    const later = provider.showInterstitial({ waitForReadyMs: 8_000, signal: laterController.signal });
    laterController.abort();
    interstitial.emit('closed');
    await expect(first).resolves.toBe(true);
    await expect(later).resolves.toBe(false);
    expect(sdk.InterstitialAd.createForAdRequest).toHaveBeenCalledOnce();
  });

  it('keeps consent dialogs behind a visible ad rather than replacing its close listener', async () => {
    const { provider, interstitial, sdk } = setup();
    await provider.gatherConsent();
    const visible = provider.showInterstitial({ waitForReadyMs: 8_000 });
    await flush();
    interstitial.emit('loaded');
    await flush();
    const privacy = provider.showPrivacyOptions();
    await flush();
    expect(sdk.AdsConsent.requestInfoUpdate).not.toHaveBeenCalled();
    expect(interstitial.listeners.has('closed')).toBe(true);
    interstitial.emit('closed');
    await expect(visible).resolves.toBe(true);
    await expect(privacy).resolves.toBe(true);
    expect(sdk.AdsConsent.requestInfoUpdate).toHaveBeenCalledOnce();
    expect(provider.consent()).toBe('denied_limited');
  });

  it('times out an unavailable ad and ignores its late load event', async () => {
    vi.useFakeTimers();
    const { provider, interstitial } = setup();
    await provider.gatherConsent();
    const result = provider.showInterstitial({ waitForReadyMs: 8_000 });
    await flush();
    const lateLoaded = interstitial.listeners.get('loaded')!;
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toBe(false);
    lateLoaded();
    await flush();
    expect(interstitial.show).not.toHaveBeenCalled();
    expect(interstitial.listeners.size).toBe(0);
  });

  it('does not show a canceled ad even if the final native consent check returns later', async () => {
    const { provider, sdk, interstitial } = setup();
    await provider.gatherConsent();
    const controller = new AbortController();
    const result = provider.showInterstitial({ waitForReadyMs: 8_000, signal: controller.signal });
    await flush();
    let release!: (value: typeof allowed) => void;
    sdk.AdsConsent.getConsentInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    interstitial.emit('loaded');
    await flush();
    controller.abort();
    await expect(result).resolves.toBe(false);
    release(allowed);
    await flush();
    expect(interstitial.show).not.toHaveBeenCalled();
    expect(interstitial.listeners.size).toBe(0);
  });

  it('invalidates a pending preload when its initiating tour is canceled', async () => {
    const { provider, sdk } = setup();
    await provider.gatherConsent();
    let release!: (value: typeof allowed) => void;
    sdk.AdsConsent.getConsentInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const result = provider.showInterstitial({ waitForReadyMs: 8_000, signal: controller.signal });
    await flush();
    controller.abort();
    release(allowed);
    await expect(result).resolves.toBe(false);
    await flush();
    expect(sdk.InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
  });

  it('resolves a pending interstitial when consent is withdrawn', async () => {
    const { provider, interstitial } = setup();
    await provider.gatherConsent();
    const result = provider.showInterstitial({ waitForReadyMs: 8_000 });
    await flush();
    const lateLoaded = interstitial.listeners.get('loaded')!;
    await provider.showPrivacyOptions();
    await expect(result).resolves.toBe(false);
    lateLoaded();
    expect(interstitial.show).not.toHaveBeenCalled();
    expect(interstitial.listeners.size).toBe(0);
  });

  it.each(['load', 'show'] as const)('releases an interstitial when native %s fails', async (phase) => {
    const { provider, interstitial } = setup();
    await provider.gatherConsent();
    if (phase === 'load')
      interstitial.load.mockImplementation(() => {
        throw new Error('cannot load');
      });
    else interstitial.show.mockRejectedValue(new Error('cannot show'));
    const result = provider.showInterstitial({ waitForReadyMs: 8_000 });
    await flush();
    if (phase === 'show') interstitial.emit('loaded');
    await expect(result).resolves.toBe(false);
    expect(interstitial.listeners.size).toBe(0);
  });

  it.each(['testflight', 'development'] as const)(
    'forces both test units in %s even with production IDs',
    async (mode) => {
      vi.stubEnv('EXPO_PUBLIC_ADMOB_REWARDED_UNIT', 'ca-app-pub-5666991539216529/6260074942');
      vi.stubEnv('EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT', 'ca-app-pub-5666991539216529/3765773549');
      vi.stubEnv('EXPO_PUBLIC_ADMOB_TEST_ADS', mode === 'testflight' ? 'true' : 'false');
      vi.stubGlobal('__DEV__', mode === 'development');
      const { provider, sdk, rewarded } = setup();
      await provider.gatherConsent();
      provider.preloadInterstitial();
      const reward = provider.showRewarded({ userId: 'uid', nonce: 'nonce' });
      await flush();
      expect(sdk.InterstitialAd.createForAdRequest).toHaveBeenCalledWith(
        'ca-app-pub-3940256099942544/4411468910',
      );
      expect(sdk.RewardedAd.createForAdRequest).toHaveBeenCalledWith(
        'ca-app-pub-3940256099942544/1712485313',
        expect.anything(),
      );
      rewarded.emit('error');
      await expect(reward).resolves.toBe('unavailable');
    },
  );
});
