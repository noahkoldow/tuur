import { describe, expect, it } from 'vitest';
import { ImageRefSchema } from '../schemas';
import { buildPois } from '../poi/pipeline';
import { isFreeLicense } from '../poi/images';
import { syntheticRawPois } from '../demo/synthetic';
import { berlin, kyoto, rural } from './regions';
import { FIXTURE_IMAGES } from './place-photos';

describe('source-matched demo place photos', () => {
  it('shows real landmark photos in the demo ingest, with source and license links', () => {
    const { pois } = buildPois(berlin.raw, { now: 1, images: FIXTURE_IMAGES });
    const gate = pois.find((poi) => poi.sources.wikidataId === 'Q82425');
    expect(gate?.imageRefs[0]?.file).toBe('File:Brandenburger Tor abends.jpg');
    expect(pois.filter((poi) => poi.imageRefs.length).length).toBeGreaterThanOrEqual(14);
    expect(
      buildPois(kyoto.raw, { now: 1, images: FIXTURE_IMAGES }).pois.filter((poi) => poi.imageRefs.length)
        .length,
    ).toBeGreaterThanOrEqual(7);
    for (const image of FIXTURE_IMAGES.values()) {
      expect(ImageRefSchema.safeParse(image).success).toBe(true);
      expect(isFreeLicense(image.license)).toBe(true);
      expect(image.author).toBeTruthy();
      expect(image.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it('does not attach landmark photos to invented or generic places', () => {
    for (const raw of [rural.raw, syntheticRawPois('u33dbf')]) {
      expect(
        buildPois(raw, { now: 1, images: FIXTURE_IMAGES }).pois.every((poi) => poi.imageRefs.length === 0),
      ).toBe(true);
    }
  });

  it('uses a second source photo when an earlier source file is unavailable', () => {
    const gate = berlin.raw.find((poi) => poi.sourceId === 'way/1')!;
    const { pois } = buildPois(
      [
        { ...gate, imageFile: 'File:Removed image.jpg' },
        { ...gate, source: 'wikidata', sourceId: 'Q82425' },
      ],
      { now: 1, images: FIXTURE_IMAGES },
    );
    expect(pois[0]?.imageRefs[0]?.file).toBe('File:Brandenburger Tor abends.jpg');
  });
});
