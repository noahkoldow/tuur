import type { TravelMode } from '../constants';
import { distanceMeters, type LatLng } from '../geo/geohash';

export interface Fix extends LatLng {
  /** epoch ms */
  ts: number;
  /** horizontal accuracy in meters */
  accuracy?: number;
  /** device-reported speed in m/s (negative or NaN = unknown) */
  speed?: number;
  /** degrees, direction of travel */
  heading?: number;
  /** optional OS activity recognition hint */
  activity?: 'stationary' | 'walking' | 'cycling' | 'automotive';
}

export interface TravelState {
  mode: TravelMode;
  /** exponentially smoothed speed in m/s */
  speedMps: number;
  last?: Fix;
  candidate?: { mode: TravelMode; sinceTs: number };
  /** when the current stationary phase began */
  stationarySinceTs?: number;
  /** smoothed heading in degrees, if known */
  heading?: number;
}

export const SPEED_LIMITS = {
  /** below: standing still */
  stationary: 0.5,
  /** up to jogging pace */
  walking: 3.2,
  /** up to ~34 km/h (e-bike); above this we assume a vehicle */
  cycling: 9.5,
  /** faster than this between two fixes is treated as a GPS glitch */
  glitch: 60,
} as const;

/** How long a new mode must persist before we switch (prevents flapping at traffic lights etc.). */
const HOLD_MS: Record<TravelMode, number> = {
  stationary: 4_000,
  walking: 4_000,
  cycling: 6_000,
  vehicle: 10_000,
};
const SMOOTHING_TAU_S = 8;
const MAX_ACCURACY_M = 60;

export const initialTravel = (): TravelState => ({ mode: 'stationary', speedMps: 0 });

export function classifySpeed(mps: number): TravelMode {
  if (mps < SPEED_LIMITS.stationary) return 'stationary';
  if (mps <= SPEED_LIMITS.walking) return 'walking';
  if (mps <= SPEED_LIMITS.cycling) return 'cycling';
  return 'vehicle';
}

function angleLerp(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** Feeds one GPS fix; pure. Poor-accuracy or nonsensical fixes leave the state unchanged. */
export function updateTravel(prev: TravelState, fix: Fix): TravelState {
  if ((fix.accuracy ?? 0) > MAX_ACCURACY_M) return prev;
  const last = prev.last;
  if (!last) return { ...prev, last: fix, ...(fix.heading !== undefined ? { heading: fix.heading } : {}) };
  const dt = (fix.ts - last.ts) / 1000;
  if (dt <= 0) return prev;
  const dist = distanceMeters(last, fix);
  const reported =
    fix.speed !== undefined && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : undefined;
  const inst = reported ?? dist / dt;
  if (inst > SPEED_LIMITS.glitch) return prev;

  const alpha = 1 - Math.exp(-dt / SMOOTHING_TAU_S);
  const speedMps = prev.speedMps + alpha * (inst - prev.speedMps);
  let raw = classifySpeed(speedMps);
  // The OS activity hint only breaks ties near thresholds; it never overrules clear speed evidence.
  if (fix.activity === 'automotive' && speedMps > 3.5) raw = 'vehicle';
  if (fix.activity === 'walking' && raw === 'cycling' && speedMps < 4.2) raw = 'walking';

  let mode = prev.mode;
  let candidate = prev.candidate;
  if (raw === prev.mode) candidate = undefined;
  else if (!candidate || candidate.mode !== raw) candidate = { mode: raw, sinceTs: fix.ts };
  else if (fix.ts - candidate.sinceTs >= HOLD_MS[raw]) {
    mode = raw;
    candidate = undefined;
  }
  const heading =
    dist >= 3 && inst >= 0.5
      ? prev.heading === undefined
        ? (fix.heading ?? bearing(last, fix))
        : angleLerp(prev.heading, fix.heading ?? bearing(last, fix), 0.35)
      : prev.heading;
  const stationarySinceTs =
    mode === 'stationary'
      ? prev.mode === 'stationary'
        ? (prev.stationarySinceTs ?? fix.ts)
        : fix.ts
      : undefined;
  return {
    mode,
    speedMps,
    last: fix,
    ...(candidate ? { candidate } : {}),
    ...(stationarySinceTs !== undefined ? { stationarySinceTs } : {}),
    ...(heading !== undefined ? { heading } : {}),
  };
}

function bearing(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x =
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
