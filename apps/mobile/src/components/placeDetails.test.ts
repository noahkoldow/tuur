import { describe, expect, it } from 'vitest';
import { PoiSchema, type WikipediaRef } from '@tuur/shared';
import { placeSummary } from './placeDetails';

const place = (wikipedia: WikipediaRef[]) =>
  PoiSchema.parse({
    id: 'tower',
    name: 'Fernsehturm',
    location: { lat: 52.5208, lng: 13.4094 },
    geohash: 'u33dc',
    tile: 'u33dc',
    interests: ['architecture'],
    rawScore: 90,
    baseScore: 90,
    score: 90,
    updatedAt: 1,
    sources: { wikipedia },
  });
const ref = (lang: string, extract?: string): WikipediaRef => ({
  lang,
  title: 'Berliner Fernsehturm',
  length: 2000,
  ...(extract === undefined ? {} : { extract }),
});

describe('place summary', () => {
  it('prefers the base UI language independently of source order', () => {
    const poi = place([ref('en', 'A television tower.'), ref('de', 'Ein Fernsehturm in Berlin.')]);

    expect(placeSummary(poi, 'de-DE')).toEqual({
      text: 'Ein Fernsehturm in Berlin.',
      sourceUrl: 'https://de.wikipedia.org/wiki/Berliner_Fernsehturm',
    });
  });

  it('falls back to English, then another available language', () => {
    const french = ref('fr', 'Une tour de télévision.');
    expect(placeSummary(place([french, ref('en', 'A television tower.')]), 'ja')?.text).toBe(
      'A television tower.',
    );
    expect(placeSummary(place([french]), 'ja')?.text).toBe('Une tour de télévision.');
  });

  it('ignores missing, blank or markup-only extracts and does not invent a description', () => {
    expect(placeSummary(place([]), 'de')).toBeUndefined();
    expect(placeSummary(place([ref('de'), ref('en', ' \n '), ref('fr', '<p></p>')]), 'de')).toBeUndefined();
    expect(placeSummary(place([ref('de', '  '), ref('en', 'A tower.')]), 'de')?.text).toBe('A tower.');
  });

  it('cleans HTML, Wikipedia markup, entities and citations', () => {
    const extract =
      "<p>Der <b>Fernsehturm</b> liegt in [[Berlin|Berlin]] &amp; ist ''sichtbar''.[1]</p>\n" +
      '<ref>Source details</ref> Er ist &#51;68&nbsp;m hoch.<script>hidden()</script>';
    expect(placeSummary(place([ref('de', extract)]), 'de')?.text).toBe(
      'Der Fernsehturm liegt in Berlin & ist sichtbar. Er ist 368 m hoch.',
    );
  });

  it('keeps complete opening sentences when later details exceed the card length', () => {
    const first = 'Der Fernsehturm steht in Berlin. Er prägt die Skyline.';
    const extract = `${first} ${'Dieser weitere Satz ist sehr lang und enthält viele Details '.repeat(5)}.`;
    expect(placeSummary(place([ref('de', extract)]), 'de')?.text).toBe(first);
  });

  it('truncates an oversized first sentence at a word boundary', () => {
    const extract = 'Ein Fernsehturm mit ' + 'zahlreichen baulichen Besonderheiten '.repeat(10) + '.';
    const text = placeSummary(place([ref('de', extract)]), 'de')!.text;
    expect(text.length).toBeLessThanOrEqual(190);
    expect(text.endsWith('…')).toBe(true);
    expect(extract.startsWith(text.slice(0, -1) + ' ')).toBe(true);
  });

  it('preserves the source URL of the chosen extract', () => {
    expect(
      placeSummary(
        place([{ ...ref('en', 'A tower.'), url: 'https://en.wikipedia.org/wiki/Fernsehturm_Berlin' }]),
        'en',
      )?.sourceUrl,
    ).toBe('https://en.wikipedia.org/wiki/Fernsehturm_Berlin');
  });

  it('encodes article titles when deriving a source and rejects unsafe URL or locale values', () => {
    expect(
      placeSummary(
        place([{ ...ref('de', 'Ein Ort.'), title: 'Ort / Café #1', url: 'javascript:alert(1)' }]),
        'de',
      )?.sourceUrl,
    ).toBe('https://de.wikipedia.org/wiki/Ort_%2F_Caf%C3%A9_%231');
    expect(placeSummary(place([ref('de/evil', 'Ein Ort.')]), 'de')).toEqual({ text: 'Ein Ort.' });
  });
});
