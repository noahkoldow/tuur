import type { LatLng } from '../geo/geohash';
import type { WikipediaRef } from '../schemas';

/** A POI candidate as delivered by one upstream source, before merge/enrichment. */
export interface RawPoi {
  source: 'osm' | 'wikidata' | 'wikipedia';
  /** Stable id inside the source, e.g. "node/123", "Q42", "de:Berlin". */
  sourceId: string;
  name: string;
  names?: Record<string, string>;
  location: LatLng;
  osmTags?: Record<string, string>;
  wikidataId?: string;
  wikipedia?: WikipediaRef[];
  sitelinks?: number;
  /** Wikimedia Commons file title (from P18 or OSM `wikimedia_commons`). */
  imageFile?: string;
  /** Wikidata "instance of" labels/ids can help classification. */
  instanceOf?: string[];
}

// ---------- Overpass ----------

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const NAME_KEY = /^name:([a-z]{2,3}(?:-[A-Za-z]+)?)$/;

export function parseOverpass(json: unknown): RawPoi[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements ?? [];
  const out: RawPoi[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags['name'] ?? tags['name:en'];
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue;
    const names: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      const m = NAME_KEY.exec(k);
      if (m?.[1]) names[m[1]] = v;
    }
    const wikipedia: WikipediaRef[] = [];
    const wp = tags['wikipedia'];
    if (wp && wp.includes(':')) {
      const idx = wp.indexOf(':');
      wikipedia.push({ lang: wp.slice(0, idx), title: wp.slice(idx + 1), length: 0 });
    }
    const commons = tags['wikimedia_commons'];
    out.push({
      source: 'osm',
      sourceId: `${el.type}/${el.id}`,
      name,
      names,
      location: { lat, lng },
      osmTags: tags,
      ...(tags['wikidata'] ? { wikidataId: tags['wikidata'] } : {}),
      ...(wikipedia.length ? { wikipedia } : {}),
      ...(commons?.startsWith('File:') ? { imageFile: commons } : {}),
    });
  }
  return out;
}

/** Builds the Overpass QL query for tourism-relevant objects inside a bbox. Endpoint is configurable. */
export function buildOverpassQuery(b: { south: number; west: number; north: number; east: number }): string {
  const bb = `${b.south},${b.west},${b.north},${b.east}`;
  const filters = [
    'nwr["tourism"~"^(attraction|museum|gallery|artwork|viewpoint|zoo|theme_park|aquarium)$"]',
    'nwr["historic"]',
    'nwr["heritage"]',
    'nwr["amenity"~"^(place_of_worship|theatre|arts_centre|marketplace|fountain|townhall|library|university|pub|bar|nightclub|biergarten)$"]',
    'nwr["man_made"~"^(tower|lighthouse|windmill|watermill|obelisk)$"]',
    'nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]',
    'nwr["natural"~"^(peak|waterfall|spring|cave_entrance|beach)$"]',
    'nwr["building"~"^(cathedral|church|chapel|castle|palace|monastery|temple|mosque|synagogue)$"]',
  ];
  return `[out:json][timeout:60];(${filters.map((f) => `${f}["name"](${bb});`).join('')});out center tags 2000;`;
}

// ---------- Wikidata SPARQL ----------

interface SparqlBinding {
  item: { value: string };
  itemLabel?: { value: string; 'xml:lang'?: string };
  coord: { value: string };
  sitelinks?: { value: string };
  image?: { value: string };
  classLabel?: { value: string };
}

