import type { Interest } from '../constants';
import { distanceMeters, type Bounds, type LatLng } from '../geo/geohash';
import type { Poi } from '../schemas';
import { haversineMatrix, type RoutingProfile, type TravelMatrix } from './matrix';
import { evaluateOrder, solveOrienteering, type Candidate, type OrienteeringResult } from './orienteering';
import { DEFAULT_TOUR_RULES, validateTour, type TourIssue, type TourValidationRules } from './validation';

export interface TourTemplate {
  id: string;
  budgetMinutes: number;
  /** Restrict candidates to these interests (theme tours). */
  interests?: Interest[];
  minScore: number;
  minStops: number;
  /** Minimum number of eligible POIs required to offer this tour at all. */
  minCandidates: number;
}

/** Spec 4.3 examples: highlights in 60 min, large loop in 2 h, plus theme tours when enough POIs exist. */
export const DEFAULT_TEMPLATES: TourTemplate[] = [
  { id: 'highlights60', budgetMinutes: 60, minScore: 25, minStops: 4, minCandidates: 6 },
  { id: 'grand120', budgetMinutes: 120, minScore: 20, minStops: 6, minCandidates: 10 },
  {
    id: 'theme_history',
    budgetMinutes: 75,
    interests: ['history'],
    minScore: 20,
    minStops: 4,
    minCandidates: 6,
  },
  {
    id: 'theme_architecture',
    budgetMinutes: 75,
    interests: ['architecture'],
    minScore: 20,
    minStops: 4,
    minCandidates: 6,
  },
  {
    id: 'theme_art_culture',
    budgetMinutes: 75,
    interests: ['art_culture'],
    minScore: 20,
    minStops: 4,
    minCandidates: 6,
  },
  {
    id: 'theme_culinary',
    budgetMinutes: 75,
    interests: ['culinary'],
    minScore: 8,
    minStops: 4,
    minCandidates: 6,
  },
  {
    id: 'theme_nature',
    budgetMinutes: 75,
    interests: ['nature'],
    minScore: 15,
    minStops: 4,
    minCandidates: 6,
  },
];

export interface PlanOptions {
  profile?: RoutingProfile;
  rules?: Partial<Omit<TourValidationRules, 'budgetMinutes'>>;
  maxCandidates?: number;
  /** Admin/partner-configurable caps (spec 7.1). */
  maxPartnerShare?: number;
  maxPartnerDetourMinutes?: number;
  /** Return to the start after the last stop (default false: open tour). */
  roundTrip?: boolean;
}

export interface PreparedTour {
  template: TourTemplate;
  start: Poi;
  candidates: Poi[];
  /** Points for the matrix request: [start location, ...candidate locations]. */
  matrixPoints: LatLng[];
}

const isEligible = (p: Poi, t: TourTemplate) =>
  !p.hidden &&
  p.accessible &&
  p.interests.length > 0 &&
  p.score >= t.minScore &&
  (!t.interests || p.interests.some((i) => t.interests!.includes(i)));

/** Picks the start in the densest cluster of high scores so tours begin where the sights are. */
export function pickStart(pois: Poi[]): Poi | undefined {
  // A museum with a long visit is a poor tour opener; only use it if nothing else exists.
  const pool = pois.filter((p) => p.dwellMinutes <= 15);
  return pickStartFrom(pool.length ? pool : pois, pois);
}

function pickStartFrom(pool: Poi[], pois: Poi[]): Poi | undefined {
  let best: { p: Poi; v: number } | undefined;
  for (const p of pool) {
    let v = 0;
    for (const q of pois) if (distanceMeters(p.location, q.location) <= 600) v += q.score;
    if (!best || v > best.v + 1e-9 || (Math.abs(v - best.v) <= 1e-9 && p.id < best.p.id)) best = { p, v };
  }
  return best?.p;
}

/** Keeps the higher-scored one of near-identical stops (e.g. two OSM objects for one building). */
export function dedupeNearby(pois: Poi[], minDistM: number): Poi[] {
  const sorted = [...pois].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const kept: Poi[] = [];
  for (const p of sorted)
    if (kept.every((k) => distanceMeters(k.location, p.location) >= minDistM)) kept.push(p);
  return kept;
}

