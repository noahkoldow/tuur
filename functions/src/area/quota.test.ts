import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, DEFAULT_CLAIM_POLICY } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import { MockPoiSources } from '../providers/poiSources';
import { PeliasGeocoder } from '../providers/pelias';
import { RateLimitError } from '../util/rateLimit';
import { ensureAreas } from './ensureArea';
import { ingestArea } from './ingest';
import { claimArea, deferAreaForQuota, markAreaFailed, newArea } from './store';

const tile = 'u33dc0';

afterEach(() => vi.unstubAllGlobals());

describe('area ingest quota deferral', () => {
  it('defers an upstream 429 and prevents queued retries from sending requests before its deadline', async () => {
    const { db, docs } = memoryFirestore();
    let now = 1000;
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    const deps = {
      db,
      sources: new MockPoiSources(),
      geocoder: new PeliasGeocoder('server-test-key', async () => {}),
      llm: new MockLlmProvider(),
      ai: DEFAULT_AI_CONFIG,
      now: () => now,
    };
    expect(await claimArea(db, tile, now)).toBe(true);
    await expect(ingestArea(deps, tile)).rejects.toMatchObject({ retryAfterMs: 86_400_000 });
    expect(docs.get(`areas/${tile}`)).toMatchObject({
      status: 'failed',
      ingestAttempts: 0,
      ingestRetryAt: now + 86_400_000,
      error: 'rate_limited',
    });
    const deferred = structuredClone(docs.get(`areas/${tile}`));
    now += 30_000;
    await expect(ingestArea(deps, tile)).rejects.toMatchObject({ retryAfterMs: 86_370_000 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(docs.get(`areas/${tile}`)).toEqual(deferred);
  });

  it('waits before any provider work and permits a queued retry at the stored deadline', async () => {
    const { db, docs } = memoryFirestore();
    const retryAt = 61_000;
    docs.set(`areas/${tile}`, {
      ...newArea(tile, 1000),
      status: 'failed',
      ingestRetryAt: retryAt,
      error: 'rate_limited',
    });
    let now = retryAt - 1;
    const reverse = vi.fn().mockRejectedValue(new Error('provider reached after deadline'));
    const sources = new MockPoiSources();
    const fetchOsm = vi.spyOn(sources, 'fetchOsm');
    const deps = {
      db,
      sources,
      geocoder: { reverse },
      llm: new MockLlmProvider(),
      ai: DEFAULT_AI_CONFIG,
      now: () => now,
    };
    await expect(ingestArea(deps, tile)).rejects.toMatchObject({ retryAfterMs: 1 });
    expect(reverse).not.toHaveBeenCalled();
    expect(fetchOsm).not.toHaveBeenCalled();
    now = retryAt;
    await expect(ingestArea(deps, tile)).rejects.toThrow('provider reached after deadline');
    expect(reverse).toHaveBeenCalledOnce();
    expect(docs.get(`areas/${tile}`)).not.toHaveProperty('ingestRetryAt');
  });

  it('can recover after more than five quota windows without permanently exhausting ingest attempts', async () => {
    const { db, docs } = memoryFirestore();
    let now = 1000;
    let retryAt = now + 86_400_000;
    const deps = {
      db,
      sources: new MockPoiSources(),
      geocoder: {
        reverse: async () => {
          throw new RateLimitError(retryAt - now);
        },
      },
      llm: new MockLlmProvider(),
      ai: DEFAULT_AI_CONFIG,
      now: () => now,
    };
    for (let cycle = 0; cycle < 6; cycle++) {
      expect(await claimArea(db, tile, now)).toBe(true);
      await expect(ingestArea(deps, tile)).rejects.toBeInstanceOf(RateLimitError);
      expect(docs.get(`areas/${tile}`)).toMatchObject({
        status: 'failed',
        ingestAttempts: 0,
        ingestRetryAt: retryAt,
        error: 'rate_limited',
      });
      expect(await claimArea(db, tile, retryAt - 1)).toBe(false);
      // Delivery retries do not own a new claim and must not alter the retry budget.
      now += 30_000;
      await expect(ingestArea(deps, tile)).rejects.toBeInstanceOf(RateLimitError);
      expect(docs.get(`areas/${tile}`)?.ingestAttempts).toBe(0);
      expect(docs.get(`areas/${tile}`)?.ingestRetryAt).toBe(retryAt);
      now = retryAt;
      retryAt = now + 86_400_000;
    }
    expect(await claimArea(db, tile, now)).toBe(true);
    expect(docs.get(`areas/${tile}`)).toMatchObject({ status: 'ingesting', ingestAttempts: 1 });
    expect(docs.get(`areas/${tile}`)).not.toHaveProperty('ingestRetryAt');
  });

  it('refunds only the quota-blocked claim, retaining previous genuine failures and their cap', async () => {
    const { db, docs } = memoryFirestore();
    const previousFailures = DEFAULT_CLAIM_POLICY.maxAttempts - 1;
    docs.set(`areas/${tile}`, {
      ...newArea(tile, 0),
      status: 'failed',
      ingestAttempts: previousFailures,
    });
    const now = 10_000_000;
    expect(await claimArea(db, tile, now)).toBe(true);
    await deferAreaForQuota(db, tile, 60_000, now);
    await deferAreaForQuota(db, tile, 30_000, now + 30_000);
    expect(docs.get(`areas/${tile}`)?.ingestAttempts).toBe(previousFailures);
    expect(await claimArea(db, tile, now + 60_000)).toBe(true);
    await markAreaFailed(db, tile, 'bad upstream data', now + 60_000);
    expect(await claimArea(db, tile, now + 86_400_000)).toBe(false);
    expect(docs.get(`areas/${tile}`)?.error).toBe('bad upstream data');
    expect(docs.get(`areas/${tile}`)).not.toHaveProperty('ingestRetryAt');
  });

  it('preserves quota deferrals when the emulator runs ingestion inline during enqueue', async () => {
    const { db, docs } = memoryFirestore();
    const now = 1000;
    const deps = {
      db,
      sources: new MockPoiSources(),
      geocoder: {
        reverse: async () => {
          throw new RateLimitError(60_000);
        },
      },
      llm: new MockLlmProvider(),
      ai: DEFAULT_AI_CONFIG,
      now: () => now,
    };
    const result = await ensureAreas(
      {
        db,
        now: () => now,
        enqueueIngest: async (area) => {
          await ingestArea(deps, area);
        },
      },
      tile,
      false,
    );
    expect(result).toEqual({ started: [], skipped: [tile] });
    expect(docs.get(`areas/${tile}`)).toMatchObject({
      status: 'failed',
      ingestAttempts: 0,
      ingestRetryAt: 61_000,
      error: 'rate_limited',
    });
  });
});
