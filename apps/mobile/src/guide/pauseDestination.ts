import { distanceMeters, type LatLng, type Poi } from '@tuur/shared';

export type PauseKind = 'coffee' | 'food' | 'rest';
export type PauseFilter = 'all' | PauseKind;

/** Only explicit place tags qualify; a culinary story is not necessarily a café. */
export function pauseKind(poi: Poi): PauseKind | undefined {
  const tags = poi.osmTags;
  if (
    poi.hidden ||
    ['no', 'private'].includes(tags.access ?? '') ||
    tags.disused === 'yes' ||
    tags.abandoned === 'yes'
  )
    return;
  if (tags.amenity === 'cafe' || tags.shop === 'bakery') return 'coffee';
  if (['restaurant', 'fast_food', 'food_court', 'ice_cream'].includes(tags.amenity ?? '')) return 'food';
  if (
    ['park', 'garden'].includes(tags.leisure ?? '') ||
    ['bench', 'shelter'].includes(tags.amenity ?? '') ||
    tags.tourism === 'picnic_site'
  )
    return 'rest';
}

export function nearbyPausePlaces(position: LatLng, pois: Poi[], filter: PauseFilter = 'all') {
  return pois
    .flatMap((poi) => {
      const kind = pauseKind(poi);
      const distanceM = distanceMeters(position, poi.location);
      return kind && (filter === 'all' || kind === filter) && distanceM <= 1500
        ? [{ poi, kind, distanceM }]
        : [];
    })
    .sort((a, b) => a.distanceM - b.distanceM || a.poi.id.localeCompare(b.poi.id))
    .slice(0, 12);
}

type PausableTour = {
  getState(): { paused: boolean };
  pause(): void;
  resume(): void;
};

/** Keep the personal itinerary intact. A failed handoff restores the previous playback state. */
export async function openPauseDirections(
  poi: Poi,
  openUrl: (url: string) => Promise<unknown>,
  tour?: PausableTour,
): Promise<void> {
  const alreadyPaused = tour?.getState().paused ?? false;
  if (!alreadyPaused) tour?.pause();
  try {
    const destination = encodeURIComponent(`${poi.location.lat},${poi.location.lng}`);
    await openUrl(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`);
  } catch (error) {
    if (!alreadyPaused) tour?.resume();
    throw error;
  }
}
