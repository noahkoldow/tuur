import { describe, expect, it } from 'vitest';
import { rateLimitDecision } from '../rateLimit';
import { buildCommonsQuery, isFreeLicense, parseCommonsImages } from './images';
import { sourceLangsFor } from './langs';
import { parseWikipediaGenerator } from './raw';

describe('commons images', () => {
  const page = (license: string) => ({
    query: {
      pages: {
        '1': {
          title: 'File:Dom.jpg',
          imageinfo: [
            {
              url: 'https://upload.wikimedia.org/x.jpg',
              thumburl: 'https://upload.wikimedia.org/thumb.jpg',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:Dom.jpg',
              extmetadata: {
                LicenseShortName: { value: license },
                Artist: { value: '<a href="//x">Jane &amp; Doe</a>' },
                LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
              },
            },
          ],
        },
      },
    },
  });

  it('keeps freely licensed images with stripped attribution', () => {
    const m = parseCommonsImages(page('CC BY-SA 4.0'));
    expect(m.get('File:Dom.jpg')).toMatchObject({
      author: 'Jane & Doe',
      license: 'CC BY-SA 4.0',
      url: 'https://upload.wikimedia.org/thumb.jpg',
    });
  });

  it('drops non-free or license-less images', () => {
    expect(parseCommonsImages(page('Fair use')).size).toBe(0);
    expect(isFreeLicense('Public domain')).toBe(true);
    expect(isFreeLicense('All rights reserved')).toBe(false);
  });

  it('builds a titles query', () => {
    expect(buildCommonsQuery(['File:A.jpg', 'File:B.jpg'])).toContain('titles=File%3AA.jpg%7CFile%3AB.jpg');
  });
});

describe('wikipedia generator', () => {
  it('extracts coordinates, length and wikidata id and skips disambiguations', () => {
    const out = parseWikipediaGenerator(
      {
        query: {
          pages: {
            '1': {
              title: 'Dom',
              length: 12000,
              coordinates: [{ lat: 1, lon: 2 }],
              pageprops: { wikibase_item: 'Q7' },
            },
            '2': {
              title: 'Dom (Begriffsklärung)',
              coordinates: [{ lat: 1, lon: 2 }],
              pageprops: { disambiguation: '' },
            },
            '3': { title: 'No coords' },
          },
        },
      },
      'de',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ wikidataId: 'Q7', wikipedia: [{ lang: 'de', length: 12000 }] });
  });
});

describe('source languages', () => {
  it('puts the local language first then de/en without duplicates', () => {
    expect(sourceLangsFor('JP')).toEqual(['ja', 'de', 'en']);
    expect(sourceLangsFor('de')).toEqual(['de', 'en']);
    expect(sourceLangsFor('ZZ')).toEqual(['de', 'en']);
  });
});

describe('rateLimitDecision', () => {
  const rule = { limit: 2, windowMs: 1000 };
  it('allows up to the limit then blocks with retry hint, then resets', () => {
    const a = rateLimitDecision(undefined, 0, rule);
    const b = rateLimitDecision(a.next, 10, rule);
    const c = rateLimitDecision(b.next, 20, rule);
    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, false]);
    expect(c.retryAfterMs).toBe(980);
    expect(rateLimitDecision(c.next, 1000, rule).allowed).toBe(true);
  });
});
