/** Build-time configuration (EXPO_PUBLIC_* values are inlined by Metro and must never hold secrets). */

export const config = {
  /** `demo` runs entirely in memory (fixtures + shared logic): web preview, tests, no Firebase needed. */
  backend: (process.env.EXPO_PUBLIC_BACKEND ?? 'firebase') as 'firebase' | 'demo',
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === 'true',
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost',
  functionsRegion: process.env.EXPO_PUBLIC_FUNCTIONS_REGION ?? 'europe-west1',
  maptilerKey: process.env.EXPO_PUBLIC_MAPTILER_KEY,
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
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
