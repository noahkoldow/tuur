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
import { MockRoutingProvider, OrsRoutingProvider, type RoutingProvider } from './providers/routing';
import type { NarrationDeps, ObjectStore } from './narration/service';
import { BillingError, authorizeContent } from './billing/entitlements';
import { NarrationError } from './narration/service';
import { MockPayments, StripePayments, type PaymentsProvider } from './partners/payments';
import type { PartnerDeps } from './partners/service';

export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
export const ORS_API_KEY = defineSecret('ORS_API_KEY');
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
          // audio is served through short-lived signed URLs only; the marker labels synthetic audio (AI Act Art. 50)
          metadata: {
            cacheControl: 'private, max-age=3600',
            metadata: { aiGenerated: 'true', generator: 'tuur' },
          },
        });
    },
    signedUrl: async (path, ttlMs) => {
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

export function narrationDeps(): NarrationDeps {
  return {
    db: db(),
    llm: llm(),
    tts: tts(),
    encoder: encoder(),
    sources: narrationSources(),
    store: objectStore(),
    now: Date.now,
    // Entitlements are checked before any content is served or generated. `system-pregen` is the internal warm-up
    // after tour creation (first stops only, cost brake spec 4.3) and never reaches clients.
    authorize: async (uid, poi, access) => {
      if (uid === 'system-pregen') return;
      try {
        await authorizeContent({ db: db(), now: Date.now }, uid, {
          tourId: access?.tourId,
          mode: access?.mode,
          poiIds: [poi.id],
          tile: poi.tile,
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
    },
  };
}

export function routing(): RoutingProvider {
  return ROUTING_PROVIDER.value() === 'openrouteservice'
    ? new OrsRoutingProvider(ORS_API_KEY.value())
    : new MockRoutingProvider();
}

import type { TourDeps } from './tours/service';
import { TourError } from './tours/service';

/** Deps of the planned-route callable, including the entitlement check for the paid 24 h session. */
export function plannedRouteDeps(): TourDeps {
  return {
    db: db(),
    llm: llm(),
    routing: routing(),
    now: Date.now,
    authorize: async (uid, r) => {
      try {
        await authorizeContent({ db: db(), now: Date.now }, uid, { mode: r.mode, poiIds: [], tile: r.tile });
      } catch (e) {
        if (e instanceof BillingError)
          throw new TourError('failed-precondition', 'Route planning needs an unlocked session', e.details);
        throw e;
      }
    },
  };
}

export function payments(): PaymentsProvider {
  return PAYMENTS_PROVIDER.value() === 'stripe'
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