export function prepareTour(
  pois: Poi[],
  template: TourTemplate,
  opt: PlanOptions = {},
): PreparedTour | undefined {
  const minDist = opt.rules?.minStopDistanceM ?? DEFAULT_TOUR_RULES.minStopDistanceM;
  const eligible = dedupeNearby(
    pois.filter((p) => isEligible(p, template)),
    minDist,
  );
  if (eligible.length < template.minCandidates) return undefined;
  const start = pickStart(eligible);
  if (!start) return undefined;
  const speed = opt.profile === 'cycling-regular' ? 14 : 4.5;
  const radiusM = ((speed * 1000 * (template.budgetMinutes / 60)) / 2 / 1.3) * 1.0;
  const near = eligible.filter((p) => distanceMeters(start.location, p.location) <= radiusM);
  const candidates = near.slice(0, opt.maxCandidates ?? 30);
  if (!candidates.some((c) => c.id === start.id)) candidates.unshift(start);
  if (candidates.length < template.minCandidates) return undefined;
  return {
    template,
    start,
    candidates,
    matrixPoints: [start.location, ...candidates.map((c) => c.location)],
  };
}

/**
 * Appends the end node. Open tours (default) end wherever the last stop is (zero cost to the end node);
 * round trips return to the start.
 */
export function withEndNode(m: number[][], roundTrip: boolean): number[][] {
  const out = m.map((row) => [...row, roundTrip ? row[0]! : 0]);
  out.push([...(roundTrip ? m[0]! : m[0]!.map(() => 0)), 0]);
  return out;
}

export interface TourPlan {
  template: TourTemplate;
  stops: Poi[];
  result: OrienteeringResult;
  legMinutes: number[];
  distanceMeters: number;
  issues: TourIssue[];
  bbox: Bounds;
}

const toCandidate = (p: Poi): Candidate => ({
  id: p.id,
  location: p.location,
  score: p.score,
  dwellMinutes: p.dwellMinutes,
  interests: p.interests,
  ...(p.partnerId ? { partner: true } : {}),
});

export function solveTour(prep: PreparedTour, matrix: TravelMatrix, opt: PlanOptions = {}): TourPlan {
  const rules: TourValidationRules = {
    ...DEFAULT_TOUR_RULES,
    ...opt.rules,
    minStops: opt.rules?.minStops ?? prep.template.minStops,
    budgetMinutes: prep.template.budgetMinutes,
  };
  const cands = prep.candidates.map(toCandidate);
  const minutes = withEndNode(matrix.minutes, Boolean(opt.roundTrip));
  const result = solveOrienteering({
    candidates: cands,
    minutes,
    budgetMinutes: prep.template.budgetMinutes,
    ...(prep.template.interests ? { interests: prep.template.interests } : {}),
    maxLegMinutes: rules.maxLegMinutes,
    maxPartnerShare: opt.maxPartnerShare ?? rules.maxPartnerShare,
    ...(opt.maxPartnerDetourMinutes !== undefined
      ? { maxPartnerDetourMinutes: opt.maxPartnerDetourMinutes }
      : {}),
    forcedIds: [prep.start.id],
  });
  return finalizePlan(prep, matrix, result.order, result, rules, Boolean(opt.roundTrip));
}

