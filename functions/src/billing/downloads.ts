import { z } from 'zod';
import { downloadTourMode, type OfflineDownloadAccess, type Tour } from '@tuur/shared';
import { authorizeContent, BillingError, type BillingDeps } from './entitlements';

const Request = z.object({ tourId: z.string().min(1).max(200), mode: z.enum(['tour', 'planned']) });

/** Authorize saving a fixed itinerary without claiming a tour start or changing monthly usage. */
export async function prepareTourDownload(
  deps: BillingDeps,
  uid: string,
  raw: unknown,
): Promise<OfflineDownloadAccess> {
  const parsed = Request.safeParse(raw);
  if (!parsed.success) throw new BillingError('invalid-argument', 'Only fixed itineraries can be downloaded');
  const { tourId, mode } = parsed.data;
  const ref =
    mode === 'planned'
      ? deps.db
          .collection('users')
          .doc(uid)
          .collection('sessions')
          .doc(tourId.replace(/^planned_/, ''))
      : deps.db.collection('tours').doc(tourId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError('not-found', 'Tour not available');
  const tour = snap.data() as Tour;
  if (downloadTourMode({ ...tour, id: tourId }) !== mode)
    throw new BillingError('permission-denied', 'This route cannot be downloaded', {
      reason: 'download_not_supported',
    });
  await authorizeContent(deps, uid, { tourId, mode, download: true, poiIds: tour.stops.map((s) => s.poiId) });
  // The 24h private session governs new online curation. A fully downloaded fixed itinerary is kept.
  return { tourId, mode, grantedAt: deps.now(), expiresAt: null };
}
