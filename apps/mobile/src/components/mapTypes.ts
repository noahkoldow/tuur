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

/** A nearby suggestion or explored place; marker size can reflect anonymous popularity. */
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
  /** Allow map panning. Disable inside a scrolling overview so vertical drags scroll the screen. */
  scrollEnabled?: boolean;
  user?: { lat: number; lng: number; heading?: number; speed?: number } | undefined;
  stops?: MapStop[];
  /** Route polyline in brand red (whole route, or the part after the current leg while navigating). */
  route?: LatLng[];
  /** Actual walked GPS trail, drawn in teal; keep separate from the planned route. */
  routeDone?: LatLng[];
  /** Current navigation leg (user -> next stop), drawn prominently; when set, `route` is drawn lighter. */
  leg?: LatLng[];
  /** Follow GPS position and movement direction. A map gesture suspends following; locate resumes it. */
  followUser?: boolean;
  /** Explain walked/current/upcoming line styles above the player sheet. */
  showRouteLegend?: boolean;
  spots?: MapSpot[];
  onSpotPress?: (id: string) => void;
  /** Taps on the map background (not on markers). */
  onMapPress?: () => void;
  /** Fit the camera to these points (tour overview); takes precedence over `center`. */
  fit?: LatLng[];
  /** Shows the "back to my location" button. Default: when `user` is set. */
  locateButton?: boolean;
  /** Distance above the bottom inset for the locate button; allow room for sheet artwork. */
  locateButtonOffset?: number;
  /** Change to reset position, zoom and orientation once; mounting does not reset an initial overview. */
  recenterKey?: number;
  /** Bottom padding so content is not hidden behind a sheet. */
  bottomInset?: number;
  onStopPress?: (id: string) => void;
  testID?: string;
}

export const ROUTE_DONE_COLOR = '#427B73';
// One zoom level halves magnification and shows twice as much ground in each direction.
export const LOCATE_ZOOM = 15.5;
