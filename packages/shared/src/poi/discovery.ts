import type { Interest } from '../constants';
import { distanceMeters, type LatLng } from '../geo/geohash';
import { weightedScore } from '../routing/orienteering';
import type { Poi } from '../schemas';
import { nameSimilarity, normalizeName } from './merge';

export type PlaceProminence = 'landmark' | 'notable' | 'local';

/** Source coverage is independent of neighborhood normalization and commercial boosts. */
export function placeProminence(poi: Poi): PlaceProminence {
  const languages = new Set(poi.sources.wikipedia.map((ref) => ref.lang)).size;
  if (poi.rawScore >= 65 || poi.sources.sitelinks >= 30 || languages >= 10) return 'landmark';
  if (poi.rawScore >= 40 || poi.sources.sitelinks >= 8 || languages >= 3) return 'notable';
  return 'local';
}

/** Session stops can retain their identity even after their full POI leaves the loaded pool. */
export type PlaceIdentity = Pick<Poi, 'id' | 'name' | 'location'> &
  Partial<Pick<Poi, 'names' | 'sources' | 'osmTags'>>;

export interface NearbyPlaceOptions {
  maxDistanceM: number;
  limit?: number;
  interests?: Interest[];
  excludedIds?: readonly string[];
  excludedPlaces?: readonly PlaceIdentity[];
}

function wikidataId(place: PlaceIdentity): string | undefined {
  return (place.sources?.wikidataId ?? place.osmTags?.['wikidata'] ?? /^wd_(Q\d+)$/i.exec(place.id)?.[1])
    ?.trim()
    .toUpperCase();
}

function wikipediaKey(lang: string, title: string): string {
  // Underscores/spaces are interchangeable in article titles; punctuation is significant.
  return `wiki:${lang.toLowerCase()}:${title.replace(/_/g, ' ').trim().normalize('NFC').toLowerCase()}`;
}

function identityKeys(place: PlaceIdentity): string[] {
  const keys = [`id:${place.id}`];
  const wikidata = wikidataId(place);
  if (wikidata) keys.push(`wd:${wikidata}`);
  const osm = place.sources?.osmId ?? /^osm_(node|way|relation)_(\d+)$/.exec(place.id)?.slice(1).join('/');
  if (osm) keys.push(`osm:${osm}`);
  for (const ref of place.sources?.wikipedia ?? []) keys.push(wikipediaKey(ref.lang, ref.title));
  const taggedWikipedia = place.osmTags?.['wikipedia'];
  const colon = taggedWikipedia?.indexOf(':') ?? -1;
  if (taggedWikipedia && colon > 0) {
    keys.push(wikipediaKey(taggedWikipedia.slice(0, colon), taggedWikipedia.slice(colon + 1)));
  }
  return keys;
}

/**
 * Group source aliases before applying exclusions or limits. Explicit, different Wikidata entities
 * must stay separate, including when an unlinked record could otherwise bridge their names.
 */
