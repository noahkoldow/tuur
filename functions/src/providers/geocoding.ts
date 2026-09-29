import { encodeGeohash, sourceLangsFor, type LatLng, type Place } from '@tuur/shared';
import { fetchJson } from '../util/http';

/** Reverse geocoding (city / municipality names) behind an interface so the vendor can be swapped. */
export interface GeocodingProvider {
  reverse(at: LatLng): Promise<GeocodeResult>;
}
export interface GeocodeResult {
  name: string;
  countryCode: string;
  country?: string;
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function placeFromGeocode(g: GeocodeResult, at: LatLng, now: number): Place {
  const cc = g.countryCode.toUpperCase();
  return {
    id: `${cc}_${slugify(g.name) || encodeGeohash(at.lat, at.lng, 5)}`,
    name: g.name,
    countryCode: cc,
    ...(g.country ? { country: g.country } : {}),
    location: at,
    sourceLangs: sourceLangsFor(cc),
    createdAt: now,
  };
}

interface NominatimReverse {
  address?: Record<string, string>;
}

/**
 * Nominatim (OSM). NOTE: the public instance allows ~1 request/second and forbids bulk use; ingest calls
 * it once per tile. For production traffic configure a self-hosted or commercial endpoint via NOMINATIM_URL.
 */
export class NominatimGeocoder implements GeocodingProvider {
  constructor(
    private readonly baseUrl = process.env['NOMINATIM_URL'] ?? 'https://nominatim.openstreetmap.org',
  ) {}

  async reverse(at: LatLng): Promise<GeocodeResult> {
    const url = `${this.baseUrl}/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${at.lat}&lon=${at.lng}`;
    const json = await fetchJson<NominatimReverse>(url, { retries: 2 });
    const a = json.address ?? {};
    const name = a['city'] ?? a['town'] ?? a['village'] ?? a['municipality'] ?? a['county'] ?? a['state'];
    const cc = a['country_code'];
    if (!name || !cc) throw new Error('Nominatim returned no place');
    return { name, countryCode: cc.toUpperCase(), ...(a['country'] ? { country: a['country'] } : {}) };
  }
}

export class MockGeocoder implements GeocodingProvider {
  async reverse(at: LatLng): Promise<GeocodeResult> {
    return { name: `Mockville ${encodeGeohash(at.lat, at.lng, 3)}`, countryCode: 'DE', country: 'Germany' };
  }
}
