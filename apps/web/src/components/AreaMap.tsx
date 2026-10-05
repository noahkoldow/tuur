'use client';

import { useEffect, useRef } from 'react';
import type { Map as MlMap, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { geohashBounds, geohashCenter, type Area } from '@tuur/shared';
import { resolveMapStyle } from '@tuur/ui';

const STATUS_COLOR: Record<string, string> = {
  ready: '#1b7f3b',
  ingesting: '#b26a00',
  failed: '#b00020',
  low_content: '#6b7280',
  empty: '#c7c7c7',
};

function collection(areas: Area[], selected?: string) {
  return {
    type: 'FeatureCollection' as const,
    features: areas.map((a) => {
      const b = geohashBounds(a.geohash);
      return {
        type: 'Feature' as const,
        properties: {
          id: a.geohash,
          color: STATUS_COLOR[a.status] ?? '#c7c7c7',
          locked: a.locked ? 1 : 0,
          selected: a.geohash === selected ? 1 : 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [b.west, b.south],
              [b.east, b.south],
              [b.east, b.north],
              [b.west, b.north],
              [b.west, b.south],
            ],
          ],
        },
      };
    }),
  };
}

function centers(areas: Area[], selected?: string) {
  return {
    type: 'FeatureCollection' as const,
    features: areas.map((a) => {
      const c = geohashCenter(a.geohash);
      return {
        type: 'Feature' as const,
        properties: {
          id: a.geohash,
          color: STATUS_COLOR[a.status] ?? '#c7c7c7',
          locked: a.locked ? 1 : 0,
          selected: a.geohash === selected ? 1 : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      };
    }),
  };
}

/** World map of ingest tiles colored by status (locked tiles get a heavy outline). */
export function AreaMap({
  areas,
  selected,
  onSelect,
  label,
}: {
  areas: Area[];
  selected?: string | undefined;
  onSelect: (geohash: string) => void;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const fitted = useRef(false);
  const latest = useRef({ areas, selected });
  latest.current = { areas, selected };
  const pick = useRef(onSelect);
  pick.current = onSelect;

  const fit = (list: Area[]) => {
    const m = map.current;
    if (!m || list.length === 0) return;
    fitted.current = true;
    const lngs = list.map((a) => geohashCenter(a.geohash).lng);
    const lats = list.map((a) => geohashCenter(a.geohash).lat);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 10, duration: 0 },
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const maplibre = await import('maplibre-gl');
      maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      // The OSM default preserves the same tuur style if our style endpoint is temporarily unavailable.
      const tryStyle = async (url: string, ms: number) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
        if (!res.ok) throw new Error('style');
        return (await res.json()) as StyleSpecification;
      };
      const style = await tryStyle('/map-style.json', 4000).catch(
        () => resolveMapStyle({}) as unknown as StyleSpecification,
      );
      if (cancelled || !el.current) return;
      const m = new maplibre.Map({
        container: el.current,
        style,
        center: [10, 30],
        zoom: 1.4,
        attributionControl: { compact: true },
      });
      map.current = m;
      // the container can change size after init (layout, CSS loading, window resize)
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(el.current);
      m.once('remove', () => ro.disconnect());
      m.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        m.addSource('tiles', {
          type: 'geojson',
          data: collection(latest.current.areas, latest.current.selected),
        });
        m.addLayer({
          id: 'tiles-fill',
          type: 'fill',
          source: 'tiles',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 },
        });
        m.addLayer({
          id: 'tiles-line',
          type: 'line',
          source: 'tiles',
          paint: {
            'line-color': [
              'case',
              ['==', ['get', 'selected'], 1],
              '#ED0516',
              ['==', ['get', 'locked'], 1],
              '#111111',
              '#ffffff',
            ],
            'line-width': ['case', ['==', ['get', 'selected'], 1], 3, ['==', ['get', 'locked'], 1], 2.5, 0.8],
          },
        });
        for (const layer of ['tiles-fill', 'tiles-dots']) {
          m.on('click', layer, (e) => {
            const id = e.features?.[0]?.properties?.['id'] as string | undefined;
            if (id) pick.current(id);
          });
          m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
          m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
        }
        m.resize();
        fit(latest.current.areas);
        ready.current = true;
      });
    })();
    return () => {
      cancelled = true;
      ready.current = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('tiles') as GeoJSONSource | undefined)?.setData(collection(areas, selected));
    (m.getSource('centers') as GeoJSONSource | undefined)?.setData(centers(areas, selected));
    if (!fitted.current) fit(areas);
  }, [areas, selected]);

  useEffect(() => {
    const m = map.current;
    if (!m || !selected) return;
    const c = geohashCenter(selected);
    m.easeTo({ center: [c.lng, c.lat], zoom: Math.max(m.getZoom(), 9), duration: 600 });
  }, [selected]);

  return <div ref={el} className="map" role="region" aria-label={label} />;
}
