import {
  buildCommonsQuery,
  buildWikidataQuery,
  encodeGeohash,
  geohashBounds,
  parseCommonsImages,
  parseWikidata,
  parseWikipediaGenerator,
  syntheticRawPois,
  type Bounds,
  type ImageRef,
  type RawPoi,
} from '@tuur/shared';
import { fetchJson } from '../util/http';
import { RateLimitError } from '../util/rateLimit';
import { fetchOverpass, type OverpassOptions } from './overpass';

/** Upstream POI data providers (OSM, Wikidata, Wikipedia, Commons) behind one interface. */
export interface PoiSourceClient {
  fetchOsm(b: Bounds): Promise<RawPoi[]>;
  fetchWikidata(b: Bounds): Promise<RawPoi[]>;
  fetchWikipedia(b: Bounds, lang: string): Promise<RawPoi[]>;
  fetchImages(files: string[]): Promise<Map<string, ImageRef>>;
}

export class HttpPoiSources implements PoiSourceClient {
  constructor(
    private readonly overpass = process.env['OVERPASS_ENDPOINT'] ?? 'https://overpass-api.de/api/interpreter',
    private readonly wikidata = process.env['WIKIDATA_SPARQL_ENDPOINT'] ??
      'https://query.wikidata.org/sparql',
    private readonly overpassOptions: OverpassOptions = {},
  ) {}

  /** `OVERPASS_ENDPOINT` may list several comma-separated interpreters; a failing one hands over to the next. */
  async fetchOsm(b: Bounds): Promise<RawPoi[]> {
    const endpoints = this.overpass
      .split(',')
      .map((endpoint) => endpoint.trim())
      .filter(Boolean);
    let failure: unknown;
    for (const endpoint of endpoints) {
      try {
        return await fetchOverpass(endpoint, b, this.overpassOptions);
      } catch (error) {
        // A local quota or lease rejection applies to every endpoint: do not spend more attempts.
        if (error instanceof RateLimitError) throw error;
        failure = error;
      }
    }
    throw failure ?? new Error('No Overpass endpoint configured');
  }

  async fetchWikidata(b: Bounds): Promise<RawPoi[]> {
    const url = `${this.wikidata}?format=json&query=${encodeURIComponent(buildWikidataQuery(b))}`;
    return parseWikidata(
      await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' }, timeoutMs: 60_000 }),
    );
  }

  async fetchWikipedia(b: Bounds, lang: string): Promise<RawPoi[]> {
    // geosearch supports a bounding box via gsbbox (generator: ggsbbox), top|left|bottom|right; max 10 km side.
    const p = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'geosearch',
      ggsbbox: `${b.north}|${b.west}|${b.south}|${b.east}`,
      ggslimit: '100',
      prop: 'info|coordinates|pageprops|pageimages',
      inprop: 'url',
      piprop: 'name',
      pilicense: 'free',
      pilimit: 'max',
      ppprop: 'wikibase_item|disambiguation',
      colimit: '100',
    });
    return parseWikipediaGenerator(await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${p}`), lang);
  }

  async fetchImages(files: string[]): Promise<Map<string, ImageRef>> {
    const out = new Map<string, ImageRef>();
    const unique = [...new Set(files)];
    for (let i = 0; i < unique.length; i += 40) {
      const chunk = unique.slice(i, i + 40);
      try {
        const json = await fetchJson(`https://commons.wikimedia.org/w/api.php?${buildCommonsQuery(chunk)}`);
        for (const [k, v] of parseCommonsImages(json)) out.set(k, v);
      } catch {
        // Keep earlier photos if one Commons batch is unavailable. Missing photos use the UI fallback.
      }
    }
    return out;
  }
}

/** Deterministic synthetic data for emulator/dev runs without network access; works for any coordinate. */
export class MockPoiSources implements PoiSourceClient {
  async fetchOsm(b: Bounds): Promise<RawPoi[]> {
    const tile = encodeGeohash((b.south + b.north) / 2, (b.west + b.east) / 2, 6);
    return syntheticRawPois(tile);
  }
  async fetchWikidata(): Promise<RawPoi[]> {
    return [];
  }
  async fetchWikipedia(b: Bounds, lang: string): Promise<RawPoi[]> {
    void b;
    void lang;
    return [];
  }
  async fetchImages(): Promise<Map<string, ImageRef>> {
    return new Map();
  }
}

export function boundsOfTile(geohash: string): Bounds {
  return geohashBounds(geohash);
}
