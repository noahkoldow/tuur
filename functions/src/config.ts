import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpPoiSources, MockPoiSources, type PoiSourceClient } from './providers/poiSources';
import { OVERSPAN_ENDPOINT, reserveOverpassRequest } from './providers/overpass';
import { MockGeocoder, NominatimGeocoder, type GeocodingProvider } from './providers/geocoding';
import { PeliasGeocoder, reservePeliasRequest } from './providers/pelias';
import { GeminiLlmProvider, MockLlmProvider, type LlmProvider } from './providers/llm';
import {
  GeminiTtsProvider,
  MockTtsProvider,
  OpenAiTtsProvider,
  RoutedTtsProvider,
  Mp3AudioEncoder,
  type AudioEncoder,
} from './providers/tts';
import {
  HttpNarrationSources,
  MockNarrationSources,
  type NarrationSourceProvider,
} from './providers/narrationSources';
import { MockRoutingProvider, OrsRoutingProvider, type RoutingProvider } from './providers/routing';
import type { NarrationDeps, ObjectStore } from './narration/service';
import type { TeaserDeps } from './narration/teaser';
import type { PoiTextDeps } from './poi/text';
import { BillingError, authorizeContent, authorizeTextContent } from './billing/entitlements';
import { hasGroupAccess } from './groups/service';
import { NarrationError } from './narration/service';
import { MockPayments, StripePayments, type PaymentsProvider } from './partners/payments';
import type { PartnerDeps } from './partners/service';
import { validateProvider } from './providers/environment';

export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
export const ORS_API_KEY = defineSecret('ORS_API_KEY');
/** Optional: bind only to live POI ingestion when the paid Overspan endpoint is configured. */
export const OVERPASS_API_KEY = defineSecret('OVERPASS_API_KEY');
/** Bound only for explicit live TTS; Gemini-only deployments use each persona's Gemini fallback. */
export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
export const REDEMPTION_TOKEN_SECRET = defineSecret('REDEMPTION_TOKEN_SECRET');
const PAYMENTS_PROVIDER = defineString('TUUR_PAYMENTS_PROVIDER', { default: 'mock' });
const WEB_BASE_URL = defineString('TUUR_WEB_BASE_URL', { default: 'https://tuur.app' });
const ROUTING_PROVIDER = defineString('TUUR_ROUTING_PROVIDER', { default: 'mock' });
const LLM_PROVIDER = defineString('TUUR_LLM_PROVIDER', { default: 'mock' });
const TTS_PROVIDER = defineString('TUUR_TTS_PROVIDER', { default: 'mock' });
const POI_PROVIDER = defineString('TUUR_POI_PROVIDER', { default: 'mock' });
const GEOCODING_PROVIDER = defineString('TUUR_GEOCODING_PROVIDER', { default: 'mock' });

// The CLI loads non-secret environment settings before function discovery. Keep unused providers
// out of endpoint metadata so deployment does not require placeholder secrets or grant access to them.
export const NARRATION_SECRETS = [
  GEMINI_API_KEY,
  ...(process.env['TUUR_TTS_PROVIDER'] === 'live' ? [OPENAI_API_KEY] : []),
];
export const ACCOUNT_SECRETS =
  process.env['TUUR_PAYMENTS_PROVIDER'] === 'stripe' ? [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] : [];

export const db = () => getFirestore();

export function poiSources(): PoiSourceClient {
  if (validateProvider('TUUR_POI_PROVIDER', POI_PROVIDER.value(), ['live']) !== 'live')
    return new MockPoiSources();
  const endpoint = process.env['OVERPASS_ENDPOINT'];
  const apiKey = endpoint === OVERSPAN_ENDPOINT ? usableKey(OVERPASS_API_KEY.value()) : undefined;
  return new HttpPoiSources(endpoint, undefined, {
    ...(apiKey ? { apiKey } : {}),
    reserveRequest: () => reserveOverpassRequest(db()),
  });
}
export function geocoder(): GeocodingProvider {
  const provider = validateProvider('TUUR_GEOCODING_PROVIDER', GEOCODING_PROVIDER.value(), [
    'nominatim',
    'pelias',
  ]);
  if (provider === 'pelias') {
    const key = usableKey(ORS_API_KEY.value());
    if (!key) throw new Error('ORS_API_KEY is required when TUUR_GEOCODING_PROVIDER=pelias');
    return new PeliasGeocoder(key, () => reservePeliasRequest(db()));
  }
  return provider === 'nominatim' ? new NominatimGeocoder() : new MockGeocoder();
}
export function llm(): LlmProvider {
  if (validateProvider('TUUR_LLM_PROVIDER', LLM_PROVIDER.value(), ['gemini']) === 'mock')
    return new MockLlmProvider();
  const key = usableKey(GEMINI_API_KEY.value());
  if (!key) throw new Error('GEMINI_API_KEY is required when TUUR_LLM_PROVIDER=gemini');
  return new GeminiLlmProvider(key);
}
const usableKey = (v: string) => (v && v !== 'unused' && v.length > 10 ? v : undefined);

