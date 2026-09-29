import type { Interest } from '../constants';
import type { MergedPoi } from './merge';

export interface Classification {
  interests: Interest[];
  primary?: Interest;
  /** false when the rules could not decide; the ingest may ask the lite LLM (spec 4.1). */
  confident: boolean;
}

const HISTORIC_ARCHITECTURE = new Set([
  'castle',
  'palace',
  'manor',
  'city_gate',
  'tower',
  'citywalls',
  'fort',
  'church',
  'monastery',
]);
const NIGHTLIFE_AMENITY = new Set(['pub', 'bar', 'nightclub', 'biergarten', 'stripclub']);
const CULINARY_AMENITY = new Set([
  'restaurant',
  'cafe',
  'fast_food',
  'marketplace',
  'food_court',
  'ice_cream',
  'biergarten',
  'pub',
]);
const ART_AMENITY = new Set(['theatre', 'arts_centre', 'cinema', 'library']);
const ARCH_BUILDING = new Set([
  'cathedral',
  'church',
  'chapel',
  'castle',
  'palace',
  'monastery',
  'temple',
  'mosque',
  'synagogue',
  'tower',
]);
const ARCH_MAN_MADE = new Set([
  'tower',
  'lighthouse',
  'windmill',
  'watermill',
  'obelisk',
  'bridge',
  'water_tower',
]);
const NATURE_NATURAL = new Set([
  'peak',
  'waterfall',
  'spring',
  'cave_entrance',
  'beach',
  'wood',
  'water',
  'cliff',
  'volcano',
]);

/** Order defines the primary interest when several apply (most specific first). */
const PRIORITY: Interest[] = [
  'history',
  'architecture',
  'art_culture',
  'nature',
  'culinary',
  'nightlife',
  'shopping',
  'hidden_gems',
];

export function classifyByRules(p: MergedPoi): Classification {
  const t = p.osmTags;
  const set = new Set<Interest>();
  const historic = t['historic'];
  if (historic && historic !== 'no') {
    set.add('history');
    if (HISTORIC_ARCHITECTURE.has(historic)) set.add('architecture');
    if (['memorial', 'monument', 'wayside_cross', 'wayside_shrine'].includes(historic))
      set.add('art_culture');
  }
  if (t['heritage'] || t['heritage:operator']) set.add('history');
  const tourism = t['tourism'];
  if (tourism === 'museum') {
    set.add('art_culture');
    set.add('history');
  }
  if (tourism === 'gallery' || tourism === 'artwork') set.add('art_culture');
  if (tourism === 'viewpoint' || tourism === 'zoo' || tourism === 'aquarium') set.add('nature');
  if (tourism === 'attraction' && set.size === 0) {
    // generic attraction: decide via other tags below, otherwise fall through as unconfident
  }
  const amenity = t['amenity'];
  if (amenity === 'place_of_worship') {
    set.add('architecture');
    set.add('history');
  }
  if (amenity && ART_AMENITY.has(amenity)) set.add('art_culture');
  if (amenity && CULINARY_AMENITY.has(amenity)) set.add('culinary');
  if (amenity && NIGHTLIFE_AMENITY.has(amenity)) set.add('nightlife');
  if (amenity === 'townhall' || amenity === 'fountain' || amenity === 'university') set.add('architecture');
  if (t['building'] && ARCH_BUILDING.has(t['building'])) set.add('architecture');
  if (t['man_made'] && ARCH_MAN_MADE.has(t['man_made'])) set.add('architecture');
  if (t['bridge'] === 'yes' || t['bridge:structure']) set.add('architecture');
  if (t['natural'] && NATURE_NATURAL.has(t['natural'])) set.add('nature');
  if (t['leisure'] && ['park', 'garden', 'nature_reserve'].includes(t['leisure'])) set.add('nature');
  if (t['shop']) set.add('shopping');
  if (t['craft']) set.add('shopping');

  // Wikidata-only candidates: infer from "instance of" labels.
  for (const c of p.instanceOf.map((x) => x.toLowerCase())) {
    if (
      /(church|cathedral|chapel|castle|palace|tower|bridge|gate|fortress|temple|shrine|monastery|mosque|synagogue)/.test(
        c,
      )
    )
      set.add('architecture');
    if (
      /(castle|palace|fortress|battlefield|monument|memorial|ruin|archaeolog|historic|temple|shrine|museum)/.test(
        c,
      )
    )
      set.add('history');
    if (/(museum|gallery|theatre|theater|opera|sculpture|artwork|library)/.test(c)) set.add('art_culture');
    if (/(park|garden|mountain|lake|river|waterfall|forest|nature|island|beach|hill|volcano)/.test(c))
      set.add('nature');
    if (/(market|restaurant|cafe|brewery)/.test(c)) set.add('culinary');
  }

  // hidden gems: interesting object with little documentation
  const documented = p.wikipedia.length > 0 || p.sitelinks > 0;
  const interesting =
    set.size > 0 || tourism === 'attraction' || tourism === 'artwork' || tourism === 'viewpoint';
  if (!documented && interesting && !set.has('shopping') && !set.has('nightlife') && !set.has('culinary')) {
    set.add('hidden_gems');
  }

  const interests = PRIORITY.filter((i) => set.has(i));
  if (interests.length === 0) {
    return { interests: [], confident: false };
  }
  return { interests, primary: interests[0]!, confident: true };
}

export type InterestClassifierFallback = (
  items: { key: string; name: string; tags: Record<string, string>; instanceOf: string[] }[],
) => Promise<Record<string, Interest[]>>;
