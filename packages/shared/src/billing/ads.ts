/** Interstitial policy (spec 6.2): only between two waypoints, never while audio plays, frequency capped, never for subscribers. */
export interface InterstitialState {
  now: number;
  lastShownAt: number | undefined;
  shownToday: number;
  /** Waypoints completed since the last interstitial. */
  stopsSinceLast: number;
  subscriber: boolean;
  /** UMP consent state: ads may only be requested after the consent flow (EU). */
  consent: 'granted' | 'not_required' | 'unknown' | 'denied_limited';
  audioPlaying: boolean;
  /** True in the gap between finishing one stop and starting the next. */
  betweenWaypoints: boolean;
}

export interface InterstitialLimits {
  minGapMs: number;
  dailyCap: number;
  minStopsBetween: number;
}

export const DEFAULT_INTERSTITIAL_LIMITS: InterstitialLimits = {
  minGapMs: 8 * 60_000,
  dailyCap: 4,
  minStopsBetween: 2,
};

export type InterstitialDecision =
  | { show: true }
  | {
      show: false;
      reason: 'subscriber' | 'consent' | 'audio' | 'not_between' | 'cap_daily' | 'cap_gap' | 'too_soon';
    };

export function decideInterstitial(
  s: InterstitialState,
  limits: InterstitialLimits = DEFAULT_INTERSTITIAL_LIMITS,
): InterstitialDecision {
  if (s.subscriber) return { show: false, reason: 'subscriber' };
  if (s.consent === 'unknown') return { show: false, reason: 'consent' };
  if (s.audioPlaying) return { show: false, reason: 'audio' };
  if (!s.betweenWaypoints) return { show: false, reason: 'not_between' };
  if (s.shownToday >= limits.dailyCap) return { show: false, reason: 'cap_daily' };
  if (s.lastShownAt !== undefined && s.now - s.lastShownAt < limits.minGapMs)
    return { show: false, reason: 'cap_gap' };
  if (s.stopsSinceLast < limits.minStopsBetween) return { show: false, reason: 'too_soon' };
  return { show: true };
}

export const REWARDED_DAILY_LIMIT_DEFAULT = 3;

export type RewardDecision = { ok: true; remaining: number } | { ok: false; reason: 'daily_limit' };

/** Server-side daily limit for rewarded-ad tours (spec 6.2). */
export function decideReward(
  grantedToday: number,
  dailyLimit = REWARDED_DAILY_LIMIT_DEFAULT,
): RewardDecision {
  return grantedToday >= dailyLimit
    ? { ok: false, reason: 'daily_limit' }
    : { ok: true, remaining: dailyLimit - grantedToday - 1 };
}
