import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePolyline, OfflineManifestSchema, type OfflineManifest } from '@tuur/shared';
import { createDemoBackend } from '../backend/demoBackend';
import type { UserInfo } from '../backend/types';
import { MemoryFileStore } from './fileStore';
import { manifestPath, OfflineLibrary } from './library';
import { withOfflineFirst } from './offlineBackend';
import { loadDownloadedTour } from './openDownloadedTour';

const now = 1_800_000_000_000;
const owner: UserInfo = { uid: 'owner-a', isAnonymous: false, phoneNumber: '+491701234567' };

function saved(): OfflineManifest {
  return OfflineManifestSchema.parse({
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
      stops: ['gate', 'garden'].map((poiId, order) => ({
        poiId,
        order,
        name: poiId,
        location: { lat: 52.5163 + order * 0.001, lng: 13.3777 },
        dwellMinutes: 5,
        walkMinutesFromPrev: order * 2,
      })),
      path: encodePolyline([
        [52.5163, 13.3777],
        [52.5173, 13.3777],
      ]),
      durationMinutes: 30,
      walkMinutes: 20,
      distanceMeters: 1500,
      bbox: { south: 52.51, west: 13.37, north: 52.52, east: 13.38 },
      expiresAt: now - 1,
      texts: {
        de: {
          title: 'Gespeicherter Spaziergang',
          teaser: 'Teaser',
          description: 'Beschreibung',
          intro: 'Anfang',
          transitions: [],
          outro: 'Ende',
        },
      },
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
    narrations: Object.fromEntries(
      ['gate', 'garden'].flatMap((poiId) =>
        ['short', 'medium', 'long'].map((tier) => [
          `${poiId}:${tier}`,
          {
            key: `${poiId}-${tier}`,
            title: poiId,
            text: 'Gespeicherte Geschichte',
            paragraphs: [],
            audioDurationMs: 1000,
            audioFile: `downloads/planned_saved/${poiId}-${tier}.mp3`,
            images: [],
          },
        ]),
      ),
    ),
    transitions: {
      'gate:garden': {
        key: 'gate-garden',
        text: 'Zum Garten',
        audioDurationMs: 1000,
        audioFile: 'downloads/planned_saved/gate-garden.mp3',
      },
    },
  });
}

async function setup(manifest = saved()) {
  const files = new MemoryFileStore();
  files.offline = true;
  const previous = new OfflineLibrary(files, () => now, true);
  await previous.bindOwner(owner.uid, () => previous.clear());
  await previous.save(manifest);
  for (const audio of [...Object.values(manifest.narrations), ...Object.values(manifest.transitions)])
    files.files.set(audio.audioFile, 100);

  // A fresh process: neither the manifest index nor its owner is hydrated yet.
  const library = new OfflineLibrary(files, () => now, true);
  let current: UserInfo | null = null;
  const base = createDemoBackend({ latencyMs: 0 });
  base.auth.current = () => current;
  base.auth.ensureSignedIn = async () => (current ??= owner);
  const remoteTour = vi.spyOn(base, 'getTour').mockRejectedValue(new Error('Network is unavailable'));
  const backend = withOfflineFirst(base, library, files);
  const options = { auth: backend.auth, library, files, tourId: manifest.tourId };
  return {
    ...options,
    options,
    manifest,
    remoteTour,
    changeOwner: (user: UserInfo | null) => (current = user),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network is unavailable')));
});
afterEach(() => vi.unstubAllGlobals());

