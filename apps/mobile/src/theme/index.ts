import { colors, fonts, radii, spacing } from '@tuur/ui';

export { colors, fonts, radii, spacing };

/** Text presets (spec 2.2: bold rounded headlines, calm body). Sizes scale with the user's font setting. */
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.ink.primary },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.ink.primary },
  heading: { fontFamily: fonts.headingMedium, fontSize: 18, lineHeight: 24, color: colors.ink.primary },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink.primary },
  bodySecondary: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink.secondary },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.ink.secondary },
  label: { fontFamily: fonts.headingMedium, fontSize: 14, lineHeight: 18, color: colors.ink.primary },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

/** Minimum touch target (WCAG / platform guidelines). */
export const HIT = 48;
