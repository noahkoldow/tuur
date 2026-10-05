import type { Poi } from '../schemas';

const STREETS = new Set([
  'residential',
  'living_street',
  'pedestrian',
  'footway',
  'path',
  'cycleway',
  'unclassified',
  'tertiary',
  'secondary',
]);
const NEIGHBORHOODS = new Set([
  'neighbourhood',
  'quarter',
  'suburb',
  'hamlet',
  'village',
  'locality',
  'square',
]);

/** Real, named features that can support a brief observation without claiming landmark status. */
export function localContextKind(
  tags: Record<string, string>,
): 'street' | 'neighborhood' | 'detail' | undefined {
  if (tags['highway'] && STREETS.has(tags['highway'])) return 'street';
  if (tags['place'] && NEIGHBORHOODS.has(tags['place'])) return 'neighborhood';
  if (
    tags['tourism'] === 'artwork' ||
    (tags['tourism'] === 'information' && ['board', 'map'].includes(tags['information'] ?? '')) ||
    ['memorial', 'wayside_cross', 'wayside_shrine', 'boundary_stone'].includes(tags['historic'] ?? '') ||
    ['fountain', 'drinking_water'].includes(tags['amenity'] ?? '') ||
    ['tree', 'spring'].includes(tags['natural'] ?? '')
  )
    return 'detail';
  return undefined;
}

/** Well documented monuments remain main sights, even when their OSM type is a small detail. */
export function isLocalContextPoi(poi: Pick<Poi, 'osmTags' | 'rawScore' | 'sources'>): boolean {
  return localContextKind(poi.osmTags) !== undefined && poi.rawScore < 30 && poi.sources.sitelinks < 8;
}
