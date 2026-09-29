import type { RawPoi } from '../poi/raw';

/** Test fixtures: hand-built raw upstream candidates for four different regions. Not real API dumps. */

const osm = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  tags: Record<string, string>,
  extra: Partial<RawPoi> = {},
): RawPoi => ({
  source: 'osm',
  sourceId: id,
  name,
  location: { lat, lng },
  osmTags: { name, ...tags },
  names: {},
  ...extra,
});

const wd = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  sitelinks: number,
  instanceOf: string[],
): RawPoi => ({
  source: 'wikidata',
  sourceId: id,
  name,
  location: { lat, lng },
  wikidataId: id,
  sitelinks,
  instanceOf,
});

const wp = (lang: string, title: string, lat: number, lng: number, length: number): RawPoi => ({
  source: 'wikipedia',
  sourceId: `${lang}:${title}`,
  name: title,
  names: { [lang]: title },
  location: { lat, lng },
  wikipedia: [{ lang, title, length }],
});

export interface RegionFixture {
  key: 'berlin' | 'rothenburg' | 'rural' | 'kyoto';
  label: string;
  center: { lat: number; lng: number };
  countryCode: string;
  raw: RawPoi[];
  /** Expected outcome of the ingest. */
  expectedStatus: 'ready' | 'low_content';
  /** Number of distinct places after merging (upper/lower sanity bounds). */
  expectedMerged: { min: number; max: number };
}

export const berlin: RegionFixture = {
  key: 'berlin',
  label: 'Großstadt (Berlin-Mitte)',
  center: { lat: 52.5163, lng: 13.3777 },
  countryCode: 'DE',
  expectedStatus: 'ready',
  expectedMerged: { min: 14, max: 18 },
  raw: [
    // Brandenburger Tor in all three sources (must merge into one)
    osm(
      'way/1',
      'Brandenburger Tor',
      52.51628,
      13.37771,
      { tourism: 'attraction', historic: 'monument', wikidata: 'Q82425' },
      { wikidataId: 'Q82425' },
    ),
    wd('Q82425', 'Brandenburg Gate', 52.51627, 13.37777, 120, ['city gate', 'triumphal arch']),
    wp('de', 'Brandenburger Tor', 52.51628, 13.37778, 60000),
    // Reichstag: OSM without wikidata tag, merges by name + distance
    osm('way/2', 'Reichstagsgebäude', 52.51861, 13.3761, { historic: 'building', tourism: 'attraction' }),
    wp('de', 'Reichstagsgebäude', 52.51862, 13.37612, 90000),
    wd('Q4340', 'Reichstag building', 52.5186, 13.3761, 95, ['parliament building']),
    osm('way/3', 'Holocaust-Mahnmal', 52.51389, 13.37889, { historic: 'memorial', tourism: 'attraction' }),
    wd('Q151550', 'Memorial to the Murdered Jews of Europe', 52.51389, 13.37889, 70, ['memorial']),
    osm(
      'way/4',
      'Pergamonmuseum',
      52.52131,
      13.39696,
      { tourism: 'museum', wikidata: 'Q154591' },
      { wikidataId: 'Q154591' },
    ),
    wd('Q154591', 'Pergamon Museum', 52.5213, 13.397, 88, ['museum']),
    osm('way/5', 'Neues Museum', 52.51979, 13.39754, { tourism: 'museum' }),
    osm('way/6', 'Berliner Dom', 52.51908, 13.40103, {
      amenity: 'place_of_worship',
      building: 'cathedral',
      tourism: 'attraction',
    }),
    wp('de', 'Berliner Dom', 52.5191, 13.401, 70000),
    wd('Q154548', 'Berlin Cathedral', 52.5191, 13.401, 80, ['church building']),
    osm('node/7', 'Checkpoint Charlie', 52.50751, 13.39041, {
      tourism: 'attraction',
      historic: 'checkpoint',
    }),
    wp('en', 'Checkpoint Charlie', 52.50751, 13.39041, 45000),
    osm('node/8', 'Gendarmenmarkt', 52.5138, 13.3928, { tourism: 'attraction' }),
    wd('Q157525', 'Gendarmenmarkt', 52.5138, 13.3928, 30, ['square']),
    osm('way/9', 'Tiergarten', 52.5145, 13.3501, { leisure: 'park' }),
    wd('Q101777', 'Großer Tiergarten', 52.5145, 13.3501, 55, ['urban park']),
    osm('node/10', 'Café Einstein', 52.5164, 13.3883, { amenity: 'cafe' }),
    osm('node/11', 'Berliner Kneipe', 52.5171, 13.3902, { amenity: 'pub' }),
    osm('node/12', 'Buchladen Mitte', 52.5175, 13.3921, { shop: 'books' }),
    osm('node/13', 'Wandbild an der Hauswand', 52.5181, 13.3866, {
      tourism: 'artwork',
      artwork_type: 'mural',
    }),
    osm('node/14', 'Kleiner Aussichtspunkt', 52.515, 13.399, { tourism: 'viewpoint' }),
    osm('way/15', 'Alte Kaserne (gesperrt)', 52.512, 13.38, { historic: 'building', access: 'private' }),
    wd('Q9999', 'Kaiser-Friedrich-Denkmal', 52.5193, 13.399, 12, ['monument']),
  ],
};

