import { describe, expect, it } from 'vitest';
import { attributionUrl, photoAttribution } from './image-attribution';

describe('photo source and license links', () => {
  it('preserves the source and exact license from metadata, even for offline photos', () => {
    expect(
      photoAttribution({
        author: 'Photographer',
        license: 'CC BY-SA 3.0 DE',
        licenseUrl: '//creativecommons.org/licenses/by-sa/3.0/de/',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Berlin.jpg',
      }),
    ).toMatchObject({
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/de/',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Berlin.jpg',
      author: 'Photographer',
    });
  });

  it('recovers source and version-specific licenses for older cached image records', () => {
    expect(photoAttribution({ file: 'File:Berlin Tower.jpg', license: 'CC BY-SA 4.0' })).toMatchObject({
      sourceUrl: 'https://commons.wikimedia.org/wiki/File%3ABerlin_Tower.jpg',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
    expect(photoAttribution({ license: 'CC BY 2.0' }).licenseUrl).toBe(
      'https://creativecommons.org/licenses/by/2.0/',
    );
    expect(photoAttribution({ license: 'CC0' }).licenseUrl).toBe(
      'https://creativecommons.org/publicdomain/zero/1.0/',
    );
  });

  it('does not invent a license for ambiguous or unrecognized license names', () => {
    expect(photoAttribution({ license: 'CC BY-SA' }).licenseUrl).toBeUndefined();
    expect(photoAttribution({ license: 'CC BY-SA 3.0 DE' }).licenseUrl).toBeUndefined();
    expect(photoAttribution({ license: 'GFDL' }).licenseUrl).toBeUndefined();
  });

  it('rejects executable, local, or credential-bearing attribution URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///cached/image.jpg',
      'https://user:secret@example.com',
      'invalid',
    ])
      expect(attributionUrl(url)).toBeUndefined();
  });
});
