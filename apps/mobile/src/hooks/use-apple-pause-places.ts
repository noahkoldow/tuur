import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '@tuur/shared';
import {
  cancelApplePlacesSearch,
  isApplePlacesAvailable,
  searchApplePlaces,
  type ApplePlace,
  type ApplePlacesSearchCategory,
} from '../../modules/tuur-apple-places';
import { applePauseCategory } from '../guide/apple-pause-places';
import type { PauseFilter } from '../guide/pauseDestination';

type SearchState = {
  key: string | null;
  places: ApplePlace[];
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
};

/** Keep Apple results only while this sheet is open; filters and location changes invalidate old requests. */
export function useApplePausePlaces(position: LatLng | null, filter: PauseFilter) {
  return useApplePlaces(position, applePauseCategory(filter));
}

/** Transient Apple search for any category; a null position disables it and drops all results. */
export function useApplePlaces(position: LatLng | null, category: ApplePlacesSearchCategory) {
  const latitude = position?.lat;
  const longitude = position?.lng;
  const key =
    latitude === undefined || longitude === undefined ? null : `${latitude}:${longitude}:${category}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ key: null, places: [], status: 'idle' });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!key || latitude === undefined || longitude === undefined) {
      setState({ key: null, places: [], status: 'idle' });
      return;
    }
    if (!isApplePlacesAvailable) {
      setState({ key, places: [], status: 'unavailable' });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ key, places: previous.key === key ? previous.places : [], status: 'loading' }));
    const timeout = setTimeout(() => {
      cancelled = true;
      void cancelApplePlacesSearch().catch(() => undefined);
      setState((previous) => ({ ...previous, status: 'error' }));
    }, 20_000);
    void searchApplePlaces({ latitude, longitude, category, radiusMeters: 1500 })
      .then((places) => {
        if (!cancelled) setState({ key, places, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setState((previous) => ({ ...previous, status: 'error' }));
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      void cancelApplePlacesSearch().catch(() => undefined);
    };
  }, [key, latitude, longitude, category, attempt]);

  const current = state.key === key;
  return {
    places: key && current ? state.places : [],
    loading: Boolean(key && (!current || state.status === 'loading')),
    error:
      key && current && (state.status === 'error' || state.status === 'unavailable') ? state.status : null,
    ready: Boolean(key && current && state.status === 'ready'),
    reload,
  };
}
