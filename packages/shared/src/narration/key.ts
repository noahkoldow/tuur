import type { GetNarrationRequest } from './types';
import { NarrationContextSchema, storyFingerprint } from './script';

const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

/** Cache key = poiId + lang + lengthTier + primaryInterest + promptVersion (spec 4.4.1); doubles as doc id. */
export function narrationKey(
  req: Pick<GetNarrationRequest, 'poiId' | 'lang' | 'lengthTier' | 'primaryInterest' | 'context'>,
  promptVersion: string,
): string {
  const context = req.context ? NarrationContextSchema.parse(req.context) : undefined;
  return [
    req.poiId,
    req.lang,
    req.lengthTier,
    req.primaryInterest ?? 'balanced',
    promptVersion,
    ...(context && Object.keys(context).length ? [`story_${storyFingerprint(JSON.stringify(context))}`] : []),
  ]
    .map(clean)
    .join('__');
}
