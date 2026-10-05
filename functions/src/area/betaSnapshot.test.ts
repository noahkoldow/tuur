import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { ensureBetaSnapshotArea } from './betaSnapshot';

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
