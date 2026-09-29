const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function encodeGeohash(lat: number, lng: number, precision: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RangeError(`Invalid coordinate ${lat},${lng}`);
  }
  const latR: [number, number] = [-90, 90];
  const lngR: [number, number] = [-180, 180];
  let hash = '';
  let bits = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lngR : latR;
    const val = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (val >= mid) {
      ch = (ch << 1) | 1;
      range[0] = mid;
    } else {
      ch = ch << 1;
      range[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return hash;
}

export function isValidGeohash(hash: string, precision?: number): boolean {
  if (!/^[0-9bcdefghjkmnpqrstuvwxyz]+$/.test(hash)) return false;
  return precision === undefined || hash.length === precision;
}

export function geohashBounds(hash: string): Bounds {
  if (!isValidGeohash(hash)) throw new RangeError(`Invalid geohash ${hash}`);
  const latR: [number, number] = [-90, 90];
  const lngR: [number, number] = [-180, 180];
  let even = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lngR : latR;
      const mid = (range[0] + range[1]) / 2;
      if ((idx >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return { south: latR[0], north: latR[1], west: lngR[0], east: lngR[1] };
}

export function geohashCenter(hash: string): LatLng {
  const b = geohashBounds(hash);
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

/** The surrounding cells (fewer near the poles); longitude wraps at the antimeridian. */
export function geohashNeighbors(hash: string): string[] {
  const b = geohashBounds(hash);
  const dLat = b.north - b.south;
  const dLng = b.east - b.west;
  const c = geohashCenter(hash);
  const out = new Set<string>();
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const lat = c.lat + dy * dLat;
      if (lat < -90 || lat > 90) continue;
      let lng = c.lng + dx * dLng;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      out.add(encodeGeohash(lat, lng, hash.length));
    }
  }
  out.delete(hash);
  return [...out];
}

/** All cells within `rings` steps of `hash` (0 = only the cell, 1 = 3x3, 2 = 5x5), deduplicated, center first. */
export function tilesAround(hash: string, rings: number): string[] {
  const seen = new Set<string>([hash]);
  let frontier = [hash];
  for (let r = 0; r < rings; r++) {
    const next: string[] = [];
    for (const h of frontier) {
      for (const n of geohashNeighbors(h)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

/** Cell plus neighbors: what `ensureArea` warms for a position. */
export function tileWithNeighbors(hash: string): string[] {
  return [hash, ...geohashNeighbors(hash)];
}

export function expandBounds(b: Bounds, meters: number): Bounds {
  const dLat = meters / 111_320;
  const midLat = (b.south + b.north) / 2;
  const dLng = meters / (111_320 * Math.max(0.05, Math.cos((midLat * Math.PI) / 180)));
  return {
    south: Math.max(-90, b.south - dLat),
    north: Math.min(90, b.north + dLat),
    west: Math.max(-180, b.west - dLng),
    east: Math.min(180, b.east + dLng),
  };
}

export function boundsCenter(b: Bounds): LatLng {
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

const R = 6_371_008.8;
const RAD = Math.PI / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a -> b in degrees [0, 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD);
  const x =
    Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Smallest absolute angle between two bearings, 0..180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export function destinationPoint(from: LatLng, bearingDeg: number, meters: number): LatLng {
  const d = meters / R;
  const br = bearingDeg * RAD;
  const lat1 = from.lat * RAD;
  const lng1 = from.lng * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / RAD, lng: ((lng2 / RAD + 540) % 360) - 180 };
}
