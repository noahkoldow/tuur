import type { Firestore } from 'firebase-admin/firestore';
import { geohashBounds, tileWithNeighbors, tilesAround } from '@tuur/shared';
import type { EnsureAreaResult } from './ensureArea';

type Env = Record<string, string | undefined>;

/** Parses "south,west,north,east"; returns undefined for anything that is not a sane, bounded rectangle. */
export function parseBetaRegion(value: string) {
  const [south, west, north, east, ...rest] = value.split(',').map((part) => Number(part.trim()));
  if (rest.length || [south, west, north, east].some((n) => n === undefined || !Number.isFinite(n)))
    return undefined;
  const box = { south: south!, west: west!, north: north!, east: east! };
  if (
    Math.abs(box.south) > 90 ||
    Math.abs(box.north) > 90 ||
    Math.abs(box.west) > 180 ||
    Math.abs(box.east) > 180 ||
    box.south >= box.north ||
    box.west >= box.east ||
    box.north - box.south > 3 ||
    box.east - box.west > 3
  )
    return undefined;
  return box;
}

/**
 * Live beta ingestion may be limited to one rectangular region (e.g. Berlin and its ABC fringe) instead of the
 * whole world. Only the requested tile's centre is checked; unset means no geographic restriction.
 */
function assertBetaRegion(geohash: string, env: Env): void {
  const value = env['TUUR_BETA_REGION_BBOX'];
  if (!value) return;
  const project = env['GCLOUD_PROJECT'] ?? env['GOOGLE_CLOUD_PROJECT'];
  const region = parseBetaRegion(value);
  if (
    !region ||
    env['TUUR_DEPLOYMENT_ENV'] !== 'beta' ||
    !project ||
    project === 'tuur-prod' ||
    project !== env['TUUR_BETA_FIREBASE_PROJECT_ID']
  )
    throw new BetaSnapshotError('beta_config_invalid');
  const tile = geohashBounds(geohash);
  const lat = (tile.south + tile.north) / 2;
  const lng = (tile.west + tile.east) / 2;
  if (lat < region.south || lat > region.north || lng < region.west || lng > region.east)
    throw new BetaSnapshotError('beta_area_unavailable');
}

export class BetaSnapshotError extends Error {
  constructor(
    readonly reason: 'beta_area_unavailable' | 'beta_snapshot_unavailable' | 'beta_config_invalid',
  ) {
    super('The beta currently supports only its imported test area');
  }
}

/** A bounded, real OSM snapshot lets beta testing run without a live ingestion subscription or queue. */
export async function ensureBetaSnapshotArea(
  db: Firestore,
  geohash: string,
  withNeighbors: boolean,
  rings: number | undefined,
  env: Env = process.env,
): Promise<EnsureAreaResult | undefined> {
  if (!env['TUUR_BETA_SNAPSHOT_TILES']) {
    assertBetaRegion(geohash, env);
    return undefined;
  }
  const project = env['GCLOUD_PROJECT'] ?? env['GOOGLE_CLOUD_PROJECT'];
  const tiles = env['TUUR_BETA_SNAPSHOT_TILES'].split(',');
  if (
    env['TUUR_DEPLOYMENT_ENV'] !== 'beta' ||
    !project ||
    project === 'tuur-prod' ||
    project !== env['TUUR_BETA_FIREBASE_PROJECT_ID'] ||
    tiles.length > 64 ||
    tiles.some((tile) => !/^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(tile))
  )
    throw new BetaSnapshotError('beta_config_invalid');
  const allowed = new Set(tiles);
  if (!allowed.has(geohash)) throw new BetaSnapshotError('beta_area_unavailable');
  const requested =
    rings !== undefined
      ? tilesAround(geohash, rings)
      : withNeighbors
        ? tileWithNeighbors(geohash)
        : [geohash];
  const selected = requested.filter((tile) => allowed.has(tile));
  const snapshots = await db.getAll(...selected.map((tile) => db.collection('areas').doc(tile)));
  if (
    snapshots.some(
      (snapshot) =>
        !snapshot.exists ||
        snapshot.get('locked') !== true ||
        !['ready', 'low_content'].includes(snapshot.get('status')),
    )
  )
    throw new BetaSnapshotError('beta_snapshot_unavailable');
  return { started: [], skipped: selected };
}
