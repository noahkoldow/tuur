import { MapLibreMapPackManager } from './mapLibrePacks';
import type { MapPackManager } from './mapPacks';

/** Native packs require a source explicitly configured for offline use. */
export function createMapPackManager(): MapPackManager {
  return new MapLibreMapPackManager();
}
