import * as Location from 'expo-location';
import i18n from '../i18n';
import { BACKGROUND_LOCATION_TASK } from './backgroundTask';
import { locationBus, type LocationSource } from './types';

export type PermissionState = 'undetermined' | 'foreground' | 'background' | 'denied';

export async function getPermissionState(): Promise<PermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status === Location.PermissionStatus.UNDETERMINED) return 'undetermined';
  if (!fg.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'background' : 'foreground';
}

/** Step 1 (after our own explanation screen, spec 10): foreground permission only. */
export async function requestForeground(): Promise<PermissionState> {
  const r = await Location.requestForegroundPermissionsAsync();
  return r.granted ? 'foreground' : 'denied';
}

/** Step 2, only when a tour starts: "always" so the tour keeps running with the screen off. */
export async function requestBackground(): Promise<PermissionState> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const r = await Location.requestBackgroundPermissionsAsync();
  return r.granted ? 'background' : 'foreground';
}

export async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

/** Real device GPS. With background permission the OS task keeps delivering fixes while the screen is off. */
export class RealLocationSource implements LocationSource {
  async subscribe(cb: Parameters<LocationSource['subscribe']>[0]) {
    const unsubBus = locationBus.subscribe(cb);
    const state = await getPermissionState();
    let watcher: Location.LocationSubscription | undefined;
    let taskStarted = false;
    if (state === 'foreground' || state === 'background') {
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 3,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          activityType: Location.ActivityType.Fitness,
          foregroundService: {
            notificationTitle: i18n.t('app.name'),
            notificationBody: i18n.t('player.walkingTo', { name: '…' }),
            notificationColor: '#ED0516',
          },
        });
        taskStarted = true;
      } catch {
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 2 },
          (l) =>
            cb({
              lat: l.coords.latitude,
              lng: l.coords.longitude,
              ts: l.timestamp,
              ...(l.coords.accuracy != null ? { accuracy: l.coords.accuracy } : {}),
              ...(l.coords.speed != null && l.coords.speed >= 0 ? { speed: l.coords.speed } : {}),
            }),
        );
      }
    }
    return () => {
      unsubBus();
      watcher?.remove();
      if (taskStarted)
        void Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
    };
  }
}
