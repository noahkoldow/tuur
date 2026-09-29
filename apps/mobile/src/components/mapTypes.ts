import type { LatLng } from '@tuur/shared';
import type { PinState } from './HeartPin';

export interface MapStop {
  id: string;
  location: LatLng;
  number: number;
  state: PinState;
  partner?: boolean;
}

export interface TuurMapProps {
  /** Initial/fallback center. */
  center: LatLng;
  zoom?: number;
  user?: { lat: number; lng: number; heading?: number } | undefined;
  stops?: MapStop[];
  /** Route polyline, drawn in brand red. */
  route?: LatLng[];
  /** Fit the camera to these points (tour overview); takes precedence over `center`. */
  fit?: LatLng[];
  /** Keep the user centered (player). */
  follow?: boolean;
  /** Bottom padding so content is not hidden behind a sheet. */
  bottomInset?: number;
  onStopPress?: (id: string) => void;
  testID?: string;
}
