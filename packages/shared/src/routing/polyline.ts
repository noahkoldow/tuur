/** Encoded polyline (precision 5) so paths fit in Firestore (which forbids nested arrays) and stay compact. */
export function encodePolyline(points: [number, number][]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(lo - prevLng);
    prevLat = la;
    prevLng = lo;
  }
  return out;
}

export function decodePolyline(str: string): [number, number][] {
  const pts: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i <= str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
