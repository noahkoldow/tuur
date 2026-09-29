import { NoopMapPackManager, type MapPackManager } from './mapPacks';

export function createMapPackManager(): MapPackManager {
  return new NoopMapPackManager();
}
