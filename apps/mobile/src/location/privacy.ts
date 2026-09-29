/** Rounds a position to 3 decimals (about 100 m) before it leaves the device for route planning. */
export function roundPosition<T extends { lat: number; lng: number }>(p: T): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}
