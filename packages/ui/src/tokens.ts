/** Design tokens shared by mobile and web (spec 2.2). Light theme only in v1; add a `dark` set later. */
export const colors = {
  brand: { red: '#ED0516', redPressed: '#C70412', redTint: '#FDE8EA' },
  ink: { primary: '#111111', secondary: '#5C5C5C', tertiary: '#9A9A9A' },
  surface: { base: '#FFFFFF', subtle: '#F6F6F6' },
  border: '#E6E6E6',
  // Deliberately far from brand red so that red is never read as "error" alone; pair with icon + text.
  status: { success: '#1E7F4F', warning: '#8F5400', error: '#7A1F5C' },
  /** Marker states for the heart-pin (spec 2.2). */
  marker: { current: '#ED0516', visited: '#9A9A9A', upcoming: '#ED0516' },
} as const;

export const radii = { sm: 12, md: 16, lg: 20, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const fonts = {
  heading: 'PlusJakartaSans_800ExtraBold',
  headingMedium: 'PlusJakartaSans_700Bold',
  body: 'PlusJakartaSans_500Medium',
  bodyRegular: 'PlusJakartaSans_400Regular',
  /** CSS stack for web; the font itself is loaded via next/font. */
  webStack: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export type Colors = typeof colors;

/**
 * Semantic palette following Apple's HIG (color.md, dark-mode.md): roles instead of raw colors, each with a light
 * and a dark value. Mobile resolves them per appearance; `colors` above stays the brand reference for web.
 * Brand red is the accent and is reserved for primary actions, the selected tab and status (branding.md).
 */
export const palette = {
  light: {
    background: '#FFFFFF',
    /** Page behind inset grouped lists. */
    backgroundGrouped: '#F2F2F7',
    /** Rows and cards sitting on `backgroundGrouped`. */
    backgroundElevated: '#FFFFFF',
    label: '#000000',
    labelSecondary: '#5C5C61',
    /** Decorative only (icons, chevrons); fails AA for text. */
    labelTertiary: '#8E8E93',
    separator: '#D1D1D6',
    fill: '#EDEDF0',
    accent: '#ED0516',
    accentPressed: '#C70412',
    /** Accent used as text or a small glyph on the page (AA on background and on the tint). */
    accentText: '#C70412',
    accentTint: '#FDE8EA',
    onAccent: '#FFFFFF',
    success: '#1E7F4F',
    warning: '#8F5400',
    error: '#7A1F5C',
  },
  dark: {
    background: '#000000',
    backgroundGrouped: '#000000',
    backgroundElevated: '#1C1C1E',
    label: '#FFFFFF',
    labelSecondary: '#AEAEB4',
    labelTertiary: '#7C7C80',
    separator: '#38383A',
    fill: '#2C2C2E',
    accent: '#FF4552',
    accentPressed: '#FF6B75',
    accentText: '#FF6B75',
    accentTint: '#3A0F14',
    onAccent: '#FFFFFF',
    success: '#32D074',
    warning: '#FFB340',
    error: '#F08AC8',
  },
} as const;

export type SemanticPalette = { [K in keyof (typeof palette)['light']]: string };

/**
 * iOS text styles (typography.md, "Large" default Dynamic Type size). Sizes and leading in points; weights are
 * CSS-style numeric strings so React Native maps them to SF Pro on iOS. `largeTitle` and `title1` are the only
 * styles that use the brand display face (branding.md: custom font for headlines, system font for body).
 */
export const textStyles = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' },
} as const;

export type TextStyleName = keyof typeof textStyles;

/** Layout constants in points: iOS default side margin, minimum hit region and the continuous-corner radii. */
export const metrics = {
  margin: 16,
  hit: 44,
  controlHeight: 50,
  radius: { row: 10, card: 20, sheet: 28, capsule: 999 },
} as const;