export const rothenburg: RegionFixture = {
  key: 'rothenburg',
  label: 'Kleinstadt (Rothenburg ob der Tauber)',
  center: { lat: 49.3767, lng: 10.1786 },
  countryCode: 'DE',
  expectedStatus: 'ready',
  expectedMerged: { min: 6, max: 8 },
  raw: [
    osm('way/101', 'Plönlein', 49.37524, 10.17836, { tourism: 'attraction', historic: 'city_gate' }),
    wp('de', 'Plönlein', 49.37524, 10.17836, 5000),
    osm(
      'way/102',
      'St.-Jakobs-Kirche',
      49.37653,
      10.17925,
      { amenity: 'place_of_worship', building: 'church', wikidata: 'Q691456' },
      { wikidataId: 'Q691456' },
    ),
    wd('Q691456', 'St. Jakob', 49.3765, 10.1792, 14, ['church building']),
    osm('way/103', 'Rathaus Rothenburg', 49.37812, 10.17956, {
      amenity: 'townhall',
      tourism: 'attraction',
      historic: 'building',
    }),
    wp('de', 'Rathaus (Rothenburg ob der Tauber)', 49.37812, 10.17956, 9000),
    osm('way/104', 'Stadtmauer', 49.3771, 10.1741, { historic: 'citywalls' }),
    wd('Q1234', 'Rothenburg Town Wall', 49.3771, 10.1741, 6, ['city wall']),
    osm('way/105', 'Burggarten', 49.37535, 10.17225, { leisure: 'garden' }),
    osm('node/106', 'Kriminalmuseum', 49.37588, 10.18, { tourism: 'museum' }),
    osm('node/107', 'Gasthaus Zur Linde', 49.3775, 10.1805, { amenity: 'restaurant' }),
    osm('node/108', 'Marktplatz-Brunnen', 49.3781, 10.1797, { amenity: 'fountain', historic: 'fountain' }),
  ],
};

export const rural: RegionFixture = {
  key: 'rural',
  label: 'Ländlich (Uckermark, Dorf)',
  center: { lat: 53.1, lng: 13.75 },
  countryCode: 'DE',
  expectedStatus: 'low_content',
  expectedMerged: { min: 3, max: 4 },
  raw: [
    osm('node/201', 'Feldsteinkirche', 53.1011, 13.7502, { amenity: 'place_of_worship', building: 'church' }),
    osm('node/202', 'Dorfteich', 53.0999, 13.7488, { natural: 'water' }),
    osm('node/203', 'Hofladen', 53.1021, 13.7523, { shop: 'farm' }),
    osm('node/204', 'Bank mit Aussicht', 53.1033, 13.7561, { tourism: 'viewpoint' }),
  ],
};

export const kyoto: RegionFixture = {
  key: 'kyoto',
  label: 'Nicht-deutschsprachig (Kyoto, Japan)',
  center: { lat: 35.0037, lng: 135.7788 },
  countryCode: 'JP',
  expectedStatus: 'ready',
  expectedMerged: { min: 8, max: 10 },
  raw: [
    osm(
      'way/301',
      '八坂神社',
      35.00366,
      135.77857,
      { amenity: 'place_of_worship', religion: 'shinto', wikidata: 'Q1136528' },
      { wikidataId: 'Q1136528', names: { en: 'Yasaka Shrine', ja: '八坂神社' } },
    ),
    wd('Q1136528', 'Yasaka Shrine', 35.0037, 135.7786, 40, ['Shinto shrine']),
    wp('ja', '八坂神社', 35.00366, 135.77857, 70000),
    wp('en', 'Yasaka Shrine', 35.00366, 135.77857, 20000),
    osm(
      'way/302',
      '清水寺',
      34.99485,
      135.78505,
      { amenity: 'place_of_worship', religion: 'buddhist', tourism: 'attraction', heritage: '1' },
      { names: { en: 'Kiyomizu-dera', ja: '清水寺' } },
    ),
    wp('ja', '清水寺', 34.99485, 135.78505, 90000),
    wd('Q193706', 'Kiyomizu-dera', 34.9948, 135.785, 65, ['Buddhist temple']),
    osm('way/303', '円山公園', 35.0036, 135.7809, { leisure: 'park' }, { names: { en: 'Maruyama Park' } }),
    wd('Q11526873', 'Maruyama Park', 35.0036, 135.781, 8, ['urban park']),
    osm(
      'way/304',
      '祇園',
      35.0037,
      135.7756,
      { tourism: 'attraction', historic: 'district' },
      { names: { en: 'Gion' } },
    ),
    wp('en', 'Gion', 35.0037, 135.7756, 30000),
    osm(
      'node/305',
      '花見小路',
      35.0029,
      135.7745,
      { tourism: 'attraction' },
      { names: { en: 'Hanamikoji Street' } },
    ),
    osm('node/306', '一力茶屋', 35.0038, 135.7742, { amenity: 'restaurant' }),
    osm(
      'node/307',
      '京都市美術館',
      35.0129,
      135.7827,
      { tourism: 'museum' },
      { names: { en: 'Kyoto City Museum of Art' } },
    ),
    osm('node/308', '居酒屋 花', 35.0041, 135.7751, { amenity: 'bar' }),
  ],
};

export const REGION_FIXTURES: RegionFixture[] = [berlin, rothenburg, rural, kyoto];