describe('opening a downloaded tour in tuur', () => {
  it('restores the owned local snapshot on cold start with no network, map pack, or renewed purchase', async () => {
    const { options, library, manifest, remoteTour } = await setup();
    expect(library.get(manifest.tourId)).toBeUndefined();
    const result = await loadDownloadedTour(options);
    expect(result).toEqual({ tour: manifest.tour, lang: 'de', complete: true });
    expect(result.tour.expiresAt).toBeLessThan(now);
    expect(library.available(manifest.tourId)).toBeDefined();
    expect(remoteTour).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a partial saved itinerary for repair without claiming it is playable offline', async () => {
    const manifest = saved();
    manifest.complete = false;
    manifest.narrations = {};
    const { options, files, library } = await setup(manifest);
    const exists = vi.spyOn(files, 'exists');
    expect(await loadDownloadedTour(options)).toEqual({ tour: manifest.tour, lang: 'de', complete: false });
    expect(library.available(manifest.tourId)).toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it.each(['gate-short.mp3', 'gate-garden.mp3'])(
    'persists a repair state when %s is missing',
    async (file) => {
      const { options, files, library, manifest } = await setup();
      await files.remove(`downloads/planned_saved/${file}`);
      expect((await loadDownloadedTour(options)).complete).toBe(false);
      expect(library.available(manifest.tourId)).toBeUndefined();
      expect(library.list()[0]?.complete).toBe(false);
      const persisted = JSON.parse((await files.readText(manifestPath(manifest.tourId)))!);
      expect(persisted.complete).toBe(false);
      expect(persisted.access).toEqual(manifest.access);
      expect(persisted.tour).toEqual(manifest.tour);
    },
  );

  it.each(['narration', 'transition'])(
    'detects missing %s metadata even if complete was persisted',
    async (kind) => {
      const manifest = saved();
      if (kind === 'narration') delete manifest.narrations['gate:long'];
      else manifest.transitions = {};
      const { options } = await setup(manifest);
      expect((await loadDownloadedTour(options)).complete).toBe(false);
    },
  );

  it('does not turn an expired receipt into playback access when showing its saved details', async () => {
    const manifest = saved();
    manifest.access!.expiresAt = now - 1;
    const { options, library } = await setup(manifest);
    expect((await loadDownloadedTour(options)).tour.id).toBe(manifest.tourId);
    expect(library.available(manifest.tourId)).toBeUndefined();
  });

  it.each(['missing', 'corrupt'])(
    'rejects a %s local snapshot without falling back to the network',
    async (kind) => {
      const { options, files, manifest, remoteTour } = await setup();
      if (kind === 'missing') await files.remove(manifestPath(manifest.tourId));
      else await files.writeText(manifestPath(manifest.tourId), '{broken');
      await expect(loadDownloadedTour(options)).rejects.toMatchObject({ code: 'not_found' });
      expect(remoteTour).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("never opens the previous account's download after cold-starting as another owner", async () => {
    const { options, library, changeOwner } = await setup();
    changeOwner({ ...owner, uid: 'owner-b' });
    await expect(loadDownloadedTour(options)).rejects.toMatchObject({ code: 'not_found' });
    expect(library.list()).toEqual([]);
  });

  it('rejects an account change during the file check before returning or rewriting the snapshot', async () => {
    const { options, files, library, changeOwner, manifest } = await setup();
    const save = vi.spyOn(files, 'writeText');
    vi.spyOn(files, 'exists').mockImplementationOnce(async () => {
      changeOwner(null);
      library.hideForAccountChange();
      return false;
    });
    await expect(loadDownloadedTour(options)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(save.mock.calls.filter(([path]) => path === manifestPath(manifest.tourId))).toEqual([]);
    expect(library.list()).toEqual([]);
  });

  it('finishes an integrity write before switching owners, so it cannot resurrect the old download', async () => {
    const { options, files, library, changeOwner, manifest } = await setup();
    await files.remove('downloads/planned_saved/gate-short.mp3');
    let switching: Promise<void> | undefined;
    const write = files.writeText.bind(files);
    vi.spyOn(files, 'writeText').mockImplementation(async (path, value) => {
      if (path === manifestPath(manifest.tourId)) {
        changeOwner({ ...owner, uid: 'owner-b' });
        switching = library.bindOwner('owner-b', () => library.clear());
      }
      await write(path, value);
    });
    await expect(loadDownloadedTour(options)).rejects.toMatchObject({ code: 'unauthenticated' });
    await switching;
    expect(library.list()).toEqual([]);
    expect(await files.readText(manifestPath(manifest.tourId))).toBeNull();
  });

  it.each(['repair', 'remove', 'clear'])(
    'does not overwrite a concurrent %s after an integrity write',
    async (action) => {
      const { options, files, library, manifest } = await setup();
      await files.remove('downloads/planned_saved/gate-short.mp3');
      let beginWrite!: () => void;
      const started = new Promise<void>((resolve) => (beginWrite = resolve));
      let resumeWrite!: () => void;
      const released = new Promise<void>((resolve) => (resumeWrite = resolve));
      const write = files.writeText.bind(files);
      let delayed = false;
      vi.spyOn(files, 'writeText').mockImplementation(async (path, value) => {
        if (path === manifestPath(manifest.tourId) && !delayed) {
          delayed = true;
          beginWrite();
          await released;
        }
        await write(path, value);
      });
      const opening = loadDownloadedTour(options).catch(() => undefined);
      await started;
      const repaired = { ...manifest, bytes: 456, complete: true };
      const mutation =
        action === 'repair'
          ? library.save(repaired)
          : action === 'remove'
            ? library.remove(manifest.tourId)
            : library.clear();
      resumeWrite();
      await Promise.all([opening, mutation]);
      const raw = await files.readText(manifestPath(manifest.tourId));
      if (action === 'repair') {
        expect(JSON.parse(raw!)).toEqual(repaired);
        expect(library.get(manifest.tourId)).toEqual(repaired);
      } else {
        expect(raw).toBeNull();
        expect(library.get(manifest.tourId)).toBeUndefined();
      }
    },
  );

  it('allows the same owner to retry after an integrity manifest write fails', async () => {
    const { options, files, library, manifest } = await setup();
    await files.remove('downloads/planned_saved/gate-short.mp3');
    const write = files.writeText.bind(files);
    let failed = false;
    vi.spyOn(files, 'writeText').mockImplementation(async (path, value) => {
      if (path === manifestPath(manifest.tourId) && !failed) {
        failed = true;
        throw new Error('Disk write failed');
      }
      await write(path, value);
    });
    await expect(loadDownloadedTour(options)).rejects.toThrow('Disk write failed');
    await expect(options.auth.ensureSignedIn()).resolves.toEqual(owner);
    expect(library.get(manifest.tourId)?.complete).toBe(true);
    expect((await loadDownloadedTour(options)).complete).toBe(false);
  });
});