function identityGroups(places: readonly PlaceIdentity[]): number[] {
  const parents = places.map((_, index) => index);
  const entities = places.map((place) => wikidataId(place));
  const root = (index: number): number => {
    if (parents[index] !== index) parents[index] = root(parents[index]!);
    return parents[index]!;
  };
  const join = (left: number, right: number) => {
    const a = root(left);
    const b = root(right);
    if (a === b || (entities[a] && entities[b] && entities[a] !== entities[b])) return;
    parents[b] = a;
    entities[a] ??= entities[b];
  };
  const ordered = places.map((_, index) => index).sort((a, b) => places[a]!.id.localeCompare(places[b]!.id));
  const byKey = new Map<string, number[]>();
  for (const index of ordered) {
    for (const key of identityKeys(places[index]!)) {
      for (const previous of byKey.get(key) ?? []) join(index, previous);
      const matches = byKey.get(key) ?? [];
      matches.push(index);
      byKey.set(key, matches);
    }
  }

  const names = places.map((place) =>
    [...new Set([place.name, ...Object.values(place.names ?? {})].map(normalizeName))].filter(Boolean),
  );
  for (let left = 0; left < ordered.length; left++) {
    const a = ordered[left]!;
    for (let right = left + 1; right < ordered.length; right++) {
      const b = ordered[right]!;
      if (root(a) === root(b)) continue;
      if (entities[root(a)] && entities[root(b)] && entities[root(a)] !== entities[root(b)]) continue;
      // Similar names alone are insufficient: only match at the same immediate location.
      const distance = distanceMeters(places[a]!.location, places[b]!.location);
      if (distance > 80) continue;
      if (
        names[a]!.some((na) =>
          names[b]!.some(
            (nb) =>
              na === nb ||
              (distance <= 40 &&
                (na.replace(/ /g, '') === nb.replace(/ /g, '') ||
                  (na.match(/\d+/g)?.join(' ') === nb.match(/\d+/g)?.join(' ') &&
                    nameSimilarity(na, nb) >= 0.92))),
          ),
        )
      )
        join(a, b);
    }
  }
  return places.map((_, index) => root(index));
}

/**
 * Nearby discovery balances travel effort, source-backed significance and personal interests.
 * Important sights have a wider useful walking range. When there is room for multiple options,
 * keep one landmark among the first three, even in a dense cluster of very close local details.
 */
export function rankNearbyPlaces(position: LatLng, candidates: Poi[], options: NearbyPlaceOptions): Poi[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 8));
  if (!limit) return [];
  const excludedIds = new Set(options.excludedIds ?? []);
  const excludedPlaces = options.excludedPlaces ?? [];
  const ranked = candidates
    .filter((poi) => poi.accessible && !poi.hidden)
    .map((poi) => ({
      poi,
      distance: distanceMeters(position, poi.location),
      prominence: placeProminence(poi),
    }))
    .filter(({ distance }) => distance <= options.maxDistanceM)
    .map((entry) => {
      const usefulRange = { landmark: 1200, notable: 650, local: 300 }[entry.prominence];
      const quality = 0.6 * entry.poi.rawScore + 0.4 * entry.poi.score;
      const value =
        weightedScore({ ...entry.poi, score: quality }, options.interests) /
        (1 + entry.distance / usefulRange);
      return { ...entry, value };
    })
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.distance - b.distance ||
        a.poi.id.localeCompare(b.poi.id) ||
        b.poi.updatedAt - a.poi.updatedAt,
    );

  // Include excluded records even when they are now hidden, inaccessible or outside the radius.
  const identities: PlaceIdentity[] = [
    ...ranked.map(({ poi }) => poi),
    ...candidates.filter((poi) => excludedIds.has(poi.id)),
    ...excludedPlaces,
  ];
  const groups = identityGroups(identities);
  const blockedGroups = new Set<number>();
  identities.forEach((place, index) => {
    if (excludedIds.has(place.id) || index >= identities.length - excludedPlaces.length) {
      blockedGroups.add(groups[index]!);
    }
  });
  const seenGroups = new Set<number>();
  const seenIds = new Set<string>();
  const unique = ranked.filter(({ poi }, index) => {
    const group = groups[index]!;
    if (blockedGroups.has(group) || seenGroups.has(group) || seenIds.has(poi.id)) return false;
    seenGroups.add(group);
    seenIds.add(poi.id);
    return true;
  });

  const selected = unique.slice(0, limit);
  if (limit >= 2 && !selected.slice(0, 3).some(({ prominence }) => prominence === 'landmark')) {
    const landmark = unique.find(({ prominence }) => prominence === 'landmark');
    if (landmark) {
      const existing = selected.indexOf(landmark);
      if (existing >= 0) selected.splice(existing, 1);
      selected.splice(Math.min(2, limit - 1), 0, landmark);
    }
  }
  return selected.slice(0, limit).map(({ poi }) => poi);
}
