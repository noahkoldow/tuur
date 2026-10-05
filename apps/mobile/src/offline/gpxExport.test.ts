import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePolyline, OfflineManifestSchema, type OfflineManifest } from '@tuur/shared';
import { MemoryFileStore } from './fileStore';
import { downloadedTourGpx, GpxExportUnavailableError } from './gpxExport';
import { OfflineLibrary } from './library';

const now = 1_800_000_000_000;
const saved = (): OfflineManifest =>
  OfflineManifestSchema.parse({
    version: 1,
    tourId: 'planned_saved',
    lang: 'de',
    complete: true,
    createdAt: now - 1000,
    bytes: 123,
    access: { tourId: 'planned_saved', mode: 'planned', grantedAt: now - 1000, expiresAt: null },
    tour: {
      id: 'planned_saved',
      placeId: 'berlin',
      source: 'planned',
      version: 1,
      template: 'planned',
      profile: 'foot-walking',
      themes: [],
      stops: [
        {
          poiId: 'gate',
          order: 0,
          name: 'Gate',
          location: { lat: 52.5163, lng: 13.3777 },
          dwellMinutes: 5,
          walkMinutesFromPrev: 0,
        },
      ],
      path: encodePolyline([
        [52.5163, 13.3777],
        [52.517, 13.378],
      ]),
      durationMinutes: 30,
      walkMinutes: 20,
      distanceMeters: 1500,
      bbox: { south: 52.51, west: 13.37, north: 52.52, east: 13.38 },
      expiresAt: now - 1,
      texts: Object.fromEntries(
        [
          ['en', 'English title'],
          ['de', 'Gespeicherter Spaziergang'],
        ].map(([lang, title]) => [
          lang,
          {
            title,
            teaser: 'private teaser',
            description: 'private description',
            intro: 'intro',
            transitions: [],
            outro: 'outro',
          },
        ]),
      ),
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
    narrations: {
      'gate:short': {
        key: 'private-narration-key',
        title: 'Private narration',
        text: 'Private audio transcript',
        paragraphs: [],
        audioDurationMs: 1000,
        audioFile: 'downloads/planned_saved/private-audio.mp3',
        images: [],
      },
    },
    transitions: {},
  });

async function setup(manifest = saved()) {
  const files = new MemoryFileStore();
  files.offline = true;
  const library = new OfflineLibrary(files, () => now, true);
  await library.bindOwner('owner-a', () => library.clear());
  await library.save(manifest);
  return { files, library, manifest };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network is unavailable');
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('GPX access to actual offline downloads', () => {
  it('exports the stored language and route offline without changing the download or leaking audio/access fields', async () => {
    const { files, library, manifest } = await setup();
    const download = vi.spyOn(files, 'download');
    const before = structuredClone([...files.files]);
    const out = downloadedTourGpx(library, manifest.tourId);
    expect(out.xml).toContain('<name>Gespeicherter Spaziergang</name>');
    expect(out.xml).toContain('<trkpt lat="52.5163" lon="13.3777"/>');
    expect(out.xml).not.toMatch(/private|owner-a|expiresAt|grantedAt|audioFile|English title/i);
    expect(out.fileName).toMatch(/\.gpx$/);
    expect([...files.files]).toEqual(before);
    expect(download).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: 'partial download',
      change: (m: OfflineManifest) => {
        m.complete = false;
      },
    },
    {
      reason: 'expired receipt',
      change: (m: OfflineManifest) => {
        m.access!.expiresAt = now - 1;
      },
    },
    {
      reason: 'receipt expiring exactly now',
      change: (m: OfflineManifest) => {
        m.access!.expiresAt = now;
      },
    },
    {
      reason: 'receipt for another tour',
      change: (m: OfflineManifest) => {
        m.access!.tourId = 'another';
      },
    },
    {
      reason: 'receipt for another mode',
      change: (m: OfflineManifest) => {
        m.access!.mode = 'tour';
      },
    },
    {
      reason: 'planned download without receipt',
      change: (m: OfflineManifest) => {
        delete m.access;
      },
    },
  ])('rejects $reason through the existing OfflineLibrary gate', async ({ change }) => {
    const manifest = saved();
    change(manifest);
    const { library } = await setup(manifest);
    expect(() => downloadedTourGpx(library, manifest.tourId)).toThrow(GpxExportUnavailableError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a missing download instead of fetching the tour from the backend', async () => {
    const { library } = await setup();
    expect(() => downloadedTourGpx(library, 'missing')).toThrow(GpxExportUnavailableError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps persisted downloads hidden until their owner has been restored', async () => {
    const { files, manifest } = await setup();
    const restored = new OfflineLibrary(files, () => now, true);
    await restored.load();
    expect(() => downloadedTourGpx(restored, manifest.tourId)).toThrow(GpxExportUnavailableError);
    await restored.bindOwner('owner-a', () => restored.clear());
    expect(downloadedTourGpx(restored, manifest.tourId).xml).toContain('<trkseg>');
  });

  it('revokes export immediately on account change and never exposes old downloads to the new owner', async () => {
    const { library, manifest } = await setup();
    expect(downloadedTourGpx(library, manifest.tourId).xml).toContain('<trkseg>');
    library.hideForAccountChange();
    expect(() => downloadedTourGpx(library, manifest.tourId)).toThrow(GpxExportUnavailableError);
    const switching = library.bindOwner('owner-b', () => library.clear());
    expect(() => downloadedTourGpx(library, manifest.tourId)).toThrow(GpxExportUnavailableError);
    await switching;
    expect(() => downloadedTourGpx(library, manifest.tourId)).toThrow(GpxExportUnavailableError);
  });

  it('preserves the existing legacy ready-made download policy', async () => {
    const manifest = saved();
    manifest.tour.source = 'auto';
    manifest.tour.template = 'highlights60';
    delete manifest.access;
    const { library } = await setup(manifest);
    expect(downloadedTourGpx(library, manifest.tourId).xml).toContain('<trkseg>');
  });
});
