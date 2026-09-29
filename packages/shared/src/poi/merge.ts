import { distanceMeters } from '../geo/geohash';
import type { WikipediaRef } from '../schemas';
import type { RawPoi } from './raw';

export interface MergedPoi {
  name: string;
  names: Record<string, string>;
  location: RawPoi['location'];
  osmTags: Record<string, string>;
  osmId?: string;
  wikidataId?: string;
  wikipedia: WikipediaRef[];
  sitelinks: number;
  imageFile?: string;
  instanceOf: string[];
  members: RawPoi[];
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice coefficient on character bigrams of normalized names, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let inter = 0;
  for (const [g, c] of ga) inter += Math.min(c, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((x, y) => x + y, 0) + [...gb.values()].reduce((x, y) => x + y, 0);
  return (2 * inter) / total;
}

function allNames(p: { name: string; names?: Record<string, string> }): string[] {
  return [p.name, ...Object.values(p.names ?? {})];
}

export interface MergeOptions {
  /** Max distance for name-based matching. */
  maxDistanceM: number;
  minSimilarity: number;
  /** Distance under which candidates from different sources are treated as the same place. */
  colocatedM: number;
}
export const DEFAULT_MERGE: MergeOptions = { maxDistanceM: 120, minSimilarity: 0.82, colocatedM: 25 };

/** Two candidates describe the same place if they share an id, or are near each other with similar names. */
export function isSamePlace(a: RawPoi, b: RawPoi, opt: MergeOptions = DEFAULT_MERGE): boolean {
  if (a.wikidataId && b.wikidataId) return a.wikidataId === b.wikidataId;
  for (const wa of a.wikipedia ?? []) {
    for (const wb of b.wikipedia ?? []) {
      if (wa.lang === wb.lang && normalizeName(wa.title) === normalizeName(wb.title)) return true;
    }
  }
  const d = distanceMeters(a.location, b.location);
  if (d > opt.maxDistanceM) return false;
  let best = 0;
  for (const na of allNames(a)) for (const nb of allNames(b)) best = Math.max(best, nameSimilarity(na, nb));
  if (best >= opt.minSimilarity) return true;
  // Wikidata labels are often English while OSM names are local; near-identical positions plus a shared
  // name stem ("Reichstag" / "Reichstagsgebäude") or co-location of a knowledge-base item with an
  // undocumented OSM sight are strong enough evidence, unless the OSM object is plainly commercial.
  if (a.source !== b.source) {
    if (d <= opt.maxDistanceM && sharesStem(a, b)) return true;
    if (d <= opt.colocatedM && !isCommercial(a) && !isCommercial(b)) return true;
  }
  return false;
}

function isCommercial(p: RawPoi): boolean {
  const t = p.osmTags ?? {};
  return (
    Boolean(t['shop']) ||
    ['restaurant', 'cafe', 'fast_food', 'pub', 'bar', 'nightclub'].includes(t['amenity'] ?? '')
  );
}

/** True if a name token of one is a strict prefix (>= 6 chars) of a different token of the other. */
function sharesStem(a: RawPoi, b: RawPoi): boolean {
  const tok = (p: RawPoi) =>
    new Set(
      allNames(p)
        .flatMap((n) => normalizeName(n).split(' '))
        .filter((x) => x.length >= 6),
    );
  const ta = tok(a);
  const tb = tok(b);
  for (const x of ta) for (const y of tb) if (x !== y && (x.startsWith(y) || y.startsWith(x))) return true;
  return false;
}

/** Union-find merge; deterministic (input order independent of result up to member ordering). */
export function mergeRawPois(raw: RawPoi[], opt: MergeOptions = DEFAULT_MERGE): MergedPoi[] {
  const parent = raw.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[i] !== r) {
      const n = parent[i] as number;
      parent[i] = r;
      i = n;
    }
    return r;
  };
  const byWikidata = new Map<string, number>();
  raw.forEach((p, i) => {
    if (!p.wikidataId) return;
    const seen = byWikidata.get(p.wikidataId);
    if (seen === undefined) byWikidata.set(p.wikidataId, i);
    else parent[find(i)] = find(seen);
  });
  // Spatial bucket (~0.002 deg) to keep pairwise checks near-linear.
  const cell = (p: RawPoi) => `${Math.floor(p.location.lat / 0.002)}:${Math.floor(p.location.lng / 0.002)}`;
  const buckets = new Map<string, number[]>();
  raw.forEach((p, i) => {
    const [cy, cx] = cell(p).split(':').map(Number) as [number, number];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of buckets.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (find(i) !== find(j) && isSamePlace(p, raw[j] as RawPoi, opt)) parent[find(i)] = find(j);
        }
      }
    }
    const k = cell(p);
    buckets.set(k, [...(buckets.get(k) ?? []), i]);
  });
  const groups = new Map<number, RawPoi[]>();
  raw.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  return [...groups.values()].map(combine).sort((a, b) => a.name.localeCompare(b.name));
}

function combine(members: RawPoi[]): MergedPoi {
  // Prefer OSM for position/tags (precise), Wikidata for ids and sitelinks.
  const osm = members.find((m) => m.source === 'osm');
  const primary = osm ?? members[0]!;
  const names: Record<string, string> = {};
  const wikipedia = new Map<string, WikipediaRef>();
  const instanceOf = new Set<string>();
  let sitelinks = 0;
  let wikidataId: string | undefined;
  let imageFile: string | undefined;
  let osmTags: Record<string, string> = {};
  for (const m of members) {
    Object.assign(names, m.names ?? {});
    for (const w of m.wikipedia ?? []) {
      const k = w.lang;
      const cur = wikipedia.get(k);
      if (!cur || w.length > cur.length) wikipedia.set(k, { ...cur, ...w });
    }
    sitelinks = Math.max(sitelinks, m.sitelinks ?? 0);
    wikidataId ??= m.wikidataId;
    imageFile ??= m.imageFile;
    for (const c of m.instanceOf ?? []) instanceOf.add(c);
    osmTags = { ...osmTags, ...(m.osmTags ?? {}) };
  }
  const osmId = osm?.sourceId;
  return {
    name: primary.name,
    names,
    location: primary.location,
    osmTags,
    ...(osmId ? { osmId } : {}),
    ...(wikidataId ? { wikidataId } : {}),
    wikipedia: [...wikipedia.values()],
    sitelinks,
    ...(imageFile ? { imageFile } : {}),
    instanceOf: [...instanceOf],
    members,
  };
}
