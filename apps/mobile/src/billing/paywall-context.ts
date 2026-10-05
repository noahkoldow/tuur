import type { Entitlement } from '@tuur/shared';
import { canDownloadTour, canStartTour, canUseSession } from './access';

export type PaywallParams = {
  kind?: 'tour' | 'session';
  tourId?: string;
  placeId?: string;
  mode?: 'planned' | 'fork' | 'roam';
  intent?: 'download' | 'pricing';
};

/** Browsing prices has no unlock target and must stay open even when preview playback is free. */
export function paywallContext(state: { entitlements: Entitlement[] }, params: PaywallParams) {
  const { kind = 'tour', tourId, placeId, mode = 'planned', intent } = params;
  const browsing = intent === 'pricing' || !(kind === 'tour' ? tourId : placeId);
  const downloading = !browsing && intent === 'download';
  const unlocked =
    !browsing &&
    (downloading
      ? canDownloadTour(state, {
          ...(tourId ? { tourId } : {}),
          ...(placeId ? { placeId } : {}),
          mode: kind === 'tour' ? 'tour' : mode,
        })
      : kind === 'tour'
        ? canStartTour(state, tourId!, false)
        : canUseSession(state, mode, placeId));
  return { browsing, downloading, unlocked };
}
