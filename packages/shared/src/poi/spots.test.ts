import { describe, expect, it } from 'vitest';
import {
  HEAT_HALF_LIFE_MS,
  HOT_HEAT,
  MIN_EXPLORERS_SHOWN,
  bumpHeat,
  currentHeat,
  explorerDaySeed,
  spotScale,
  toExploredSpots,
} from './spots';

const now = 1_800_000_000_000;

describe('spot heat', () => {
  it('decays by half per week and adds one per explorer', () => {
    expect(bumpHeat(undefined, now)).toBe(1);
    expect(bumpHeat({ heat: 10, lastAt: now - HEAT_HALF_LIFE_MS }, now)).toBeCloseTo(6);
    expect(currentHeat({ heat: 8, lastAt: now - 2 * HEAT_HALF_LIFE_MS }, now)).toBeCloseTo(2);
  });
});

describe('toExploredSpots', () => {
  const pois = new Map([
    ['a', { name: 'A', location: { lat: 1, lng: 1 } }],
    ['b', { name: 'B', location: { lat: 1, lng: 2 } }],
    ['c', { name: 'C', location: { lat: 1, lng: 3 } }],
  ]);
  it('hides spots below the anonymity threshold or without POI data and flags hot ones', () => {
    const spots = toExploredSpots(
      [
        { poiId: 'a', tile: 't', explorers: MIN_EXPLORERS_SHOWN - 1, heat: 50, lastAt: now },
        { poiId: 'b', tile: 't', explorers: 40, heat: HOT_HEAT + 1, lastAt: now },
        { poiId: 'c', tile: 't', explorers: 5, heat: 3, lastAt: now },
        { poiId: 'x', tile: 't', explorers: 9, heat: 9, lastAt: now },
      ],
      pois,
      now,
    );
    expect(spots.map((s) => [s.poiId, s.hot])).toEqual([
      ['b', true],
      ['c', false],
    ]);
  });
});

describe('spotScale and explorerDaySeed', () => {
  it('scales logarithmically between 0 and 1', () => {
    expect(spotScale(MIN_EXPLORERS_SHOWN, 100)).toBe(0);
    expect(spotScale(100, 100)).toBe(1);
    expect(spotScale(20, 100)).toBeGreaterThan(0.5);
  });
  it('changes the visitor seed every day and per spot', () => {
    expect(explorerDaySeed('u1', 'p', now)).not.toBe(explorerDaySeed('u1', 'p', now + 86_400_000));
    expect(explorerDaySeed('u1', 'p', now)).not.toBe(explorerDaySeed('u1', 'q', now));
  });
});
