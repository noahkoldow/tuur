import { decodePolyline, type LatLng } from '@tuur/shared';
import { config } from '../config';

/**
 * Preview only (demo backend, `EXPO_PUBLIC_PREVIEW_ROUTING=osm`): real walking geometry from the public FOSSGIS OSRM
 * server so routes follow streets in Expo Go. The demo always runs on fixture coordinates, so no user position is
 * sent. Production uses OpenRouteService through the Cloud Function proxy (RoutingProvider) instead.
 */
export async function previewWalkingPath(points: LatLng[]): Promise<LatLng[] | undefined> {
  if (config.previewRouting !== 'osm' || points.length < 2 || points.length > 25) return undefined;
  const coords = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=polyline`,
      { signal: ctrl.signal },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as { routes?: { geometry?: string }[] };
    const geometry = body.routes?.[0]?.geometry;
    return geometry ? decodePolyline(geometry).map(([lat, lng]) => ({ lat, lng })) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
