import { describe, expect, it } from 'vitest';
import { tilesAround } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { ensureAreas } from './ensureArea';
import { newArea } from './store';
import { RateLimitError } from '../util/rateLimit';

const now = Date.UTC(2026, 9, 8, 12);
const day = '2026-10-08';
const center = 'u33dbb';

describe('area ingestion admission', () => {
  it('reserves the daily allowance atomically across simultaneous neighborhoods', async () => {
    const { db, docs } = memoryFirestore();
    const enqueued: string[] = [];
    const deps = {
      db,
      now: () => now,
      maxClaimsPerDay: 5,
      enqueueIngest: async (tile: string) => void enqueued.push(tile),
    };
    const results = await Promise.allSettled(
      [center, 'u33dc0', 'u281z7', center].map((tile) => ensureAreas(deps, tile, true, 2)),
    );

    expect(enqueued).toHaveLength(5);
    expect(new Set(enqueued).size).toBe(5);
    expect(
      results.flatMap((result) => (result.status === 'fulfilled' ? result.value.started : [])).sort(),
    ).toEqual([...enqueued].sort());
    for (const result of results)
      if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(RateLimitError);
    expect(docs.get(`usageDaily/${day}`)?.tilesClaimed).toBe(5);
    const areas = [...docs.entries()].filter(([path]) => path.startsWith('areas/')).map(([, area]) => area);
    expect(areas.filter((area) => area.status === 'ingesting')).toHaveLength(5);
    for (const area of areas.filter((area) => area.status !== 'ingesting'))
      expect(area).toMatchObject({
        status: 'failed',
        error: 'rate_limited',
        ingestAttempts: 0,
        ingestRetryAt: Date.UTC(2026, 9, 9),
      });
  });

  it('submits the center before its neighbors and stops claiming at the daily limit', async () => {
    const { db, docs } = memoryFirestore();
    const enqueued: string[] = [];
    let pending = false;
    const result = await ensureAreas(
      {
        db,
        now: () => now,
        maxClaimsPerDay: 3,
        enqueueIngest: async (tile) => {
          expect(pending).toBe(false);
          pending = true;
          await Promise.resolve();
          enqueued.push(tile);
          pending = false;
        },
      },
      center,
      true,
      2,
    );
    const tiles = tilesAround(center, 2);
    expect(enqueued).toEqual(tiles.slice(0, 3));
    expect(result).toEqual({ started: tiles.slice(0, 3), skipped: tiles.slice(3) });
    expect(docs.get(`usageDaily/${day}`)?.tilesClaimed).toBe(3);
  });

  it('does not spend allowance on cached areas or duplicate claims and preserves unrelated usage', async () => {
    const { db, docs } = memoryFirestore();
    const neighbor = tilesAround(center, 1)[1]!;
    docs.set(`areas/${center}`, { ...newArea(center, now), status: 'ready', locked: true });
    docs.set(`usageDaily/${day}`, { day, tilesClaimed: 1, costUsd: 0.25 });
    const enqueued: string[] = [];
    const deps = {
      db,
      now: () => now,
      maxClaimsPerDay: 2,
      enqueueIngest: async (tile: string) => void enqueued.push(tile),
    };

    expect(await ensureAreas(deps, center, false)).toEqual({ started: [], skipped: [center] });
    await Promise.all([ensureAreas(deps, neighbor, false), ensureAreas(deps, neighbor, false)]);
    expect(enqueued).toEqual([neighbor]);
    expect(docs.get(`usageDaily/${day}`)).toEqual({ day, tilesClaimed: 2, costUsd: 0.25 });
  });

  it('uses the next UTC day allowance without modifying the previous day', async () => {
    const { db, docs } = memoryFirestore();
    docs.set(`usageDaily/${day}`, { day, tilesClaimed: 1 });
    const result = await ensureAreas(
      {
        db,
        now: () => Date.UTC(2026, 9, 9),
        maxClaimsPerDay: 1,
        enqueueIngest: async () => {},
      },
      center,
      false,
    );
    expect(result.started).toEqual([center]);
    expect(docs.get(`usageDaily/${day}`)?.tilesClaimed).toBe(1);
    expect(docs.get('usageDaily/2026-10-09')?.tilesClaimed).toBe(1);
  });

  it('reports exhausted admission, defers missing content, and permits retry after midnight', async () => {
    const { db, docs } = memoryFirestore();
    docs.set(`usageDaily/${day}`, { day, tilesClaimed: 1 });
    let clock = now;
    const enqueued: string[] = [];
    const deps = {
      db,
      now: () => clock,
      maxClaimsPerDay: 1,
      enqueueIngest: async (tile: string) => void enqueued.push(tile),
    };
    await expect(ensureAreas(deps, center, false)).rejects.toMatchObject({
      retryAfterMs: 12 * 3600_000,
    });
    expect(enqueued).toEqual([]);
    expect(docs.get(`areas/${center}`)).toMatchObject({
      status: 'failed',
      error: 'rate_limited',
      ingestAttempts: 0,
      ingestRetryAt: Date.UTC(2026, 9, 9),
    });
    clock = Date.UTC(2026, 9, 9);
    expect((await ensureAreas(deps, center, false)).started).toEqual([center]);
    expect(docs.get(`areas/${center}`)).not.toHaveProperty('ingestRetryAt');
    expect(docs.get(`areas/${center}`)?.ingestAttempts).toBe(1);
  });

  it.each(['ready', 'low_content'] as const)(
    'preserves expired cached %s content when its refresh allowance is exhausted',
    async (status) => {
      const { db, docs } = memoryFirestore();
      docs.set(`usageDaily/${day}`, { day, tilesClaimed: 1 });
      const area = { ...newArea(center, now - 1000), status, expiresAt: now - 1, poiCount: 3 };
      docs.set(`areas/${center}`, area);
      await expect(
        ensureAreas({ db, now: () => now, maxClaimsPerDay: 1, enqueueIngest: async () => {} }, center, false),
      ).rejects.toBeInstanceOf(RateLimitError);
      expect(docs.get(`areas/${center}`)).toEqual(area);
    },
  );
});
