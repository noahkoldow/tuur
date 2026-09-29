import type { WikipediaRef } from '../schemas';
import type { MergedPoi } from './merge';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const TOURISM_POINTS: Record<string, number> = {
  attraction: 12,
  museum: 14,
  gallery: 9,
  viewpoint: 8,
  artwork: 4,
  zoo: 10,
  theme_park: 10,
  aquarium: 9,
};
const HISTORIC_POINTS: Record<string, number> = {
  castle: 16,
  palace: 16,
  monument: 9,
  memorial: 6,
  ruins: 10,
  archaeological_site: 12,
  church: 10,
  monastery: 12,
  fort: 12,
  city_gate: 12,
  citywalls: 10,
  manor: 10,
};

export function wikipediaPoints(refs: WikipediaRef[]): number {
  if (refs.length === 0) return 0;
  const langs = Math.min(20, 5 + 4 * refs.length); // existence + breadth
  const best = Math.max(...refs.map((r) => r.length));
  // ~1k chars -> 4, ~10k -> 10, ~100k -> 15
  const len = best > 0 ? clamp(5 * Math.log10(1 + best / 300), 0, 15) : 0;
  return langs + len;
}

export function sitelinkPoints(n: number): number {
  return clamp(5 * Math.log2(1 + n), 0, 25);
}

/** Source-based sightseeing score 0-100 (spec 4.2), independent of the surroundings. */
export function rawScore(p: MergedPoi): number {
  let s = wikipediaPoints(p.wikipedia) + sitelinkPoints(p.sitelinks);
  const t = p.osmTags;
  if (t['tourism']) s += TOURISM_POINTS[t['tourism']] ?? 3;
  if (t['historic'] && t['historic'] !== 'no') s += HISTORIC_POINTS[t['historic']] ?? 5;
  if (t['heritage']) s += 8;
  if (t['wikidata'] || p.wikidataId) s += 3;
  if (t['amenity'] === 'place_of_worship') s += 4;
  if (t['name'] && t['tourism'] === 'artwork' && !p.wikipedia.length) s -= 2;
  if (t['shop'] || (t['amenity'] && ['restaurant', 'cafe', 'fast_food', 'pub', 'bar'].includes(t['amenity'])))
    s -= 5;
  return Math.round(clamp(s, 0, 100));
}

export interface RelativeOptions {
  /** Below this many candidates the raw score is kept as-is. */
  minSetSize: number;
  /** 0..1 weight of the relative component. */
  relativeWeight: number;
}
export const DEFAULT_RELATIVE: RelativeOptions = { minSetSize: 5, relativeWeight: 0.6 };

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
}

/**
 * Normalizes raw scores relative to the neighborhood so a small town's best sights still rank high while a
 * metropolis does not flatten (spec 4.2). Returns scores aligned to the input order.
 */
export function relativeScores(raw: number[], opt: RelativeOptions = DEFAULT_RELATIVE): number[] {
  if (raw.length < opt.minSetSize) return raw.map((r) => clamp(Math.round(r), 0, 100));
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = percentile(sorted, 0.1);
  const hi = Math.max(percentile(sorted, 0.95), lo + 1);
  return raw.map((r) => {
    const rel = clamp(((r - lo) / (hi - lo)) * 100, 0, 100);
    return clamp(Math.round(opt.relativeWeight * rel + (1 - opt.relativeWeight) * r), 0, 100);
  });
}

export interface ScoreModifiers {
  adminWeight?: number;
  partnerBoost?: number;
  /** Hard cap on how many points a partner boost may add (spec 4.2/7.1). */
  partnerBoostCap?: number;
}

export function applyModifiers(base: number, m: ScoreModifiers): number {
  const boost = clamp(m.partnerBoost ?? 0, 0, m.partnerBoostCap ?? 15);
  return clamp(Math.round(base * (m.adminWeight ?? 1) + boost), 0, 100);
}

/** Rough visit duration in minutes; used by the orienteering optimizer. */
export function estimateDwellMinutes(score: number, tags: Record<string, string>): number {
  if (tags['tourism'] === 'museum') return clamp(20 + score / 5, 20, 40);
  if (tags['tourism'] === 'viewpoint' || tags['tourism'] === 'artwork') return 3;
  if (tags['leisure'] === 'park') return 10;
  return clamp(Math.round(3 + score / 12), 3, 12);
}
