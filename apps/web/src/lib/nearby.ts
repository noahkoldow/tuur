import {
  DEFAULT_GEOHASH_PRECISION,
  distanceMeters,
  encodeGeohash,
  tilesAround,
  type LatLng,
  type Poi,
} from '@tuur/shared';

export interface GeocodeHit {
  label: string;
  location: LatLng;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Address search for the partner profile (OpenStreetMap Nominatim, called from the browser on an explicit click
 * only, so the usage policy's one-request-per-second limit holds). Allowed by the CSP `connect-src`.
 */
export async function geocodeAddress(address: string, lang?: string): Promise<GeocodeHit[]> {
  const q = address.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '0',
    // query parameter instead of a header keeps the request CORS-simple (no preflight)
    'accept-language': lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'),
  });
  const res = await fetch(`${NOMINATIM}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocoding failed (${res.status})`);
  const rows = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
  const hits: GeocodeHit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!r.display_name || !Number.isFinite(lat) || !Number.isFinite(lng) || seen.has(r.display_name)) continue;
    seen.add(r.display_name); // labels are used as React keys
    hits.push({ label: r.display_name, location: { lat, lng } });
  }
  return hits;
}

/**
 * Ingest tiles to query for POIs around a position: the tile plus its ring of neighbours (9 tiles, within the
 * Firestore `in` limit of 30), so places right across a tile border are found too.
 */
export function searchTiles(location: LatLng): string[] {
  return tilesAround(encodeGeohash(location.lat, location.lng, DEFAULT_GEOHASH_PRECISION), 1);
}

/**
 * POIs within `radiusM` of `center`, nearest first, with the rounded distance. POIs already attached to another
 * partner are left out (the server rejects linking them); the own partner's POI stays selectable.
 */
export function nearbyPois(
  pois: Poi[],
  center: LatLng,
  radiusM: number,
  ownPartnerId?: string,
  max = 15,
): { poi: Poi; distanceM: number }[] {
  return pois
    .filter((p) => !p.hidden && (!p.partnerId || p.partnerId === ownPartnerId))
    .map((poi) => ({ poi, distanceM: Math.round(distanceMeters(center, poi.location)) }))
    .filter((x) => x.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, max);
}
