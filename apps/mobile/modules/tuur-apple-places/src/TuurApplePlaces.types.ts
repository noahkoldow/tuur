import type { ViewProps } from 'react-native';

export type ApplePlaceCategory = 'coffee' | 'food' | 'park' | 'toilets' | 'museum' | 'culture';
/** `sights` searches museums and culture together; `all` keeps meaning the everyday break categories. */
export type ApplePlacesSearchCategory = ApplePlaceCategory | 'all' | 'sights';

/** Apple results are transient UI data: never persist, upload, or merge into the OSM POI catalog. */
export type ApplePlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: ApplePlaceCategory;
};

export type ApplePlacesSearchOptions = {
  latitude: number;
  longitude: number;
  /** Clamped to 100–1500 metres; defaults to 1500. */
  radiusMeters?: number;
  category: ApplePlacesSearchCategory;
};

export type ApplePlacesMapViewProps = ViewProps & {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  places: ApplePlace[];
  selectedPlaceId?: string;
  onPlaceSelected?: (event: { nativeEvent: { id: string } }) => void;
};

export interface ApplePlacesNativeModule {
  searchNearby(options: ApplePlacesSearchOptions): Promise<ApplePlace[]>;
  cancelSearch(): Promise<void>;
}
