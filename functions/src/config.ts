import { getFirestore } from 'firebase-admin/firestore';
import { HttpPoiSources, MockPoiSources, type PoiSourceClient } from './providers/poiSources';
import { MockGeocoder, NominatimGeocoder, type GeocodingProvider } from './providers/geocoding';
import { MockLlmProvider, type LlmProvider } from './providers/llm';

const mode = (name: string) => process.env[name] ?? 'mock';

export const db = () => getFirestore();

export function poiSources(): PoiSourceClient {
  return mode('TUUR_POI_PROVIDER') === 'live' ? new HttpPoiSources() : new MockPoiSources();
}
export function geocoder(): GeocodingProvider {
  return mode('TUUR_GEOCODING_PROVIDER') === 'nominatim' ? new NominatimGeocoder() : new MockGeocoder();
}
export function llm(): LlmProvider {
  return new MockLlmProvider();
}
