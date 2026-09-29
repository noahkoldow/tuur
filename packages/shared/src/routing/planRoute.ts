import type { Interest } from '../constants';
import { distanceMeters, type LatLng } from '../geo/geohash';
import type { Poi } from '../schemas';
import { dedupeNearby } from './autoTours';
import { haversineMatrix, type RoutingProfile, type TravelMatrix } from './matrix';
import { evaluateOrder, solveOrienteering, type Candidate } from './orienteering';
import { DEFAULT_TOUR_RULES, validateTour, type TourIssue } from './validation';

export interface PlanRequest {
  /** Where the walk starts (usually the current position). */
  start: LatLng;
  /** Destination; omitted = round trip back to the start. */
  end?: LatLng;
  /** Available time in minutes (walking plus visiting). */
  budgetMinutes: number;
  profile: RoutingProfile;
  /** Empty = balanced mix (spec 5). */
  interests: Interest[];
  pois: Poi[];
  minScore?: number;
  maxCandidates?: number;
  maxLegMinutes?: number;
  maxPartnerShare?: number;
  maxPartnerDetourMinutes?: number;
}

export interface PlannedRoute {
  stops: Poi[];
  /** Walking minutes to each stop from the previous point (the first one from the start). */
  legMinutes: number[];
  /** Minutes from the last stop to the destination / start (0 for open routes). */
  finalLegMinutes: number;
  totalMinutes: number;
  walkMinutes: number;
  distanceMeters: number;
  score: number;
  issues: TourIssue[];
}

const eligible = (p: Poi, minScore: number) =>
  !p.hidden && p.accessible && p.interests.length > 0 && p.score >= minScore;

/**
 * Curates the best route for a personal request (spec 5.2 / 4.5): orienteering heuristic over the POIs around the
 * start, weighted by the selected interests, keeping the time budget including the way to the destination.
 * Deterministic; uses the offline matrix (the backend later re-checks it with real routing times).
 */
export function planCustomRoute(req: PlanRequest): PlannedRoute | undefined {
  const minScore = req.minScore ?? 15;
  const speed = req.profile === 'cycling-regular' ? 14 : 4.5;
  const reachM = ((speed * 1000 * (req.budgetMinutes / 60)) / 1.3) * (req.end ? 1 : 0.5);
  const pool = dedupeNearby(
    req.pois.filter((p) => eligible(p, minScore)),
    DEFAULT_TOUR_RULES.minStopDistanceM,
  )
    .map((p) => ({
      p,
      d:
        distanceMeters(req.start, p.location) +
        (req.end ? distanceMeters(p.location, req.end) - distanceMeters(req.start, req.end) : 0),
    }))
    .filter((x) => x.d <= reachM * 2)
    .sort(
      (a, b) => b.p.score / (1 + a.d / 1000) - a.p.score / (1 + b.d / 1000) || a.p.id.localeCompare(b.p.id),
    )
    .slice(0, req.maxCandidates ?? 30)
    .map((x) => x.p);
  if (pool.length === 0) return undefined;

  // nodes: 0 start, 1..n candidates, n+1 end (destination, or a copy of the start for round trips)
  const points: LatLng[] = [req.start, ...pool.map((p) => p.location), req.end ?? req.start];
  const m = haversineMatrix(points, req.profile);
  const candidates: Candidate[] = pool.map((p) => ({
    id: p.id,
    location: p.location,
    score: p.score,
    dwellMinutes: p.dwellMinutes,
    interests: p.interests,
    ...(p.partnerId ? { partner: true } : {}),
  }));
  const maxLeg = req.maxLegMinutes ?? 20;
  const result = solveOrienteering({
    candidates,
    minutes: m.minutes,
    budgetMinutes: req.budgetMinutes,
    interests: req.interests,
    maxLegMinutes: maxLeg,
    maxPartnerShare: req.maxPartnerShare ?? 0.25,
    ...(req.maxPartnerDetourMinutes !== undefined
      ? { maxPartnerDetourMinutes: req.maxPartnerDetourMinutes }
      : {}),
  });
  if (result.order.length === 0) return undefined;
  return assemble(req, pool, m, result.order, result.totalScore);
}

/** Builds the route summary for a given order (also used to re-evaluate a corrected order). */
export function assemble(
  req: Pick<PlanRequest, 'budgetMinutes' | 'profile'>,
  pool: Poi[],
  m: TravelMatrix,
  order: string[],
  score: number,
): PlannedRoute {
  const idx = new Map(pool.map((p, i) => [p.id, i + 1]));
  const end = pool.length + 1;
  const nodes = order.map((id) => idx.get(id)!);
  const legMinutes: number[] = [];
  let prev = 0;
  let walk = 0;
  let dist = 0;
  let dwell = 0;
  for (const n of nodes) {
    legMinutes.push(round1(m.minutes[prev]![n]!));
    walk += m.minutes[prev]![n]!;
    dist += m.meters[prev]![n]!;
    dwell += pool[n - 1]!.dwellMinutes;
    prev = n;
  }
  const finalLeg = m.minutes[prev]![end]!;
  walk += finalLeg;
  dist += m.meters[prev]![end]!;
  const stops = nodes.map((n) => pool[n - 1]!);
  const total = round1(walk + dwell);
  const issues = validateTour(
    {
      stops: stops.map((p) => ({
        id: p.id,
        location: p.location,
        accessible: p.accessible,
        partner: Boolean(p.partnerId),
      })),
      legMinutes: legMinutes.slice(1),
      totalMinutes: total,
    },
    { ...DEFAULT_TOUR_RULES, minStops: 1, maxLegMinutes: 20, budgetMinutes: req.budgetMinutes },
  );
  return {
    stops,
    legMinutes,
    finalLegMinutes: round1(finalLeg),
    totalMinutes: total,
    walkMinutes: round1(walk),
    distanceMeters: Math.round(dist),
    score,
    issues,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Re-checks a planned route against real travel times (server routing matrix over [start, ...stops, end]) and drops
 * the least valuable stops until the budget holds (spec 13 phase 5: the time budget is kept).
 */
export function fitToBudget(
  stops: Poi[],
  matrix: TravelMatrix,
  budgetMinutes: number,
  interests: Interest[],
): { order: string[]; totalMinutes: number; dropped: string[] } {
  const cands: Candidate[] = stops.map((p) => ({
    id: p.id,
    location: p.location,
    score: p.score,
    dwellMinutes: p.dwellMinutes,
    interests: p.interests,
  }));
  let order = stops.map((s) => s.id);
  const dropped: string[] = [];
  const weight = (id: string) => {
    const c = cands.find((x) => x.id === id)!;
    return c.score * (interests.length && c.interests.some((i) => interests.includes(i)) ? 1.5 : 1);
  };
  for (;;) {
    const ev = evaluateOrder({ candidates: cands, minutes: matrix.minutes }, order);
    if (!ev || ev.totalMinutes <= budgetMinutes + 1e-6 || order.length <= 1)
      return { order, totalMinutes: ev?.totalMinutes ?? 0, dropped };
    const worst = [...order].sort((a, b) => weight(a) - weight(b) || a.localeCompare(b))[0]!;
    order = order.filter((id) => id !== worst);
    dropped.push(worst);
  }
}
