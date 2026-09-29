import { bearingDegrees, destinationPoint, distanceMeters, type LatLng } from '../geo/geohash';
import type { Fix } from './travel';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SpeedSegment {
  /** applies until this many meters along the path (Infinity for the rest) */
  untilMeters: number;
  speedMps: number;
}

export interface SimulateOptions {
  startTs: number;
  /** constant speed, or a profile by distance along the path */
  speedMps?: number;
  profile?: SpeedSegment[];
  /** fixes per second */
  hz?: number;
  /** GPS noise standard deviation in meters */
  noiseM?: number;
  seed?: number;
  /** pauses: standing still for `seconds` when `atMeters` along the path is reached */
  stops?: { atMeters: number; seconds: number }[];
}

export function pathLength(path: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += distanceMeters(path[i - 1]!, path[i]!);
  return d;
}

/** Point at `meters` along a polyline plus the local heading. */
export function pointAlong(path: LatLng[], meters: number): { point: LatLng; heading: number } {
  let left = meters;
  for (let i = 1; i < path.length; i++) {
    const seg = distanceMeters(path[i - 1]!, path[i]!);
    if (left <= seg || i === path.length - 1) {
      const heading = bearingDegrees(path[i - 1]!, path[i]!);
      return { point: destinationPoint(path[i - 1]!, heading, Math.min(left, seg)), heading };
    }
    left -= seg;
  }
  return { point: path[0]!, heading: 0 };
}

/**
 * Deterministic GPS simulation along a polyline (used by the in-app simulator, tests and demo mode):
 * emits one fix per 1/hz seconds with optional noise, speed profile and standing pauses.
 */
export function simulateRoute(path: LatLng[], opt: SimulateOptions): Fix[] {
  const hz = opt.hz ?? 1;
  const dt = 1 / hz;
  const rnd = mulberry32(opt.seed ?? 1);
  const total = pathLength(path);
  const fixes: Fix[] = [];
  let dist = 0;
  let ts = opt.startTs;
  const pending = [...(opt.stops ?? [])].sort((a, b) => a.atMeters - b.atMeters);
  let standing = 0;
  const speedAt = (m: number) =>
    opt.profile?.find((p) => m <= p.untilMeters)?.speedMps ?? opt.speedMps ?? 1.35;
  const noise = () => (rnd() + rnd() + rnd() - 1.5) * (opt.noiseM ?? 0) * 1.15;
  for (let guard = 0; guard < 500_000; guard++) {
    const { point, heading } = pointAlong(path, Math.min(dist, total));
    const speed = standing > 0 ? 0 : speedAt(dist);
    const jittered = opt.noiseM ? destinationPoint(point, rnd() * 360, Math.abs(noise())) : point;
    fixes.push({
      lat: jittered.lat,
      lng: jittered.lng,
      ts: Math.round(ts),
      accuracy: 5 + (opt.noiseM ?? 0),
      speed,
      heading,
    });
    if (dist >= total && standing <= 0) break;
    ts += dt * 1000;
    if (standing > 0) {
      standing -= dt;
      continue;
    }
    dist += speed * dt;
    const next = pending[0];
    if (next && dist >= next.atMeters) {
      standing = next.seconds;
      pending.shift();
    }
  }
  return fixes;
}
