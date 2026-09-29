import { describe, expect, it } from 'vitest';
import {
  buildOverpassQuery,
  buildWikidataQuery,
  parseOverpass,
  parseWikidata,
  parseWikipediaGeosearch,
  parseWktPoint,
} from './raw';

describe('source parsers', () => {
  it('parses Overpass elements with centers, localized names, wikipedia and commons tags', () => {
    const out = parseOverpass({
      elements: [
        {
          type: 'way',
          id: 5,
          center: { lat: 1, lon: 2 },
          tags: {
            name: 'A',
            'name:de': 'Ah',
            wikipedia: 'de:Foo Bar',
            wikidata: 'Q5',
            wikimedia_commons: 'File:X.jpg',
          },
        },
        { type: 'node', id: 6, lat: 3, lon: 4, tags: { amenity: 'bench' } }, // no name -> skipped
        { type: 'node', id: 7, tags: { name: 'no coords' } }, // skipped
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: 'way/5',
      names: { de: 'Ah' },
      wikidataId: 'Q5',
      imageFile: 'File:X.jpg',
    });
    expect(out[0]!.wikipedia).toEqual([{ lang: 'de', title: 'Foo Bar', length: 0 }]);
  });

  it('tolerates malformed input', () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseWikidata({})).toEqual([]);
    expect(parseWikipediaGeosearch(undefined, 'de')).toEqual([]);
  });

  it('parses WKT points as lon/lat', () => {
    expect(parseWktPoint('Point(13.4 52.5)')).toEqual({ lat: 52.5, lng: 13.4 });
    expect(parseWktPoint('nope')).toBeNull();
  });

  it('parses Wikidata bindings, dedups rows per item and skips unlabeled items', () => {
    const b = (id: string, label: string, cls: string) => ({
      item: { value: `http://www.wikidata.org/entity/${id}` },
      itemLabel: { value: label },
      coord: { value: 'Point(10 50)' },
      sitelinks: { value: '12' },
      image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Some%20File.jpg' },
      classLabel: { value: cls },
    });
    const out = parseWikidata({
      results: { bindings: [b('Q1', 'Dom', 'church'), b('Q1', 'Dom', 'landmark'), b('Q2', 'Q2', 'x')] },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      wikidataId: 'Q1',
      sitelinks: 12,
      instanceOf: ['church', 'landmark'],
      imageFile: 'File:Some File.jpg',
    });
  });

  it('parses Wikipedia geosearch', () => {
    const out = parseWikipediaGeosearch(
      { query: { geosearch: [{ pageid: 1, title: 'Alter Dom', lat: 1, lon: 2 }] } },
      'de',
    );
    expect(out[0]).toMatchObject({ sourceId: 'de:Alter Dom', names: { de: 'Alter Dom' } });
    expect(out[0]!.wikipedia![0]!.url).toBe('https://de.wikipedia.org/wiki/Alter_Dom');
  });

  it('builds queries containing the bbox', () => {
    const b = { south: 1, west: 2, north: 3, east: 4 };
    expect(buildOverpassQuery(b)).toContain('(1,2,3,4)');
    expect(buildWikidataQuery(b)).toContain('Point(2 1)');
  });
});
