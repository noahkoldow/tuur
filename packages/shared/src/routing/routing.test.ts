import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import { destinationPoint, distanceMeters } from '../geo/geohash';
import { buildPois } from '../poi/pipeline';
import type { Poi } from '../schemas';
import {
  acceptSuggestedOrder,
  DEFAULT_TEMPLATES,
  planTour,
  prepareTour,
  solveTour,
  stopOverlap,
  themesOf,
  simplifyPath,
  pickStart,
} from './autoTours';
import { haversineMatrix, matrixCacheKey } from './matrix';
import { evaluateOrder, solveOrienteering, type Candidate } from './orienteering';
import { pickFreeTourId, tourId } from './tourPrompt';
import { validateTour, DEFAULT_TOUR_RULES } from './validation';

const origin = { lat: 52.5, lng: 13.4 };
const cand = (
  id: string,
  bearing: number,
  meters: number,
  score = 50,
  extra: Partial<Candidate> = {},
): Candidate => ({
  id,
  location: destinationPoint(origin, bearing, meters),
  score,
  dwellMinutes: 5,
  interests: ['history'],
  ...extra,
});
const matrixFor = (cands: Candidate[]) => {
  const m = haversineMatrix([origin, ...cands.map((c) => c.location)], 'foot-walking').minutes;
  return m.map((r) => [...r, r[0]!]).concat([[...m[0]!, 0]]);
};

