import { beforeEach, describe, expect, it } from 'vitest';
import { recordVisit } from '../src/stats/explorers';
import { clearFirestore, testDb } from './helpers';

const db = testDb();
let clock = 1_800_000_000_000;
const deps = () => ({ db, now: () => clock });

describe('recordVisit (anonymous explorer counts)', () => {
  beforeEach(async () => {
    await clearFirestore();
    clock = 1_800_000_000_000;
    await db.collection('pois').doc('p1').set({ tile: 'u33dc0', hidden: false });
    await db.collection('pois').doc('hidden').set({ tile: 'u33dc0', hidden: true });
  });

  it('counts a person once per spot and day and stores no user id', async () => {
    expect(await recordVisit(deps(), 'alice', { poiId: 'p1' })).toEqual({ counted: true });
    expect(await recordVisit(deps(), 'alice', { poiId: 'p1' })).toEqual({ counted: false });
    expect(await recordVisit(deps(), 'bob', { poiId: 'p1' })).toEqual({ counted: true });
    clock += 86_400_000;
    expect(await recordVisit(deps(), 'alice', { poiId: 'p1' })).toEqual({ counted: true });

    const stats = (await db.collection('poiStats').doc('p1').get()).data()!;
    expect(stats).toMatchObject({ poiId: 'p1', tile: 'u33dc0', explorers: 3 });
    const markers = await db.collection('explorerMarkers').get();
    for (const m of markers.docs) {
      expect(m.id).not.toContain('alice');
      expect(Object.keys(m.data())).toEqual(['expireAt']);
    }
  });

  it('ignores unknown and hidden POIs and rejects invalid input', async () => {
    expect(await recordVisit(deps(), 'alice', { poiId: 'nope' })).toEqual({ counted: false });
    expect(await recordVisit(deps(), 'alice', { poiId: 'hidden' })).toEqual({ counted: false });
    await expect(recordVisit(deps(), 'alice', { poiId: '' })).rejects.toThrow();
  });
});
