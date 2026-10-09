import { useEffect, useMemo, useState } from 'react';
import type { Poi } from '@tuur/shared';
import { useAuth } from '../auth/session';
import { useBackend, type AccessInfo } from '../backend';
import type { FactSheetResponse } from '../backend/types';
import { localFactSheet } from '../components/factSheetLocal';

const CACHE_LIMIT = 100;
const cache = new Map<string, Promise<FactSheetResponse>>();

/**
 * Fact sheet for a place: the deterministic on-device sheet shows immediately; the server (AI with its own
 * fallback, cached) replaces it when it arrives. Errors keep the local sheet; nothing here blocks the card.
 */
export function useFactSheet(poi: Poi | undefined, lang: string, access?: AccessInfo) {
  const backend = useBackend();
  const { user } = useAuth();
  const language = lang.toLowerCase().startsWith('de') ? 'de' : 'en';
  const local = useMemo(() => localFactSheet(poi, language), [poi, language]);
  const key = poi && user ? JSON.stringify([user.uid, poi.id, poi.updatedAt, language, access?.tourId]) : '';
  const [remote, setRemote] = useState<{ key: string; response: FactSheetResponse }>();
  const { tourId, mode, groupId } = access ?? {};
  useEffect(() => {
    if (!key || !poi) return;
    let cancelled = false;
    let promise = cache.get(key);
    if (!promise) {
      promise = backend.getFactSheet({
        poiId: poi.id,
        lang: language,
        access: { ...(tourId ? { tourId } : {}), ...(mode ? { mode } : {}), ...(groupId ? { groupId } : {}) },
      });
      cache.set(key, promise);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      const failed = promise;
      void failed.catch(() => {
        if (cache.get(key) === failed) cache.delete(key);
      });
    }
    void promise.then(
      (response) => {
        if (!cancelled) setRemote({ key, response });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [backend, key, poi?.id, language, tourId, mode, groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = remote?.key === key ? remote.response : undefined;
  return {
    sheet: current?.sheet ?? local,
    ai: current?.origin === 'ai',
    loading: Boolean(key) && !current,
  };
}
