import type { Interest } from '@tuur/shared';

/** Stable category hues shared by preferences, place cards and map markers. */
export const categoryPalette = {
  history: {
    light: { foreground: '#805400', background: '#FFF1D8' },
    dark: { foreground: '#F5C56D', background: '#382B17' },
  },
  architecture: {
    light: { foreground: '#285CA5', background: '#EAF1FD' },
    dark: { foreground: '#9DC4FA', background: '#192C46' },
  },
  culinary: {
    light: { foreground: '#A33D16', background: '#FFF0E8' },
    dark: { foreground: '#FFB089', background: '#40261C' },
  },
  art_culture: {
    light: { foreground: '#7546A4', background: '#F3EBFD' },
    dark: { foreground: '#D2ADF8', background: '#332341' },
  },
  nature: {
    light: { foreground: '#28683C', background: '#E9F5EB' },
    dark: { foreground: '#9FDAAE', background: '#1C3324' },
  },
  hidden_gems: {
    light: { foreground: '#006D74', background: '#E4F5F5' },
    dark: { foreground: '#86D9DB', background: '#163336' },
  },
  nightlife: {
    light: { foreground: '#5345A2', background: '#EEEBFC' },
    dark: { foreground: '#B9AFF7', background: '#282341' },
  },
  shopping: {
    light: { foreground: '#9D356B', background: '#FDEBF4' },
    dark: { foreground: '#F3AED0', background: '#3D2231' },
  },
} as const satisfies Record<Interest, Record<'light' | 'dark', { foreground: string; background: string }>>;

export const categoryOnSolid = '#FFFFFF';
