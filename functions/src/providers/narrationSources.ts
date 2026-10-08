import {
  filterOsmTags,
  labelsFromEntities,
  parseWikidataFacts,
  parseWikipediaExtracts,
  type Poi,
  type SourceBundle,
} from '@tuur/shared';
import { fetchJson, type FetchOptions } from '../util/http';

/** Collects the verified source material for a POI (Wikipedia excerpts, Wikidata facts, OSM tags, admin facts). */
export interface NarrationSourceProvider {
  gather(poi: Poi, langs: string[]): Promise<SourceBundle>;
}

export class HttpNarrationSources implements NarrationSourceProvider {
  constructor(
    private readonly requestOptions: Pick<FetchOptions, 'timeoutMs' | 'retries'> = {},
    private readonly wikipediaOnly = false,
  ) {}

  async gather(poi: Poi, langs: string[]): Promise<SourceBundle> {
    const wikipedia: SourceBundle['wikipedia'] = [];
    // Prefer the local-language article (usually the richest), then requested languages; max 3 excerpts.
    const refs = [...poi.sources.wikipedia]
      // Only Wikimedia language subdomains from canonical POI records, never a supplied URL/host.
      .filter((ref) => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(ref.lang) && ref.lang.length <= 24)
      .sort(
        (a, b) =>
          Number(langs.indexOf(a.lang) === -1) - Number(langs.indexOf(b.lang) === -1) ||
          langs.indexOf(a.lang) - langs.indexOf(b.lang) ||
          b.length - a.length,
      )
      .slice(0, 3);
    await Promise.all(
      refs.map(async (r) => {
        try {
          const p = new URLSearchParams({
            action: 'query',
            format: 'json',
            prop: 'extracts',
            explaintext: '1',
            exchars: '1200',
            redirects: '1',
            titles: r.title,
          });
          const json = await fetchJson(`https://${r.lang}.wikipedia.org/w/api.php?${p}`, this.requestOptions);
          const text = [...parseWikipediaExtracts(json).values()][0];
          if (text)
            wikipedia.push({ lang: r.lang, title: r.title, extract: text, ...(r.url ? { url: r.url } : {}) });
        } catch {
          // a missing excerpt only reduces richness
        }
      }),
    );
    const facts: SourceBundle['facts'] = [];
    const qid = poi.sources.wikidataId;
    if (qid && !this.wikipediaOnly) {
      try {
        const p = new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: qid, props: 'claims' });
        const parsed = parseWikidataFacts(await fetchJson(`https://www.wikidata.org/w/api.php?${p}`), qid);
        facts.push(...parsed.facts);
        if (parsed.pendingLabels.length) {
          const lp = new URLSearchParams({
            action: 'wbgetentities',
            format: 'json',
            ids: parsed.pendingLabels.join('|'),
            props: 'labels',
          });
          const labels = labelsFromEntities(await fetchJson(`https://www.wikidata.org/w/api.php?${lp}`), [
            ...langs,
            'en',
          ]);
          for (const e of parsed.entityFacts) {
            const l = labels.get(e.qid);
            if (l) facts.push({ label: e.label, value: l });
          }
        }
      } catch {
        // facts are optional
      }
    }
    return {
      poiName: poi.name,
      wikipedia: wikipedia.sort((a, b) => langs.indexOf(a.lang) - langs.indexOf(b.lang)),
      facts,
      osmTags: filterOsmTags(poi.osmTags, langs[0] ?? 'en'),
      adminFacts: poi.adminFacts,
    };
  }
}

/** Builds a small source bundle from stored POI data only (offline/dev). */
export class MockNarrationSources implements NarrationSourceProvider {
  async gather(poi: Poi): Promise<SourceBundle> {
    const wiki = poi.sources.wikipedia[0];
    const kind =
      poi.osmTags['tourism'] ??
      poi.osmTags['historic'] ??
      poi.osmTags['amenity'] ??
      poi.osmTags['leisure'] ??
      'place';
    const extract = [
      `${poi.name} ist ein sehenswerter Ort in dieser Gegend.`,
      `Der Ort gehört zur Kategorie ${kind}.`,
      `Er liegt mitten im Zentrum der Umgebung und lässt sich gut zu Fuß erreichen.`,
      `Viele Besucher halten hier kurz an, um die Atmosphäre zu genießen.`,
      `Die Gegend hat eine lange Geschichte, die man an vielen Ecken noch spürt.`,
      `Nehmen Sie sich einen Moment Zeit und schauen Sie sich in Ruhe um.`,
    ].join(' ');
    return {
      poiName: poi.name,
      wikipedia: [{ lang: wiki?.lang ?? 'de', title: poi.name, extract }],
      facts: [],
      osmTags: filterOsmTags(poi.osmTags, 'de'),
      adminFacts: poi.adminFacts,
    };
  }
}
