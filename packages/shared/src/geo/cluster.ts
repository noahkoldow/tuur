import type { LatLng } from './geohash';

export interface Cluster<T> {
  key: string;
  /** Mean position of the members. */
  location: LatLng;
  members: T[];
}

/** Grid cell size in degrees for roughly `px` screen pixels at a web-mercator zoom level (256 px tiles). */
export const cellDegForZoom = (zoom: number, px = 48) => (px * 360) / (256 * 2 ** zoom);

/**
 * Groups map markers that would overlap: items in the same grid cell form one cluster. Deterministic and cheap
 * (O(n)); good enough for a few hundred explore spots on a phone.
 */
export function clusterByGrid<T extends { id: string; location: LatLng }>(
  items: T[],
  cellDeg: number,
): Cluster<T>[] {
  if (!(cellDeg > 0)) return items.map((i) => ({ key: i.id, location: i.location, members: [i] }));
  const cells = new Map<string, T[]>();
  for (const it of items) {
    const k = `${Math.floor(it.location.lat / cellDeg)}:${Math.floor(it.location.lng / cellDeg)}`;
    const list = cells.get(k);
    if (list) list.push(it);
    else cells.set(k, [it]);
  }
  return [...cells.entries()].map(([k, members]) => ({
    key: members.length === 1 ? members[0]!.id : `c:${k}`,
    location: {
      lat: members.reduce((s, m) => s + m.location.lat, 0) / members.length,
      lng: members.reduce((s, m) => s + m.location.lng, 0) / members.length,
    },
    members,
  }));
}
