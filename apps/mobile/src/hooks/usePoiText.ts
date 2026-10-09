import { useEffect, useRef, useState } from 'react';
import type { Poi } from '@tuur/shared';
import { useBackend, type AccessInfo } from '../backend';
import { useAuth } from '../auth/session';
import { poiTextCache, poiTextKey } from '../backend/poiTextCache';

/** Fetch only the current/open place; stale responses cannot replace another stop or user's information. */
export function usePoiText(poi: Poi | undefined, lang: string, enabled = true, access?: AccessInfo) {
  const backend = useBackend();
  const { user } = useAuth();
  const language = lang.toLowerCase().startsWith('de') ? 'de' : 'en';
  const { tourId, mode, groupId } = access ?? {};
  const request = {
    poiId: poi?.id ?? '',
    lang: language,
    access: { ...(tourId ? { tourId } : {}), ...(mode ? { mode } : {}), ...(groupId ? { groupId } : {}) },
  };
  const key = poi ? poiTextKey(user?.uid, poi, request) : '';
  const [result, setResult] = useState<{ key: string; poi?: Poi; error?: boolean }>();
  const [retry, setRetry] = useState({ key: '', count: 0 });
  const attempts = retry.key === key ? retry.count : 0;
  const consumedRetry = useRef('');
  const hasLocalText = Boolean(
    poi &&
    (poi.sources.wikipedia.some((ref) => ref.lang === language && ref.extract?.trim()) ||
      poi.adminFacts.length ||
      poi.osmTags[`description:${language}`]),
  );
  const needed = enabled && Boolean(poi) && !hasLocalText;
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    if (!needed || !poi || !user) return;
    let cancelled = false;
    setResult(undefined);
    const retryToken = `${key}:${attempts}`;
    const force = attempts > 0 && consumedRetry.current !== retryToken;
    if (force) consumedRetry.current = retryToken;
    const request = {
      poiId: poi.id,
      lang: language,
      access: { ...(tourId ? { tourId } : {}), ...(mode ? { mode } : {}), ...(groupId ? { groupId } : {}) },
    };
    void poiTextCache(backend)
      .load(poi, request, force)
      .then(
        (loaded) => {
          if (!cancelled) setResult({ key, poi: loaded });
        },
        () => {
          if (!cancelled) setResult({ key, error: true });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [backend, key, needed, poi, user, language, tourId, mode, groupId, attempts]);
  return {
    poi: current?.poi ?? poi,
    loading: needed && Boolean(user) && !current,
    error: Boolean(current?.error),
    retry: () => setRetry((old) => ({ key, count: old.key === key ? old.count + 1 : 1 })),
  };
}
