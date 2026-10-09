import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, PoiSchema, type SourceBundle } from '@tuur/shared';
import { memoryFirestore } from '../../test/memoryFirestore';
import { MockLlmProvider } from '../providers/llm';
import type { TeaserDeps } from '../narration/teaser';
import { getFactSheet } from './factSheet';

const request = { poiId: 'gate', lang: 'de' };
function fixture(llm = new MockLlmProvider()) {
  const { db, docs } = memoryFirestore();
  const now = 1_800_000_000_000;
  const poi = PoiSchema.parse({
    id: 'gate',
    name: 'Brandenburger Tor',
    location: { lat: 52.5163, lng: 13.3777 },
    geohash: 'u33dbb',
    tile: 'u33dbb',
    interests: ['history'],
    score: 60,
    baseScore: 60,
    rawScore: 60,
    sources: { wikipedia: [{ lang: 'de', title: 'Brandenburger Tor', length: 80000 }] },
    updatedAt: now,
  });
  docs.set('pois/gate', poi);
  const bundle: SourceBundle = {
    poiName: poi.name,
    wikipedia: [
      {
        lang: 'de',
        title: 'Brandenburger Tor',
        extract:
          'Das Brandenburger Tor ist ein Stadttor in Berlin. Es wurde 1791 fertiggestellt. Es ist bekannt als Symbol der Stadt.',
      },
    ],
    facts: [{ label: 'architect', value: 'Carl Gotthard Langhans' }],
    osmTags: {},
    adminFacts: [],
  };
  const gather = vi.fn(async () => bundle);
  const deps = {
    db,
    llm,
    sources: { gather },
    now: () => now,
    config: async () => DEFAULT_AI_CONFIG,
  } as unknown as TeaserDeps;
  return { deps, docs, gather };
}

describe('getFactSheet', () => {
  it('returns a structured sheet from the (mock) provider and caches it', async () => {
    const { deps, docs, gather } = fixture();
    const first = await getFactSheet(deps, 'u1', request);
    expect(first.origin).toBe('ai');
    expect(first.sheet.summary).toContain('Stadttor');
    expect(first.sheet.facts).toEqual([{ key: 'architect', value: 'Carl Gotthard Langhans' }]);
    expect(first.sheet.sections.map((s) => s.kind)).toContain('history');
    expect([...docs.keys()].some((k) => k.startsWith('factSheets/'))).toBe(true);
    const second = await getFactSheet(deps, 'u1', request);
    expect(second.cached).toBe(true);
    expect(gather).toHaveBeenCalledTimes(1);
  });

  it('falls back to the deterministic sheet when the provider output is unverifiable', async () => {
    const llm = new MockLlmProvider();
    vi.spyOn(llm, 'factSheet').mockResolvedValue({
      output: { summary: 'Erbaut im Jahr 1666.', facts: [], sections: [] },
      usage: { liteInputTokens: 1, liteOutputTokens: 1 },
    });
    const { deps } = fixture(llm);
    const result = await getFactSheet(deps, 'u1', request);
    expect(result.origin).toBe('fallback');
    expect(result.sheet.summary).toContain('Stadttor');
  });

  it('falls back when the provider throws', async () => {
    const llm = new MockLlmProvider();
    vi.spyOn(llm, 'factSheet').mockRejectedValue(new Error('boom'));
    const result = await getFactSheet(fixture(llm).deps, 'u1', request);
    expect(result.origin).toBe('fallback');
  });

  it('rejects invalid requests', async () => {
    await expect(getFactSheet(fixture().deps, 'u1', { poiId: '' })).rejects.toThrow();
  });
});
