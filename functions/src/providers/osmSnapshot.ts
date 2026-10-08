import { gunzipSync, gzipSync } from 'node:zlib';
import type { Firestore } from 'firebase-admin/firestore';
import {
  encodeGeohash,
  geohashBounds,
  parseOverpass,
  type Bounds,
  type ImageRef,
  type RawPoi,
} from '@tuur/shared';
import type { PoiSourceClient } from './poiSources';

/** Per-tile OSM elements imported from a regional extract (see scripts/geofabrik-load.mjs). */
export const OSM_TILES = 'osmTiles';
export const OSM_META_DOC = '_meta';
const META_TTL_MS = 10 * 60_000;

/** Rings of [lng, lat] points; a point is inside when an odd number of rings contain it (holes work). */
export type CoveragePolygon = [number, number][][];

export interface OsmSnapshotMeta {
  /** Bounding box of the covered region, used as a cheap first test. */
  coverage: Bounds;
  /** Exact outline of the extract. A tile inside it without a document has no relevant OSM data. */
  polygon?: CoveragePolygon;
  extractedAt: string;
  source: string;
}

/** A tile document holds the Overpass-shaped elements, gzip-compressed to stay far below Firestore's 1 MiB. */
export function encodeTileElements(elements: unknown[]): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(elements), 'utf8'));
}

export function decodeTileElements(data: Uint8Array): unknown[] {
  const parsed: unknown = JSON.parse(gunzipSync(data).toString('utf8'));
  if (!Array.isArray(parsed)) throw new Error('Invalid OSM tile snapshot');
  return parsed;
}

export function pointInPolygon(polygon: CoveragePolygon, lat: number, lng: number): boolean {
  let inside = false;
  for (const ring of polygon)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[j]!;
      if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) inside = !inside;
    }
  return inside;
}

const covered = (meta: OsmSnapshotMeta, lat: number, lng: number) =>
  lat >= meta.coverage.south &&
  lat <= meta.coverage.north &&
  lng >= meta.coverage.west &&
  lng <= meta.coverage.east &&
  (!meta.polygon || pointInPolygon(meta.polygon, lat, lng));

/**
 * Firestore forbids arrays inside arrays, so the stored form is a list of `{ p: [lng, lat, lng, lat, ...] }`
 * rings. Returns undefined for anything that is not a usable polygon.
 */
function polygonFrom(value: unknown): CoveragePolygon | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const rings: CoveragePolygon = [];
  for (const entry of value) {
    const flat = (entry as { p?: unknown } | null)?.p;
    if (
      !Array.isArray(flat) ||
      flat.length < 6 ||
      flat.length % 2 !== 0 ||
      !flat.every((n) => typeof n === 'number' && Number.isFinite(n))
    )
      return undefined;
    const ring: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] as number, flat[i + 1] as number]);
    rings.push(ring);
  }
  return rings;
}

function metaFrom(data: Record<string, unknown> | undefined): OsmSnapshotMeta | undefined {
  const c = data?.['coverage'] as Partial<Bounds> | undefined;
  if (
    !c ||
    ![c.south, c.west, c.north, c.east].every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    typeof data?.['extractedAt'] !== 'string'
  )
    return undefined;
  const polygon = polygonFrom(data['polygon']);
  // A polygon that is present but unusable must not silently widen the coverage to its bounding box.
  if (data['polygon'] !== undefined && !polygon) return undefined;
  return {
    coverage: c as Bounds,
    ...(polygon ? { polygon } : {}),
    extractedAt: data['extractedAt'],
    source: typeof data['source'] === 'string' ? data['source'] : 'unknown',
  };
}

/**
 * OSM places for a tile from the imported regional extract; everything else (Wikidata, Wikipedia, images)
 * and tiles outside the imported region go to the wrapped client unchanged. Inside the covered region an
 * absent tile document is a real "nothing here", so no Overpass query is spent on it.
 * Streets are stored with the tile of their centre, so a street crossing a tile edge appears in one tile only.
 */
export class SnapshotPoiSources implements PoiSourceClient {
  private meta: { value: OsmSnapshotMeta | undefined; at: number } | undefined;

  constructor(
    private readonly db: Firestore,
    private readonly inner: PoiSourceClient,
    private readonly now: () => number = Date.now,
  ) {}

  private async loadMeta(): Promise<OsmSnapshotMeta | undefined> {
    if (this.meta && this.now() - this.meta.at < META_TTL_MS) return this.meta.value;
    const snap = await this.db.collection(OSM_TILES).doc(OSM_META_DOC).get();
    const value = snap.exists ? metaFrom(snap.data()) : undefined;
    this.meta = { value, at: this.now() };
    return value;
  }

  async fetchOsm(b: Bounds): Promise<RawPoi[]> {
    const tile = encodeGeohash((b.south + b.north) / 2, (b.west + b.east) / 2, 6);
    const tileBounds = geohashBounds(tile);
    const exactTile =
      Math.abs(tileBounds.south - b.south) < 1e-9 &&
      Math.abs(tileBounds.north - b.north) < 1e-9 &&
      Math.abs(tileBounds.west - b.west) < 1e-9 &&
      Math.abs(tileBounds.east - b.east) < 1e-9;
    const meta = exactTile ? await this.loadMeta() : undefined;
    const lat = (b.south + b.north) / 2;
    const lng = (b.west + b.east) / 2;
    if (!meta || !covered(meta, lat, lng)) return this.inner.fetchOsm(b);
    const snap = await this.db.collection(OSM_TILES).doc(tile).get();
    if (!snap.exists) return [];
    const data = snap.get('data') as Uint8Array | undefined;
    if (!data) throw new Error(`OSM tile snapshot ${tile} has no data`);
    return parseOverpass({ elements: decodeTileElements(data) });
  }

  fetchWikidata(b: Bounds): Promise<RawPoi[]> {
    return this.inner.fetchWikidata(b);
  }

  fetchWikipedia(b: Bounds, lang: string): Promise<RawPoi[]> {
    return this.inner.fetchWikipedia(b, lang);
  }

  fetchImages(files: string[]): Promise<Map<string, ImageRef>> {
    return this.inner.fetchImages(files);
  }
}
