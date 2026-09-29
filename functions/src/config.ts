import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpPoiSources, MockPoiSources, type PoiSourceClient } from './providers/poiSources';
import { MockGeocoder, NominatimGeocoder, type GeocodingProvider } from './providers/geocoding';
import { GeminiLlmProvider, MockLlmProvider, type LlmProvider } from './providers/llm';
import {
  GeminiTtsProvider,
  MockTtsProvider,
  Mp3AudioEncoder,
  type AudioEncoder,
  type TtsProvider,
} from './providers/tts';
import {
  HttpNarrationSources,
  MockNarrationSources,
  type NarrationSourceProvider,
} from './providers/narrationSources';
import type { NarrationDeps, ObjectStore } from './narration/service';

export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const LLM_PROVIDER = defineString('TUUR_LLM_PROVIDER', { default: 'mock' });
const TTS_PROVIDER = defineString('TUUR_TTS_PROVIDER', { default: 'mock' });
const POI_PROVIDER = defineString('TUUR_POI_PROVIDER', { default: 'mock' });
const GEOCODING_PROVIDER = defineString('TUUR_GEOCODING_PROVIDER', { default: 'mock' });

export const db = () => getFirestore();

export function poiSources(): PoiSourceClient {
  return POI_PROVIDER.value() === 'live' ? new HttpPoiSources() : new MockPoiSources();
}
export function geocoder(): GeocodingProvider {
  return GEOCODING_PROVIDER.value() === 'nominatim' ? new NominatimGeocoder() : new MockGeocoder();
}
export function llm(): LlmProvider {
  return LLM_PROVIDER.value() === 'gemini'
    ? new GeminiLlmProvider(GEMINI_API_KEY.value())
    : new MockLlmProvider();
}
export function tts(): TtsProvider {
  return TTS_PROVIDER.value() === 'gemini'
    ? new GeminiTtsProvider(GEMINI_API_KEY.value())
    : new MockTtsProvider();
}
export function encoder(): AudioEncoder {
  return new Mp3AudioEncoder();
}
export function narrationSources(): NarrationSourceProvider {
  return POI_PROVIDER.value() === 'live' ? new HttpNarrationSources() : new MockNarrationSources();
}

export function objectStore(): ObjectStore {
  const bucket = () => getStorage().bucket();
  return {
    put: async (path, data, mimeType) => {
      await bucket()
        .file(path)
        .save(data, {
          contentType: mimeType,
          resumable: false,
          metadata: { cacheControl: 'public, max-age=31536000, immutable' },
        });
    },
    delete: async (path) => {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}

export function narrationDeps(): NarrationDeps {
  return {
    db: db(),
    llm: llm(),
    tts: tts(),
    encoder: encoder(),
    sources: narrationSources(),
    store: objectStore(),
    now: Date.now,
  };
}
