import { BackendError } from '../backend/types';

export type AreaErrorCode = 'network' | 'coverage' | 'temporary' | 'generic';

/** Keep an unavailable data source distinct from a successful search with no places. */
export function areaErrorCode(error: unknown): AreaErrorCode {
  if (!(error instanceof BackendError)) return 'generic';
  if (error.reason === 'beta_area_unavailable') return 'coverage';
  if (error.code === 'network') return 'network';
  if (['rate_limited', 'paused', 'unavailable'].includes(error.code)) return 'temporary';
  return 'generic';
}

export const areaErrorKeys: Record<AreaErrorCode, string> = {
  network: 'errors.network',
  coverage: 'errors.areaCoverage',
  temporary: 'errors.placesUnavailable',
  generic: 'errors.placesUnavailable',
};
