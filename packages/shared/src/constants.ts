export const INTERESTS = [
  'history',
  'architecture',
  'culinary',
  'art_culture',
  'nature',
  'hidden_gems',
  'nightlife',
  'shopping',
] as const;
export type Interest = (typeof INTERESTS)[number];

export const LENGTH_TIERS = ['short', 'medium', 'long'] as const;
export type LengthTier = (typeof LENGTH_TIERS)[number];
/** Target spoken duration per tier in seconds (spec 4.4). */
export const LENGTH_TIER_SECONDS: Record<LengthTier, number> = { short: 30, medium: 90, long: 180 };

export const AREA_STATUSES = ['empty', 'ingesting', 'ready', 'failed', 'low_content'] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];

export const TRAVEL_MODES = ['stationary', 'walking', 'cycling', 'vehicle'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const SUPPORTED_UI_LANGUAGES = ['de', 'en'] as const;
export type UiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

export const DEFAULT_GEOHASH_PRECISION = 6;