/** `live` enables configured Gemini/OpenAI voices; `gemini` uses Gemini only; emulator `mock` is silent. */
export function tts(): RoutedTtsProvider {
  const mode = validateProvider('TUUR_TTS_PROVIDER', TTS_PROVIDER.value(), ['live', 'gemini']);
  if (mode !== 'live' && mode !== 'gemini') {
    const mock = new MockTtsProvider();
    return new RoutedTtsProvider({ gemini: mock, openai: mock });
  }
  const gemini = usableKey(GEMINI_API_KEY.value());
  const openai = mode === 'live' ? usableKey(OPENAI_API_KEY.value()) : undefined;
  if (!gemini && !openai) throw new Error('A configured TTS provider key is required');
  return new RoutedTtsProvider({
    ...(gemini ? { gemini: new GeminiTtsProvider(gemini) } : {}),
    ...(openai ? { openai: new OpenAiTtsProvider(openai) } : {}),
  });
}
export function encoder(): AudioEncoder {
  return new Mp3AudioEncoder();
}
export function narrationSources(): NarrationSourceProvider {
  return validateProvider('TUUR_POI_PROVIDER', POI_PROVIDER.value(), ['live']) === 'live'
    ? new HttpNarrationSources()
    : new MockNarrationSources();
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
          // audio is served through short-lived signed URLs only; the marker labels synthetic audio (AI Act Art. 50)
          metadata: {
            cacheControl: 'private, max-age=3600',
            metadata: { aiGenerated: 'true', generator: 'tuur' },
          },
        });
    },
    signedUrl: async (path, ttlMs) => {
      // the Storage emulator cannot sign: local development gets the plain emulator URL
      if (process.env['FIREBASE_STORAGE_EMULATOR_HOST'])
        return `http://${process.env['FIREBASE_STORAGE_EMULATOR_HOST']}/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media`;
      const [url] = await bucket()
        .file(path)
        .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlMs });
      return url;
    },
    delete: async (path) => {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}

// Audio always needs paid access, including cache hits and internally named callers.
const authorizeNarration: NonNullable<NarrationDeps['authorize']> = async (uid, poi, access, opts) => {
  // Live group guests ride on the host's tour (online only, never for downloads, D47).
  if (
    access?.groupId &&
    (await hasGroupAccess({ db: db(), now: Date.now }, uid, access.groupId, {
      poiIds: [poi.id],
      ...(opts?.download ? { download: true } : {}),
    }))
  )
    return;
  try {
    await authorizeContent({ db: db(), now: Date.now }, uid, {
      tourId: access?.tourId,
      mode: access?.mode,
      poiIds: [poi.id],
      tile: poi.tile,
      download: opts?.download,
      sessionId: access?.sessionId,
      downloadId: access?.downloadId,
    });
  } catch (e) {
    if (e instanceof BillingError) {
      throw new NarrationError(
        e.code === 'not-found' ? 'not-found' : 'permission-denied',
        e.message,
        e.details,
      );
    }
    throw e;
  }
};

const authorizeText: NonNullable<NarrationDeps['authorize']> = async (uid, poi, access) => {
  try {
    await authorizeTextContent({ db: db(), now: Date.now }, uid, {
      tourId: access?.tourId,
      groupId: access?.groupId,
      mode: access?.mode,
      poiIds: [poi.id],
      tile: poi.tile,
    });
  } catch (error) {
    if (error instanceof BillingError)
      throw new NarrationError(
        error.code === 'not-found' ? 'not-found' : 'permission-denied',
        error.message,
        error.details,
      );
    throw error;
  }
};

/** Text-only teasers do not instantiate TTS, an encoder or an audio store. */
export function teaserDeps(): TeaserDeps {
  return {
    db: db(),
    llm: llm(),
    sources: narrationSources(),
    now: Date.now,
    authorize: authorizeText,
  };
}

/** Real public Wikipedia text, with bounded latency and no model/audio provider or secret. */
export function poiTextDeps(): PoiTextDeps {
  return {
    db: db(),
    sources: new HttpNarrationSources({ timeoutMs: 8000, retries: 0 }, true),
    now: Date.now,
  };
}

export function narrationDeps(): NarrationDeps {
  return {
    ...teaserDeps(),
    authorize: authorizeNarration,
    tts: tts(),
    encoder: encoder(),
    store: objectStore(),
  };
}

export function routing(): RoutingProvider {
  return validateProvider('TUUR_ROUTING_PROVIDER', ROUTING_PROVIDER.value(), ['openrouteservice']) ===
    'openrouteservice'
    ? new OrsRoutingProvider(ORS_API_KEY.value())
    : new MockRoutingProvider();
}

import type { TourDeps } from './tours/service';
import { TourError } from './tours/service';

/** Planning is free text/navigation; provider budgets and route limits still apply. */
export function plannedRouteDeps(): TourDeps {
  return {
    db: db(),
    llm: llm(),
    routing: routing(),
    now: Date.now,
    authorize: async (uid, r) => {
      try {
        await authorizeTextContent({ db: db(), now: Date.now }, uid, {
          mode: r.mode,
          poiIds: [],
          tile: r.tile,
        });
      } catch (e) {
        if (e instanceof BillingError)
          throw new TourError('failed-precondition', 'Route planning area is unavailable', e.details);
        throw e;
      }
    },
  };
}

export function payments(): PaymentsProvider {
  return validateProvider('TUUR_PAYMENTS_PROVIDER', PAYMENTS_PROVIDER.value(), ['stripe']) === 'stripe'
    ? new StripePayments(STRIPE_SECRET_KEY.value(), STRIPE_WEBHOOK_SECRET.value())
    : new MockPayments();
}

/** Secrets bound to every partner function that signs/verifies tokens or talks to Stripe. */
export const PARTNER_SECRETS = [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, REDEMPTION_TOKEN_SECRET];

export function partnerDeps(ensureTile?: PartnerDeps['ensureTile']): PartnerDeps {
  return {
    db: db(),
    now: Date.now,
    tokenSecret: () => {
      const v = REDEMPTION_TOKEN_SECRET.value();
      if (!v || v.length < 16) throw new Error('REDEMPTION_TOKEN_SECRET is not configured');
      return v;
    },
    payments,
    webBaseUrl: WEB_BASE_URL.value(),
    ...(ensureTile ? { ensureTile } : {}),
  };
}
