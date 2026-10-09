import { describe, expect, it } from 'vitest';
import { PoiSchema } from '@tuur/shared';
import { localFactSheet } from './factSheetLocal';

const poi = (osmTags: Record<string, string>, extract?: string) =>
  PoiSchema.parse({
    id: 'p',
    name: 'Turm',
    location: { lat: 52, lng: 13 },
    geohash: 'u33dbb',
    tile: 'u33dbb',
    interests: ['history'],
    score: 1,
    baseScore: 1,
    rawScore: 1,
    osmTags,
    sources: { wikipedia: extract ? [{ lang: 'de', title: 'Turm', length: 10, extract }] : [] },
    updatedAt: 1,
  });

describe('localFactSheet', () => {
  it('structures Wikipedia text and OSM tags without AI', () => {
    const sheet = localFactSheet(
      poi(
        { start_date: '1910', opening_hours: 'Mo-Su 10:00-18:00' },
        'Der Turm ist ein Aussichtsturm. Er wurde 1910 errichtet. Er ist bekannt für die Aussicht.',
      ),
      'de-DE',
    )!;
    expect(sheet.summary).toBe('Der Turm ist ein Aussichtsturm.');
    expect(sheet.facts.map((f) => f.key)).toEqual(['built', 'openingHours']);
    expect(sheet.sections.map((s) => s.kind)).toEqual(['history', 'worth']);
  });
  it('is undefined without any text', () => {
    expect(localFactSheet(poi({}), 'en')).toBeUndefined();
    expect(localFactSheet(undefined, 'en')).toBeUndefined();
  });
});
