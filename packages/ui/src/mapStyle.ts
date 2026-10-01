import { colors } from './tokens';

export interface MapStyleOptions {
  /** TileJSON URL of an OpenMapTiles-schema vector tile source (default provider: MapTiler). */
  tilesUrl: string;
  /** Glyph URL template with {fontstack} and {range}. */
  glyphsUrl: string;
  /** Follows the system appearance (dark-mode.md); defaults to light. */
  appearance?: 'light' | 'dark';
}

/** Colors of the two appearances; the dark map keeps the same restraint so the red route still dominates. */
const MAP_COLORS = {
  light: {
    land: colors.surface.subtle,
    water: '#E3E9EC',
    park: '#ECEFEA',
    building: '#EAEAEA',
    casing: colors.border,
    road: '#FFFFFF',
    path: '#DADADA',
    label: colors.ink.secondary,
    placeLabel: colors.ink.primary,
    poiLabel: colors.ink.tertiary,
    halo: '#FFFFFF',
  },
  dark: {
    land: '#151517',
    water: '#0F1A21',
    park: '#1A201C',
    building: '#202023',
    casing: '#0B0B0C',
    road: '#2E2E32',
    path: '#48484C',
    label: '#A8A8AE',
    placeLabel: '#EDEDF0',
    poiLabel: '#8C8C92',
    halo: '#151517',
  },
} as const;

type Json = Record<string, unknown>;

/**
 * The light, restrained tuur base style (spec 2.2): light-grey land, white roads, muted water and parks so the
 * red route dominates. Built for OpenMapTiles vector tiles; the provider is configurable (spec 3 "Karte").
 */
export function buildTuurMapStyle(o: MapStyleOptions): Json {
  const dark = o.appearance === 'dark';
  const c = MAP_COLORS[dark ? 'dark' : 'light'];
  const { land, water, park, building, label } = c;
  const font = ['Noto Sans Regular'];
  const fontBold = ['Noto Sans Bold'];
  const halo = { 'text-halo-color': c.halo, 'text-halo-width': 1.4 };
  return {
    version: 8,
    name: dark ? 'tuur-dark' : 'tuur-light',
    sources: { openmaptiles: { type: 'vector', url: o.tilesUrl } },
    glyphs: o.glyphsUrl,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': land } },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': park },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'grass', 'wood'],
        paint: { 'fill-color': park, 'fill-opacity': 0.8 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: { 'line-color': water, 'line-width': 1.2 },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': building, 'fill-opacity': 0.9 },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.casing,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 1, 16, 9, 19, 26],
        },
      },
      {
        id: 'road',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 0.6, 16, 7, 19, 22],
        },
      },
      {
        id: 'path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'path', 'pedestrian', 'track'],
        paint: {
          'line-color': c.path,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 2.2],
          'line-dasharray': [2, 1.5],
        },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', 'class', 'city', 'town', 'village', 'suburb', 'neighbourhood'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': fontBold,
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
          'text-max-width': 8,
        },
        paint: { 'text-color': c.placeLabel, ...halo },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': font,
          'text-size': 11,
        },
        paint: { 'text-color': label, ...halo },
      },
      {
        id: 'poi-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 16,
        filter: ['<=', 'rank', 12],
        layout: {
          'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
          'text-font': font,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.6],
        },
        paint: { 'text-color': c.poiLabel, ...halo },
      },
    ],
  };
}

export interface MapEnv {
  styleUrl?: string;
  maptilerKey?: string;
}

/**
 * Resolves the style for the current environment: an explicit style URL wins, then the tuur style on MapTiler
 * tiles, and finally the public MapLibre demo tiles so development works without any key.
 */
export function resolveMapStyle(env: MapEnv, appearance: 'light' | 'dark' = 'light'): string | Json {
  if (env.styleUrl) return env.styleUrl;
  if (env.maptilerKey) {
    return buildTuurMapStyle({
      tilesUrl: `https://api.maptiler.com/tiles/v3/tiles.json?key=${env.maptilerKey}`,
      glyphsUrl: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${env.maptilerKey}`,
      appearance,
    });
  }
  return 'https://demotiles.maplibre.org/style.json';
}
