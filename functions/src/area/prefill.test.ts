import { describe, expect, it } from 'vitest';
import { encodeGeohash, geohashBounds } from '@tuur/shared';
import { canClaimForPrefill, PREFILL_PRESETS, prefillTiles } from './prefill';
import { parseBetaRegion } from './betaSnapshot';

const preset = PREFILL_PRESETS['berlin-inner']!;
const now = Date.parse('2026-10-08T12:00:00Z');

describe('area prefill planning', () => {
  const tiles = prefillTiles(preset.bounds, preset.center);

  it('covers the inner Berlin ring with unique six-character tiles, nearest first', () => {
    expect(tiles.length).toBeGreaterThan(150);
    expect(tiles.length).toBeLessThan(500);
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(tiles.every((tile) => /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(tile))).toBe(true);
    expect(tiles[0]).toBe(encodeGeohash(preset.center.lat, preset.center.lng, 6));
  });

  it('stays inside the Berlin ABC beta region, so the deployed gate accepts every tile', () => {
    const region = parseBetaRegion('52.28,12.90,52.78,13.92')!;
    for (const tile of tiles) {
      const b = geohashBounds(tile);
      expect((b.south + b.north) / 2).toBeGreaterThanOrEqual(region.south);
      expect((b.south + b.north) / 2).toBeLessThanOrEqual(region.north);
      expect((b.west + b.east) / 2).toBeGreaterThanOrEqual(region.west);
      expect((b.west + b.east) / 2).toBeLessThanOrEqual(region.east);
    }
  });

  it('refuses an unbounded plan', () => {
    expect(() => prefillTiles({ south: 50, west: 10, north: 53, east: 14 }, preset.center)).toThrow(/exceeds/);
  });

  it('claims new and failed tiles, but never ready, locked or freshly ingesting ones', () => {
    const base = { geohash: 'u33dbc', createdAt: now, updatedAt: now };
    expect(canClaimForPrefill(undefined, now)).toBe(true);
    expect(canClaimForPrefill({ ...base, status: 'empty' }, now)).toBe(true);
    expect(canClaimForPrefill({ ...base, status: 'ingesting', ingestStartedAt: now - 60_000 }, now)).toBe(false);
    expect(canClaimForPrefill({ ...base, status: 'ready', locked: true, expiresAt: now - 1 }, now)).toBe(false);
  });
});
