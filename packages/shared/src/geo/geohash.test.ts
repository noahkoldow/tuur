import { describe, expect, it } from 'vitest';
import {
  tilesAround,
  angleDiff,
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  encodeGeohash,
  geohashBounds,
  geohashCenter,
  geohashNeighbors,
  isValidGeohash,
} from './geohash';

describe('geohash', () => {
  it('encodes known reference values', () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(52.52, 13.405, 6)).toBe('u33dc0');
  });

  it('round-trips: center of a cell encodes back to the cell', () => {
    for (const [lat, lng] of [
      [35.0116, 135.7681],
      [-33.8688, 151.2093],
      [64.1466, -21.9426],
      [0, 0],
    ] as const) {
      const h = encodeGeohash(lat, lng, 6);
      const c = geohashCenter(h);
      expect(encodeGeohash(c.lat, c.lng, 6)).toBe(h);
      const b = geohashBounds(h);
      expect(lat).toBeGreaterThanOrEqual(b.south);
      expect(lat).toBeLessThanOrEqual(b.north);
    }
  });

  it('returns 8 distinct adjacent neighbors', () => {
    const h = encodeGeohash(48.1374, 11.5755, 6);
    const n = geohashNeighbors(h);
    expect(n).toHaveLength(8);
    expect(new Set(n).size).toBe(8);
    expect(n).not.toContain(h);
    const c = geohashCenter(h);
    for (const x of n) expect(distanceMeters(c, geohashCenter(x))).toBeLessThan(2_000);
  });

  it('wraps neighbors across the antimeridian and skips beyond the poles', () => {
    const n = geohashNeighbors(encodeGeohash(0, 179.999, 5));
    expect(n.some((x) => geohashCenter(x).lng < -170)).toBe(true);
    expect(geohashNeighbors(encodeGeohash(89.999, 10, 5)).length).toBeLessThan(8);
  });

  it('validates input', () => {
    expect(isValidGeohash('u33dc0', 6)).toBe(true);
    expect(isValidGeohash('u33dca')).toBe(false);
    expect(() => encodeGeohash(91, 0, 6)).toThrow();
    expect(() => geohashBounds('xxa')).toThrow();
  });

  it('computes distance, bearing, destination and angle differences consistently', () => {
    const a = { lat: 52.52, lng: 13.405 };
    const b = destinationPoint(a, 90, 1000);
    expect(distanceMeters(a, b)).toBeCloseTo(1000, 0);
    expect(bearingDegrees(a, b)).toBeCloseTo(90, 0);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
  });
});

describe('tilesAround', () => {
  it('returns 1, 9 and 25 distinct cells for 0, 1 and 2 rings, center first', () => {
    const h = encodeGeohash(52.52, 13.405, 6);
    expect(tilesAround(h, 0)).toEqual([h]);
    expect(tilesAround(h, 1)).toHaveLength(9);
    const r2 = tilesAround(h, 2);
    expect(r2).toHaveLength(25);
    expect(r2[0]).toBe(h);
    expect(new Set(r2).size).toBe(25);
  });
});
