import { describe, expect, it } from 'vitest';
import type { SessionCheckpoint } from '@tuur/shared';
import { SessionCheckpointStore } from './checkpointStore';

const now = 1_800_000_000_000;
const saved: SessionCheckpoint = {
  version: 1,
  ownerUid: 'owner',
  mode: 'roam',
  recordId: 'walk',
  startedAt: now - 1000,
  savedAt: now,
  lang: 'de',
  interests: [],
  frequency: 'normal',
  profile: 'foot-walking',
  budgetMinutes: 60,
  simulate: false,
  route: [],
  progress: { index: 0, visited: [], skipped: [], narrated: [], playedTier: {} },
};
function storage() {
  let data: string | null = null;
  return {
    getItem: async () => data,
    setItem: async (_key: string, value: string) => {
      data = value;
    },
    removeItem: async () => {
      data = null;
    },
  };
}

describe('device-local session recovery', () => {
  it('offers only valid, recent data belonging to the current account', async () => {
    const disk = storage();
    const store = new SessionCheckpointStore(disk);
    await store.save(saved);
    expect(await store.load('owner', now)).toEqual(saved);
    expect(await store.load('other', now)).toBeUndefined();
    expect(await store.load('owner', now + 25 * 3600_000)).toBeUndefined();
    await disk.setItem('', '{broken');
    expect(await store.load('owner', now)).toBeUndefined();
  });
  it('finishes an in-flight write before deletion so stale data cannot return', async () => {
    const disk = storage();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = new SessionCheckpointStore({
      ...disk,
      setItem: async (key, value) => {
        await gate;
        await disk.setItem(key, value);
      },
    });
    const write = store.save(saved);
    const clear = store.clear();
    release();
    await Promise.all([write, clear]);
    expect(await store.load('owner', now)).toBeUndefined();
  });
  it('rejects malformed progress and fixed routes without a tour', async () => {
    const store = new SessionCheckpointStore(storage());
    await expect(store.save({ ...saved, mode: 'tour' })).rejects.toThrow();
    await expect(store.save({ ...saved, progress: { ...saved.progress, index: 2 } })).rejects.toThrow();
  });
});
