import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeGeohash, tilesAround } from '@tuur/shared';
import { useBackend } from '../backend';
import { config } from '../config';
import { PoiPool } from '../guide/modes';

/**
 * Loads the POIs around a position for planning modes: asks the server to explore `rings` tile rings (only tile
 * ids are sent), waits until they are ready and returns the pool. `loading` covers the exploring state.
 */
export function usePoiPool(position: { lat: number; lng: number } | null, rings: number) {
  const backend = useBackend();
  const pool = useMemo(() => new PoiPool(backend), [backend]);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const lat = position?.lat;
  const lng = position?.lng;
  const done = useRef<string>('');

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    const tile = encodeGeohash(lat, lng, config.tilePrecision);
    const key = `${tile}:${rings}`;
    if (done.current === key) return;
    let cancelled = false;
    setReady(false);
    void (async () => {
      await backend.auth.ensureSignedIn();
      await backend.ensureArea(tile, rings).catch(() => undefined);
      const tiles = tilesAround(tile, rings);
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
        await pool.load(tiles);
        const n = pool.all().length;
        if (n > 0 && attempt >= 1) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (cancelled) return;
      done.current = key;
      setCount(pool.all().length);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, pool, lat, lng, rings]);

  return { pool, ready, count };
}
