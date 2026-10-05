import {
  decideAccess,
  decideDownloadAccess,
  isSubscriber,
  type AccessContext,
  type Entitlement,
} from '@tuur/shared';
import { config } from '../config';

type Ents = { entitlements: Entitlement[] };

/** Whether a standard tour may be started (free tour, bought/redeemed tour or subscription). */
export function canStartTour(s: Ents, tourId: string, free: boolean, now = Date.now()) {
  if (!config.paywall) return true;
  return decideAccess(s.entitlements, { tourId, tourFree: free, mode: 'tour' }, now).allowed;
}

/** Whether a dynamic mode (planned route, crossroads, roam) may be used at a place (24 h session or subscription). */
export function canUseSession(
  s: Ents,
  mode: 'planned' | 'fork' | 'roam',
  placeId: string | undefined,
  now = Date.now(),
) {
  if (!config.paywall) return true;
  return decideAccess(s.entitlements, { mode, ...(placeId ? { placeId } : {}) }, now).allowed;
}

export const subscribed = (s: Ents, now = Date.now()) => isSubscriber(s.entitlements, now);

/** Download rights are separate from free/ad/invite playback, including in the interactive demo. */
export function canDownloadTour(s: Ents, context: AccessContext, now = Date.now()) {
  return decideDownloadAccess(s.entitlements, context, now).allowed;
}
