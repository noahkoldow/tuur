import type { GenerateToursResult } from '@tuur/shared';
import type { AreaInfo } from '../backend/types';

export type AreaPhase = 'no-location' | 'exploring' | 'generating' | 'ready' | 'low_content' | 'failed';

/** Pure phase logic of the home screen (tested): a failed area request must never look like endless exploring. */
export function deriveAreaPhase(i: {
  position: unknown;
  area: AreaInfo | null;
  tourCall: GenerateToursResult['status'] | 'idle' | 'error';
  toursCount: number;
  ensureFailed: boolean;
}): AreaPhase {
  const { area } = i;
  if (!i.position) return 'no-location';
  if (area?.status === 'failed' || i.tourCall === 'error' || (i.ensureFailed && !area)) return 'failed';
  if (!area || area.status === 'empty' || area.status === 'ingesting') return 'exploring';
  if (i.tourCall === 'generating' || i.tourCall === 'idle') return i.toursCount ? 'ready' : 'generating';
  if (area.status === 'low_content' && i.toursCount === 0) return 'low_content';
  return 'ready';
}
