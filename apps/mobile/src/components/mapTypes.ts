import type { Interest, LatLng } from '@tuur/shared';
import type { PinState } from './HeartPin';

export interface MapStop {
  id: string;
  location: LatLng;
  number: number;
  state: PinState;
  interest?: Interest;
  partner?: boolean;
}

/** A place other users explored (anonymous aggregate); marker size follows popularity. */
export interface MapSpot {
  id: string;
  location: LatLng;
  name: string;
  interest?: Interest;
  /** 0..1 marker size. */
  scale: number;
  hot: boolean;
}

export interface TuurMapProps {
  /** Initial/fallback center. */
  center: LatLng;
  zoom?: number;
  user?: { lat: number; lng: number; heading?: number } | undefined;
  stops?: MapStop[];
  /** Route polyline in brand red (whole route, or the part after the current leg while navigating). */
  route?: LatLng[];
  /** Walked part of the route, drawn muted. */
  routeDone?: LatLng[];
  /** Current navigation leg (user -> next stop), drawn prominently; when set, `route` is drawn lighter. */
  leg?: LatLng[];
  spots?: MapSpot[];
  onSpotPress?: (id: string) => void;
  /** Taps on the map background (not on markers). */
  onMapPress?: () => void;
  /** Fit the camera to these points (tour overview); takes precedence over `center`. */
  fit?: LatLng[];
  /** Shows the "back to my location" button (the camera never follows on its own). Default: when `user` is set. */
  locateButton?: boolean;
  /** Bottom padding so content is not hidden behind a sheet. */
  bottomInset?: number;
  onStopPress?: (id: string) => void;
  testID?: string;
}

export const ROUTE_DONE_COLOR = '#B9B9B9';
export const LOCATE_ZOOM = 16.5;
