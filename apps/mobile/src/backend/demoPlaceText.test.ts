import { describe, expect, it, vi } from 'vitest';
import { REGION_FIXTURES, buildPois, encodeGeohash } from '@tuur/shared';
import { withDemoPlaceText } from './demoPlaceText';
import { placeInformation } from '../components/placeDetails';
import { createDemoBackend } from './demoBackend';
import { withOfflineFirst } from '../offline/offlineBackend';
import { MemoryFileStore } from '../offline/fileStore';
import { OfflineLibrary } from '../offline/library';

describe('demo free place information', () => {
  it('provides explicitly labeled DE/EN information for every fixture place, including Brandenburg Gate', () => {
    for (const region of REGION_FIXTURES) {
      const { pois } = buildPois(region.raw, { now: 1, precision: 6 });
      for (const source of pois) {
        const place = withDemoPlaceText(source);
        for (const lang of ['de', 'en']) {
          const info = placeInformation(place, lang)!;
          expect(info.text).toContain(place.name);
          expect(info.sourceName).toBe('tuur Demo');
          expect(info.sourceUrl).toBeUndefined();
        }
      }
    }
  });
  it('preserves stored descriptions instead of replacing them with preview copy', () => {
    const source = buildPois(REGION_FIXTURES[0]!.raw, { now: 1, precision: 6 }).pois[0]!;
    source.osmTags.description = 'Existing local description.';
    expect(withDemoPlaceText(source)).toBe(source);
  });
  it('reads through the app backend and offline wrapper without audio, purchases or a time lease', async () => {
    const base = createDemoBackend({ latencyMs: 0, enforceAccess: true });
    await base.auth.signInWithEmail('reader@example.test', 'password', false);
    const center = REGION_FIXTURES[0]!.center;
    const tile = encodeGeohash(center.lat, center.lng, 6);
    await base.ensureArea(tile);
    await base.getAutoTours(tile, 'de');
    const places = await base.getPois([tile]);
    const gate = places.find((place) => place.name === 'Brandenburger Tor')!;
    expect(gate).toBeDefined();
    const narration = vi.spyOn(base, 'getNarration');
    const transition = vi.spyOn(base, 'getTransition');
    const spend = vi.spyOn(base, 'spendCredit');
    const lease = vi.spyOn(base, 'updateTourTime');
    const files = new MemoryFileStore();
    const backend = withOfflineFirst(base, new OfflineLibrary(files), files);
    const loaded = await backend.getPoiText({ poiId: gate.id, lang: 'de' });
    expect(placeInformation(loaded, 'de')?.text).toContain('Brandenburger Tor');
    expect(narration).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
    expect(lease).not.toHaveBeenCalled();
  });
});
