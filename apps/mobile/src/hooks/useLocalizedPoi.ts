import { useEffect, useState } from 'react';
import type { Poi, WikipediaRef } from '@tuur/shared';
import { localizedWikipedia } from '../backend/wikipediaLocal';

/** Puts the article in the reader's language in front of the stored ones when Wikipedia has it. */
export function useLocalizedPoi(poi: Poi | undefined, lang: string): Poi | undefined {
  const [found, setFound] = useState<{ key: string; ref: WikipediaRef }>();
  const language = lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const refs = poi?.sources.wikipedia ?? [];
  const source = refs.find((ref) => ref.extract?.trim());
  const missing = !refs.some((ref) => ref.lang.toLowerCase() === language && ref.extract?.trim());
  const key = poi ? `${poi.id}:${language}` : '';
  useEffect(() => {
    if (!source || !missing) return;
    let cancelled = false;
    void localizedWikipedia(source, language).then((ref) => {
      if (!cancelled && ref) setFound({ key, ref });
    });
    return () => {
      cancelled = true;
    };
  }, [source, missing, language, key]);
  if (!poi || found?.key !== key || !missing) return poi;
  return { ...poi, sources: { ...poi.sources, wikipedia: [found.ref, ...refs] } };
}