describe('solveOrienteering', () => {
  const ring = Array.from({ length: 14 }, (_, i) =>
    cand(`p${String(i).padStart(2, '0')}`, i * 25, 300 + (i % 4) * 250, 30 + ((i * 13) % 50)),
  );

  it('respects the time budget for many budgets and never repeats a stop', () => {
    for (const budget of [20, 45, 60, 90, 150]) {
      const r = solveOrienteering({ candidates: ring, minutes: matrixFor(ring), budgetMinutes: budget });
      expect(r.totalMinutes).toBeLessThanOrEqual(budget + 0.05);
      expect(new Set(r.order).size).toBe(r.order.length);
    }
  });

  it('collects more score with a larger budget', () => {
    const small = solveOrienteering({ candidates: ring, minutes: matrixFor(ring), budgetMinutes: 30 });
    const big = solveOrienteering({ candidates: ring, minutes: matrixFor(ring), budgetMinutes: 120 });
    expect(big.totalScore).toBeGreaterThan(small.totalScore);
  });

  it('is deterministic', () => {
    const a = solveOrienteering({ candidates: ring, minutes: matrixFor(ring), budgetMinutes: 75 });
    const b = solveOrienteering({ candidates: ring, minutes: matrixFor(ring), budgetMinutes: 75 });
    expect(a).toEqual(b);
  });

  it('2-opt removes crossings: collinear stops are visited monotonically, not zig-zag', () => {
    const line = [cand('d', 90, 1200), cand('a', 90, 300), cand('c', 90, 900), cand('b', 90, 600)];
    const r = solveOrienteering({ candidates: line, minutes: matrixFor(line), budgetMinutes: 240 });
    expect(['a,b,c,d', 'd,c,b,a']).toContain(r.order.join(','));
  });

  it('enforces the maximum walking leg', () => {
    const far = [cand('near', 0, 300), cand('far', 90, 6000, 100)];
    const r = solveOrienteering({
      candidates: far,
      minutes: matrixFor(far),
      budgetMinutes: 400,
      maxLegMinutes: 15,
    });
    expect(r.order).toEqual(['near']);
  });

  it('caps the partner share and the partner detour (boost can never make a route absurd)', () => {
    const cs = [
      ...['p1', 'p2', 'p3', 'p4'].map((id, i) => cand(id, i * 90, 400, 95, { partner: true })),
      ...['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map((id, i) => cand(id, 20 + i * 55, 500 + i * 60, 40)),
    ];
    const r = solveOrienteering({
      candidates: cs,
      minutes: matrixFor(cs),
      budgetMinutes: 120,
      maxPartnerShare: 0.25,
    });
    const partners = r.order.filter((id) => id.startsWith('p')).length;
    expect(partners).toBeLessThanOrEqual(Math.floor(0.25 * r.order.length));
    const none = solveOrienteering({
      candidates: cs,
      minutes: matrixFor(cs),
      budgetMinutes: 120,
      maxPartnerShare: 0,
    });
    expect(none.order.some((id) => id.startsWith('p'))).toBe(false);
    const far = [
      cand('n1', 0, 300),
      cand('n2', 90, 400),
      cand('n3', 180, 350),
      cand('n4', 270, 450),
      cand('pfar', 45, 2500, 100, { partner: true }),
    ];
    const r2 = solveOrienteering({
      candidates: far,
      minutes: matrixFor(far),
      budgetMinutes: 200,
      maxPartnerDetourMinutes: 8,
      maxPartnerShare: 0.5,
    });
    expect(r2.order).not.toContain('pfar');
  });

  it('prefers stops matching the selected interests', () => {
    const cs = [
      cand('hist', 0, 500, 50, { interests: ['history'] }),
      cand('food', 180, 500, 55, { interests: ['culinary'] }),
    ];
    const r = solveOrienteering({
      candidates: cs,
      minutes: matrixFor(cs),
      budgetMinutes: 24,
      interests: ['history'],
    });
    expect(r.order).toEqual(['hist']);
  });

  it('includes forced stops when feasible', () => {
    const cs = [cand('a', 0, 500, 90), cand('b', 90, 500, 10)];
    const r = solveOrienteering({
      candidates: cs,
      minutes: matrixFor(cs),
      budgetMinutes: 26,
      forcedIds: ['b'],
    });
    expect(r.order).toContain('b');
  });

  it('handles empty candidates and evaluates explicit orders', () => {
    expect(
      solveOrienteering({
        candidates: [],
        minutes: [
          [0, 0],
          [0, 0],
        ],
        budgetMinutes: 30,
      }).order,
    ).toEqual([]);
    const cs = [cand('a', 0, 500), cand('b', 90, 500)];
    const ev = evaluateOrder({ candidates: cs, minutes: matrixFor(cs) }, ['a', 'b'])!;
    expect(ev.totalMinutes).toBeGreaterThan(10);
    expect(evaluateOrder({ candidates: cs, minutes: matrixFor(cs) }, ['zzz'])).toBeUndefined();
  });
});

describe('matrix', () => {
  it('is symmetric with plausible walking speed and stable cache keys', () => {
    const pts = [origin, destinationPoint(origin, 90, 1000)];
    const m = haversineMatrix(pts, 'foot-walking');
    expect(m.minutes[0]![1]).toBe(m.minutes[1]![0]);
    expect(m.minutes[0]![1]).toBeGreaterThan(13);
    expect(m.minutes[0]![1]).toBeLessThan(20);
    expect(haversineMatrix(pts, 'cycling-regular').minutes[0]![1]!).toBeLessThan(m.minutes[0]![1]! / 2.5);
    expect(matrixCacheKey(pts, 'foot-walking')).toBe(matrixCacheKey(pts, 'foot-walking'));
    expect(matrixCacheKey(pts, 'foot-walking')).not.toBe(matrixCacheKey(pts, 'cycling-regular'));
  });
});

describe('validateTour', () => {
  const stops = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      location: destinationPoint(origin, 90, i * 300),
      accessible: true,
    }));
  const rules = { ...DEFAULT_TOUR_RULES, budgetMinutes: 60 };
  it('accepts a good tour and flags each violated rule', () => {
    expect(validateTour({ stops: stops(5), legMinutes: [4, 4, 4, 4], totalMinutes: 55 }, rules)).toEqual([]);
    expect(validateTour({ stops: stops(2), legMinutes: [4], totalMinutes: 20 }, rules)).toContain(
      'too_few_stops',
    );
    expect(validateTour({ stops: stops(5), legMinutes: [4, 40, 4, 4], totalMinutes: 55 }, rules)).toContain(
      'leg_too_long',
    );
    expect(validateTour({ stops: stops(5), legMinutes: [4, 4, 4, 4], totalMinutes: 61 }, rules)).toContain(
      'over_budget',
    );
    const dup = [...stops(4), { id: 's0', location: origin, accessible: true }];
    expect(validateTour({ stops: dup, legMinutes: [1, 1, 1, 1], totalMinutes: 30 }, rules)).toContain(
      'duplicate_stop',
    );
    const near = [
      ...stops(4),
      { id: 'x', location: destinationPoint(stops(4)[3]!.location, 0, 5), accessible: true },
    ];
    expect(validateTour({ stops: near, legMinutes: [1, 1, 1, 1], totalMinutes: 30 }, rules)).toContain(
      'duplicate_stop',
    );
    const priv = stops(5).map((s, i) => ({ ...s, accessible: i !== 2 }));
    expect(validateTour({ stops: priv, legMinutes: [4, 4, 4, 4], totalMinutes: 40 }, rules)).toContain(
      'not_accessible',
    );
    const partners = stops(5).map((s, i) => ({ ...s, partner: i < 3 }));
    expect(validateTour({ stops: partners, legMinutes: [4, 4, 4, 4], totalMinutes: 40 }, rules)).toContain(
      'partner_share',
    );
  });
});

