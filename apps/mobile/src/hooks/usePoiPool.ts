import { useCallback, useEffect, useMemo, useState } from 'react';
import { encodeGeohash, tilesAround } from '@tuur/shared';
import { useBackend } from '../backend';
import { config } from '../config';
import { PoiPool } from '../guide/modes';
import { areaErrorCode, type AreaErrorCode } from '../location/areaErrors';

/**
 * Loads the POIs around a position, including live positions. Only a tile change starts a new request;
 * GPS updates within that tile keep the current request alive. Passing null disables loading.
 */
export function usePoiPool(position: { lat: number; lng: number } | null, rings: number) {
  const backend = useBackend();
  const pool = useMemo(() => new PoiPool(backend), [backend]);
  const [retry, setRetry] = useState(0);
  const tile = position ? encodeGeohash(position.lat, position.lng, config.tilePrecision) : null;
  const request = useMemo(() => ({ pool, tile, rings, retry }), [pool, tile, rings, retry]);
  const [state, setState] = useState({
    request,
    ready: false,
    count: 0,
    pois: pool.all(),
    revision: 0,
    error: null as string | null,
    errorCode: null as AreaErrorCode | null,
  });
  const reload = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    const currentTile = request.tile;
    if (currentTile === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshRetry: ReturnType<typeof setTimeout> | undefined;
    let finishWait: (() => void) | undefined;
    const unsubscribers: (() => void)[] = [];
    const tiles = tilesAround(currentTile, request.rings);
    const inArea = new Set(tiles);
    const completed = new Set<string>();
    const failed = new Set<string>();
    const pendingRefresh = new Set<string>();
    let refreshing = false;
    let finishedInitialWait = false;
    let areaError: string | null = null;
    let refreshError: string | null = null;
    let areaCode: AreaErrorCode | null = null;
    let refreshCode: AreaErrorCode | null = null;
    const update = () => {
      if (cancelled) return;
      const pois = pool.all();
      const hasPlaces = pois.some((poi) => inArea.has(poi.tile));
      // An unfinished search is not empty. Late watcher results clear this timeout automatically.
      const timedOut = finishedInitialWait && completed.size < tiles.length && !hasPlaces;
      const error =
        areaError ??
        refreshError ??
        (failed.size
          ? 'Could not load nearby places'
          : timedOut
            ? 'Nearby places are taking too long to load'
            : null);
      setState({
        request,
        ready: finishedInitialWait || completed.size === tiles.length || hasPlaces || !!error,
        count: pois.length,
        pois,
        revision: pool.revision,
        error,
        errorCode: areaCode ?? refreshCode ?? (failed.size || timedOut ? 'temporary' : null),
      });
    };
    const flushRefresh = async () => {
      if (cancelled || refreshing) return;
      refreshing = true;
      try {
        while (pendingRefresh.size && !cancelled) {
          const batch = [...pendingRefresh];
          pendingRefresh.clear();
          try {
            await pool.refresh(batch);
            if (cancelled) return;
            for (const tile of batch) completed.add(tile);
            refreshError = null;
            refreshCode = null;
            update();
          } catch (error) {
            if (cancelled) return;
            refreshError = error instanceof Error ? error.message : 'Could not refresh nearby places';
            refreshCode = areaErrorCode(error);
            for (const tile of batch) pendingRefresh.add(tile);
            update();
            clearTimeout(refreshRetry);
            refreshRetry = setTimeout(() => void flushRefresh(), 8000);
            break;
          }
        }
      } finally {
        refreshing = false;
      }
    };
    update();
    void (async () => {
      try {
        await backend.auth.ensureSignedIn();
        if (cancelled) return;
        // ensureArea only queues production ingestion. Keep these listeners after the initial
        // loading window so a slower neighboring landmark is discovered without a GPS tile change.
        for (const tile of tiles) {
          unsubscribers.push(
            backend.watchArea(tile, (area) => {
              if (cancelled) return;
              if (area?.status === 'failed') {
                failed.add(tile);
                completed.add(tile);
                update();
              } else if (area?.status === 'ready' || area?.status === 'low_content') {
                failed.delete(tile);
                pendingRefresh.add(tile);
                // Cached terminal states arrive synchronously; combine them into one POI query.
                void Promise.resolve().then(flushRefresh);
              } else {
                failed.delete(tile);
                completed.delete(tile);
                update();
              }
            }),
          );
        }
        try {
          await backend.ensureArea(currentTile, request.rings);
        } catch (error) {
          // Existing server/cache POIs can still be available if starting ingestion fails.
          areaError = error instanceof Error ? error.message : 'Could not load nearby places';
          areaCode = areaErrorCode(error);
        }
        for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
          await pool.load(tiles);
          if (cancelled) return;
          update();
          if (areaError || completed.size === tiles.length) break;
          if (attempt < 29) {
            await new Promise<void>((resolve) => {
              finishWait = resolve;
              timer = setTimeout(resolve, 1500);
            });
          }
        }
        finishedInitialWait = true;
        update();
      } catch (error) {
        areaError = error instanceof Error ? error.message : 'Could not load nearby places';
        areaCode = areaErrorCode(error);
        finishedInitialWait = true;
        update();
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(refreshRetry);
      finishWait?.();
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [backend, pool, request]);

  const current = state.request === request;
  const ready = tile !== null && current && state.ready;
  return {
    pool,
    pois: current ? state.pois : pool.all(),
    ready,
    count: current ? state.count : pool.all().length,
    revision: current ? state.revision : pool.revision,
    loading: tile !== null && !ready,
    error: current ? state.error : null,
    errorCode: current ? state.errorCode : null,
    reload,
  };
}
