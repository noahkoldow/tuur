import { describe, expect, it } from 'vitest';
import { destinationPoint, distanceMeters } from '@tuur/shared';
import { navigationCenter } from './mapNavigation';

const user = { lat: 52.52, lng: 13.405 };

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
