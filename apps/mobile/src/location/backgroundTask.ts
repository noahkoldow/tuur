import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { locationBus } from './types';

export const BACKGROUND_LOCATION_TASK = 'tuur-background-location';

/**
 * Must run at module scope, before the app renders (imported from the entry file). Location updates are pushed
 * into `locationBus`; the guide runtime consumes them while audio keeps the process alive in the background.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: LocationObject[] } | undefined)?.locations ?? [];
  for (const l of locations) {
    locationBus.emit({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      ts: l.timestamp,
      ...(l.coords.accuracy != null ? { accuracy: l.coords.accuracy } : {}),
      ...(l.coords.speed != null && l.coords.speed >= 0 ? { speed: l.coords.speed } : {}),
      ...(l.coords.heading != null && l.coords.heading >= 0 ? { heading: l.coords.heading } : {}),
    });
  }
});
