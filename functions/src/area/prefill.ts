import {
  AreaSchema,
  DEFAULT_CLAIM_POLICY,
  decideClaim,
  distanceMeters,
  encodeGeohash,
  geohashBounds,
  type Bounds,
  type ClaimPolicy,
  type LatLng,
} from '@tuur/shared';

export interface PrefillPreset {
  name: string;
  bounds: Bounds;
  /** Tiles are processed nearest-first, so a partial run covers the most visited places. */
  center: LatLng;
}

/** Named areas that can be warmed ahead of time. */
export const PREFILL_PRESETS: Record<string, PrefillPreset> = {
  /** Hakenfelde and its surroundings (about 6 km by 6 km): Falkenhagener Feld, Spandau-Nord, Haselhorst edge. */
  hakenfelde: {
    name: 'hakenfelde',
    bounds: { south: 52.555, west: 13.14, north: 52.61, east: 13.235 },
    center: { lat: 52.583, lng: 13.183 },
  },
  /** Potsdam city centre and Sanssouci (Berlin zone C). */
  potsdam: {
    name: 'potsdam',
    bounds: { south: 52.375, west: 13.03, north: 52.425, east: 13.1 },
    center: { lat: 52.3995, lng: 13.0645 },
  },
  /** The wider Spandau district around the Altstadt. */
  spandau: {
    name: 'spandau',
    bounds: { south: 52.49, west: 13.08, north: 52.64, east: 13.28 },
    center: { lat: 52.5352, lng: 13.2 },
  },
  /** Roughly the Berlin S-Bahn ring (Westkreuz, Südkreuz, Ostkreuz, Gesundbrunnen) around Alexanderplatz. */
  'berlin-inner': {
    name: 'berlin-inner',
    bounds: { south: 52.47, west: 13.28, north: 52.555, east: 13.48 },
    center: { lat: 52.5208, lng: 13.4095 },
  },
};

/** Same stale window as the deployed beta ensureArea, so queued tiles are not claimed twice. */
export const PREFILL_CLAIM_POLICY: ClaimPolicy = { ...DEFAULT_CLAIM_POLICY, staleIngestMs: 2 * 3600_000 };

/** Every geohash tile whose centre lies in `bounds`, nearest to `center` first. */
export function prefillTiles(bounds: Bounds, center: LatLng, precision = 6, maxTiles = 2000): string[] {
  const cell = geohashBounds(encodeGeohash(center.lat, center.lng, precision));
  const height = cell.north - cell.south;
  const width = cell.east - cell.west;
  const tiles = new Set<string>();
  for (let lat = bounds.south + height / 2; lat < bounds.north; lat += height)
    for (let lng = bounds.west + width / 2; lng < bounds.east; lng += width) {
      tiles.add(encodeGeohash(lat, lng, precision));
      if (tiles.size > maxTiles) throw new Error(`Prefill area exceeds ${maxTiles} tiles`);
    }
  const distance = (tile: string) => {
    const b = geohashBounds(tile);
    return distanceMeters(center, { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 });
  };
  return [...tiles].sort((a, b) => distance(a) - distance(b) || a.localeCompare(b));
}

/** Whether a stored area document may be claimed for ingestion now (same rules as ensureArea). */
export function canClaimForPrefill(stored: unknown, now: number): boolean {
  const area = stored === undefined ? undefined : AreaSchema.parse(stored);
  return decideClaim(area, now, PREFILL_CLAIM_POLICY) !== 'skip';
}

/** Imported tiles that contain at least `minSights` places, nearest to `center` first. */
export function snapshotPrefillOrder(
  tiles: { id: string; sights: number }[],
  center: LatLng,
  minSights = 1,
): string[] {
  const valid = tiles.filter((t) => /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(t.id) && t.sights >= minSights);
  const distance = (tile: string) => {
    const b = geohashBounds(tile);
    return distanceMeters(center, { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 });
  };
  return valid
    .map((t) => t.id)
    .sort((a, b) => distance(a) - distance(b) || a.localeCompare(b));
}