export function finalizePlan(
  prep: PreparedTour,
  matrix: TravelMatrix,
  order: string[],
  result: OrienteeringResult,
  rules: TourValidationRules,
  roundTrip = false,
): TourPlan {
  const byId = new Map(prep.candidates.map((c, i) => [c.id, { poi: c, node: i + 1 }]));
  const stops = order.map((id) => byId.get(id)!.poi);
  const nodes = order.map((id) => byId.get(id)!.node);
  const legMinutes: number[] = [];
  let distance = 0;
  let prev = 0;
  for (const n of nodes) {
    legMinutes.push(matrix.minutes[prev]![n]!);
    distance += matrix.meters[prev]![n]!;
    prev = n;
  }
  if (roundTrip) {
    legMinutes.push(matrix.minutes[prev]![0]!);
    distance += matrix.meters[prev]![0]!;
  }
  const issues = validateTour(
    {
      stops: stops.map((p) => ({
        id: p.id,
        location: p.location,
        accessible: p.accessible,
        partner: Boolean(p.partnerId),
      })),
      // the first leg leads from the start point to the first stop (zero for the forced start stop)
      legMinutes: legMinutes.slice(1),
      totalMinutes: result.totalMinutes,
    },
    rules,
  );
  const lats = stops.map((s) => s.location.lat);
  const lngs = stops.map((s) => s.location.lng);
  return {
    template: prep.template,
    stops,
    result,
    legMinutes,
    distanceMeters: Math.round(distance),
    issues,
    bbox: {
      south: Math.min(...lats),
      north: Math.max(...lats),
      west: Math.min(...lngs),
      east: Math.max(...lngs),
    },
  };
}

/**
 * Accepts an order suggested by the model only if it is a permutation of the optimizer's stops, its legs
 * stay plausible, and the total time stays within budget and not much above the optimizer's own route.
 */
export function acceptSuggestedOrder(
  prep: PreparedTour,
  matrix: TravelMatrix,
  plan: TourPlan,
  suggested: string[] | undefined,
  opt: PlanOptions = {},
): TourPlan {
  if (!suggested || suggested.length !== plan.stops.length) return plan;
  const ids = new Set(plan.stops.map((s) => s.id));
  if (new Set(suggested).size !== suggested.length || !suggested.every((s) => ids.has(s))) return plan;
  const rules: TourValidationRules = {
    ...DEFAULT_TOUR_RULES,
    ...opt.rules,
    minStops: opt.rules?.minStops ?? prep.template.minStops,
    budgetMinutes: prep.template.budgetMinutes,
  };
  const minutes = withEndNode(matrix.minutes, Boolean(opt.roundTrip));
  const ev = evaluateOrder(
    { candidates: prep.candidates.map(toCandidate), minutes, maxLegMinutes: rules.maxLegMinutes },
    suggested,
  );
  if (
    !ev ||
    !ev.legsOk ||
    ev.totalMinutes > prep.template.budgetMinutes ||
    ev.walkMinutes > plan.result.walkMinutes * 1.15 + 1
  )
    return plan;
  const next = finalizePlan(
    prep,
    matrix,
    suggested,
    { ...plan.result, order: suggested, totalMinutes: ev.totalMinutes, walkMinutes: ev.walkMinutes },
    rules,
    Boolean(opt.roundTrip),
  );
  return next.issues.length === 0 ? next : plan;
}

/** Pure end-to-end planning with the offline matrix; used by tests and as fallback when routing is down. */
export function planTour(
  pois: Poi[],
  template: TourTemplate,
  opt: PlanOptions = {},
): { prep: PreparedTour; plan: TourPlan } | undefined {
  const prep = prepareTour(pois, template, opt);
  if (!prep) return undefined;
  return {
    prep,
    plan: solveTour(prep, haversineMatrix(prep.matrixPoints, opt.profile ?? 'foot-walking'), opt),
  };
}

/** Jaccard similarity of stop sets, used to drop theme tours that repeat another tour. */
export function stopOverlap(a: string[], b: string[]): number {
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (sa.size + b.length - inter || 1);
}

/** Top interests of a tour's stops (by primary interest), used as theme labels. */
export function themesOf(stops: Poi[]): Interest[] {
  const counts = new Map<Interest, number>();
  for (const s of stops)
    if (s.primaryInterest) counts.set(s.primaryInterest, (counts.get(s.primaryInterest) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([, c]) => c >= 2)
    .slice(0, 3)
    .map(([i]) => i);
}

/** Douglas-Peucker style thinning of a polyline to at most `max` points (keeps first and last). */
export function simplifyPath(points: [number, number][], max = 400): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.round(i * step)]!);
  out.push(points[points.length - 1]!);
  return out;
}
