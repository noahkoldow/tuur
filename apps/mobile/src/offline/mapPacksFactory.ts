import { config } from '../config';
import { MapLibreMapPackManager } from './mapLibrePacks';
import { NoopMapPackManager, type MapPackManager } from './mapPacks';

/** Native: MapLibre offline packs (demo backend uses the no-op manager). */
export function createMapPackManager(): MapPackManager {
  return config.backend === 'demo' ? new NoopMapPackManager() : new MapLibreMapPackManager();
}
