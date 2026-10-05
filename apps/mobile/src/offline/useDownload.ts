import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { downloadTourMode, offlineAccessValid, type Tour } from '@tuur/shared';
import { getDownloadManager, getOfflineLibrary, DownloadError } from './index';
import { BackendError } from '../backend/types';

export type DownloadPhase = 'idle' | 'running' | 'error';

/** Per-tour download state for the UI: progress, errors (no space / interrupted), resume and cancel. */
export function useTourDownload(tour: Tour | null | undefined, lang: string) {
  const library = getOfflineLibrary();
  const manifest = useSyncExternalStore(
    library.subscribe,
    () => (tour ? library.get(tour.id) : undefined),
    () => undefined,
  );
  const [phase, setPhase] = useState<DownloadPhase>('idle');
  const [fraction, setFraction] = useState(0);
  const [error, setError] = useState<'no_space' | 'failed' | 'map_failed' | 'locked' | undefined>();
  const signal = useRef({ cancelled: false });
  const running = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    running.current = false;
    setPhase('idle');
    setFraction(0);
    setError(undefined);
    return () => {
      signal.current.cancelled = true;
      generation.current = token + 1;
    };
  }, [tour?.id, tour?.version, tour?.fingerprint, lang]);

  const start = useCallback(async () => {
    if (!tour || running.current || !downloadTourMode(tour)) return;
    running.current = true;
    const token = generation.current;
    signal.current = { cancelled: false };
    const downloadSignal = signal.current;
    setPhase('running');
    setError(undefined);
    setFraction(0);
    try {
      await getDownloadManager().start(
        tour,
        lang,
        (p) => {
          if (token === generation.current) setFraction(p.fraction);
        },
        downloadSignal,
      );
      if (token === generation.current) setPhase('idle');
    } catch (e) {
      if (token !== generation.current) return;
      if (e instanceof DownloadError && e.code === 'cancelled') setPhase('idle');
      else {
        setError(
          e instanceof BackendError && e.reason === 'download_requires_purchase'
            ? 'locked'
            : e instanceof DownloadError && e.code === 'no_space'
              ? 'no_space'
              : 'failed',
        );
        setPhase('error');
      }
    } finally {
      if (token === generation.current) running.current = false;
    }
  }, [tour, lang]);

  const cancel = useCallback(() => {
    signal.current.cancelled = true;
  }, []);

  const repairMap = useCallback(async () => {
    if (!tour || running.current) return;
    running.current = true;
    const token = generation.current;
    signal.current = { cancelled: false };
    setPhase('running');
    setError(undefined);
    setFraction(0);
    try {
      await getDownloadManager().repairMap(
        tour.id,
        (p) => {
          if (token === generation.current) setFraction(p.fraction);
        },
        signal.current,
      );
      if (token === generation.current) setPhase('idle');
    } catch (e) {
      if (token !== generation.current) return;
      if (e instanceof DownloadError && e.code === 'cancelled') setPhase('idle');
      else {
        setError('map_failed');
        setPhase('error');
      }
    } finally {
      if (token === generation.current) running.current = false;
    }
  }, [tour]);

  const remove = useCallback(async () => {
    if (tour) await getDownloadManager().remove(tour.id);
  }, [tour]);

  return {
    manifest,
    mapsSupported: getDownloadManager().mapsSupported,
    complete: Boolean(
      manifest?.complete &&
      manifest.lang === lang &&
      tour &&
      manifest.tour.version === tour.version &&
      manifest.tour.fingerprint === tour.fingerprint &&
      offlineAccessValid(manifest),
    ),
    supported: Boolean(tour && downloadTourMode(tour)),
    partial: Boolean(manifest && !manifest.complete),
    phase,
    fraction,
    error,
    start,
    repairMap,
    cancel,
    remove,
  };
}
