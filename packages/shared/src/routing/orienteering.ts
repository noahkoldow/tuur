import type { Interest } from '../constants';
import type { LatLng } from '../geo/geohash';

export interface Candidate {
  id: string;
  location: LatLng;
  /** Final POI score 0-100 (already includes admin weight and the capped partner boost). */
  score: number;
  dwellMinutes: number;
  interests: Interest[];
  partner?: boolean;
}

export interface OrienteeringInput {
  candidates: Candidate[];
  /**
   * Travel minutes, node order: 0 = start, 1..n = candidates (same order as `candidates`), n+1 = end.
   * For round trips the end node is a copy of the start.
   */
  minutes: number[][];
  budgetMinutes: number;
  /** Interests the listener selected; empty means a balanced mix (no weighting). */
  interests?: Interest[];
  /** Hard cap for any single walking leg. */
  maxLegMinutes?: number;
  /** Max share of partner stops in the tour (spec 7.1, default 0.25). */
  maxPartnerShare?: number;
  /** A partner stop may add at most this many minutes of detour. */
  maxPartnerDetourMinutes?: number;
  /** Candidate ids that must be included if feasible. */
  forcedIds?: string[];
}

export interface OrienteeringResult {
  /** Ordered candidate ids. */
  order: string[];
  totalMinutes: number;
  walkMinutes: number;
  totalScore: number;
}

export function weightedScore(c: Candidate, interests: Interest[] | undefined): number {
  if (!interests || interests.length === 0) return c.score;
  const match = c.interests.some((i) => interests.includes(i));
  return c.score * (match ? 1.5 : 0.55);
}

interface State {
  route: number[]; // candidate node indices (1..n)
}

/**
 * Orienteering heuristic (spec 4.5): greedy insertion by value-per-added-minute, then 2-opt on the
 * travel legs, then re-insertion until nothing improves. Fully deterministic: ties break by id, then position.
 */
