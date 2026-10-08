export type ConsentState = 'granted' | 'not_required' | 'unknown' | 'denied_limited';

export type RewardedOutcome = 'earned' | 'dismissed' | 'unavailable';

export interface InterstitialOptions {
  /** Maximum time to wait for an ad to become ready; omitted means use only a cached ad. */
  waitForReadyMs?: number;
  /** Cancels pending loading; an already presented ad stays exclusive until CLOSED, then returns false. */
  signal?: AbortSignal;
}

/**
 * Ads (AdMob). Nothing is requested before the UMP consent flow has run; subscribers never see ads. The reward itself is
 * granted by the server after server-side verification (userId + nonce as customData), never by this result.
 */
export interface AdsProvider {
  /** Runs the UMP consent form when required; must complete before any ad request. */
  gatherConsent(): Promise<ConsentState>;
  consent(): ConsentState;
  /** Shows a rewarded ad with SSV options; resolves when the ad is closed. */
  showRewarded(o: { userId: string; nonce: string }): Promise<RewardedOutcome>;
  /** Re-opens the UMP privacy options form (withdraw or change ad consent); false when not applicable. */
  showPrivacyOptions(): Promise<boolean>;
  /** Preloads an interstitial without presenting it. */
  preloadInterstitial(): void;
  /** Resolves true only after the presented ad closes; false for unavailable, canceled or failed ads. */
  showInterstitial(options?: InterstitialOptions): Promise<boolean>;
}
