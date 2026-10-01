import { describe, expect, it } from 'vitest';
import { appendTrackPoint, summarizeWalk, type TrackPoint } from './walkStats';

// ~111 m per 0.001 deg latitude
const at = (i: number, ts: number): TrackPoint => ({ lat: 52.5 + i * 0.001, lng: 13.4, ts });

describe('walk track and summary', () => {
  it('thins the track and drops GPS jumps', () => {
    let t: TrackPoint[] = [];
    t = appendTrackPoint(t, at(0, 0));
    t = appendTrackPoint(t, { lat: 52.50005, lng: 13.4, ts: 5_000 }); // 5 m: skipped
    t = appendTrackPoint(t, at(1, 80_000));
    t = appendTrackPoint(t, at(50, 81_000)); // 5 km in 1 s: jump
    expect(t).toHaveLength(2);
  });

  it('sums distance, moving time and pace for a walk with a pause', () => {
    const track = [at(0, 0), at(1, 80_000), at(2, 160_000), at(2, 460_000), at(3, 540_000)].filter(
      (p, i, a) => i === 0 || p.lat !== a[i - 1]!.lat || true,
    );
    const s = summarizeWalk(track, 2, 0, 600_000);
    expect(s.distanceM).toBeGreaterThan(320);
    expect(s.distanceM).toBeLessThan(345);
    expect(s.movingMs).toBe(240_000);
    expect(s.durationMs).toBe(600_000);
    expect(s.paceMinPerKm).toBeCloseTo(12, 0);
    expect(s.stops).toBe(2);
  });

  it('has no pace for tiny walks', () => {
    expect(summarizeWalk([at(0, 0), at(1, 60_000)], 0).paceMinPerKm).toBeUndefined();
  });
});
