import type { WikipediaRef } from '@tuur/shared';

const LANG = /^[a-z]{2,3}$/;
const cache = new Map<string, Promise<WikipediaRef | undefined>>();

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? await res.json() : undefined;
  } finally {
    clearTimeout(timer);
  }
}

const api = (lang: string, params: Record<string, string>) =>
  `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    ...params,
  })}`;

type Pages = {
  query?: { pages?: Array<{ title?: string; extract?: string; langlinks?: Array<{ title?: string }> }> };
};

async function fetchLocalized(source: WikipediaRef, lang: string): Promise<WikipediaRef | undefined> {
  const links = (await getJson(
    api(source.lang, { prop: 'langlinks', lllang: lang, lllimit: '1', titles: source.title }),
  )) as Pages | undefined;
  const title = links?.query?.pages?.[0]?.langlinks?.[0]?.title;
  if (!title) return undefined;
  const article = (await getJson(
    api(lang, { prop: 'extracts', exintro: '1', explaintext: '1', titles: title }),
  )) as Pages | undefined;
  const page = article?.query?.pages?.[0];
  const extract = page?.extract?.trim();
  if (!extract) return undefined;
  const name = page?.title ?? title;
  return {
    lang,
    title: name,
    length: extract.length,
    extract,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(name.replace(/\s+/g, '_'))}`,
  };
}

/**
 * The same Wikipedia article in the reader's language, when it exists (e.g. English for a place whose stored
 * article is German). Only the article title leaves the device. Failures resolve to undefined: the original text
 * stays visible.
 */
export function localizedWikipedia(source: WikipediaRef, lang: string): Promise<WikipediaRef | undefined> {
  if (!LANG.test(lang) || !LANG.test(source.lang) || source.lang === lang) return Promise.resolve(undefined);
  const key = `${source.lang}:${source.title}:${lang}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchLocalized(source, lang).catch(() => undefined);
    cache.set(key, pending);
    void pending.then((found) => {
      if (!found) cache.delete(key);
    });
  }
  return pending;
}
