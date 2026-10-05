import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import { syntheticRawPois } from '../demo/synthetic';
import { destinationPoint, distanceMeters, encodeGeohash } from '../geo/geohash';
import { buildPois } from '../poi/pipeline';
import { fitToBudget, planCustomRoute } from './planRoute';
import { haversineMatrix } from './matrix';

const NOW = 1_700_000_000_000;
const berlin = buildPois(REGION_FIXTURES[0]!.raw, { now: NOW }).pois;
const start = { lat: 52.5163, lng: 13.3777 };

describe('planCustomRoute', () => {
  it('keeps an explicitly chosen place even with other interests and a lower score', () => {
    const chosen = { ...berlin.find((p) => p.name === 'Brandenburger Tor')!, score: 1 };
    const route = planCustomRoute({
      start,
      budgetMinutes: 180,
      profile: 'foot-walking',
      interests: ['nature'],
      pois: berlin.map((p) => (p.id === chosen.id ? chosen : p)),
      requiredStopIds: [chosen.id],
    });
    expect(route?.stops.some((p) => p.id === chosen.id)).toBe(true);
    expect(route!.totalMinutes).toBeLessThanOrEqual(180.1);
  });

  it('does not silently replace a pick that cannot fit the time budget', () => {
    const chosen = { ...berlin.find((p) => p.name === 'Brandenburger Tor')!, dwellMinutes: 90 };
    expect(
      planCustomRoute({
        start,
        budgetMinutes: 30,
        profile: 'foot-walking',
        interests: [],
        pois: [chosen],
        requiredStopIds: [chosen.id],
      }),
    ).toBeUndefined();
  });

  it('respects removed places and never inserts an unavailable pick', () => {
    const excluded = berlin[0]!;
    const route = planCustomRoute({
      start,
      budgetMinutes: 90,
      profile: 'foot-walking',
      interests: [],
      pois: berlin,
      excludedStopIds: [excluded.id],
    });
    expect(route?.stops.every((p) => p.id !== excluded.id)).toBe(true);
    expect(
      planCustomRoute({
        start,
        budgetMinutes: 90,
        profile: 'foot-walking',
        interests: [],
        pois: berlin,
        requiredStopIds: ['missing-place'],
      }),
    ).toBeUndefined();
  });

  it('protects manual stops when real routing times require trimming the route', () => {
    const stops = berlin.slice(0, 3).map((p) => ({ ...p, dwellMinutes: 20 }));
    const matrix = haversineMatrix([start, ...stops.map((p) => p.location), start], 'foot-walking');
    const fit = fitToBudget(stops, matrix, 35, [], [stops[0]!.id]);
    expect(fit.order).toContain(stops[0]!.id);
    expect(fit.dropped).not.toContain(stops[0]!.id);
  });

  it('keeps the time budget for many budgets, profiles and destinations', () => {
    for (const budget of [30, 45, 60, 90, 120, 180]) {
      for (const profile of ['foot-walking', 'cycling-regular'] as const) {
        for (const end of [undefined, { lat: 52.5193, lng: 13.399 }]) {
          const r = planCustomRoute({
            start,
            ...(end ? { end } : {}),
            budgetMinutes: budget,
            profile,
            interests: [],
            pois: berlin,
          });
          if (!r) continue;
          expect(r.totalMinutes).toBeLessThanOrEqual(budget + 0.1);
          expect(new Set(r.stops.map((s) => s.id)).size).toBe(r.stops.length);
          expect(r.issues).not.toContain('over_budget');
          expect(r.issues).not.toContain('duplicate_stop');
          expect(r.stops.every((s) => s.accessible && !s.hidden)).toBe(true);
        }
      }
    }
  });

  it('includes the way to the destination in the budget and heads toward it', () => {
    const end = { lat: 52.5193, lng: 13.399 };
    const r = planCustomRoute({
      start,
      end,
      budgetMinutes: 90,
      profile: 'foot-walking',
      interests: [],
      pois: berlin,
    })!;
    expect(r.finalLegMinutes).toBeGreaterThanOrEqual(0);
    const last = r.stops[r.stops.length - 1]!;
    expect(distanceMeters(last.location, end)).toBeLessThan(distanceMeters(start, end) + 1500);
    expect(r.totalMinutes).toBeLessThanOrEqual(90.1);
  });

  it('round trip: the way back is part of the budget', () => {
    const away = { lat: 52.515, lng: 13.399 };
    const r = planCustomRoute({
      start: away,
      budgetMinutes: 60,
      profile: 'foot-walking',
      interests: [],
      pois: berlin,
    })!;
    expect(r.finalLegMinutes).toBeGreaterThan(0);
    expect(r.walkMinutes).toBeGreaterThan(r.legMinutes.reduce((a, b) => a + b, 0) - 0.01);
  });

  it('weights the selected interests', () => {
    const nature = planCustomRoute({
      start,
      budgetMinutes: 60,
      profile: 'foot-walking',
      interests: ['nature'],
      pois: berlin,
      minScore: 5,
    });
    const history = planCustomRoute({
      start,
      budgetMinutes: 60,
      profile: 'foot-walking',
      interests: ['history'],
      pois: berlin,
    });
    const shareOf = (r: typeof nature, i: 'nature' | 'history') =>
      r ? r.stops.filter((s) => s.interests.includes(i)).length / r.stops.length : 0;
    expect(shareOf(history, 'history')).toBeGreaterThanOrEqual(shareOf(nature, 'history'));
    expect(shareOf(nature, 'nature')).toBeGreaterThanOrEqual(shareOf(history, 'nature'));
  });

  it('cycling reaches farther than walking within the same time', () => {
    const walk = planCustomRoute({
      start,
      budgetMinutes: 60,
      profile: 'foot-walking',
      interests: [],
      pois: berlin,
    })!;
    const bike = planCustomRoute({
      start,
      budgetMinutes: 60,
      profile: 'cycling-regular',
      interests: [],
      pois: berlin,
    })!;
    expect(bike.distanceMeters).toBeGreaterThanOrEqual(walk.distanceMeters);
  });

  it('works anywhere on the planet (synthetic area) and returns undefined without candidates', () => {
    const tile = encodeGeohash(-33.8688, 151.2093, 6);
    const pois = buildPois(syntheticRawPois(tile), { now: NOW }).pois;
    const at = { lat: pois[0]!.location.lat, lng: pois[0]!.location.lng };
    const r = planCustomRoute({ start: at, budgetMinutes: 45, profile: 'foot-walking', interests: [], pois });
    expect(r).toBeDefined();
    expect(
      planCustomRoute({
        start: destinationPoint(at, 0, 500_000),
        budgetMinutes: 45,
        profile: 'foot-walking',
        interests: [],
        pois,
      }),
    ).toBeUndefined();
    expect(
      planCustomRoute({ start, budgetMinutes: 45, profile: 'foot-walking', interests: [], pois: [] }),
    ).toBeUndefined();
  });

  it('is deterministic', () => {
    const a = planCustomRoute({
      start,
      budgetMinutes: 75,
      profile: 'foot-walking',
      interests: ['history'],
      pois: berlin,
    })!;
    const b = planCustomRoute({
      start,
      budgetMinutes: 75,
      profile: 'foot-walking',
      interests: ['history'],
      pois: [...berlin].reverse(),
    })!;
    expect(a.stops.map((s) => s.id)).toEqual(b.stops.map((s) => s.id));
  });
});

describe('fitToBudget (server re-check with real times)', () => {
  it('drops the least valuable stops until the budget holds, and keeps everything if it already fits', () => {
    const r = planCustomRoute({
      start,
      budgetMinutes: 90,
      profile: 'foot-walking',
      interests: [],
      pois: berlin,
    })!;
    const pts = [start, ...r.stops.map((s) => s.location), start];
    const m = haversineMatrix(pts, 'foot-walking');
    // real routing turns out 60% slower than the estimate
    const slow = { minutes: m.minutes.map((row) => row.map((v) => v * 1.6)), meters: m.meters };
    const fitted = fitToBudget(r.stops, slow, 90, []);
    expect(fitted.totalMinutes).toBeLessThanOrEqual(90);
    expect(fitted.order.length).toBeLessThanOrEqual(r.stops.length);
    if (fitted.dropped.length) expect(fitted.order.length + fitted.dropped.length).toBe(r.stops.length);
    const unchanged = fitToBudget(r.stops, m, 1000, []);
    expect(unchanged.dropped).toEqual([]);
  });
});
