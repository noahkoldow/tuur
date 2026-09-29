import type { AreaStatus } from '../constants';
import type { Poi } from '../schemas';

export interface QualityOptions {
  /** A POI counts as "quality" from this final score on. */
  minScore: number;
  /** Minimum number of quality POIs for the area to be `ready`. */
  minQualityPois: number;
}
export const DEFAULT_QUALITY: QualityOptions = { minScore: 20, minQualityPois: 3 };

export function countQualityPois(pois: Poi[], opt: QualityOptions = DEFAULT_QUALITY): number {
  return pois.filter((p) => !p.hidden && p.accessible && p.score >= opt.minScore && p.interests.length > 0)
    .length;
}

/** Spec 4.1: too few or too weak POIs -> `low_content`. */
export function statusForIngest(
  pois: Poi[],
  opt: QualityOptions = DEFAULT_QUALITY,
): Extract<AreaStatus, 'ready' | 'low_content'> {
  return countQualityPois(pois, opt) >= opt.minQualityPois ? 'ready' : 'low_content';
}
