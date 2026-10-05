import { describe, expect, it } from 'vitest';
import { destinationPoint, distanceMeters } from '@tuur/shared';
import { navigationBearing, navigationCenter } from './mapNavigation';

const user = { lat: 52.52, lng: 13.405 };

describe('navigation bearing', () => {
  it('uses GPS travel direction at walking speed, including north', () => {
    expect(navigationBearing(undefined, 90, 1.35)).toBe(90);
    expect(navigationBearing(90, 0, 1.35)).toBe(0);
    expect(navigationBearing(90, 360, 1.35)).toBe(0);
    expect(navigationBearing(90, 180, 0.5)).toBe(180);
  });

  it('holds the last course when stopped even if GPS heading changes', () => {
    expect(navigationBearing(90, 180, 0)).toBe(90);
    expect(navigationBearing(90, 180, 0.49)).toBe(90);
    expect(navigationBearing(undefined, 180, 0)).toBeUndefined();
    expect(navigationBearing(90, 180, 1.35)).toBe(180);
  });

  it.each([undefined, -1, NaN, Infinity])('accepts a valid course when speed is unknown (%s)', (speed) => {
    expect(navigationBearing(90, 180, speed)).toBe(180);
  });

  it.each([undefined, -1, 361, NaN, Infinity])(
    'holds direction for an unavailable course (%s)',
    (heading) => {
      expect(navigationBearing(90, heading, 1.35)).toBe(90);
      expect(navigationBearing(undefined, heading, 1.35)).toBeUndefined();
    },
  );

  it('ignores small changes across north while accepting actual turns', () => {
    expect(navigationBearing(90, 93, 1.35)).toBe(90);
    expect(navigationBearing(90, 87, 1.35)).toBe(90);
    expect(navigationBearing(359, 1, 1.35)).toBe(359);
    expect(navigationBearing(1, 359, 1.35)).toBe(1);
    expect(navigationBearing(359, 5, 1.35)).toBe(5);
    expect(navigationBearing(1, 355, 1.35)).toBe(355);
    expect(navigationBearing(90, 270, 1.35)).toBe(270);
  });
});

describe('navigation camera', () => {
  it('stays on the walker when exploring without a next stop', () => {
    expect(navigationCenter(user)).toEqual(user);
  });

  it('leaves space ahead without moving the walker far off screen', () => {
    const target = destinationPoint(user, 90, 1000);
    const center = navigationCenter(user, [user, target]);
    expect(distanceMeters(user, center)).toBeCloseTo(40, 0);
    expect(center.lng).toBeGreaterThan(user.lng);
  });

  it('looks along bends and handles repeated GPS points', () => {
    const corner = destinationPoint(user, 0, 30);
    const target = destinationPoint(corner, 90, 100);
    const center = navigationCenter(user, [user, user, corner, target]);
    expect(center.lat).toBeGreaterThan(user.lat);
    expect(center.lng).toBeGreaterThan(user.lng);
    expect(distanceMeters(user, center)).toBeLessThanOrEqual(40);
  });

  it('frames both the walker and an imminent stop', () => {
    const target = destinationPoint(user, 180, 12);
    expect(distanceMeters(user, navigationCenter(user, [target]))).toBeCloseTo(6, 0);
  });
});
