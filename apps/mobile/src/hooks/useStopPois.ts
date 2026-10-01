import { useEffect, useMemo, useState } from 'react';
import { encodeGeohash, type LatLng, type Poi } from '@tuur/shared';
import { useBackend } from '../backend';
import { config } from '../config';

/**
 * POI details (category, images, Wikipedia extract) for the stops of the running session, loaded per ingest tile.
 * Tour stops only carry name and position; the cards and category pins need the full POI.
 */
export function useStopPois(stops: { id: string; location: LatLng }[]): Map<string, Poi> {
  const backend = useBackend();
  const [pois, setPois] = useState<Map<string, Poi>>(new Map());
  const tilesKey = useMemo(
    () =>
      [...new Set(stops.map((s) => encodeGeohash(s.location.lat, s.location.lng, config.tilePrecision)))]
        .sort()
        .join(','),
    [stops],
  );
  useEffect(() => {
    if (!tilesKey) return;
    let cancelled = false;
    void backend
      .getPois(tilesKey.split(','))
      .then((list) => {
        if (cancelled) return;
        setPois((cur) => {
          const next = new Map(cur);
          for (const p of list) next.set(p.id, p);
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend, tilesKey]);
  return pois;
}
