import { describe, expect, it, vi } from 'vitest';
import { buildPois, type SelectNearbyResult } from '@tuur/shared';
import { LiveCuration } from './curation';

const candidates = buildPois(
  [1, 2, 3].map((n) => ({
    source: 'osm' as const,
    sourceId: `way/${n}`,
    name: `Street ${n}`,
    location: { lat: 52 + n / 100, lng: 13 },
    osmTags: { highway: 'residential' },
  })),
  { now: 1 },
).pois;
const context = { lang: 'en' as const, interests: [], thread: 'Everyday traces' };

describe('live AI curation', () => {
  it('uses only offered POIs and throttles calls while retaining changed candidate safety', async () => {
    let now = 0;
    const selectNearby = vi
      .fn()
      .mockResolvedValue({ poiIds: ['invented', candidates[1]!.id, candidates[1]!.id], source: 'gemini' });
    const curation = new LiveCuration({ selectNearby }, () => now);
    expect((await curation.rank(candidates, context)).map((p) => p.id)).toEqual([
      candidates[1]!.id,
      candidates[0]!.id,
      candidates[2]!.id,
    ]);
    expect((await curation.rank([candidates[0]!], context)).map((p) => p.id)).toEqual([candidates[0]!.id]);
    expect(selectNearby).toHaveBeenCalledTimes(1);
    now = 61_000;
    await curation.rank(candidates, context);
    expect(selectNearby).toHaveBeenCalledTimes(2);
    expect(selectNearby.mock.calls[0]![0]).not.toHaveProperty('position');
  });

  it('continues with the local ranking when the provider is unavailable', async () => {
    const curation = new LiveCuration({ selectNearby: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await curation.rank(candidates, context)).toEqual(candidates);
  });

  it('bounds waiting without multiplying an in-flight request', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (result: SelectNearbyResult) => void;
      const selectNearby = vi.fn(
        () =>
          new Promise<SelectNearbyResult>((resolve) => {
            finish = resolve;
          }),
      );
      const curation = new LiveCuration({ selectNearby });
      const ranking = curation.rank(candidates, context);
      await vi.advanceTimersByTimeAsync(2500);
      expect(await ranking).toEqual(candidates);
      const again = curation.rank(candidates, context);
      finish({ poiIds: [candidates[2]!.id], source: 'gemini' });
      expect((await again)[0]!.id).toBe(candidates[2]!.id);
      expect(selectNearby).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
