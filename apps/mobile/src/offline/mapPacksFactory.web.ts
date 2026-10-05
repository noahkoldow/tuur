import { UnavailableMapPackManager, type MapPackManager } from './mapPacks';

export function createMapPackManager(): MapPackManager {
  return new UnavailableMapPackManager();
}
