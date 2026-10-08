import { distanceMeters, type LatLng } from '@tuur/shared';
import type { ApplePlace } from '../../modules/tuur-apple-places';
import type { PauseDestination, PauseFilter, PauseKind } from './pauseDestination';

export function applePauseCategory(filter: PauseFilter): 'all' | ApplePlace['category'] {
  return filter === 'rest' ? 'park' : filter;
}

/** Transient presentation only: no shared Poi, database, tour, or narration representation is created. */
export function applePausePlaces(position: LatLng, places: ApplePlace[], filter: PauseFilter = 'all') {
  const unique = new Set<string>();
  return places
    .flatMap((place) => {
      if (unique.has(place.id) || !place.name.trim()) return [];
      // Sights belong to the discovery fallback, never to the break list.
      if (place.category === 'museum' || place.category === 'culture') return [];
      unique.add(place.id);
      const location = { lat: place.latitude, lng: place.longitude };
      const distanceM = distanceMeters(position, location);
      const kind: PauseKind = place.category === 'park' ? 'rest' : place.category;
      if (!Number.isFinite(distanceM) || distanceM > 1500 || (filter !== 'all' && kind !== filter)) return [];
      const destination: PauseDestination = { id: place.id, name: place.name, location };
      return [{ destination, kind, distanceM }];
    })
    .sort((a, b) => a.distanceM - b.distanceM || a.destination.id.localeCompare(b.destination.id))
    .slice(0, 12);
}

/**
 * The Apple fallback is offered only when the OSM catalogue has nothing to show (empty or failed) and the
 * native module is present. It never replaces, merges with or backfills OSM places.
 */
export function shouldOfferAppleFallback(input: {
  available: boolean;
  hasPosition: boolean;
  osmPlaceCount: number;
  osmReady: boolean;
  osmFailed: boolean;
}): boolean {
  return (
    input.available &&
    input.hasPosition &&
    input.osmPlaceCount === 0 &&
    (input.osmReady || input.osmFailed)
  );
}

/** Nearby sights for the transient fallback list: museums and culture only, nearest first. */
export function appleSightPlaces(position: LatLng, places: ApplePlace[], limit = 8) {
  const unique = new Set<string>();
  return places
    .flatMap((place) => {
      if (place.category !== 'museum' && place.category !== 'culture') return [];
      if (unique.has(place.id) || !place.name.trim()) return [];
      unique.add(place.id);
      const location = { lat: place.latitude, lng: place.longitude };
      const distanceM = distanceMeters(position, location);
      if (!Number.isFinite(distanceM) || distanceM > 1500) return [];
      const destination: PauseDestination = { id: place.id, name: place.name, location };
      return [{ destination, category: place.category, distanceM }];
    })
    .sort((a, b) => a.distanceM - b.distanceM || a.destination.id.localeCompare(b.destination.id))
    .slice(0, limit);
}
