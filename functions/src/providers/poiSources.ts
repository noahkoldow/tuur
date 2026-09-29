import {
  buildCommonsQuery,
  buildOverpassQuery,
  buildWikidataQuery,
  encodeGeohash,
  geohashBounds,
  parseCommonsImages,
  parseOverpass,
  parseWikidata,
  parseWikipediaGenerator,
  type Bounds,
  type ImageRef,
  type RawPoi,
} from '@tuur/shared';
import { fetchJson } from '../util/http';

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
  ) {}

  async fetchOsm(b: Bounds): Promise<RawPoi[]> {
    const body = new URLSearchParams({ data: buildOverpassQuery(b) }).toString();
    const json = await fetchJson(this.overpass, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeoutMs: 70_000,
      retries: 2,
    });
    return parseOverpass(json);
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
      prop: 'info|coordinates|pageprops',
      inprop: 'url',
      ppprop: 'wikibase_item|disambiguation',
      colimit: '100',
    });
    return parseWikipediaGenerator(await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${p}`), lang);
  }

  async fetchImages(files: string[]): Promise<Map<string, ImageRef>> {
    const out = new Map<string, ImageRef>();
    for (let i = 0; i < files.length; i += 40) {
      const chunk = files.slice(i, i + 40);
      const json = await fetchJson(`https://commons.wikimedia.org/w/api.php?${buildCommonsQuery(chunk)}`);
      for (const [k, v] of parseCommonsImages(json)) out.set(k, v);
    }
    return out;
  }
}

/** Deterministic synthetic data for emulator/dev runs without network access; works for any coordinate. */
export class MockPoiSources implements PoiSourceClient {
  async fetchOsm(b: Bounds): Promise<RawPoi[]> {
    const hash = encodeGeohash((b.south + b.north) / 2, (b.west + b.east) / 2, 6);
    const seed = [...hash].reduce((a, c) => a + c.charCodeAt(0), 0);
    const kinds: Record<string, string>[] = [
      { tourism: 'attraction', historic: 'monument' },
      { tourism: 'museum' },
      { amenity: 'place_of_worship', building: 'church' },
      { historic: 'castle' },
      { leisure: 'park' },
      { tourism: 'viewpoint' },
    ];
    return kinds.map((tags, i) => {
      const name = `Mock ${tags['tourism'] ?? tags['historic'] ?? tags['amenity'] ?? tags['leisure']} ${hash}-${i}`;
      const lat = b.south + ((b.north - b.south) * (((seed + i * 17) % 90) + 5)) / 100;
      const lng = b.west + ((b.east - b.west) * (((seed + i * 29) % 90) + 5)) / 100;
      return {
        source: 'osm' as const,
        sourceId: `node/${seed * 100 + i}`,
        name,
        names: {},
        location: { lat, lng },
        osmTags: { name, ...tags },
        ...(i < 3 ? { wikidataId: `Q${seed * 10 + i}`, sitelinks: 10 + i * 5 } : {}),
      };
    });
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
