import { LENGTH_TIERS, LENGTH_TIER_SECONDS, type LengthTier, type TravelMode } from '../constants';

export interface ParagraphTiming {
  startMs: number;
  durationMs: number;
}

/** Typical speeds used before the smoothed speed is reliable (m/s). */
export const TYPICAL_SPEED: Record<TravelMode, number> = {
  stationary: 0,
  walking: 1.35,
  cycling: 4.2,
  vehicle: 10,
};

export interface PacingPrefs {
  /** Extra seconds by which narration starts before the moment the highlight should land at the stop. */
  leadSec: number;
  /** Upper bound for the narration length (e.g. from a "tell me less" setting). */
  maxTier: LengthTier;
  /** Tier used while cycling (spec 4.6: default short). */
  cyclingTier: LengthTier;
  /** Safety margin subtracted from the available time window. */
  marginSec: number;
}

export const DEFAULT_PACING: PacingPrefs = {
  leadSec: 20,
  maxTier: 'long',
  cyclingTier: 'short',
  marginSec: 10,
};

const tierIndex = (t: LengthTier) => LENGTH_TIERS.indexOf(t);
export const minTier = (a: LengthTier, b: LengthTier): LengthTier => (tierIndex(a) <= tierIndex(b) ? a : b);

/** Seconds until arrival, using the smoothed speed but never assuming faster/slower than plausible for the mode. */
export function etaSeconds(distanceM: number, mode: TravelMode, speedMps: number): number {
  if (mode === 'stationary') return Number.POSITIVE_INFINITY;
  const typical = TYPICAL_SPEED[mode];
  const maximum = mode === 'vehicle' ? 60 : typical * 1.6;
  const v = Math.min(maximum, Math.max(typical * 0.6, speedMps));
  return distanceM / v;
}

/**
 * Longest tier whose spoken duration fits the time window before arrival (spec 4.6). Cycling uses its set cap;
 * car/public-transport travel uses the shortest story as places pass more quickly.
 * The result never exceeds `maxTier`. Windows too small for `short` still return `short`.
 */
export function chooseTier(
  windowSec: number,
  mode: TravelMode,
  prefs: PacingPrefs = DEFAULT_PACING,
): LengthTier {
  const cap =
    mode === 'vehicle'
      ? 'short'
      : mode === 'cycling'
        ? minTier(prefs.maxTier, prefs.cyclingTier)
        : prefs.maxTier;
  const usable = windowSec - prefs.marginSec;
  let pick: LengthTier = 'short';
  for (const t of LENGTH_TIERS) {
    if (LENGTH_TIER_SECONDS[t] <= usable && tierIndex(t) <= tierIndex(cap)) pick = t;
  }
  return pick;
}

export interface NarrationTiming {
  durationMs: number;
  /** Duration of the final paragraph, where the description of what is in front of the listener usually lands. */
  lastParagraphMs: number;
}

/** Nominal timing before the real narration is known. */
export function nominalTiming(tier: LengthTier): NarrationTiming {
  const d = LENGTH_TIER_SECONDS[tier] * 1000;
  return { durationMs: d, lastParagraphMs: tier === 'short' ? d : Math.round(d * 0.3) };
}

/**
 * Seconds before arrival at which the narration should start so that its closing part (the highlight) is
 * spoken at the location, plus the configured lead (spec 4.6).
 */
export function startThresholdSeconds(timing: NarrationTiming, prefs: PacingPrefs = DEFAULT_PACING): number {
  return (timing.durationMs - timing.lastParagraphMs) / 1000 + prefs.leadSec;
}

/** Next tier up, or undefined if already the longest. */
export function nextLongerTier(t: LengthTier): LengthTier | undefined {
  return LENGTH_TIERS[tierIndex(t) + 1];
}

/**
 * "Tell me more" (spec 4.6): the longer narration repeats what was already heard at its beginning, so we skip
 * whole paragraphs covering roughly the time already played and continue seamlessly.
 */
export function resumeParagraphIndex(paragraphs: ParagraphTiming[], alreadyPlayedMs: number): number {
  if (paragraphs.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i]!.startMs + paragraphs[i]!.durationMs <= alreadyPlayedMs + 500) idx = i + 1;
  }
  return Math.min(idx, paragraphs.length - 1);
}

/** Time until the current paragraph ends (0 if between paragraphs), used to stop cleanly (never mid-sentence). */
export function msToParagraphEnd(paragraphs: ParagraphTiming[], positionMs: number): number {
  for (const p of paragraphs) {
    const end = p.startMs + p.durationMs;
    if (positionMs < end) return Math.max(0, end - positionMs);
  }
  return 0;
}
