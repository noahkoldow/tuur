import { resolveMapStyle } from '@tuur/ui';

export const dynamic = 'force-dynamic';

/**
 * Online tuur style on OSM/OpenFreeMap by default, with an optional existing MapTiler key.
 * Publishing this style does not grant permission to prefetch the upstream tiles for offline use.
 */
export function GET() {
  const key = process.env['MAPTILER_KEY'];
  const style = resolveMapStyle(key ? { maptilerKey: key } : {});
  return Response.json(style, {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
