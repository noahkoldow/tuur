import { DEFAULT_GEOHASH_PRECISION, type Interest } from '../constants';
import { encodeGeohash } from '../geo/geohash';
import type { ImageRef, Poi } from '../schemas';
import { classifyByRules, type Classification } from './classify';
import { DEFAULT_MERGE, mergeRawPois, type MergeOptions, type MergedPoi } from './merge';
import type { RawPoi } from './raw';
import {
  DEFAULT_RELATIVE,
  estimateDwellMinutes,
  rawScore,
  relativeScores,
  type RelativeOptions,
} from './scoring';

export interface AccessTagCheck {
  accessible: boolean;
}

/** Public accessibility from OSM `access`/`fee` style tags; unknown means accessible (spec 4.3 validation). */
export function isPubliclyAccessible(tags: Record<string, string>): boolean {
  const access = tags['access'];
  if (access && ['private', 'no', 'customers', 'permit'].includes(access)) return false;
  if (tags['disused'] === 'yes' || tags['abandoned'] === 'yes') return false;
  if (tags['military'] && tags['military'] !== 'no') return false;
  return true;
}

/** Deterministic id so re-ingest updates instead of duplicating: Wikidata > OSM > name+coords. */
export function poiId(m: MergedPoi): string {
  if (m.wikidataId) return `wd_${m.wikidataId}`;
  if (m.osmId) return `osm_${m.osmId.replace('/', '_')}`;
  const c = `${m.location.lat.toFixed(5)}_${m.location.lng.toFixed(5)}`;
  return `pt_${c.replace(/[.-]/g, (x) => (x === '.' ? 'p' : 'm'))}`;
}

export interface BuildOptions {
  now: number;
  precision?: number;
  merge?: MergeOptions;
  relative?: RelativeOptions;
  /** Resolves image metadata for Commons files; missing entries yield no image (never unattributed). */
  images?: Map<string, ImageRef>;
  /** Interests for candidates the rules could not classify (from the lite LLM). */
  llmInterests?: Map<string, Interest[]>;
  /** Extra POIs of the surroundings to normalize against (already scored raw values). */
  neighborRawScores?: number[];
  /** Minimum raw score for a POI to be kept at all. */
  minRawScore?: number;
}

export interface BuildResult {
  pois: Poi[];
  /** Candidates the rules could not classify, keyed by poiId, for an optional LLM pass. */
  unclassified: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[];
}

/** Full pure ingest transformation: merge -> classify -> score -> relative normalize. */
export function buildPois(raw: RawPoi[], opt: BuildOptions): BuildResult {
  const precision = opt.precision ?? DEFAULT_GEOHASH_PRECISION;
  const merged = mergeRawPois(raw, opt.merge ?? DEFAULT_MERGE);
  const classes: Classification[] = merged.map(classifyByRules);
  const raws = merged.map(rawScore);
  const rel = relativeScores(
    [...raws, ...(opt.neighborRawScores ?? [])],
    opt.relative ?? DEFAULT_RELATIVE,
  ).slice(0, merged.length);
  const min = opt.minRawScore ?? 1;
  const pois: Poi[] = [];
  const unclassified: BuildResult['unclassified'] = [];
  merged.forEach((m, i) => {
    const id = poiId(m);
    let cls = classes[i]!;
    if (!cls.confident) {
      const llm = opt.llmInterests?.get(id);
      if (llm && llm.length) cls = { interests: llm, primary: llm[0]!, confident: true };
      else unclassified.push({ key: id, name: m.name, tags: m.osmTags, instanceOf: m.instanceOf });
    }
    const raw0 = raws[i]!;
    if (raw0 < min && cls.interests.length === 0) return;
    const base = rel[i]!;
    const image = m.imageFile ? opt.images?.get(m.imageFile) : undefined;
    pois.push({
      id,
      name: m.name,
      names: m.names,
      location: m.location,
      geohash: encodeGeohash(m.location.lat, m.location.lng, 9),
      tile: encodeGeohash(m.location.lat, m.location.lng, precision),
      osmTags: m.osmTags,
      interests: cls.interests,
      ...(cls.primary ? { primaryInterest: cls.primary } : {}),
      rawScore: raw0,
      baseScore: base,
      score: base,
      hidden: false,
      adminWeight: 1,
      adminFacts: [],
      accessible: isPubliclyAccessible(m.osmTags),
      imageRefs: image ? [image] : [],
      sources: {
        ...(m.osmId ? { osmId: m.osmId } : {}),
        ...(m.wikidataId ? { wikidataId: m.wikidataId } : {}),
        wikipedia: m.wikipedia,
        sitelinks: m.sitelinks,
      },
      dwellMinutes: estimateDwellMinutes(base, m.osmTags),
      updatedAt: opt.now,
    });
  });
  return { pois, unclassified };
}
