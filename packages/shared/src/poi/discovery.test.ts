import { describe, expect, it } from 'vitest';
import { destinationPoint } from '../geo/geohash';
import { PoiSchema, type Poi } from '../schemas';
import { placeProminence, rankNearbyPlaces } from './discovery';

const here = { lat: 52.52, lng: 13.405 };
const place = (id: string, meters: number, overrides: Partial<Poi> = {}): Poi =>
  PoiSchema.parse({
    id,
    name: id,
    location: destinationPoint(here, 90, meters),
    geohash: 'u33db',
    tile: 'u33db',
    interests: ['history'],
    rawScore: 20,
    baseScore: 40,
    score: 40,
    sources: {},
    updatedAt: 1,
    ...overrides,
  });
const rank = (places: Poi[], options: Partial<Parameters<typeof rankNearbyPlaces>[2]> = {}) =>
  rankNearbyPlaces(here, places, { maxDistanceM: 1500, ...options });
const ids = (places: Poi[]) => places.map((poi) => poi.id);

describe('source-backed place prominence', () => {
  it('recognizes broad source coverage and absolute sightseeing significance', () => {
    expect(placeProminence(place('tower', 1000, { sources: { wikipedia: [], sitelinks: 60 } }))).toBe(
      'landmark',
    );
    expect(placeProminence(place('palace', 1000, { rawScore: 70 }))).toBe('landmark');
    expect(placeProminence(place('museum', 300, { rawScore: 45 }))).toBe('notable');
    expect(placeProminence(place('fountain', 50))).toBe('local');
  });

  it('does not label area-relative scores or partner boosts as fame', () => {
    expect(
      placeProminence(place('local-best', 50, { rawScore: 15, baseScore: 95, score: 100, partnerBoost: 15 })),
    ).toBe('local');
  });

  it('counts distinct Wikipedia languages, not duplicate references', () => {
    const ref = { lang: 'de', title: 'A local statue', length: 1000 };
    expect(
      placeProminence(place('statue', 10, { sources: { sitelinks: 0, wikipedia: Array(12).fill(ref) } })),
    ).toBe('local');
    expect(
      placeProminence(
        place('statue', 10, {
          sources: { sitelinks: 0, wikipedia: ['de', 'en', 'fr'].map((lang) => ({ ...ref, lang })) },
        }),
      ),
    ).toBe('notable');
  });
});

