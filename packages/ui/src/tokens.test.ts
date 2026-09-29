import { describe, expect, it } from 'vitest';
import { colors, contrastRatio, MARK_PATH } from './index';

describe('design tokens', () => {
  it('keeps body text AA-compliant on white', () => {
    expect(contrastRatio(colors.ink.primary, colors.surface.base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.ink.secondary, colors.surface.base)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses redPressed for small white text on red (AA), brand red only for large text (3:1)', () => {
    expect(contrastRatio('#FFFFFF', colors.brand.red)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#FFFFFF', colors.brand.redPressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the status colors distinguishable from brand red', () => {
    expect(colors.status.error).not.toBe(colors.brand.red);
  });

  it('exports the brand mark geometry', () => {
    expect(MARK_PATH.startsWith('M')).toBe(true);
  });
});