/** Parses "Point(lon lat)" WKT. */
export function parseWktPoint(wkt: string): LatLng | null {
  const m = /Point\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/i.exec(wkt);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function parseWikidata(json: unknown): RawPoi[] {
  const rows = (json as { results?: { bindings?: SparqlBinding[] } } | null)?.results?.bindings ?? [];
  const byId = new Map<string, RawPoi>();
  for (const r of rows) {
    const id = r.item.value.split('/').pop();
    const loc = parseWktPoint(r.coord.value);
    const label = r.itemLabel?.value;
    if (!id || !loc || !label || /^Q\d+$/.test(label)) continue;
    const existing = byId.get(id);
    if (existing) {
      if (r.classLabel?.value) existing.instanceOf = [...(existing.instanceOf ?? []), r.classLabel.value];
      continue;
    }
    const file = r.image?.value
      ? decodeURIComponent(r.image.value.split('/Special:FilePath/').pop() ?? '')
      : '';
    byId.set(id, {
      source: 'wikidata',
      sourceId: id,
      name: label,
      location: loc,
      wikidataId: id,
      sitelinks: Number(r.sitelinks?.value ?? 0),
      ...(file ? { imageFile: `File:${file.replace(/_/g, ' ')}` } : {}),
      ...(r.classLabel?.value ? { instanceOf: [r.classLabel.value] } : {}),
    });
  }
  return [...byId.values()];
}

/** SPARQL for notable things (with sitelinks) inside a bbox via the wikibase:box service. */
export function buildWikidataQuery(b: { south: number; west: number; north: number; east: number }): string {
  return `SELECT ?item ?itemLabel ?coord ?sitelinks ?image ?classLabel WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord . bd:serviceParam wikibase:cornerSouthWest "Point(${b.west} ${b.south})"^^geo:wktLiteral . bd:serviceParam wikibase:cornerNorthEast "Point(${b.east} ${b.north})"^^geo:wktLiteral . }
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= 2)
  ?item wdt:P31 ?class .
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q5 . }
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q486972 . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,mul". }
} LIMIT 1500`;
}

// ---------- Wikipedia geosearch ----------

interface GeoSearchItem {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist?: number;
}

export function parseWikipediaGeosearch(json: unknown, lang: string): RawPoi[] {
  const items = (json as { query?: { geosearch?: GeoSearchItem[] } } | null)?.query?.geosearch ?? [];
  return items.map((it) => ({
    source: 'wikipedia' as const,
    sourceId: `${lang}:${it.title}`,
    name: it.title,
    names: { [lang]: it.title },
    location: { lat: it.lat, lng: it.lon },
    wikipedia: [
      {
        lang,
        title: it.title,
        length: 0,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, '_'))}`,
      },
    ],
  }));
}

interface PageInfo {
  title: string;
  length?: number;
  extract?: string;
  pageprops?: { wikibase_item?: string };
}

/** Parses `action=query&prop=info|extracts|pageprops` into title -> info for enrichment. */
export function parseWikipediaPages(json: unknown): Map<string, PageInfo> {
  const pages = (json as { query?: { pages?: Record<string, PageInfo> } } | null)?.query?.pages ?? {};
  const out = new Map<string, PageInfo>();
  for (const p of Object.values(pages)) out.set(p.title, p);
  return out;
}

// ---------- Wikipedia generator=geosearch (one call: coordinates, length, wikidata id) ----------

interface GeneratorPage {
  title: string;
  length?: number;
  fullurl?: string;
  coordinates?: { lat: number; lon: number }[];
  pageprops?: { wikibase_item?: string; disambiguation?: string };
}

export function parseWikipediaGenerator(json: unknown, lang: string): RawPoi[] {
  const pages = (json as { query?: { pages?: Record<string, GeneratorPage> } } | null)?.query?.pages ?? {};
  const out: RawPoi[] = [];
  for (const p of Object.values(pages)) {
    const c = p.coordinates?.[0];
    if (!c || p.pageprops?.disambiguation !== undefined) continue;
    out.push({
      source: 'wikipedia',
      sourceId: `${lang}:${p.title}`,
      name: p.title,
      names: { [lang]: p.title },
      location: { lat: c.lat, lng: c.lon },
      ...(p.pageprops?.wikibase_item ? { wikidataId: p.pageprops.wikibase_item } : {}),
      wikipedia: [
        {
          lang,
          title: p.title,
          length: p.length ?? 0,
          url:
            p.fullurl ??
            `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
        },
      ],
    });
  }
  return out;
}
