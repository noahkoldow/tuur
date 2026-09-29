import { buildTuurMapStyle } from '@tuur/ui';

export const dynamic = 'force-dynamic';

/**
 * The tuur map style as JSON for MapLibre clients (app, admin map, offline packs). The tile provider key is a
 * restricted, public-by-design key (MapTiler keys are limited by allowed origins in the provider console).
 */
export function GET() {
  const key = process.env['MAPTILER_KEY'];
  if (!key) return Response.json({ error: 'map style not configured' }, { status: 503 });
  const style = buildTuurMapStyle({
    tilesUrl: `https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`,
    glyphsUrl: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${key}`,
  });
  return Response.json(style, {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
