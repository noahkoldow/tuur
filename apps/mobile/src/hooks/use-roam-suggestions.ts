import { useMemo } from 'react';
import type { MapSpot } from '../components/mapTypes';
import { nearbyRoamPlaces } from '../guide/nearbyPlaces';
import type { GuideUi } from '../guide/runtime';
import type { ActiveSession } from '../guide/session';
import { useSettings } from '../state/settings';
import { usePoiPool } from './usePoiPool';

/** Suggestions remain browsable while a story plays; choosing never interrupts that story. */
export function useRoamSuggestions(session: ActiveSession, ui: GuideUi) {
  const enabled = session.mode === 'roam' && ui.phase !== 'finished';
  const interests = useSettings((s) => s.interests);
  const { pois, ready, error, reload } = usePoiPool(enabled ? (ui.user ?? null) : null, 2);
  const state = session.runtime.getState();
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
      places.map((poi) => ({
        id: poi.id,
        name: poi.name,
        location: poi.location,
        scale: 0.4,
        hot: false,
        ...((poi.primaryInterest ?? poi.interests[0])
          ? { interest: (poi.primaryInterest ?? poi.interests[0])! }
          : {}),
      })),
    [places],
  );
  return { places, spots, ready, error, reload, canChoose: session.roam?.canChoose() ?? false };
}
