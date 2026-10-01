import { describe, expect, it } from 'vitest';
import { cityOf, earnedBadges } from './earn';

const cities = [
  { id: 'berlin', center: { lat: 52.52, lng: 13.405 }, radiusKm: 20 },
  { id: 'potsdam', center: { lat: 52.3906, lng: 13.0645 }, radiusKm: 8 },
];
const walk = (id: string, lat: number, lng: number, stopsVisited = 3) => ({
  id,
  center: { lat, lng },
  stopsVisited,
});

describe('city badges', () => {
  it('assigns a tour to the nearest city whose radius contains it', () => {
    expect(cityOf({ lat: 52.51, lng: 13.39 }, cities)?.id).toBe('berlin');
    expect(cityOf({ lat: 52.4, lng: 13.07 }, cities)?.id).toBe('potsdam');
    expect(cityOf({ lat: 48.1, lng: 11.6 }, cities)).toBeUndefined();
  });

  it('counts tours per city into tiers and ignores tours with too few stops', () => {
    const tours = [
      walk('a', 52.51, 13.39),
      walk('b', 52.52, 13.41),
      walk('c', 52.5, 13.42),
      walk('d', 52.4, 13.07),
      walk('e', 52.4, 13.07, 1),
    ];
    expect(earnedBadges(tours, cities)).toEqual([
      { cityId: 'berlin', tours: 3, tier: 'silver', toNext: 4 },
      { cityId: 'potsdam', tours: 1, tier: 'bronze', toNext: 2 },
    ]);
  });

  it('stops counting up at gold', () => {
    const tours = Array.from({ length: 8 }, (_, i) => walk(`t${i}`, 52.52, 13.405));
    expect(earnedBadges(tours, cities)[0]).toEqual({ cityId: 'berlin', tours: 8, tier: 'gold' });
  });
});
