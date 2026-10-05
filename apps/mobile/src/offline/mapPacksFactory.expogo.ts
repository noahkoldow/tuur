import { UnavailableMapPackManager, type MapPackManager } from './mapPacks';

/** Expo Go's react-native-maps preview cannot install MapLibre offline packs. Audio still downloads. */
export function createMapPackManager(): MapPackManager {
  return new UnavailableMapPackManager();
}
