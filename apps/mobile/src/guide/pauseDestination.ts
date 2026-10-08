import { distanceMeters, type LatLng, type Poi } from '@tuur/shared';

export type PauseKind = 'coffee' | 'food' | 'rest' | 'toilets';
export type PauseFilter = 'all' | PauseKind;
/** A navigation-only destination; Apple results must never become narrated POIs or tour history. */
export type PauseDestination = { id: string; name: string; location: LatLng };

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
  if (tags.amenity === 'toilets') return 'toilets';
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
  destination: PauseDestination,
  openUrl: (url: string) => Promise<unknown>,
  tour?: PausableTour,
  maps: 'apple' | 'google' = 'google',
): Promise<void> {
  const coordinates = encodeURIComponent(`${destination.location.lat},${destination.location.lng}`);
  const url =
    maps === 'apple'
      ? `https://maps.apple.com/?daddr=${coordinates}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${coordinates}&travelmode=walking`;
  await openPauseMap(url, openUrl, tour);
}

/** External Apple search is also available when the installed app has no native search module yet. */
export async function openApplePauseSearch(
  position: LatLng,
  query: string,
  openUrl: (url: string) => Promise<unknown>,
  tour?: PausableTour,
): Promise<void> {
  const center = encodeURIComponent(`${position.lat},${position.lng}`);
  await openPauseMap(`https://maps.apple.com/?q=${encodeURIComponent(query)}&sll=${center}`, openUrl, tour);
}

async function openPauseMap(url: string, openUrl: (url: string) => Promise<unknown>, tour?: PausableTour) {
  const alreadyPaused = tour?.getState().paused ?? false;
  if (!alreadyPaused) tour?.pause();
  try {
    await openUrl(url);
  } catch (error) {
    if (!alreadyPaused) tour?.resume();
    throw error;
  }
}
