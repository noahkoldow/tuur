import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { encodeGeohash } from '@tuur/shared';
import { ensureBetaSnapshotArea, parseBetaRegion } from './betaSnapshot';

const tileAt = (lat: number, lng: number) => encodeGeohash(lat, lng, 6);

const env = {
  TUUR_DEPLOYMENT_ENV: 'beta',
  GCLOUD_PROJECT: 'tuur-beta-test',
  TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta-test',
  TUUR_BETA_SNAPSHOT_TILES: 'u33dbb,u33dbc',
};
function database(state: { exists?: boolean; locked?: boolean; status?: string } = {}) {
  const getAll = vi.fn(async (...refs: string[]) =>
    refs.map(() => ({
      exists: state.exists ?? true,
      get: (key: string) => (key === 'locked' ? (state.locked ?? true) : (state.status ?? 'ready')),
    })),
  );
  return { getAll, db: { collection: () => ({ doc: (id: string) => id }), getAll } as unknown as Firestore };
}
describe('bounded beta snapshot areas', () => {
  it('leaves ordinary ingestion unchanged when the snapshot option is absent', async () => {
    const { db, getAll } = database();
    expect(await ensureBetaSnapshotArea(db, 'u33dbb', true, undefined, {})).toBeUndefined();
    expect(getAll).not.toHaveBeenCalled();
  });
  it('serves only imported neighbor tiles, without an ingestion task', async () => {
    const { db, getAll } = database();
    expect(await ensureBetaSnapshotArea(db, 'u33dbb', true, 1, env)).toEqual({
      started: [],
      skipped: expect.arrayContaining(['u33dbb']),
    });
    expect(getAll.mock.calls[0]!.every((id) => env.TUUR_BETA_SNAPSHOT_TILES.split(',').includes(id))).toBe(
      true,
    );
  });
  it('rejects an unimported area before reading Firestore', async () => {
    const { db, getAll } = database();
    await expect(ensureBetaSnapshotArea(db, 'u33dc0', true, 1, env)).rejects.toMatchObject({
      reason: 'beta_area_unavailable',
    });
    expect(getAll).not.toHaveBeenCalled();
  });
  it.each([
    { TUUR_DEPLOYMENT_ENV: 'production' },
    { GCLOUD_PROJECT: 'tuur-prod' },
    { GCLOUD_PROJECT: 'another' },
    { TUUR_BETA_SNAPSHOT_TILES: 'invalid' },
  ])('fails closed on unsafe configuration %j', async (overrides) => {
    const { db, getAll } = database();
    await expect(
      ensureBetaSnapshotArea(db, 'u33dbb', true, 1, { ...env, ...overrides }),
    ).rejects.toMatchObject({ reason: 'beta_config_invalid' });
    expect(getAll).not.toHaveBeenCalled();
  });
  describe('live ingestion limited to a region', () => {
    const live = {
      TUUR_DEPLOYMENT_ENV: 'beta',
      GCLOUD_PROJECT: 'tuur-beta-test',
      TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta-test',
      TUUR_BETA_REGION_BBOX: '52.28,12.90,52.78,13.92',
    };
    it('allows Berlin and its fringe and leaves the ingestion path to the caller', async () => {
      const { db, getAll } = database();
      for (const tile of [tileAt(52.52, 13.405), tileAt(52.39, 13.065), tileAt(52.3, 13.6)])
        expect(await ensureBetaSnapshotArea(db, tile, true, 1, live)).toBeUndefined();
      expect(getAll).not.toHaveBeenCalled();
    });
    it.each([
      ['Hamburg', tileAt(53.55, 10.0)],
      ['Paris', tileAt(48.857, 2.352)],
    ])('rejects %s before any ingestion', async (_name, tile) => {
      const { db } = database();
      await expect(ensureBetaSnapshotArea(db, tile, true, 1, live)).rejects.toMatchObject({
        reason: 'beta_area_unavailable',
      });
    });
    it.each([
      { TUUR_BETA_REGION_BBOX: 'garbage' },
      { TUUR_BETA_REGION_BBOX: '52.78,12.90,52.28,13.92' },
      { TUUR_BETA_REGION_BBOX: '-90,-180,90,180' },
      { TUUR_BETA_REGION_BBOX: '50,10,55,15' },
      { TUUR_DEPLOYMENT_ENV: 'production' },
      { GCLOUD_PROJECT: 'tuur-prod', TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-prod' },
    ])('fails closed on unsafe region configuration %j', async (overrides) => {
      const { db } = database();
      await expect(ensureBetaSnapshotArea(db, 'u33dbc', true, 1, { ...live, ...overrides })).rejects.toMatchObject(
        { reason: 'beta_config_invalid' },
      );
    });
    it('parses only bounded rectangles', () => {
      expect(parseBetaRegion('52.28,12.90,52.78,13.92')).toEqual({
        south: 52.28,
        west: 12.9,
        north: 52.78,
        east: 13.92,
      });
      expect(parseBetaRegion('1,2,3')).toBeUndefined();
      expect(parseBetaRegion('51.35,11.25,53.57,14.78')).toBeDefined();
    });
  });
  it.each([{ exists: false }, { locked: false }, { status: 'failed' }])(
    'does not silently ingest an unavailable snapshot %j',
    async (state) => {
      const { db } = database(state);
      await expect(ensureBetaSnapshotArea(db, 'u33dbb', false, undefined, env)).rejects.toMatchObject({
        reason: 'beta_snapshot_unavailable',
      });
    },
  );
});
