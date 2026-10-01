import { describe, expect, it } from 'vitest';
import { colors, contrastRatio, MARK_PATH, palette } from './index';

describe('design tokens', () => {
  it('keeps body text AA-compliant on white', () => {
    expect(contrastRatio(colors.ink.primary, colors.surface.base)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.ink.secondary, colors.surface.base)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses redPressed for small white text on red (AA), brand red only for large text (3:1)', () => {
    expect(contrastRatio('#FFFFFF', colors.brand.red)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#FFFFFF', colors.brand.redPressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps text colors used on white and on the red tint AA-compliant', () => {
    for (const c of [
      colors.status.success,
      colors.status.warning,
      colors.status.error,
      colors.brand.redPressed,
    ])
      expect(contrastRatio(c, colors.surface.base)).toBeGreaterThanOrEqual(4.5);
    // selected chips and partner cards put text on the tint: only the pressed red is dark enough there
    expect(contrastRatio(colors.brand.redPressed, colors.brand.redTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.ink.primary, colors.brand.redTint)).toBeGreaterThanOrEqual(4.5);
    // base red on the tint is NOT enough for text (guard against using it there)
    expect(contrastRatio(colors.brand.red, colors.brand.redTint)).toBeLessThan(4.5);
  });

  it('keeps the tertiary grey decorative: it fails AA on white and must only be used for icons', () => {
    expect(contrastRatio(colors.ink.tertiary, colors.surface.base)).toBeLessThan(4.5);
  });

  it('keeps the status colors distinguishable from brand red', () => {
    expect(colors.status.error).not.toBe(colors.brand.red);
  });

  it('exports the brand mark geometry', () => {
    expect(MARK_PATH.startsWith('M')).toBe(true);
  });

  describe.each(['light', 'dark'] as const)('semantic palette (%s)', (mode) => {
    const p = palette[mode];
    it('keeps labels AA on every surface they sit on', () => {
      for (const bg of [p.background, p.backgroundGrouped, p.backgroundElevated]) {
        expect(contrastRatio(p.label, bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(p.labelSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it('keeps accent text and status colors AA on the surfaces', () => {
      for (const bg of [p.background, p.backgroundElevated]) {
        for (const c of [p.accentText, p.success, p.warning, p.error])
          expect(contrastRatio(c, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(p.accentText, p.accentTint)).toBeGreaterThanOrEqual(4.5);
    });
    it('keeps label text on filled accent buttons readable (bold text needs 3:1)', () => {
      expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(3);
    });
    it('keeps the accent visible as a glyph or tab icon (3:1)', () => {
      expect(contrastRatio(p.accent, p.background)).toBeGreaterThanOrEqual(3);
    });
    it('keeps the tertiary label decorative-only but still visible as a glyph', () => {
      expect(contrastRatio(p.labelTertiary, p.backgroundElevated)).toBeGreaterThanOrEqual(3);
    });
  });
});
