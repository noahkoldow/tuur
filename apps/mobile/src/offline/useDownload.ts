import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { Tour } from '@tuur/shared';
import { getDownloadManager, getOfflineLibrary, DownloadError } from './index';

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
  const [error, setError] = useState<'no_space' | 'failed' | undefined>();
  const signal = useRef({ cancelled: false });

  const start = useCallback(async () => {
    if (!tour) return;
    signal.current = { cancelled: false };
    setPhase('running');
    setError(undefined);
    try {
      await getDownloadManager().start(tour, lang, (p) => setFraction(p.fraction), signal.current);
      setPhase('idle');
    } catch (e) {
      if (e instanceof DownloadError && e.code === 'cancelled') setPhase('idle');
      else {
        setError(e instanceof DownloadError && e.code === 'no_space' ? 'no_space' : 'failed');
        setPhase('error');
      }
    }
  }, [tour, lang]);

  const cancel = useCallback(() => {
    signal.current.cancelled = true;
  }, []);

  const remove = useCallback(async () => {
    if (tour) await getDownloadManager().remove(tour.id);
  }, [tour]);

  return {
    manifest,
    complete: Boolean(manifest?.complete),
    partial: Boolean(manifest && !manifest.complete),
    phase,
    fraction,
    error,
    start,
    cancel,
    remove,
  };
}
