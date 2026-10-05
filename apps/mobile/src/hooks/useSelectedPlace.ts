import { useEffect, useReducer, useState } from 'react';
import { encodeGeohash, type ExploredSpot, type Poi } from '@tuur/shared';
import { useBackend } from '../backend';
import { config } from '../config';

/** Resolve a map selection even when it falls outside the nearby carousel's ranked results. */
export function useSelectedPlace(spot: ExploredSpot | undefined, nearby: Poi[]) {
  const backend = useBackend();
  const [attempt, retry] = useReducer((value: number) => value + 1, 0);
  const [result, setResult] = useState<{
    id: string;
    poi?: Poi;
    status: 'loading' | 'ready' | 'missing' | 'error';
  }>();
  const cached = nearby.find((poi) => poi.id === spot?.poiId);
  const id = spot?.poiId;
  const tile = spot ? encodeGeohash(spot.location.lat, spot.location.lng, config.tilePrecision) : undefined;
  useEffect(() => {
    if (!id || !tile || cached) return;
    let cancelled = false;
    setResult({ id, status: 'loading' });
    void backend.getPois([tile]).then(
      (pois) => {
        if (cancelled) return;
        const poi = pois.find((place) => place.id === id);
        setResult(poi ? { id, poi, status: 'ready' } : { id, status: 'missing' });
      },
      () => {
        if (!cancelled) setResult({ id, status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backend, id, tile, cached, attempt]);
  return {
    poi: cached ?? (result?.id === id ? result?.poi : undefined),
    status: cached ? 'ready' : result?.id === id ? result?.status : id ? 'loading' : undefined,
    retry,
  };
}
