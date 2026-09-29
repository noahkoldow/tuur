import { distanceMeters, type LatLng } from '../geo/geohash';

export interface TourValidationInput {
  stops: { id: string; location: LatLng; accessible: boolean; partner?: boolean }[];
  /** travel minutes between consecutive stops (length = stops.length - 1) */
  legMinutes: number[];
  totalMinutes: number;
}

export interface TourValidationRules {
  minStops: number;
  maxLegMinutes: number;
  budgetMinutes: number;
  maxPartnerShare: number;
  /** Two stops closer than this are considered duplicates even with different ids. */
  minStopDistanceM: number;
}

export const DEFAULT_TOUR_RULES: Omit<TourValidationRules, 'budgetMinutes'> = {
  minStops: 4,
  maxLegMinutes: 15,
  maxPartnerShare: 0.25,
  minStopDistanceM: 25,
};

export type TourIssue =
  'too_few_stops' | 'leg_too_long' | 'duplicate_stop' | 'not_accessible' | 'over_budget' | 'partner_share';

/** Spec 4.3 validation; returns all violated rules (empty = valid). */
export function validateTour(inp: TourValidationInput, rules: TourValidationRules): TourIssue[] {
  const issues = new Set<TourIssue>();
  if (inp.stops.length < rules.minStops) issues.add('too_few_stops');
  if (inp.legMinutes.some((m) => m > rules.maxLegMinutes)) issues.add('leg_too_long');
  if (inp.stops.some((s) => !s.accessible)) issues.add('not_accessible');
  if (inp.totalMinutes > rules.budgetMinutes + 1e-6) issues.add('over_budget');
  const ids = new Set<string>();
  for (const [i, s] of inp.stops.entries()) {
    if (ids.has(s.id)) issues.add('duplicate_stop');
    ids.add(s.id);
    for (let j = 0; j < i; j++)
      if (distanceMeters(s.location, inp.stops[j]!.location) < rules.minStopDistanceM)
        issues.add('duplicate_stop');
  }
  const partners = inp.stops.filter((s) => s.partner).length;
  if (partners > Math.floor(rules.maxPartnerShare * inp.stops.length + 1e-9)) issues.add('partner_share');
  return [...issues];
}
