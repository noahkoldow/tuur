import {
  rankNearbyPlaces,
  ROAM_START_MAX_M,
  type Interest,
  type LatLng,
  type PlaceIdentity,
  type Poi,
} from '@tuur/shared';

/** Nearby destinations balance significance and distance from the live GPS position. */
export function nearbyRoamPlaces(
  position: LatLng,
  candidates: Poi[],
  excludedIds: readonly string[],
  limit = 8,
  options: { interests?: Interest[]; excludedPlaces?: readonly PlaceIdentity[] } = {},
): Poi[] {
  return rankNearbyPlaces(position, candidates, {
    ...options,
    excludedIds,
    limit,
    maxDistanceM: ROAM_START_MAX_M,
  });
}
