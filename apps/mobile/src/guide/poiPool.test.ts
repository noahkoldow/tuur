import { describe, expect, it, vi } from 'vitest';
import { PoiSchema, type Poi } from '@tuur/shared';
import { createDemoBackend } from '../backend/demoBackend';
import { FakeClock } from '../testing/fakeClock';
import { PoiPool } from './modes';

const place = (id: string, tile = 'u33db0', overrides: Partial<Poi> = {}): Poi =>
  PoiSchema.parse({
    id,
    name: id,
    tile,
    geohash: tile,
    location: { lat: 52.52, lng: 13.405 },
    interests: ['history'],
    rawScore: 20,
    baseScore: 40,
    score: 40,
    sources: {},
    updatedAt: 1,
    ...overrides,
  });
const setup = () => {
  const backend = createDemoBackend({ latencyMs: 0 });
  const getPois = vi.spyOn(backend, 'getPois');
  return { getPois, pool: new PoiPool(backend, new FakeClock()) };
};

describe('POI pool refresh after neighboring ingestion completes', () => {
  it('refreshes populated tiles, updates metadata, removes stale POIs and preserves other tiles', async () => {
    const { getPois, pool } = setup();
    getPois.mockResolvedValueOnce([place('fountain'), place('old'), place('elsewhere', 'u33db1')]);
    await pool.load(['u33db0', 'u33db1']);
    await pool.load(['u33db0']);
    expect(getPois).toHaveBeenCalledTimes(1);
    const revision = pool.revision;
    getPois.mockResolvedValueOnce([
      place('fountain', 'u33db0', { name: 'Updated fountain' }),
      place('landmark'),
    ]);
    await pool.refresh(['u33db0']);
    expect(getPois).toHaveBeenLastCalledWith(['u33db0']);
    expect(
      pool
        .all()
        .map((poi) => poi.id)
        .sort(),
    ).toEqual(['elsewhere', 'fountain', 'landmark']);
    expect(pool.all().find((poi) => poi.id === 'fountain')?.name).toBe('Updated fountain');
    expect(pool.revision).toBeGreaterThan(revision);
  });

  it('bypasses the eight-second retry gate for a previously empty neighboring tile', async () => {
    const { getPois, pool } = setup();
    getPois.mockResolvedValueOnce([]);
    await pool.load(['u33db0']);
    await pool.load(['u33db0']);
    expect(getPois).toHaveBeenCalledTimes(1);
    getPois.mockResolvedValueOnce([place('landmark')]);
    await pool.refresh(['u33db0']);
    expect(pool.all().map((poi) => poi.id)).toEqual(['landmark']);
    expect(getPois).toHaveBeenCalledTimes(2);
  });

  it('does not let an older incomplete read overwrite a completed refresh', async () => {
    const { getPois, pool } = setup();
    let finishOld: (pois: Poi[]) => void = () => undefined;
    getPois.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const oldLoad = pool.load(['u33db0', 'u33db1']);
    getPois.mockResolvedValueOnce([place('fountain'), place('landmark')]);
    await pool.refresh(['u33db0']);
    finishOld([place('fountain'), place('other-tile', 'u33db1')]);
    await oldLoad;
    expect(
      pool
        .all()
        .map((poi) => poi.id)
        .sort(),
    ).toEqual(['fountain', 'landmark', 'other-tile']);
  });

  it('retains cached places on failed refresh and lets the caller retry immediately', async () => {
    const { getPois, pool } = setup();
    getPois.mockResolvedValueOnce([place('fountain')]);
    await pool.load(['u33db0']);
    const revision = pool.revision;
    getPois.mockRejectedValueOnce(new Error('offline'));
    await expect(pool.refresh(['u33db0'])).rejects.toThrow('offline');
    expect(pool.all().map((poi) => poi.id)).toEqual(['fountain']);
    expect(pool.revision).toBe(revision);
    getPois.mockResolvedValueOnce([place('landmark')]);
    await pool.refresh(['u33db0']);
    expect(pool.all().map((poi) => poi.id)).toEqual(['landmark']);
  });

  it('publishes same-count metadata changes and completed empty snapshots', async () => {
    const { getPois, pool } = setup();
    getPois.mockResolvedValueOnce([place('one')]);
    await pool.load(['u33db0']);
    const initial = pool.revision;
    getPois.mockResolvedValueOnce([place('one', 'u33db0', { rawScore: 80 })]);
    await pool.refresh(['u33db0']);
    expect(pool.all()[0]?.rawScore).toBe(80);
    expect(pool.revision).toBeGreaterThan(initial);
    getPois.mockResolvedValueOnce([]);
    await pool.refresh(['u33db0']);
    expect(pool.all()).toEqual([]);
  });
});
