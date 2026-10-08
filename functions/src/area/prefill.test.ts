import { describe, expect, it } from 'vitest';
import { encodeGeohash, geohashBounds } from '@tuur/shared';
import { canClaimForPrefill, PREFILL_PRESETS, prefillTiles, snapshotPrefillOrder } from './prefill';
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

  it('plans Hakenfelde first-class, nearest to its centre, inside the beta region', () => {
    const hakenfelde = PREFILL_PRESETS['hakenfelde']!;
    const plan = prefillTiles(hakenfelde.bounds, hakenfelde.center);
    expect(plan.length).toBeGreaterThan(60);
    expect(plan.length).toBeLessThan(160);
    expect(plan[0]).toBe(encodeGeohash(hakenfelde.center.lat, hakenfelde.center.lng, 6));
    const region = parseBetaRegion('52.28,12.90,52.78,13.92')!;
    expect(hakenfelde.bounds.south).toBeGreaterThan(region.south);
    expect(hakenfelde.bounds.east).toBeLessThan(region.east);
    expect(prefillTiles(PREFILL_PRESETS['spandau']!.bounds, PREFILL_PRESETS['spandau']!.center).length).toBeLessThan(
      700,
    );
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

  it('orders imported tiles nearest-first and skips street-only and invalid ones', () => {
    const near = encodeGeohash(52.5208, 13.4095, 6);
    const far = encodeGeohash(52.4, 13.06, 6);
    const empty = encodeGeohash(52.5, 13.3, 6);
    const order = snapshotPrefillOrder(
      [
        { id: far, sights: 9 },
        { id: empty, sights: 0 },
        { id: 'bad!!!', sights: 5 },
        { id: near, sights: 1 },
      ],
      preset.center,
    );
    expect(order).toEqual([near, far]);
    expect(snapshotPrefillOrder([{ id: near, sights: 1 }], preset.center, 2)).toEqual([]);
  });
});
