import nativeModule from './TuurApplePlacesModule';
import type { ApplePlace, ApplePlacesSearchOptions } from './TuurApplePlaces.types';

export const isApplePlacesAvailable = nativeModule !== null;

export async function searchApplePlaces(options: ApplePlacesSearchOptions): Promise<ApplePlace[]> {
  if (!nativeModule)
    throw Object.assign(new Error('Apple place search requires a native build with MapKit support.'), {
      code: 'ERR_APPLE_PLACES_UNAVAILABLE',
    });
  if (
    !Number.isFinite(options.latitude) ||
    Math.abs(options.latitude) > 90 ||
    !Number.isFinite(options.longitude) ||
    Math.abs(options.longitude) > 180 ||
    (options.radiusMeters !== undefined && !Number.isFinite(options.radiusMeters)) ||
    !['all', 'sights', 'coffee', 'food', 'park', 'toilets', 'museum', 'culture'].includes(options.category)
  )
    throw Object.assign(new Error('Invalid nearby search coordinates or category.'), {
      code: 'ERR_APPLE_PLACES_ARGUMENT',
    });
  return nativeModule.searchNearby({
    latitude: options.latitude,
    longitude: options.longitude,
    radiusMeters: Math.min(1500, Math.max(100, options.radiusMeters ?? 1500)),
    category: options.category,
  });
}

/** Cancels the active native request when closing or changing the break search. */
export async function cancelApplePlacesSearch(): Promise<void> {
  await nativeModule?.cancelSearch();
}