describe('nearby discovery', () => {
  it('keeps a landmark 1km away visible among many close details, including with different interests', () => {
    const tower = place('television-tower', 1000, {
      rawScore: 70,
      score: 90,
      interests: ['architecture'],
      sources: { wikipedia: [], sitelinks: 60 },
    });
    const fountains = Array.from({ length: 16 }, (_, index) =>
      place(`fountain-${index}`, 50 + index * 5, {
        rawScore: 15,
        score: 100,
        interests: ['art_culture'],
        sources: { wikipedia: [], sitelinks: 0, wikidataId: `Q${index + 1}` },
      }),
    );
    const result = rank([...fountains, tower], { interests: ['art_culture'], limit: 8 });
    expect(ids(result.slice(0, 3))).toContain(tower.id);
    expect(result).toHaveLength(8);
    expect(result.some((poi) => poi.id.startsWith('fountain-'))).toBe(true);
    expect(ids(rank([tower, ...fountains].reverse(), { interests: ['art_culture'], limit: 8 }))).toEqual(
      ids(result),
    );
  });

  it('prefers close places with the same significance and honors personal interests', () => {
    const history = place('historic-detail', 100);
    const art = place('art-detail', 100, { interests: ['art_culture'] });
    expect(ids(rank([place('far', 800), place('near', 50)]))).toEqual(['near', 'far']);
    expect(ids(rank([history, art], { interests: ['art_culture'] }))[0]).toBe('art-detail');
  });

  it('deduplicates source identities before limiting and chooses the stronger representative', () => {
    const main = place('osm-tower', 700, {
      rawScore: 70,
      sources: { wikipedia: [], sitelinks: 50, wikidataId: 'Q123' },
    });
    const alias = place('wd-tower', 705, {
      rawScore: 30,
      sources: { wikipedia: [], sitelinks: 50, wikidataId: 'Q123' },
    });
    const other = place('other-place', 300);
    expect(ids(rank([alias, main, main, other], { limit: 2 }))).toEqual(['osm-tower', 'other-place']);
    expect(ids(rank([other, main, alias], { limit: 2 }))).toEqual(['osm-tower', 'other-place']);
  });

  it('matches OSM ids and Wikipedia titles even when names differ', () => {
    const osm = { osmId: 'node/123', wikipedia: [], sitelinks: 0 };
    expect(
      rank([place('source-one', 50, { sources: osm }), place('source-two', 100, { sources: osm })]),
    ).toHaveLength(1);
    expect(
      rank([
        place('german-name', 100, {
          sources: { wikipedia: [{ lang: 'de', title: 'Berliner_Fernsehturm', length: 100 }], sitelinks: 0 },
        }),
        place('english-name', 120, {
          sources: { wikipedia: [{ lang: 'de', title: 'Berliner Fernsehturm', length: 100 }], sitelinks: 0 },
        }),
      ]),
    ).toHaveLength(1);
  });

  it('never repeats the same canonical id even if source metadata conflicts', () => {
    const one = place('same-id', 100, {
      sources: { wikidataId: 'Q1', wikipedia: [], sitelinks: 0 },
    });
    const two = place('same-id', 100, {
      sources: { wikidataId: 'Q2', wikipedia: [], sitelinks: 0 },
    });
    expect(ids(rank([one, two, place('different', 200)]))).toEqual(['same-id', 'different']);
  });

  it('matches close normalized names and translated aliases but keeps distant namesakes', () => {
    expect(
      rank([
        place('one', 100, { name: 'Neptun-Brunnen' }),
        place('two', 120, { name: 'Neptun Brunnen' }),
        place('three', 800, { name: 'Neptun Brunnen' }),
      ]),
    ).toHaveLength(2);
    expect(
      rank([
        place('one', 100, { name: 'Neptunbrunnen', names: { en: 'Neptune fountain' } }),
        place('two', 120, { name: 'Neptune fountain' }),
      ]),
    ).toHaveLength(1);
  });

  it('retains distinct nearby sights and explicit Wikidata entities, including unlinked bridges', () => {
    const a = place('a', 100, {
      name: 'City fountain',
      sources: { wikidataId: 'Q1', wikipedia: [], sitelinks: 0 },
    });
    const b = place('b', 105, { name: 'City fountain' });
    const c = place('c', 110, {
      name: 'City fountain',
      sources: { wikidataId: 'Q2', wikipedia: [], sitelinks: 0 },
    });
    expect(rank([a, b, c])).toHaveLength(2);
    expect(ids(rank([a, b, c]))).toEqual(ids(rank([c, b, a])));
    expect(rank([place('museum', 50), place('fountain', 52)])).toHaveLength(2);
  });

  it('excludes active and visited aliases even if their original record is out of range or hidden', () => {
    const sources = { wikidataId: 'Q500', wikipedia: [], sitelinks: 0 };
    const visited = place('visited', 1700, { sources, hidden: true });
    const alias = place('alias', 100, { sources });
    expect(ids(rank([visited, alias, place('available', 200)], { excludedIds: ['visited'] }))).toEqual([
      'available',
    ]);
  });

  it('excludes aliases of session stops no longer in the pool without inventing full POIs', () => {
    const alias = place('new-pool-id', 100, { name: 'Neptunbrunnen' });
    expect(
      rank([alias], {
        excludedIds: ['old-pool-id'],
        excludedPlaces: [{ id: 'old-pool-id', name: 'Neptun-Brunnen', location: alias.location }],
      }),
    ).toEqual([]);
    const wikidataAlias = place('other-id', 100, {
      sources: { wikidataId: 'Q100', wikipedia: [], sitelinks: 0 },
    });
    expect(
      rank([wikidataAlias], {
        excludedPlaces: [
          { id: 'wd_Q100', name: 'An older translated name', location: wikidataAlias.location },
        ],
      }),
    ).toEqual([]);
  });
});
