/** Build-time configuration (EXPO_PUBLIC_* values are inlined by Metro and must never hold secrets). */

export const config = {
  /** `demo` runs entirely in memory (fixtures + shared logic): web preview, tests, no Firebase needed. */
  backend: (process.env.EXPO_PUBLIC_BACKEND ??
    (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ? 'firebase' : 'demo')) as 'firebase' | 'demo',
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  },
  firebaseAppCheckSiteKey: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY,
  /** `EXPO_PUBLIC_PAYWALL=off` unlocks every tour and mode (UI previews only; the server still enforces access). */
  paywall: process.env.EXPO_PUBLIC_PAYWALL !== 'off',
  /** Preview only: `osm` fetches real walking geometry for demo routes (see backend/previewRouting.ts). */
  previewRouting: process.env.EXPO_PUBLIC_PREVIEW_ROUTING,
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === 'true',
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost',
  functionsRegion: process.env.EXPO_PUBLIC_FUNCTIONS_REGION ?? 'europe-west1',
  maptilerKey: process.env.EXPO_PUBLIC_MAPTILER_KEY,
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
  /** Explicitly authorized offline source; also used for display so downloaded resource URLs match. */
  offlineMapStyleUrl: process.env.EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL,
  /** Geohash precision of ingest tiles (must match the backend default). */
  tilePrecision: 6,
  /** Operator details for the legal texts (imprint, privacy); the release check fails while values are missing. */
  operator: {
    name: process.env.EXPO_PUBLIC_OPERATOR_NAME,
    address: process.env.EXPO_PUBLIC_OPERATOR_ADDRESS,
    email: process.env.EXPO_PUBLIC_OPERATOR_EMAIL,
    phone: process.env.EXPO_PUBLIC_OPERATOR_PHONE,
    register: process.env.EXPO_PUBLIC_OPERATOR_REGISTER,
    vatId: process.env.EXPO_PUBLIC_OPERATOR_VAT_ID,
    representative: process.env.EXPO_PUBLIC_OPERATOR_REPRESENTATIVE,
    privacyEmail: process.env.EXPO_PUBLIC_OPERATOR_PRIVACY_EMAIL,
    authority: process.env.EXPO_PUBLIC_OPERATOR_SUPERVISORY_AUTHORITY,
  },
  /** Shown in legal/settings screens; set by the operator. */
  legal: {
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@tuur.app',
    webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://tuur.app',
  },
} as const;

export const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
