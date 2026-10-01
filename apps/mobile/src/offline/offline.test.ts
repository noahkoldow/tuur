import { describe, expect, it } from 'vitest';
import {
  REGION_FIXTURES,
  decodePolyline,
  destinationPoint,
  encodeGeohash,
  type LatLng,
  type LengthTier,
  type Tour,
} from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { BackendError, type Backend } from '../backend/types';
import { GuideRuntime } from '../guide/runtime';
import { SimulatedLocationSource } from '../location/simulated';
import { FakeClock } from '../testing/fakeClock';
import { MemoryFileStore } from './fileStore';
import { OfflineLibrary } from './library';
import { DownloadError, DownloadManager } from './manager';
import { NoopMapPackManager } from './mapPacks';
import { withOfflineFirst } from './offlineBackend';

const berlin = REGION_FIXTURES[0]!;

async function setup() {
  const backend = createDemoBackend({ latencyMs: 0 });
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
    expect(done).toBeGreaterThan(0);
    files.offline = false;
    files.download = orig;
    const before = calls.narration;
    const m = await manager.start(tour, 'de', () => undefined);
    expect(m.complete).toBe(true);
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

  it('plays a downloaded tour completely in airplane mode (network backend fully dead)', async () => {
    const { tour, manager, library, files } = await setup();
    await manager.start(tour, 'de', () => undefined);
    const dead = (): never => {
      throw new BackendError('network', 'airplane mode');
    };
    const offlineNet: Backend = {
      kind: 'demo',
      auth: {
        current: () => null,
        onChange: () => () => undefined,
        ensureSignedIn: async () => ({ uid: 'x', isAnonymous: true }),
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
      getExploredSpots: dead,
      composePlannedRoute: dead,
      getTeaser: dead,
      getNarration: dead,
      getTransition: dead,
      audioUrl: dead,
      reportNarration: dead,
      watchEntitlements: () => () => undefined,
      claimTourStart: dead,
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

    const clock = new FakeClock();
    const urls: string[] = [];
    const audio = new SimulatedAudioEngine(clock);
    const origPlay = audio.play.bind(audio);
    audio.play = async (item, opts) => {
      urls.push(item.url);
      return origPlay(item, opts);
    };
    const runtime = new GuideRuntime({ backend, audio, lang: 'de', clock });
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
});
