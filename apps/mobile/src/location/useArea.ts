import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeGeohash, type GenerateToursResult, type Tour } from '@tuur/shared';
import { useBackend, type AreaInfo } from '../backend';
import { config } from '../config';
import { useSettings } from '../state/settings';
import { deriveAreaPhase, type AreaPhase } from './areaPhase';
import { areaErrorCode, type AreaErrorCode } from './areaErrors';

export type { AreaPhase };

export interface AreaState {
  phase: AreaPhase;
  tile?: string;
  placeId?: string;
  area?: AreaInfo | null;
  tours: Tour[];
  error?: string;
  /** Machine-readable reason for the failed phase (shown localized, never the raw message). */
  errorCode?: AreaErrorCode;
  reload: () => void;
}

/**
 * Drives the home screen (spec 4.1): position -> tile (only the geohash leaves the device) -> ensureArea ->
 * progressive loading while the area is explored -> optionally the auto tours for the place (`tours: false` skips
 * their generation, e.g. for the individual modes).
 */
export function useArea(
  position: { lat: number; lng: number } | null,
  { tours: withTours = true, ensure = true }: { tours?: boolean; ensure?: boolean } = {},
): AreaState {
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
  const [tourCall, setTourCall] = useState<GenerateToursResult['status'] | 'idle' | 'error' | 'skipped'>(
    withTours ? 'idle' : 'skipped',
  );
  const [error, setError] = useState<string | undefined>();
  const [errorCode, setErrorCode] = useState<AreaErrorCode | undefined>();
  const [ensureFailed, setEnsureFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const requestedTile = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!tile) return;
    setArea(null);
    setTours([]);
    setTourCall(withTours ? 'idle' : 'skipped');
    setError(undefined);
    setErrorCode(undefined);
    setEnsureFailed(false);
    let cancelled = false;
    const unsub = backend.watchArea(tile, (a) => !cancelled && setArea(a));
    // A POI pool can own ingestion while this hook only watches area metadata.
    if (ensure && requestedTile.current !== `${tile}:${nonce}`) {
      requestedTile.current = `${tile}:${nonce}`;
      void backend.auth
        .ensureSignedIn()
        .then(() => backend.ensureArea(tile))
        .catch((e: Error) => {
          if (cancelled) return;
          setError(e.message);
          setErrorCode(areaErrorCode(e));
          setEnsureFailed(true);
        });
    }
    return () => {
      cancelled = true;
      unsub();
    };
  }, [backend, tile, nonce, withTours, ensure]);

  const placeId = area?.placeId;
  const ready = area?.status === 'ready' || area?.status === 'low_content';

  useEffect(() => {
    if (!withTours || !tile || !ready || !placeId) return;
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
          setErrorCode(areaErrorCode(e));
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [backend, tile, ready, placeId, lang, nonce, withTours]);

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
