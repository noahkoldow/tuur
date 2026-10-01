import { describe, expect, it } from 'vitest';
import { navigationView, splitPathAtStops } from './legs';

// A straight east-bound street with stops at 0.002, 0.004 and 0.006 degrees longitude.
const path = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ lat: 52.5, lng: 13.4 + i * 0.001 }));
const stops = [2, 4, 6].map((i) => ({ lat: 52.5, lng: 13.4 + i * 0.001 }));

describe('splitPathAtStops', () => {
  it('cuts the path into one leg per stop, each ending at its stop', () => {
    const legs = splitPathAtStops(path, stops);
    expect(legs).toHaveLength(3);
    expect(legs.map((l) => l.length)).toEqual([3, 3, 3]);
    legs.forEach((l, i) => expect(l[l.length - 1]).toEqual(stops[i]));
  });

  it('matches stops forward only, so an out-and-back path keeps its order', () => {
    const back = [...path, ...[...path].reverse().slice(1)];
    const legs = splitPathAtStops(back, [stops[2]!, stops[0]!]);
    expect(legs[0]).toHaveLength(7);
    expect(legs[1]).toHaveLength(5);
  });
});

describe('navigationView', () => {
  it('highlights the way from the user to the target and keeps walked and upcoming legs apart', () => {
    const user = { lat: 52.5001, lng: 13.4021 };
    const v = navigationView(path, stops, 1, user);
    expect(v.leg[0]).toEqual(user);
    expect(v.leg[v.leg.length - 1]).toEqual(stops[1]);
    expect(v.leg).toHaveLength(3);
    expect(v.done[v.done.length - 1]).toEqual(stops[0]);
    expect(v.ahead[v.ahead.length - 1]).toEqual(stops[2]);
  });

  it('falls back to a straight line without a path and shows everything as done when finished', () => {
    const user = { lat: 52.5, lng: 13.4 };
    expect(navigationView([], stops, 0, user).leg).toEqual([user, stops[0]]);
    expect(navigationView(path, stops, undefined, user)).toEqual({ done: path, leg: [], ahead: [] });
  });
});
