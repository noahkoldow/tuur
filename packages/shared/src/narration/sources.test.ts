import { describe, expect, it } from 'vitest';
import {
  effectiveTier,
  filterOsmTags,
  labelsFromEntities,
  parseWikidataFacts,
  parseWikipediaExtracts,
  sourceRichness,
  wikidataYear,
} from './sources';
import type { SourceBundle } from './prompt';

describe('wikidata facts', () => {
  const json = {
    entities: {
      Q1: {
        claims: {
          P571: [{ mainsnak: { datavalue: { value: { time: '+1791-00-00T00:00:00Z' } } } }],
          P84: [{ mainsnak: { datavalue: { value: { id: 'Q99' } } } }],
          P2048: [{ mainsnak: { datavalue: { value: { amount: '+26' } } } }],
          P999: [{ mainsnak: { datavalue: { value: 'ignored' } } }],
        },
      },
    },
  };
  it('extracts years, quantities and entity references', () => {
    const r = parseWikidataFacts(json, 'Q1');
    expect(r.facts).toEqual([
      { label: 'inception', value: '1791' },
      { label: 'height in meters', value: '26' },
    ]);
    expect(r.pendingLabels).toEqual(['Q99']);
    expect(r.entityFacts).toEqual([{ label: 'architect', qid: 'Q99' }]);
  });
  it('handles BCE years and label resolution', () => {
    expect(wikidataYear('-0044-03-15T00:00:00Z')).toBe('-44');
    const m = labelsFromEntities(
      { entities: { Q99: { labels: { de: { value: 'Langhans' }, en: { value: 'L' } } } } },
      ['ja', 'de', 'en'],
    );
    expect(m.get('Q99')).toBe('Langhans');
  });
  it('tolerates empty responses', () => {
    expect(parseWikidataFacts(null, 'Q1').facts).toEqual([]);
  });
});

describe('extracts & tags', () => {
  it('parses extracts by title', () => {
    const m = parseWikipediaExtracts({ query: { pages: { '1': { title: 'Dom', extract: 'A\n\n\nB' } } } });
    expect(m.get('Dom')).toBe('A\nB');
  });
  it('allow-lists OSM tags and prefers localized description', () => {
    const t = filterOsmTags(
      {
        name: 'X',
        historic: 'castle',
        'addr:street': 'Nope',
        description: 'plain',
        'description:de': 'deutsch',
      },
      'de',
    );
    expect(t).toEqual({ name: 'X', historic: 'castle', description: 'deutsch' });
  });
});

describe('effectiveTier', () => {
  const bundle = (n: number): SourceBundle => ({
    poiName: 'P',
    wikipedia: [{ lang: 'de', title: 'P', extract: 'x'.repeat(n) }],
    facts: [],
    osmTags: {},
    adminFacts: [],
  });
  it('refuses when there is no material and caps by richness', () => {
    expect(effectiveTier('long', sourceRichness(bundle(0)))).toEqual({
      ok: false,
      reason: 'insufficient_sources',
    });
    expect(effectiveTier('long', sourceRichness(bundle(200)))).toEqual({ ok: true, tier: 'short' });
    expect(effectiveTier('long', sourceRichness(bundle(800)))).toEqual({ ok: true, tier: 'medium' });
    expect(effectiveTier('long', sourceRichness(bundle(5000)))).toEqual({ ok: true, tier: 'long' });
    expect(effectiveTier('short', sourceRichness(bundle(5000)))).toEqual({ ok: true, tier: 'short' });
  });
});
