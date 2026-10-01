import { describe, expect, it } from 'vitest';
import { buildTuurMapStyle, resolveMapStyle } from './mapStyle';

describe('map style', () => {
  const style = buildTuurMapStyle({
    tilesUrl: 'https://t/tiles.json',
    glyphsUrl: 'https://g/{fontstack}/{range}.pbf',
  }) as {
    sources: Record<string, unknown>;
    layers: { id: string; type: string; source?: string }[];
    glyphs: string;
  };

  it('is a valid-looking MapLibre style: unique ids, known sources, glyphs', () => {
    const ids = style.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of style.layers) if (l.source) expect(Object.keys(style.sources)).toContain(l.source);
    expect(style.glyphs).toContain('{fontstack}');
  });

  it('stays light: all fills and the background are light', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    const fills = [...JSON.stringify(style).matchAll(/"(?:fill|background)-color":"(#[0-9A-Fa-f]{6})"/g)].map(
      (m) => m[1]!,
    );
    expect(fills.length).toBeGreaterThan(3);
    for (const c of fills) expect(lum(c)).toBeGreaterThan(0.85);
  });

  it('resolves explicit URL, MapTiler and keyless fallback in that order', () => {
    expect(resolveMapStyle({ styleUrl: 'https://x/style.json', maptilerKey: 'k' })).toBe(
      'https://x/style.json',
    );
    expect(typeof resolveMapStyle({ maptilerKey: 'k' })).toBe('object');
    expect(resolveMapStyle({})).toContain('demotiles');
  });

  it('has a dark appearance with only dark fills and the same layers', () => {
    const dark = buildTuurMapStyle({
      tilesUrl: 'https://t/tiles.json',
      glyphsUrl: 'https://g/{fontstack}/{range}.pbf',
      appearance: 'dark',
    }) as { layers: { id: string }[] };
    expect(dark.layers.map((l) => l.id)).toEqual(style.layers.map((l) => l.id));
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    };
    const fills = [...JSON.stringify(dark).matchAll(/"(?:fill|background)-color":"(#[0-9A-Fa-f]{6})"/g)].map(
      (m) => m[1]!,
    );
    expect(fills.length).toBeGreaterThan(3);
    for (const c of fills) expect(lum(c)).toBeLessThan(0.2); // stays dark
  });
});
