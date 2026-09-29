import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeGeohash, type GenerateToursResult, type Tour } from '@tuur/shared';
import { BackendError, useBackend, type AreaInfo } from '../backend';
import { config } from '../config';
import { useSettings } from '../state/settings';
import { deriveAreaPhase, type AreaPhase } from './areaPhase';

export type { AreaPhase };

export interface AreaState {
  phase: AreaPhase;
  tile?: string;
  placeId?: string;
  area?: AreaInfo | null;
  tours: Tour[];
  error?: string;
  /** Machine-readable reason for the failed phase (shown localized, never the raw message). */
  errorCode?: 'network' | 'generic';
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
  const [errorCode, setErrorCode] = useState<'network' | 'generic' | undefined>();
  const [ensureFailed, setEnsureFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const requestedTile = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!tile) return;
    setArea(null);
    setTours([]);
    setTourCall('idle');
    setError(undefined);
    setErrorCode(undefined);
    setEnsureFailed(false);
    let cancelled = false;
    const unsub = backend.watchArea(tile, (a) => !cancelled && setArea(a));
    if (requestedTile.current !== `${tile}:${nonce}`) {
      requestedTile.current = `${tile}:${nonce}`;
      void backend.auth
        .ensureSignedIn()
        .then(() => backend.ensureArea(tile))
        .catch((e: Error) => {
          if (cancelled) return;
          setError(e.message);
          setErrorCode(e instanceof BackendError && e.code === 'network' ? 'network' : 'generic');
          setEnsureFailed(true);
        });
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
          setErrorCode(e instanceof BackendError && e.code === 'network' ? 'network' : 'generic');
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [backend, tile, ready, placeId, lang, nonce]);

  const phase = deriveAreaPhase({ position, area, tourCall, toursCount: tours.length, ensureFailed });

  return {
    phase,
    ...(tile ? { tile } : {}),
    ...(placeId ? { placeId } : {}),
    area,
    tours,
    ...(error ? { error } : {}),
    ...(errorCode ? { errorCode } : {}),
    reload: () => setNonce((n) => n + 1),
  };
}
