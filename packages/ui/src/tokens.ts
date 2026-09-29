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
