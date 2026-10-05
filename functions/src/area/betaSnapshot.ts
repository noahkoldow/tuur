import type { Firestore } from 'firebase-admin/firestore';
import { tileWithNeighbors, tilesAround } from '@tuur/shared';
import type { EnsureAreaResult } from './ensureArea';

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
  env: Record<string, string | undefined> = process.env,
): Promise<EnsureAreaResult | undefined> {
  if (!env['TUUR_BETA_SNAPSHOT_TILES']) return undefined;
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
