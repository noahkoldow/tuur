import { describe, expect, it } from 'vitest';
import {
  REGION_FIXTURES,
  OfflineManifestSchema,
  createTourScript,
  narrationContextFor,
  decodePolyline,
  destinationPoint,
  encodeGeohash,
  type LatLng,
  type LengthTier,
  type Tour,
} from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { BackendError, type Backend, type UserInfo } from '../backend/types';
import { GuideRuntime } from '../guide/runtime';
import { SimulatedLocationSource } from '../location/simulated';
import { FakeClock } from '../testing/fakeClock';
import { MemoryFileStore } from './fileStore';
import { OfflineLibrary } from './library';
import { DownloadError, DownloadManager } from './manager';
import { NoopMapPackManager, UnavailableMapPackManager } from './mapPacks';
import { withOfflineFirst } from './offlineBackend';
import { downloadedTourScript } from './downloadScript';

const berlin = REGION_FIXTURES[0]!;

async function setup() {
  const backend = createDemoBackend({ latencyMs: 0 });
  backend.demo!.grantSubscription();
  await backend.auth.signInWithEmail('test@example.com', 'password', true);
  await backend.auth.confirmPhoneVerification(
    await backend.auth.requestPhoneVerification('+491701234567'),
    '000000',
  );
  const tile = encodeGeohash(berlin.center.lat, berlin.center.lng, 6);
  await backend.ensureArea(tile);
  for (let i = 0; i < 50; i++) {
    let ok = false;
    backend.watchArea(tile, (a) => (ok = a?.status === 'ready'))();
    if (ok) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const res = await backend.getAutoTours(tile, 'de');
  const tour = (await backend.getTour(res.tours[0]!.id))!;
  const files = new MemoryFileStore();
  const library = new OfflineLibrary(files);
  const maps = new NoopMapPackManager();
  const calls = { narration: 0 };
  const counting: Backend = {
    ...backend,
    getNarration: async (r) => {
      calls.narration++;
      return backend.getNarration(r);
    },
  };
  const manager = new DownloadManager({ backend: counting, files, maps, library, concurrency: 2 });
  return { backend, tour, files, library, maps, manager, calls };
}

describe('offline downloads', () => {
  it('preserves a complete archive when a replacement has no remaining download minutes', async () => {
    const { backend, tour, files, library, maps, manager } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    const denied = new DownloadManager({
      backend: {
        ...backend,
        prepareTourDownload: async () => {
          throw new BackendError('locked', 'No minutes left', undefined, 'tour_time_exhausted');
        },
      },
      files,
      library,
      maps,
    });
    await expect(denied.start(tour, 'en', () => undefined)).rejects.toMatchObject({
      reason: 'tour_time_exhausted',
    });
    expect(library.available(tour.id)).toEqual(saved);
    const restarted = new OfflineLibrary(files);
    await restarted.load();
    expect(restarted.available(tour.id)).toEqual(OfflineManifestSchema.parse(saved));
    for (const narration of Object.values(saved.narrations))
      expect(await files.exists(narration.audioFile)).toBe(true);
  });

  it('reuses a lost reservation response across restart without replacing the old archive or changing voice', async () => {
    const { backend, tour, files, library, maps, manager } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    const reserved: (string | undefined)[] = [];
    const voices: (string | undefined)[] = [];
    let dropResponse = true;
    let createdIds = 0;
    let voice = 'classic';
    const source: Backend = {
      ...backend,
      prepareTourDownload: async (...args) => {
        reserved.push(args[2]);
        const result = await backend.prepareTourDownload(...args);
        if (dropResponse) {
          dropResponse = false;
          throw new BackendError('network', 'Response lost');
        }
        return result;
      },
      getNarration: async (req) => {
        voices.push(req.voice);
        voice = 'changed';
        return backend.getNarration(req);
      },
      getTransition: async (req) => {
        voices.push(req.voice);
        return backend.getTransition(req);
      },
    };
    const deps = {
      backend: source,
      files,
      maps,
      library,
      voice: () => voice,
      newScriptInstanceId: () => `replacement-${++createdIds}`,
    };
    await expect(new DownloadManager(deps).start(tour, 'en', () => undefined)).rejects.toMatchObject({
      code: 'network',
    });
    expect(library.available(tour.id)).toEqual(saved);
    const restarted = new OfflineLibrary(files);
    await restarted.load();
    expect(restarted.available(tour.id)).toEqual(OfflineManifestSchema.parse(saved));
    voice = 'different';
    const replacement = await new DownloadManager({ ...deps, library: restarted }).start(
      tour,
      'en',
      () => undefined,
    );
    expect(createdIds).toBe(1);
    expect(reserved).toEqual(['replacement-1', 'replacement-1']);
    expect(replacement).toMatchObject({ lang: 'en', complete: true, voiceId: 'classic' });
    expect(voices.length).toBeGreaterThan(0);
    expect(new Set(voices)).toEqual(new Set(['classic']));
  });

  it('downloads audio and texts without claiming a map when no offline source is available', async () => {
    const { backend, tour, files, library } = await setup();
    const maps = new UnavailableMapPackManager();
    let mapAttempts = 0;
    maps.create = async () => {
      mapAttempts++;
      throw new Error('must not prefetch');
    };
    const manager = new DownloadManager({ backend, files, maps, library });
    expect(manager.mapsSupported).toBe(false);
    const saved = await manager.start(tour, 'de', () => undefined);
    expect(saved.complete).toBe(true);
    expect(Object.keys(saved.narrations).length).toBeGreaterThan(0);
    expect(saved.mapPack).toBeUndefined();
    expect(library.list()[0]?.hasMap).toBe(false);
    await expect(manager.repairMap(tour.id, () => undefined)).rejects.toMatchObject({ code: 'unsupported' });
    expect(mapAttempts).toBe(0);
  });

  it('binds legacy downloads to their first authenticated owner without losing them', async () => {
    const { tour, manager, files } = await setup();
    await manager.start(tour, 'de', () => undefined);
    await files.remove('downloads-owner.txt');
    const restored = new OfflineLibrary(files, Date.now, true);
    await restored.load();
    expect(restored.list()).toEqual([]);
    let cleared = false;
    await restored.bindOwner('first-owner', async () => {
      cleared = true;
      await restored.clear();
    });
    expect(cleared).toBe(false);
    expect(restored.available(tour.id)?.tourId).toBe(tour.id);
    expect(await files.readText('downloads-owner.txt')).toBe('first-owner');
  });

  it('retains downloads when a guest is linked, but clears them before another UID can read them', async () => {
    const { tour, manager, files, library, backend, maps } = await setup();
    let user: UserInfo = { uid: 'owner-a', isAnonymous: true };
    let notify!: (user: UserInfo | null) => void;
    backend.auth.current = () => user;
    backend.auth.ensureSignedIn = async () => user;
    backend.auth.onChange = (cb) => {
      notify = cb;
      cb(user);
      return () => undefined;
    };
    await manager.start(tour, 'de', () => undefined);
    const wrapped = withOfflineFirst({ ...backend, getTour: async () => null }, library, files, {
      clearAccountDownloads: () => manager.clearAll(false),
    });
    wrapped.auth.onChange(() => undefined);
    user = { uid: 'owner-a', isAnonymous: false };
    notify(user);
    expect((await wrapped.getTour(tour.id))?.id).toBe(tour.id);
    user = { uid: 'owner-b', isAnonymous: false };
    notify(user);
    expect(library.list()).toEqual([]);
    expect(await wrapped.getTour(tour.id)).toBeNull();
    expect(await files.exists('downloads')).toBe(false);
    expect(maps.created).toEqual([]);
    expect(await files.readText('downloads-owner.txt')).toBe('owner-b');
  });

  it('waits for a previous account download to stop before completing the UID change', async () => {
    const { tour, manager, files, library, backend, maps } = await setup();
    let user: UserInfo = { uid: 'owner-a', isAnonymous: true };
    backend.auth.current = () => user;
    backend.auth.ensureSignedIn = async () => user;
    let release!: () => void;
    let signal: { cancelled: boolean } | undefined;
    let mapStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      mapStarted = resolve;
    });
    maps.create = async (_name, _bounds, _progress, options) => {
      signal = options?.signal;
      mapStarted();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const download = manager.start(tour, 'de', () => undefined);
    const cancelled = expect(download).rejects.toMatchObject({ code: 'cancelled' });
    await started;
    user = { uid: 'owner-b', isAnonymous: false };
    const wrapped = withOfflineFirst({ ...backend, getTour: async () => null }, library, files, {
      clearAccountDownloads: () => manager.clearAll(false),
    });
    const read = wrapped.getTour(tour.id);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(signal?.cancelled).toBe(true);
    expect(library.list()).toEqual([]);
    release();
    await cancelled;
    expect(await read).toBeNull();
    expect(await files.exists('downloads')).toBe(false);
  });

  it('keeps previous-account content hidden and retryable if native map deletion fails', async () => {
    const { tour, manager, files, library, backend, maps } = await setup();
    await manager.start(tour, 'de', () => undefined);
    backend.auth.current = () => ({ uid: 'new-owner', isAnonymous: false });
    backend.auth.ensureSignedIn = async () => backend.auth.current()!;
    const remove = maps.remove.bind(maps);
    maps.remove = async () => {
      throw new Error('native map deletion failed');
    };
    const wrapped = withOfflineFirst({ ...backend, getTour: async () => null }, library, files, {
      clearAccountDownloads: () => manager.clearAll(false),
    });
    await expect(wrapped.getTour(tour.id)).rejects.toThrow('native map deletion failed');
    expect(library.list()).toEqual([]);
    expect(await files.exists('downloads')).toBe(true);
    maps.remove = remove;
    expect(await wrapped.getTour(tour.id)).toBeNull();
    expect(await files.exists('downloads')).toBe(false);
    expect(maps.created).toEqual([]);
  });

  it('cannot resurrect downloads when account deletion finishes during owner hydration', async () => {
    const { tour, files, backend, library, maps } = await setup();
    const manager = new DownloadManager({ backend, files, library, maps });
    let release!: () => void;
    let readingOwner!: () => void;
    const reading = new Promise<void>((resolve) => {
      readingOwner = resolve;
    });
    const read = files.readText.bind(files);
    files.readText = async (path) => {
      if (path === 'downloads-owner.txt') {
        readingOwner();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return read(path);
    };
    let prepares = 0;
    const prepare = backend.prepareTourDownload;
    backend.prepareTourDownload = async (...args) => {
      prepares++;
      return prepare(...args);
    };
    const download = manager.start(tour, 'de', () => undefined);
    const cancelled = expect(download).rejects.toMatchObject({ code: 'cancelled' });
    await reading;
    await manager.clearAll();
    release();
    await cancelled;
    expect(prepares).toBe(0);
    expect(await files.exists('downloads')).toBe(false);
  });

  it('waits for persisted downloads before attempting a cold-start network read', async () => {
    const { tour, manager, files, backend } = await setup();
    await manager.start(tour, 'de', () => undefined);
    const restored = new OfflineLibrary(files);
    let remoteReads = 0;
    const offline = withOfflineFirst(
      {
        ...backend,
        getTour: async () => {
          remoteReads++;
          throw new Error('airplane mode');
        },
      },
      restored,
      files,
    );
    const [first, second] = await Promise.all([offline.getTour(tour.id), offline.getTour(tour.id)]);
    expect(first?.id).toBe(tour.id);
    expect(second?.id).toBe(tour.id);
    expect(remoteReads).toBe(0);
  });

  it('repairs missing maps without downloading or generating audio again', async () => {
    const { tour, manager, maps, calls, library } = await setup();
    maps.create = async () => {
      throw new Error('tiles unavailable');
    };
    await manager.start(tour, 'de', () => undefined);
    expect(library.available(tour.id)?.mapPack).toBeUndefined();
    const before = calls.narration;
    maps.create = async (_name, _bounds, progress) => {
      progress(1);
    };
    await manager.repairMap(tour.id, () => undefined);
    expect(library.available(tour.id)?.mapPack).toBe(tour.id);
    expect(calls.narration).toBe(before);
  });

  it('removes downloads, orphan files and native maps before account deletion', async () => {
    const { tour, manager, maps, files, library } = await setup();
    await manager.start(tour, 'de', () => undefined);
    await files.writeText('downloads/orphan/audio.mp3', 'partial');
    await manager.clearAll();
    expect(library.list()).toEqual([]);
    expect(maps.created).toEqual([]);
    expect(await files.exists('downloads')).toBe(false);
    const restored = new OfflineLibrary(files);
    await restored.load();
    expect(restored.tours()).toEqual([]);
  });

  it('cancels ongoing writes before clearing account downloads', async () => {
    const { tour, manager, maps, files, library } = await setup();
    let completeMap!: () => void;
    let mapStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      mapStarted = resolve;
    });
    maps.create = async () => {
      mapStarted();
      await new Promise<void>((resolve) => {
        completeMap = resolve;
      });
    };
    const download = manager.start(tour, 'de', () => undefined);
    const cancelled = expect(download).rejects.toMatchObject({ code: 'cancelled' });
    await started;
    const clearing = manager.clearAll();
    completeMap();
    await Promise.all([clearing, cancelled]);
    expect(library.list()).toEqual([]);
    expect(await files.exists('downloads')).toBe(false);
  });

  it('downloads a curated route with its own access, then replays after online expiry without any network claim', async () => {
    const { backend, tour, files, maps, library } = await setup();
    const planned: Tour = {
      ...tour,
      id: 'planned_saved',
      source: 'planned',
      template: 'planned',
      expiresAt: Date.now() + 1_000,
    };
    let prepares = 0;
    let starts = 0;
    const source: Backend = {
      ...backend,
      prepareTourDownload: async (tourId, mode, scriptInstanceId) => {
        prepares++;
        expect({ tourId, mode }).toEqual({ tourId: planned.id, mode: 'planned' });
        await backend.prepareTourDownload(tour.id, 'tour', scriptInstanceId);
        return { tourId, mode, grantedAt: Date.now(), expiresAt: null };
      },
      claimTourStart: async () => {
        starts++;
        throw new Error('Download must not count as a start');
      },
      getNarration: async (req) => {
        expect(req.access).toEqual({
          tourId: planned.id,
          mode: 'planned',
          downloadId: req.context?.script?.instanceId,
        });
        expect(req.download).toBe(true);
        const n = await backend.getNarration({
          ...req,
          access: { ...req.access, tourId: tour.id, mode: 'tour' },
        });
        return { ...n, audioUrl: `https://signed.example/${n.key}` };
      },
      getTransition: async (req) => {
        expect(req.access).toEqual({ tourId: planned.id, mode: 'planned', downloadId: req.scriptInstanceId });
        expect(req.download).toBe(true);
        const n = await backend.getTransition({
          ...req,
          access: { ...req.access, tourId: tour.id, mode: 'tour' },
        });
        return { ...n, audioUrl: `https://signed.example/${n.key}` };
      },
      audioUrl: async () => {
        throw new Error('Use the signed URL returned by generation');
      },
    };
    const manager = new DownloadManager({ backend: source, files, maps, library });
    await manager.start(planned, 'de', () => undefined);
    expect(prepares).toBe(1);
    expect(starts).toBe(0);
    const restored = new OfflineLibrary(files, () => Date.now() + 30 * 86400_000);
    await restored.load();
    const dead = async (): Promise<never> => {
      throw new BackendError('network', 'airplane mode');
    };
    const offline = withOfflineFirst(
      {
        ...source,
        getTour: dead,
        claimTourStart: dead,
        updateTourTime: dead,
        getNarration: dead,
        getTransition: dead,
        audioUrl: dead,
      },
      restored,
      files,
    );
    expect((await offline.getTour(planned.id))?.expiresAt).toBe(planned.expiresAt);
    await expect(offline.claimTourStart(planned.id, 'saved', 'planned')).resolves.toEqual({
      counted: false,
      remaining: null,
    });
    const localTime = {
      sessionId: 'saved',
      sequence: 1,
      state: 'active' as const,
      tourId: planned.id,
      mode: 'planned' as const,
      scriptInstanceId: downloadedTourScript(restored.get(planned.id)!).instanceId,
    };
    await expect(offline.updateTourTime(localTime)).resolves.toMatchObject({
      offline: true,
      remainingSeconds: null,
      leaseExpiresAt: null,
    });
    await expect(offline.updateTourTime({ ...localTime, mode: 'roam' })).rejects.toMatchObject({
      code: 'network',
    });
    const req = {
      poiId: planned.stops[0]!.poiId,
      lang: 'de',
      lengthTier: 'short' as const,
      access: { tourId: planned.id, mode: 'planned' as const },
      context: narrationContextFor(
        downloadedTourScript(restored.get(planned.id)!),
        planned.stops.map((s) => ({ id: s.poiId, name: s.name })),
        planned.stops[0]!.poiId,
      ),
    };
    const n = await offline.getNarration(req);
    expect(await offline.audioUrl(n.audioPath)).toMatch(/^file:\/\/\/mem\//);
    expect(n.images.length).toBeGreaterThan(0);
    expect(n.images.every((image) => image.url.startsWith('file:///mem/'))).toBe(true);
    await expect(offline.getNarration({ ...req, access: { mode: 'roam' } })).rejects.toMatchObject({
      code: 'network',
    });
    const saved = restored.get(planned.id)!;
    await restored.save({ ...saved, access: { ...saved.access!, expiresAt: 1 } });
    expect(restored.available(planned.id)).toBeUndefined();
    await expect(offline.claimTourStart(planned.id, 'saved', 'planned')).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('rejects Explore and Crossroads before authorizing or writing any download', async () => {
    const { tour, backend, files, maps, library } = await setup();
    const manager = new DownloadManager({
      backend: {
        ...backend,
        prepareTourDownload: async () => {
          throw new Error('must not call');
        },
      },
      files,
      maps,
      library,
    });
    for (const mode of ['roam', 'fork'])
      await expect(
        manager.start({ ...tour, id: `${mode}_session`, template: mode }, 'de', () => undefined),
      ).rejects.toMatchObject({ code: 'unsupported' });
    expect(library.list()).toEqual([]);
  });

  it('guards duplicate starts and leaves cancellation during map creation resumable', async () => {
    const { tour, backend, files, library } = await setup();
    const signal = { cancelled: false };
    const maps = new NoopMapPackManager();
    maps.create = async () => {
      signal.cancelled = true;
    };
    const manager = new DownloadManager({ backend, files, maps, library });
    const first = manager.start(tour, 'de', () => undefined, signal);
    await expect(manager.start(tour, 'de', () => undefined)).rejects.toMatchObject({ code: 'busy' });
    await expect(first).rejects.toMatchObject({ code: 'cancelled' });
    expect(library.get(tour.id)?.complete).toBe(false);
    expect(library.available(tour.id)).toBeUndefined();
  });

  it('downloads audio for every stop and tier, texts, transitions and the map pack with rising progress', async () => {
    const { tour, manager, library, files, maps } = await setup();
    const seen: number[] = [];
    const m = await manager.start(tour, 'de', (p) => seen.push(p.fraction));
    expect(m.complete).toBe(true);
    for (const s of tour.stops)
      for (const t of ['short', 'medium', 'long'] as LengthTier[]) {
        const n = m.narrations[`${s.poiId}:${t}`];
        expect(n).toBeDefined();
        expect(await files.exists(n!.audioFile)).toBe(true);
      }
    expect(Object.keys(m.transitions)).toHaveLength(tour.stops.length - 1);
    expect(m.mapPack).toBe(tour.id);
    expect(maps.created).toContain(tour.id);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]! - 1e-9)).toBe(true);
    expect(library.tours()).toHaveLength(1);
    expect(m.bytes).toBeGreaterThan(0);
  });

  it('resumes an interrupted download without re-fetching finished narrations', async () => {
    const { tour, manager, files, calls, library } = await setup();
    let downloads = 0;
    const orig = files.download.bind(files);
    files.download = async (u, p) => {
      if (++downloads > 6) files.offline = true;
      return orig(u, p);
    };
    await expect(manager.start(tour, 'de', () => undefined)).rejects.toMatchObject({ code: 'failed' });
    expect(library.get(tour.id)?.complete).toBe(false);
    const done = Object.keys(library.get(tour.id)!.narrations).length;
    const personalScript = library.get(tour.id)!.script;
    expect(personalScript?.instanceId).toBeTruthy();
    expect(done).toBeGreaterThan(0);
    files.offline = false;
    files.download = orig;
    const before = calls.narration;
    const m = await manager.start(tour, 'de', () => undefined);
    expect(m.complete).toBe(true);
    expect(m.script).toEqual(personalScript);
    const total = tour.stops.length * 3;
    expect(calls.narration - before).toBeLessThanOrEqual(total - done + 1);
  });

  it('refuses to start when there is not enough free storage and supports cancelling', async () => {
    const { tour, manager, files } = await setup();
    files.freeSpace = 1_000_000;
    await expect(manager.start(tour, 'de', () => undefined)).rejects.toBeInstanceOf(DownloadError);
    await expect(manager.start(tour, 'de', () => undefined)).rejects.toMatchObject({ code: 'no_space' });
    files.freeSpace = 5e9;
    const signal = { cancelled: true };
    await expect(manager.start(tour, 'de', () => undefined, signal)).rejects.toMatchObject({
      code: 'cancelled',
    });
  });

  it('lists sizes and deletes a download completely (files and map pack)', async () => {
    const { tour, manager, library, files, maps } = await setup();
    await manager.start(tour, 'de', () => undefined);
    expect(await library.totalBytes()).toBeGreaterThan(0);
    expect(library.list()[0]).toMatchObject({ tourId: tour.id, complete: true, lang: 'de' });
    await manager.remove(tour.id);
    expect(library.list()).toHaveLength(0);
    expect(await files.sizeOf(`downloads/${tour.id}`)).toBe(0);
    expect(maps.created).not.toContain(tour.id);
  });

  it('reloads the library from disk after a restart', async () => {
    const { tour, manager, files } = await setup();
    await manager.start(tour, 'de', () => undefined);
    const fresh = new OfflineLibrary(files);
    await fresh.load();
    expect(fresh.tours()).toHaveLength(1);
    expect(fresh.findNarration('de', tour.stops[0]!.poiId, 'short')?.audioPath.startsWith('local:')).toBe(
      true,
    );
    expect(fresh.findNarration('en', tour.stops[0]!.poiId, 'short')).toBeUndefined();
  });

  it('repairs a missing local audio file when resuming', async () => {
    const { tour, manager, files, calls } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    const missing = Object.values(saved.narrations)[0]!;
    await files.remove(missing.audioFile);
    const before = calls.narration;
    await manager.start(tour, 'de', () => undefined);
    expect(await files.exists(missing.audioFile)).toBe(true);
    expect(calls.narration - before).toBe(1);
  });

  it('plays a downloaded tour completely in airplane mode (network backend fully dead)', async () => {
    const { tour, manager, library, files } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    const dead = (): never => {
      throw new BackendError('network', 'airplane mode');
    };
    const offlineNet: Backend = {
      kind: 'demo',
      getAiConsent: dead,
      updateAiConsent: dead,
      reportContent: dead,
      auth: {
        current: () => ({ uid: 'demo-user', isAnonymous: false, phoneNumber: '+491701234567' }),
        onChange: () => () => undefined,
        ensureSignedIn: async () => ({ uid: 'demo-user', isAnonymous: false, phoneNumber: '+491701234567' }),
        signInWithEmail: dead,
        signInWithApple: dead,
        signInWithGoogle: dead,
        requestPhoneVerification: dead,
        confirmPhoneVerification: dead,
        signOut: dead,
      },
      ensureArea: dead,
      watchArea: () => () => undefined,
      getAutoTours: dead,
      watchTours: () => () => undefined,
      getTour: dead,
      getPois: dead,
      selectNearby: dead,
      getWalkingRoute: dead,
      getExploredSpots: dead,
      composePlannedRoute: dead,
      getTeaser: dead,
      getPoiText: dead,
      getNarration: dead,
      getTransition: dead,
      audioUrl: dead,
      reportNarration: dead,
      watchEntitlements: () => () => undefined,
      claimTourStart: dead,
      updateTourTime: dead,
      prepareTourDownload: dead,
      spendCredit: dead,
      createInvite: dead,
      redeemInvite: dead,
      createRewardNonce: dead,
      deleteAccount: dead,
      exportMyData: dead,
      recordPurchaseConsent: dead,
      getOffers: dead,
      recordPartnerEvent: dead,
      recordVisit: dead,
      submitPartnerApplication: dead,
      createGroup: dead,
      joinGroup: dead,
      addGroupSeat: dead,
      leaveGroup: dead,
      watchGroup: () => () => undefined,
      createRedemptionToken: dead,
      watchRedemption: () => () => undefined,
    };
    const backend = withOfflineFirst(offlineNet, library, files);
    expect((await backend.getTour(tour.id))?.id).toBe(tour.id);
    await expect(backend.claimTourStart(tour.id, 'offline-replay', 'tour')).resolves.toEqual({
      counted: false,
      remaining: null,
    });

    const clock = new FakeClock();
    const urls: string[] = [];
    const audio = new SimulatedAudioEngine(clock);
    const origPlay = audio.play.bind(audio);
    audio.play = async (item, opts) => {
      urls.push(item.url);
      return origPlay(item, opts);
    };
    const runtime = new GuideRuntime({
      backend,
      audio,
      lang: 'de',
      clock,
      script: saved.script!,
      access: { tourId: tour.id, mode: 'tour' },
    });
    const path: LatLng[] = [
      destinationPoint(tour.stops[0]!.location, 270, 120),
      ...decodePolyline(tour.path).map(([lat, lng]) => ({ lat, lng })),
    ];
    await runtime.start(
      tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
      new SimulatedLocationSource(path, { clock }),
    );
    for (let i = 0; i < 4 * 3600 && !runtime.getState().finished; i++) await clock.advance(1000);
    for (let i = 0; i < 60 && !runtime.getState().finished; i++) await clock.advance(1000);
    expect(runtime.getState().finished).toBe(true);
    expect(urls.length).toBeGreaterThanOrEqual(tour.stops.length - 1);
    expect(urls.every((u) => u.startsWith('file:///mem/downloads/'))).toBe(true);
    expect(['finished', undefined]).toContain(runtime.getSnapshot().notice);
    await runtime.dispose();
  }, 60_000);

  it('falls back to the network for content that was not downloaded', async () => {
    const { backend, tour, library, files } = await setup();
    const wrapped = withOfflineFirst(backend, library, files);
    const n = await wrapped.getNarration({ poiId: tour.stops[0]!.poiId, lang: 'de', lengthTier: 'short' });
    expect(n.audioPath.startsWith('demo:')).toBe(true);
    const t: Tour | null = await wrapped.getTour(tour.id);
    expect(t?.id).toBe(tour.id);
  });

  it('never serves a saved personal recording to an independent online walk with an identical brief', async () => {
    const { backend, tour, library, files, manager } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    const wrapped = withOfflineFirst(backend, library, files);
    const stops = tour.stops.map((s) => ({ id: s.poiId, name: s.name }));
    const first = tour.stops[0]!;
    const req = {
      poiId: first.poiId,
      lang: 'de',
      lengthTier: 'short' as const,
      access: { tourId: tour.id, mode: 'tour' as const },
      context: narrationContextFor(saved.script!, stops, first.poiId),
    };
    expect((await wrapped.getNarration(req)).audioPath.startsWith('local:')).toBe(true);
    const fresh = createTourScript({ lang: 'de', tour, instanceId: 'independent-walk' });
    expect(fresh.id).toBe(saved.script!.id);
    const response = await wrapped.getNarration({
      ...req,
      context: narrationContextFor(fresh, stops, first.poiId),
    });
    expect(response.audioPath.startsWith('demo:')).toBe(true);
    const next = tour.stops[1]!;
    const transition = await wrapped.getTransition({
      fromPoiId: first.poiId,
      toPoiId: next.poiId,
      lang: 'de',
      walkMinutes: 2,
      access: req.access,
      scriptInstanceId: fresh.instanceId!,
    });
    expect(transition.audioPath.startsWith('demo:')).toBe(true);
  });

  it('reopens legacy downloaded audio only through its explicit saved archive identity', async () => {
    const { backend, tour, library, files, manager } = await setup();
    const saved = await manager.start(tour, 'de', () => undefined);
    delete saved.script;
    await library.save(saved);
    const script = downloadedTourScript(saved);
    expect(downloadedTourScript(JSON.parse(JSON.stringify(saved)))).toEqual(script);
    const wrapped = withOfflineFirst(backend, library, files);
    const first = tour.stops[0]!;
    const req = {
      poiId: first.poiId,
      lang: 'de',
      lengthTier: 'short' as const,
      access: { tourId: tour.id, mode: 'tour' as const },
    };
    const ownArchive = await wrapped.getNarration({
      ...req,
      context: narrationContextFor(
        script,
        tour.stops.map((s) => ({ id: s.poiId, name: s.name })),
        first.poiId,
      ),
    });
    expect(ownArchive.audioPath.startsWith('local:')).toBe(true);
    expect((await wrapped.getNarration(req)).audioPath.startsWith('demo:')).toBe(true);
  });
});
