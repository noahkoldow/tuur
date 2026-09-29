import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import { statusForIngest } from '../area/quality';
import { mergeRawPois } from './merge';
import { buildPois } from './pipeline';

const NOW = 1_700_000_000_000;

describe('ingest pipeline on region fixtures', () => {
  for (const f of REGION_FIXTURES) {
    describe(f.label, () => {
      const { pois } = buildPois(f.raw, { now: NOW });

      it('merges duplicates into a plausible number of places', () => {
        const merged = mergeRawPois(f.raw);
        expect(merged.length).toBeGreaterThanOrEqual(f.expectedMerged.min);
        expect(merged.length).toBeLessThanOrEqual(f.expectedMerged.max);
      });

      it('produces unique ids and valid scores', () => {
        expect(new Set(pois.map((p) => p.id)).size).toBe(pois.length);
        for (const p of pois) {
          expect(p.score).toBeGreaterThanOrEqual(0);
          expect(p.score).toBeLessThanOrEqual(100);
          expect(p.tile).toHaveLength(6);
          expect(p.geohash).toHaveLength(9);
        }
      });

      it(`ends with status ${f.expectedStatus}`, () => {
        expect(statusForIngest(pois)).toBe(f.expectedStatus);
      });
    });
  }

  it('merges Brandenburg Gate across OSM, Wikidata and Wikipedia and keeps all sources', () => {
    const berlin = REGION_FIXTURES[0]!;
    const { pois } = buildPois(berlin.raw, { now: NOW });
    const gates = pois.filter((p) => p.sources.wikidataId === 'Q82425');
    expect(gates).toHaveLength(1);
    expect(gates[0]!.sources.wikipedia.map((w) => w.lang)).toContain('de');
    expect(gates[0]!.sources.sitelinks).toBe(120);
    expect(gates[0]!.id).toBe('wd_Q82425');
  });

  it('merges the Reichstag by name and distance when the OSM object has no wikidata tag', () => {
    const berlin = REGION_FIXTURES[0]!;
    const { pois } = buildPois(berlin.raw, { now: NOW });
    expect(pois.filter((p) => p.name.includes('Reichstag'))).toHaveLength(1);
  });

  it('ranks top sights above cafes and marks private objects inaccessible', () => {
    const berlin = REGION_FIXTURES[0]!;
    const { pois } = buildPois(berlin.raw, { now: NOW });
    const byName = (n: string) => pois.find((p) => p.name.includes(n))!;
    expect(byName('Brandenburger').score).toBeGreaterThan(byName('Einstein').score);
    expect(byName('Alte Kaserne').accessible).toBe(false);
  });

  it('normalizes relative to surroundings: a small town top sight scores high', () => {
    const t = REGION_FIXTURES[1]!;
    const { pois } = buildPois(t.raw, { now: NOW });
    expect(Math.max(...pois.map((p) => p.score))).toBeGreaterThanOrEqual(70);
  });

  it('classifies interests by rules and flags what needs the LLM fallback', () => {
    const { pois, unclassified } = buildPois(
      [
        {
          source: 'osm',
          sourceId: 'node/1',
          name: 'Mystery',
          location: { lat: 1, lng: 1 },
          osmTags: { name: 'Mystery', building: 'yes' },
        },
        {
          source: 'osm',
          sourceId: 'node/2',
          name: 'Alte Burg',
          location: { lat: 2, lng: 2 },
          osmTags: { name: 'Alte Burg', historic: 'castle' },
        },
      ],
      { now: NOW, minRawScore: 0 },
    );
    expect(unclassified.map((u) => u.name)).toEqual(['Mystery']);
    const castle = pois.find((p) => p.name === 'Alte Burg')!;
    expect(castle.interests).toEqual(expect.arrayContaining(['history', 'architecture']));
    expect(castle.primaryInterest).toBe('history');
  });

  it('applies LLM interests for unclassified candidates', () => {
    const raw = [
      {
        source: 'osm' as const,
        sourceId: 'node/1',
        name: 'Mystery',
        location: { lat: 1, lng: 1 },
        osmTags: { name: 'Mystery', building: 'yes', wikidata: 'Q1' },
        wikidataId: 'Q1',
        sitelinks: 5,
      },
    ];
    const { pois, unclassified } = buildPois(raw, {
      now: NOW,
      llmInterests: new Map([['wd_Q1', ['art_culture']]]),
    });
    expect(unclassified).toHaveLength(0);
    expect(pois[0]!.interests).toEqual(['art_culture']);
  });

  it('is deterministic regardless of input order', () => {
    const berlin = REGION_FIXTURES[0]!;
    const a = buildPois(berlin.raw, { now: NOW }).pois.map((p) => [p.id, p.score]);
    const b = buildPois([...berlin.raw].reverse(), { now: NOW }).pois.map((p) => [p.id, p.score]);
    expect(b.sort()).toEqual(a.sort());
  });

  it('keeps Kyoto names in multiple languages', () => {
    const kyoto = REGION_FIXTURES[3]!;
    const { pois } = buildPois(kyoto.raw, { now: NOW });
    const yasaka = pois.find((p) => p.sources.wikidataId === 'Q1136528')!;
    expect(yasaka.names['ja']).toBe('八坂神社');
    expect(yasaka.sources.wikipedia.map((w) => w.lang).sort()).toEqual(['en', 'ja']);
  });
});
