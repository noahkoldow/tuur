import type { GetNarrationRequest } from './types';

const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

/** Cache key = poiId + lang + lengthTier + primaryInterest + promptVersion (spec 4.4.1); doubles as doc id. */
export function narrationKey(
  req: Pick<GetNarrationRequest, 'poiId' | 'lang' | 'lengthTier' | 'primaryInterest'>,
  promptVersion: string,
): string {
  return [req.poiId, req.lang, req.lengthTier, req.primaryInterest ?? 'balanced', promptVersion]
    .map(clean)
    .join('__');
}
