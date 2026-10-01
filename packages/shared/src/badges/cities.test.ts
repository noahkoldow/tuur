import { describe, expect, it } from 'vitest';
import { CITY_BADGES } from './cities';
import { CITY_BADGE_ICONS } from './types';

const byId = (id: string) => {
  const badge = CITY_BADGES.find((b) => b.id === id);
  if (!badge) throw new Error(`missing badge ${id}`);
  return badge;
};

/** Great-circle distance in km (haversine). */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe('CITY_BADGES', () => {
  it('has at least 100 entries', () => {
    expect(CITY_BADGES.length).toBeGreaterThanOrEqual(100);
  });

  it('has unique, slug-shaped ids sorted alphabetically', () => {
    const ids = CITY_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(ids).toEqual([...ids].sort());
  });

  it('has valid fields', () => {
    const icons: readonly string[] = CITY_BADGE_ICONS;
    for (const b of CITY_BADGES) {
      expect(icons, b.id).toContain(b.icon);
      expect(b.center.lat, b.id).toBeGreaterThanOrEqual(-90);
      expect(b.center.lat, b.id).toBeLessThanOrEqual(90);
      expect(b.center.lng, b.id).toBeGreaterThanOrEqual(-180);
      expect(b.center.lng, b.id).toBeLessThanOrEqual(180);
      expect(b.radiusKm, b.id).toBeGreaterThanOrEqual(2);
      expect(b.radiusKm, b.id).toBeLessThanOrEqual(60);
      expect(b.country, b.id).toMatch(/^[A-Z]{2}$/);
      expect(b.names.de.trim(), b.id).not.toBe('');
      expect(b.names.en.trim(), b.id).not.toBe('');
      expect(b.landmark.de.trim(), b.id).not.toBe('');
      expect(b.landmark.en.trim(), b.id).not.toBe('');
    }
  });

  it('keeps badges at least 30 km apart with non-overlapping areas', () => {
    for (let i = 0; i < CITY_BADGES.length; i++) {
      for (let j = i + 1; j < CITY_BADGES.length; j++) {
        const a = CITY_BADGES[i]!;
        const b = CITY_BADGES[j]!;
        const d = distanceKm(a.center, b.center);
        expect(d, `${a.id} <-> ${b.id}`).toBeGreaterThanOrEqual(30);
        expect(d, `${a.id} <-> ${b.id} overlap`).toBeGreaterThan(a.radiusKm + b.radiusKm);
      }
    }
  });

  it('has plausible coordinates (spot checks)', () => {
    const berlin = byId('berlin');
    expect(Math.abs(berlin.center.lat - 52.52)).toBeLessThan(0.1);
    expect(Math.abs(berlin.center.lng - 13.405)).toBeLessThan(0.1);
    expect(byId('sydney').center.lat).toBeLessThan(-33);
    expect(byId('sydney').center.lng).toBeGreaterThan(150);
    expect(byId('new-york').center.lng).toBeLessThan(-73);
    expect(byId('rio-de-janeiro').center.lat).toBeLessThan(-22);
    expect(byId('rio-de-janeiro').center.lng).toBeLessThan(-43);
    expect(byId('cape-town').center.lat).toBeLessThan(-33);
    expect(byId('london').center.lng).toBeLessThan(0);
    expect(Math.abs(byId('tokyo').center.lat - 35.68)).toBeLessThan(0.1);
    expect(Math.abs(byId('paris').center.lng - 2.35)).toBeLessThan(0.1);
  });

  it('uses German exonyms', () => {
    expect(byId('rome').names.de).toBe('Rom');
    expect(byId('venice').names.de).toBe('Venedig');
    expect(byId('munich').names.de).toBe('München');
    expect(byId('beijing').names.de).toBe('Peking');
  });
});
