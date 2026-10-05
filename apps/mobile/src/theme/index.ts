import { DynamicColorIOS, Platform, type ColorValue, type TextStyle } from 'react-native';
import { INTERESTS, type Interest } from '@tuur/shared';
import {
  colors as brand,
  fonts,
  metrics,
  palette,
  radii,
  spacing,
  textStyles,
  type SemanticPalette,
} from '@tuur/ui';
import { categoryOnSolid, categoryPalette } from './categories';

export { fonts, metrics, radii, spacing };

interface CategoryColors {
  foreground: ColorValue;
  background: ColorValue;
  solid: string;
  onSolid: string;
}

/** The same hue always means the same interest; iOS follows appearance like the rest of the theme. */
export const categoryColors = Object.fromEntries(
  INTERESTS.map((interest) => {
    const { light, dark } = categoryPalette[interest];
    const color = (role: 'foreground' | 'background') =>
      Platform.OS === 'ios' ? DynamicColorIOS({ light: light[role], dark: dark[role] }) : light[role];
    return [
      interest,
      {
        foreground: color('foreground'),
        background: color('background'),
        solid: light.foreground,
        onSolid: categoryOnSolid,
      },
    ];
  }),
) as Record<Interest, CategoryColors>;

/**
 * Resolves a semantic role to the system appearance. On iOS the value is a dynamic color, so every style that uses it
 * follows light/dark live without re-rendering (dark-mode.md: no app-specific appearance switch). Other platforms
 * keep the light value; Android and web previews are not the design target.
 */
function dyn(role: keyof SemanticPalette): ColorValue {
  return Platform.OS === 'ios'
    ? DynamicColorIOS({ light: palette.light[role], dark: palette.dark[role] })
    : palette.light[role];
}

/** Semantic colors by role (color.md). Prefer these in new code. */
export const sys = {
  background: dyn('background'),
  grouped: dyn('backgroundGrouped'),
  elevated: dyn('backgroundElevated'),
  label: dyn('label'),
  labelSecondary: dyn('labelSecondary'),
  /** Decorative glyphs only; not AA for text. */
  labelTertiary: dyn('labelTertiary'),
  separator: dyn('separator'),
  fill: dyn('fill'),
  accent: dyn('accent'),
  accentPressed: dyn('accentPressed'),
  accentText: dyn('accentText'),
  accentTint: dyn('accentTint'),
  onAccent: dyn('onAccent'),
  success: dyn('success'),
  warning: dyn('warning'),
  error: dyn('error'),
} as const;

/**
 * Legacy color names kept so screens migrate gradually; they resolve to the semantic roles above and therefore
 * adapt to dark mode. New code uses `sys`.
 */
export const colors = {
  brand: { red: sys.accent, redPressed: sys.accentPressed, redTint: sys.accentTint },
  ink: { primary: sys.label, secondary: sys.labelSecondary, tertiary: sys.labelTertiary },
  surface: { base: sys.background, subtle: sys.fill },
  border: sys.separator,
  status: { success: sys.success, warning: sys.warning, error: sys.error },
  marker: { current: sys.accent, visited: sys.labelTertiary, upcoming: sys.accent },
} as const;

/** Brand red as a plain hex string for APIs that cannot take a dynamic color (SVG, map pins, native tab tint). */
export const BRAND_RED = brand.brand.red;

/**
 * Text styles = the iOS Dynamic Type styles (typography.md). Only `largeTitle` and `title1` use the brand display face;
 * everything else is the system font (SF Pro on iOS) for best legibility at small sizes (branding.md).
 */
const display = { fontFamily: fonts.heading } as const;
const system = (name: keyof typeof textStyles): TextStyle => ({
  fontSize: textStyles[name].fontSize,
  lineHeight: textStyles[name].lineHeight,
  fontWeight: textStyles[name].fontWeight,
});

export const type = {
  largeTitle: {
    ...display,
    fontSize: textStyles.largeTitle.fontSize,
    lineHeight: textStyles.largeTitle.lineHeight,
    color: sys.label,
  },
  title1: {
    ...display,
    fontSize: textStyles.title1.fontSize,
    lineHeight: textStyles.title1.lineHeight,
    color: sys.label,
  },
  title2: { ...system('title2'), color: sys.label },
  title3: { ...system('title3'), color: sys.label },
  headline: { ...system('headline'), color: sys.label },
  body: { ...system('body'), color: sys.label },
  callout: { ...system('callout'), color: sys.label },
  subheadline: { ...system('subheadline'), color: sys.labelSecondary },
  footnote: { ...system('footnote'), color: sys.labelSecondary },
  caption: { ...system('caption1'), color: sys.labelSecondary },
  /** Short emphasized UI label: subheadline in semibold. */
  label: { ...system('subheadline'), fontWeight: '600', color: sys.label },
  // legacy names
  display: {
    ...display,
    fontSize: textStyles.largeTitle.fontSize,
    lineHeight: textStyles.largeTitle.lineHeight,
    color: sys.label,
  },
  title: {
    ...display,
    fontSize: textStyles.title1.fontSize,
    lineHeight: textStyles.title1.lineHeight,
    color: sys.label,
  },
  heading: { ...system('headline'), color: sys.label },
  bodySecondary: { ...system('subheadline'), color: sys.labelSecondary },
} as const;

/**
 * Elevation. Floating controls use the glass material or a soft shadow; content never does (liquid-glass.md: glass is
 * for the functional layer only).
 */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

/** Minimum touch target: 44 pt (accessibility.md, buttons.md). */
export const HIT = metrics.hit;

/** Shared geometry and elevation for map stops, explored places and the position puck. */
export const mapMarker = {
  hit: 48,
  stopHeight: 34,
  currentHeight: 40,
  icon: 18,
  compactIcon: 16,
  gap: spacing.sm,
  inset: 10,
  discMin: 32,
  discMax: 40,
  positionSize: 40,
  positionCore: 24,
  shadow: '0 2px 7px rgba(0, 0, 0, 0.12)',
  selectedShadow: '0 3px 10px rgba(0, 0, 0, 0.18)',
} as const;
