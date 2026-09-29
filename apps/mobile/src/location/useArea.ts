import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeGeohash, type GenerateToursResult, type Tour } from '@tuur/shared';
import { useBackend, type AreaInfo } from '../backend';
import { config } from '../config';
import { useSettings } from '../state/settings';

export type AreaPhase = 'no-location' | 'exploring' | 'generating' | 'ready' | 'low_content' | 'failed';

export interface AreaState {
  phase: AreaPhase;
  tile?: string;
  placeId?: string;
  area?: AreaInfo | null;
  tours: Tour[];
  error?: string;
  reload: () => void;
}

/**
 * Drives the home screen (spec 4.1): position -> tile (only the geohash leaves the device) -> ensureArea ->
 * progressive loading while the area is explored -> auto tours for the place.
 */
export function useArea(position: { lat: number; lng: number } | null): AreaState {
  const backend = useBackend();
  const lang = useSettings((s) => s.language);
  const lat = position?.lat;
  const lng = position?.lng;
  const tile = useMemo(
    () =>
      lat !== undefined && lng !== undefined ? encodeGeohash(lat, lng, config.tilePrecision) : undefined,
    [lat, lng],
  );
  const [area, setArea] = useState<AreaInfo | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [tourCall, setTourCall] = useState<GenerateToursResult['status'] | 'idle' | 'error'>('idle');
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const requestedTile = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!tile) return;
    setArea(null);
    setTours([]);
    setTourCall('idle');
    setError(undefined);
    let cancelled = false;
    const unsub = backend.watchArea(tile, (a) => !cancelled && setArea(a));
    if (requestedTile.current !== `${tile}:${nonce}`) {
      requestedTile.current = `${tile}:${nonce}`;
      void backend.auth
        .ensureSignedIn()
        .then(() => backend.ensureArea(tile))
        .catch((e: Error) => !cancelled && setError(e.message));
    }
    return () => {
      cancelled = true;
      unsub();
    };
  }, [backend, tile, nonce]);

  const placeId = area?.placeId;
  const ready = area?.status === 'ready' || area?.status === 'low_content';

  useEffect(() => {
    if (!tile || !ready || !placeId) return;
    let cancelled = false;
    const unsub = backend.watchTours(placeId, (t) => !cancelled && setTours(t));
    setTourCall('generating');
    backend
      .getAutoTours(tile, lang)
      .then((r) => !cancelled && setTourCall(r.status))
      .catch((e: Error) => {
        if (!cancelled) {
          setTourCall('error');
          setError(e.message);
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [backend, tile, ready, placeId, lang, nonce]);

  let phase: AreaPhase;
  if (!position) phase = 'no-location';
  else if (area?.status === 'failed' || tourCall === 'error') phase = 'failed';
  else if (!area || area.status === 'empty' || area.status === 'ingesting') phase = 'exploring';
  else if (tourCall === 'generating' || tourCall === 'idle') phase = tours.length ? 'ready' : 'generating';
  else if (area.status === 'low_content' && tours.length === 0) phase = 'low_content';
  else phase = 'ready';

  return {
    phase,
    ...(tile ? { tile } : {}),
    ...(placeId ? { placeId } : {}),
    area,
    tours,
    ...(error ? { error } : {}),
    reload: () => setNonce((n) => n + 1),
  };
}
