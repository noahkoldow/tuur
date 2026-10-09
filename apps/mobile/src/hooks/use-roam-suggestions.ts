import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Poi } from '@tuur/shared';
import type { MapSpot } from '../components/mapTypes';
import { nearbyRoamPlaces } from '../guide/nearbyPlaces';
import type { GuideUi } from '../guide/runtime';
import type { ActiveSession } from '../guide/session';
import { useSettings } from '../state/settings';
import { usePoiPool } from './usePoiPool';

const NO_SUBSCRIBE = () => () => undefined;
const EMPTY_QUEUE = (): readonly Poi[] => EMPTY;
const EMPTY: readonly Poi[] = [];

/** Suggestions remain browsable while a story plays; choosing never interrupts that story. */
export function useRoamSuggestions(session: ActiveSession, ui: GuideUi) {
  const enabled = session.mode === 'roam' && ui.phase !== 'finished';
  const interests = useSettings((s) => s.interests);
  const { pois, ready, error, reload } = usePoiPool(enabled ? (ui.user ?? null) : null, 2);
  const state = session.runtime.getState();
  const roam = session.roam;
  const queue = useSyncExternalStore(
    roam?.subscribeQueue ?? NO_SUBSCRIBE,
    roam?.getQueue ?? EMPTY_QUEUE,
    roam?.getQueue ?? EMPTY_QUEUE,
  );
  const queuedIds = useMemo(() => queue.map((poi) => poi.id), [queue]);
  const toggleQueue = useCallback(
    (poi: Poi) => {
      if (!roam) return;
      if (roam.getQueue().some((q) => q.id === poi.id)) roam.dequeue(poi.id);
      else roam.enqueue(poi);
    },
    [roam],
  );
  const places = useMemo(
    () =>
      enabled && ui.user
        ? nearbyRoamPlaces(
            ui.user,
            pois,
            [
              ...state.visited,
              ...state.skipped,
              ...state.narrated,
              ...state.route.slice(state.index).map((stop) => stop.id),
            ],
            8,
            { interests, excludedPlaces: state.route },
          )
        : [],
    [
      enabled,
      ui.user,
      pois,
      state.visited,
      state.skipped,
      state.narrated,
      state.route,
      state.index,
      interests,
    ],
  );
  const spots = useMemo<MapSpot[]>(
    () =>
      [...places, ...queue.filter((q) => !places.some((p) => p.id === q.id))].map((poi) => ({
        id: poi.id,
        name: poi.name,
        location: poi.location,
        scale: 0.4,
        hot: false,
        ...(queuedIds.includes(poi.id) ? { queued: queuedIds.indexOf(poi.id) + 1 } : {}),
        ...((poi.primaryInterest ?? poi.interests[0])
          ? { interest: (poi.primaryInterest ?? poi.interests[0])! }
          : {}),
      })),
    [places, queue, queuedIds],
  );
  return { places, spots, queuedIds, toggleQueue, ready, error, reload, canChoose: session.roam?.canChoose() ?? false };
}
