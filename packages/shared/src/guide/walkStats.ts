import { distanceMeters, type LatLng } from '../geo/geohash';

export interface TrackPoint extends LatLng {
  ts: number;
}

/** Keeps the walked track small (device storage, share image): a point only after `minStepM` of movement. */
export function appendTrackPoint(track: TrackPoint[], p: TrackPoint, minStepM = 15): TrackPoint[] {
  const last = track[track.length - 1];
  if (last && distanceMeters(last, p) < minStepM) return track;
  // GPS jumps (> 60 m/s ~ 216 km/h) are dropped instead of drawn
  if (last && p.ts > last.ts && distanceMeters(last, p) / ((p.ts - last.ts) / 1000) > 60) return track;
  return [...track, p];
}

export interface WalkSummary {
  durationMs: number;
  /** Time actually moving (segments faster than 0.5 m/s). */
  movingMs: number;
  distanceM: number;
  /** Minutes per km while moving; undefined for very short walks. */
  paceMinPerKm?: number;
  stops: number;
}

/** Strava-like numbers of a finished tour, computed on the device from the walked track. */
export function summarizeWalk(
  track: TrackPoint[],
  stops: number,
  startedAt?: number,
  endedAt?: number,
): WalkSummary {
  let distanceM = 0;
  let movingMs = 0;
  for (let i = 1; i < track.length; i++) {
    const d = distanceMeters(track[i - 1]!, track[i]!);
    const dt = track[i]!.ts - track[i - 1]!.ts;
    distanceM += d;
    if (dt > 0 && d / (dt / 1000) >= 0.5) movingMs += dt;
  }
  const first = startedAt ?? track[0]?.ts ?? 0;
  const last = endedAt ?? track[track.length - 1]?.ts ?? first;
  const pace = distanceM >= 200 && movingMs > 0 ? movingMs / 60000 / (distanceM / 1000) : undefined;
  return {
    durationMs: Math.max(0, last - first),
    movingMs,
    distanceM: Math.round(distanceM),
    ...(pace ? { paceMinPerKm: Math.round(pace * 10) / 10 } : {}),
    stops,
  };
}
