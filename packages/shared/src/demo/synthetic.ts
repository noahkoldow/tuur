import { geohashBounds } from '../geo/geohash';
import type { RawPoi } from '../poi/raw';

/**
 * Deterministic synthetic POI candidates for any tile, so dev, demo and tests work at arbitrary coordinates
 * without network access. Names are generic on purpose; nothing here pretends to be real data.
 */
export function syntheticRawPois(tile: string): RawPoi[] {
  const b = geohashBounds(tile);
  const seed = [...tile].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const kinds: { label: string; tags: Record<string, string>; sitelinks: number; wikipedia?: boolean }[] = [
    {
      label: 'Old Town Hall',
      tags: { amenity: 'townhall', historic: 'building', tourism: 'attraction' },
      sitelinks: 24,
      wikipedia: true,
    },
    {
      label: 'Cathedral',
      tags: { amenity: 'place_of_worship', building: 'cathedral', tourism: 'attraction' },
      sitelinks: 30,
      wikipedia: true,
    },
    { label: 'City Museum', tags: { tourism: 'museum' }, sitelinks: 14, wikipedia: true },
    { label: 'Castle Ruins', tags: { historic: 'castle' }, sitelinks: 18, wikipedia: true },
    { label: 'Memorial', tags: { historic: 'memorial', tourism: 'attraction' }, sitelinks: 8 },
    { label: 'Market Fountain', tags: { amenity: 'fountain', historic: 'fountain' }, sitelinks: 6 },
    { label: 'City Park', tags: { leisure: 'park' }, sitelinks: 5 },
    { label: 'Viewpoint', tags: { tourism: 'viewpoint' }, sitelinks: 3 },
    { label: 'Gallery', tags: { tourism: 'gallery' }, sitelinks: 4 },
    {
      label: 'Old Gate',
      tags: { historic: 'city_gate', tourism: 'attraction' },
      sitelinks: 12,
      wikipedia: true,
    },
    { label: 'Chapel', tags: { amenity: 'place_of_worship', building: 'chapel' }, sitelinks: 4 },
    { label: 'Tower', tags: { man_made: 'tower', tourism: 'attraction' }, sitelinks: 9 },
  ];
  return kinds.map((k, i) => {
    const fx = ((seed >>> (i % 7)) + i * 37) % 90;
    const fy = ((seed >>> ((i + 3) % 7)) + i * 53) % 90;
    const lat = b.south + ((b.north - b.south) * (fy + 5)) / 100;
    const lng = b.west + ((b.east - b.west) * (fx + 5)) / 100;
    const name = `${k.label} ${tile.slice(-3).toUpperCase()}-${i + 1}`;
    return {
      source: 'osm' as const,
      sourceId: `node/${seed % 100000}${i}`,
      name,
      names: {},
      location: { lat, lng },
      osmTags: { name, ...k.tags },
      ...(k.wikipedia
        ? {
            wikidataId: `Q${9000000 + (seed % 100000) * 10 + i}`,
            sitelinks: k.sitelinks,
            wikipedia: [{ lang: 'de', title: name, length: 6000 + i * 900 }],
          }
        : { sitelinks: k.sitelinks }),
    };
  });
}