describe('auto tours on region fixtures', () => {
  const NOW = 1_700_000_000_000;
  const poisOf = (key: string) =>
    buildPois(REGION_FIXTURES.find((f) => f.key === key)!.raw, { now: NOW }).pois;

  it('plans plausible tours for Berlin: within budget, valid, unique stops', () => {
    const pois = poisOf('berlin');
    const res = planTour(pois, DEFAULT_TEMPLATES[0]!);
    expect(res).toBeDefined();
    const { plan } = res!;
    expect(plan.issues).toEqual([]);
    expect(plan.result.totalMinutes).toBeLessThanOrEqual(60);
    expect(plan.stops.length).toBeGreaterThanOrEqual(4);
    expect(new Set(plan.stops.map((s) => s.id)).size).toBe(plan.stops.length);
    expect(plan.stops.every((s) => s.accessible && !s.hidden)).toBe(true);
    const big = planTour(pois, DEFAULT_TEMPLATES[1]!);
    if (big) expect(big.plan.result.totalMinutes).toBeLessThanOrEqual(120);
  });

  it('never routes to private objects', () => {
    const pois = poisOf('berlin');
    const res = planTour(pois, DEFAULT_TEMPLATES[0]!)!;
    expect(res.plan.stops.map((s) => s.name)).not.toContain('Alte Kaserne (gesperrt)');
  });

  it('offers a tour for the small town and none for the rural low-content area', () => {
    const small = planTour(poisOf('rothenburg'), { ...DEFAULT_TEMPLATES[0]!, minCandidates: 5, minStops: 4 });
    expect(small).toBeDefined();
    expect(small!.plan.issues).toEqual([]);
    expect(planTour(poisOf('rural'), DEFAULT_TEMPLATES[0]!)).toBeUndefined();
  });

  it('plans in a non-German region too (Kyoto) and stays within budget', () => {
    const res = planTour(poisOf('kyoto'), { ...DEFAULT_TEMPLATES[0]!, minCandidates: 5, minStops: 3 });
    expect(res).toBeDefined();
    expect(res!.plan.result.totalMinutes).toBeLessThanOrEqual(60);
  });

  it('is deterministic and cycling covers more ground than walking', () => {
    const pois = poisOf('berlin');
    const a = planTour(pois, DEFAULT_TEMPLATES[0]!)!;
    const b = planTour(pois, DEFAULT_TEMPLATES[0]!)!;
    expect(a.plan.stops.map((s) => s.id)).toEqual(b.plan.stops.map((s) => s.id));
    const bike = planTour(pois, DEFAULT_TEMPLATES[0]!, { profile: 'cycling-regular' })!;
    expect(bike.plan.distanceMeters).toBeGreaterThanOrEqual(a.plan.distanceMeters);
  });

  it('theme tours only contain matching stops', () => {
    const pois = poisOf('berlin');
    const t = { ...DEFAULT_TEMPLATES.find((x) => x.id === 'theme_history')!, minCandidates: 4, minStops: 3 };
    const res = planTour(pois, t);
    expect(res).toBeDefined();
    expect(res!.plan.stops.every((s) => s.interests.includes('history'))).toBe(true);
  });

  it('accepts a model-suggested order only when it stays plausible', () => {
    const pois = poisOf('berlin');
    const { prep, plan } = planTour(pois, DEFAULT_TEMPLATES[0]!)!;
    const matrix = haversineMatrix(prep.matrixPoints, 'foot-walking');
    const same = acceptSuggestedOrder(
      prep,
      matrix,
      plan,
      plan.stops.map((s) => s.id),
    );
    expect(same.stops.map((s) => s.id)).toEqual(plan.stops.map((s) => s.id));
    const unknown = acceptSuggestedOrder(prep, matrix, plan, [
      ...plan.stops.map((s) => s.id).slice(1),
      'nope',
    ]);
    expect(unknown).toBe(plan);
    const dup = acceptSuggestedOrder(
      prep,
      matrix,
      plan,
      plan.stops.map(() => plan.stops[0]!.id),
    );
    expect(dup).toBe(plan);
    // a wildly zig-zag order is rejected because it inflates the walking time
    const zig = [...plan.stops].sort(
      (a, b) =>
        distanceMeters(a.location, plan.stops[0]!.location) -
        distanceMeters(b.location, plan.stops[0]!.location),
    );
    const alt = [zig[0]!, ...zig.slice(1).reverse()].map((s) => s.id);
    const accepted = acceptSuggestedOrder(prep, matrix, plan, alt);
    expect(accepted.result.walkMinutes).toBeLessThanOrEqual(plan.result.walkMinutes * 1.15 + 1);
  });

  it('prepareTour returns undefined without enough candidates and picks a start in the densest cluster', () => {
    const pois = poisOf('berlin');
    expect(prepareTour(pois.slice(0, 2), DEFAULT_TEMPLATES[0]!)).toBeUndefined();
    const start = pickStart(pois.filter((p) => p.score > 30))!;
    expect(start).toBeDefined();
  });
});