export function solveOrienteering(inp: OrienteeringInput): OrienteeringResult {
  const n = inp.candidates.length;
  const end = n + 1;
  const t = inp.minutes;
  const dwell = (i: number) => inp.candidates[i - 1]!.dwellMinutes;
  const value = inp.candidates.map((c) => weightedScore(c, inp.interests));
  const maxLeg = inp.maxLegMinutes ?? Infinity;
  const partnerShare = inp.maxPartnerShare ?? 0.25;
  const partnerDetour = inp.maxPartnerDetourMinutes ?? 8;
  const isPartner = (i: number) => Boolean(inp.candidates[i - 1]!.partner);

  const walk = (r: number[]) => {
    let w = 0;
    let prev = 0;
    for (const i of r) {
      w += t[prev]![i]!;
      prev = i;
    }
    return w + t[prev]![end]!;
  };
  const total = (r: number[]) => walk(r) + r.reduce((s, i) => s + dwell(i), 0);

  const legsOk = (r: number[]) => {
    let prev = 0;
    for (const i of r) {
      if (t[prev]![i]! > maxLeg) return false;
      prev = i;
    }
    return t[prev]![end]! <= maxLeg;
  };

  const partnerOk = (r: number[]) => {
    const partners = r.filter(isPartner).length;
    return partners <= Math.floor(partnerShare * r.length + 1e-9);
  };

  const state: State = { route: [] };
  const inRoute = () => new Set(state.route);

  const insertBest = (): boolean => {
    const used = inRoute();
    const curTotal = total(state.route);
    let best: { i: number; pos: number; ratio: number; val: number; id: string } | undefined;
    for (let i = 1; i <= n; i++) {
      if (used.has(i)) continue;
      const id = inp.candidates[i - 1]!.id;
      for (let pos = 0; pos <= state.route.length; pos++) {
        const prev = pos === 0 ? 0 : state.route[pos - 1]!;
        const next = pos === state.route.length ? end : state.route[pos]!;
        const detour = t[prev]![i]! + t[i]![next]! - t[prev]![next]!;
        const dt = detour + dwell(i);
        if (curTotal + dt > inp.budgetMinutes + 1e-9) continue;
        if (t[prev]![i]! > maxLeg || t[i]![next]! > maxLeg) continue;
        if (isPartner(i)) {
          if (detour > partnerDetour) continue;
          const trial = [...state.route.slice(0, pos), i, ...state.route.slice(pos)];
          if (!partnerOk(trial)) continue;
        }
        const ratio = value[i - 1]! / Math.max(dt, 0.5);
        const eps = 1e-9;
        const better =
          !best ||
          ratio > best.ratio + eps ||
          (Math.abs(ratio - best.ratio) <= eps &&
            (value[i - 1]! > best.val + eps || (Math.abs(value[i - 1]! - best.val) <= eps && id < best.id)));
        if (better) best = { i, pos, ratio, val: value[i - 1]!, id };
      }
    }
    if (!best || value[best.i - 1]! <= 0) return false;
    state.route.splice(best.pos, 0, best.i);
    return true;
  };

  // Forced stops first (if they fit), cheapest insertion.
  for (const fid of inp.forcedIds ?? []) {
    const i = inp.candidates.findIndex((c) => c.id === fid) + 1;
    if (i === 0 || state.route.includes(i)) continue;
    let bestPos = -1;
    let bestDt = Infinity;
    for (let pos = 0; pos <= state.route.length; pos++) {
      const prev = pos === 0 ? 0 : state.route[pos - 1]!;
      const next = pos === state.route.length ? end : state.route[pos]!;
      const dt = t[prev]![i]! + t[i]![next]! - t[prev]![next]! + dwell(i);
      if (total(state.route) + dt <= inp.budgetMinutes && dt < bestDt) {
        bestDt = dt;
        bestPos = pos;
      }
    }
    if (bestPos >= 0) state.route.splice(bestPos, 0, i);
  }

  while (insertBest()) {
    /* keep inserting */
  }

  // 2-opt on the travel legs (endpoints fixed), then try to use the freed time for more stops.
  for (let round = 0; round < 25; round++) {
    let improved = false;
    const r = state.route;
    for (let a = 0; a < r.length - 1; a++) {
      for (let b = a + 1; b < r.length; b++) {
        const cand = [...r.slice(0, a), ...r.slice(a, b + 1).reverse(), ...r.slice(b + 1)];
        if (walk(cand) < walk(r) - 1e-6 && legsOk(cand)) {
          state.route = cand;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) {
      const before = state.route.length;
      while (insertBest()) {
        /* use freed time */
      }
      if (state.route.length === before) break;
    }
  }

  const order = state.route.map((i) => inp.candidates[i - 1]!.id);
  return {
    order,
    totalMinutes: Math.round(total(state.route) * 10) / 10,
    walkMinutes: Math.round(walk(state.route) * 10) / 10,
    totalScore: Math.round(state.route.reduce((s, i) => s + value[i - 1]!, 0)),
  };
}

/** Time of an explicit order (used to re-check LLM-suggested orders, spec 4.3). */
export function evaluateOrder(
  inp: Pick<OrienteeringInput, 'candidates' | 'minutes' | 'maxLegMinutes'>,
  order: string[],
): { totalMinutes: number; walkMinutes: number; legsOk: boolean } | undefined {
  const n = inp.candidates.length;
  const idx = new Map(inp.candidates.map((c, i) => [c.id, i + 1]));
  let prev = 0;
  let walk = 0;
  let dwell = 0;
  let legsOk = true;
  for (const id of order) {
    const i = idx.get(id);
    if (!i) return undefined;
    const leg = inp.minutes[prev]![i]!;
    if (leg > (inp.maxLegMinutes ?? Infinity)) legsOk = false;
    walk += leg;
    dwell += inp.candidates[i - 1]!.dwellMinutes;
    prev = i;
  }
  const last = inp.minutes[prev]![n + 1]!;
  if (last > (inp.maxLegMinutes ?? Infinity)) legsOk = false;
  walk += last;
  return {
    totalMinutes: Math.round((walk + dwell) * 10) / 10,
    walkMinutes: Math.round(walk * 10) / 10,
    legsOk,
  };
}
