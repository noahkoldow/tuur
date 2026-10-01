import type { Interest, TravelMode } from '@tuur/shared';

/** Icon names understood by `Icon` (resolved to SF Symbols on iOS). */
export type McIcon = string;

/** One glyph per interest, used in map pins, stop cards and spot markers so a stop's kind is visible at a glance. */
export const INTEREST_ICON: Record<Interest, McIcon> = {
  history: 'castle',
  architecture: 'bank',
  culinary: 'silverware-fork-knife',
  art_culture: 'palette',
  nature: 'tree',
  hidden_gems: 'diamond-stone',
  nightlife: 'glass-cocktail',
  shopping: 'shopping',
};

export const TRAVEL_ICON: Record<TravelMode, McIcon> = {
  stationary: 'human-handsdown',
  walking: 'walk',
  cycling: 'bike',
  vehicle: 'car',
};