import { decodePolyline, encodePolyline } from './polyline';
describe('polyline', () => {
  it('round-trips coordinates at precision 5 and matches the reference example', () => {
    expect(
      encodePolyline([
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    const pts: [number, number][] = [
      [52.51628, 13.37771],
      [52.51861, 13.3761],
      [-33.86882, 151.20929],
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('tour helpers', () => {
  it('builds stable ids, picks the shortest tour as free, and measures overlap', () => {
    expect(tourId('DE_berlin', 'highlights60')).toBe('DE_berlin__highlights60');
    expect(
      pickFreeTourId([
        { id: 'b', durationMinutes: 60 },
        { id: 'a', durationMinutes: 60 },
        { id: 'c', durationMinutes: 120 },
      ]),
    ).toBe('a');
    expect(pickFreeTourId([])).toBeUndefined();
    expect(stopOverlap(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(stopOverlap(['a'], ['b'])).toBe(0);
  });
  it('simplifies long paths keeping endpoints and derives themes', () => {
    const pts: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i, i]);
    const s = simplifyPath(pts, 100);
    expect(s).toHaveLength(100);
    expect(s[0]).toEqual([0, 0]);
    expect(s[99]).toEqual([999, 999]);
    const mk = (i: string, p: Poi['primaryInterest']) => ({ id: i, primaryInterest: p }) as Poi;
    expect(themesOf([mk('1', 'history'), mk('2', 'history'), mk('3', 'nature')])).toEqual(['history']);
  });
});

// keep the imports honest
void solveTour;
