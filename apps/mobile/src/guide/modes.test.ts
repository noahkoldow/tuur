import { describe, expect, it, vi } from 'vitest';
import {
  buildPois,
  destinationPoint,
  encodeGeohash,
  geohashBounds,
  initialGuideState,
  syntheticRawPois,
  type GuideCommand,
  type GuideState,
  type Poi,
} from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { SimulatedLocationSource } from '../location/simulated';
import { FakeClock } from '../testing/fakeClock';
import { ForkController, PoiPool, RoamController } from './modes';
import { GuideRuntime } from './runtime';

const paris = { lat: 48.8566, lng: 2.3522 };

async function waitReady(backend: ReturnType<typeof createDemoBackend>, tile: string) {
  for (let i = 0; i < 40; i++) {
    let ok = false;
    backend.watchArea(tile, (a) => (ok = a?.status === 'ready' || a?.status === 'low_content'))();
    if (ok) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('roam mode across tile boundaries (demo backend, simulated GPS)', () => {
  it('warms the tile ahead before entering it and narrates matching POIs from both tiles without repeats', async () => {
    const backend = createDemoBackend({ latencyMs: 0 });
    const ensured: { tile: string; userTile: string }[] = [];
    const ref: { runtime?: GuideRuntime } = {};
    const origEnsure = backend.ensureArea.bind(backend);
    backend.ensureArea = async (t, rings) => {
      const u = ref.runtime?.getSnapshot().user;
      ensured.push({ tile: t, userTile: u ? encodeGeohash(u.lat, u.lng, 6) : '' });
      return origEnsure(t, rings);
    };

    const tile0 = encodeGeohash(paris.lat, paris.lng, 6);
    const b = geohashBounds(tile0);
    const east = encodeGeohash((b.south + b.north) / 2, b.east + 0.0006, 6);
    expect(east).not.toBe(tile0);
    // The demo world is deterministic: derive where the POIs of both tiles will be and walk a street through them.
    const good = (tile: string) =>
      buildPois(syntheticRawPois(tile), { now: 1 })
        .pois.filter((p) => p.score >= 30 && p.accessible)
        .sort((x, y) => x.location.lng - y.location.lng);
    const a = good(tile0).at(-1)!;
    const c = good(east)[0]!;
    const start = destinationPoint(a.location, 270, 180);
    const path = [start, a.location, c.location, destinationPoint(c.location, 90, 200)];
    const tile1 = east;
    await backend.ensureArea(tile0, 0);
    await waitReady(backend, tile0);

    const clock = new FakeClock();
    const audio = new SimulatedAudioEngine(clock);
    const commands: GuideCommand[] = [];
    const runtime = new GuideRuntime({
      backend,
      audio,
      lang: 'de',
      clock,
      onCommand: (c) => commands.push(c),
    });
    ref.runtime = runtime;
    const pool = new PoiPool(backend, clock);
    const roam = new RoamController({ runtime, backend, pool, interests: [], frequency: 'high', clock });
    roam.attach();
    const source = new SimulatedLocationSource(path, { clock, startOffsetM: 0 });
    await runtime.start([], source, { open: true });

    for (let i = 0; i < 1800; i++) {
      await clock.advance(1000);
      if (source.progressMeters >= source.totalMeters - 1 && !runtime.getState().playback) break;
    }
    roam.detach();

    // ensureArea for the next tile was called while the listener was still in the first tile
    const early = ensured.find((e) => e.tile === tile1 && e.userTile !== '');
    expect(early).toBeDefined();
    expect(early!.userTile).toBe(tile0);

    const played = commands.filter((c) => c.type === 'play').map((c) => (c as { poiId: string }).poiId);
    const unique = new Set(played);
    expect(unique.size).toBeGreaterThanOrEqual(2);
    expect(stopsIncludes()).toBe(true);
    const stops = runtime.getState().narrated;
    function stopsIncludes() {
      return runtime.getState().narrated.includes(a.id) && runtime.getState().narrated.includes(c.id);
    }
    expect(new Set(stops).size).toBe(stops.length);
    // POIs from the second tile were played, too (crossing the boundary worked)
    const all: Poi[] = pool.all();
    const tiles = new Set(stops.map((id) => all.find((p) => p.id === id)?.tile));
    expect(tiles.has(tile0) && tiles.has(tile1)).toBe(true);
    await runtime.dispose();
  }, 60_000);
});

describe('choosing a destination during roam', () => {
  const seed = buildPois(syntheticRawPois(encodeGeohash(paris.lat, paris.lng, 6)), { now: 1 }).pois[0]!;
  const place = (id: string, heading = 90, meters = 250): Poi => ({
    ...seed,
    id,
    name: id,
    location: destinationPoint(paris, heading, meters),
    accessible: true,
    hidden: false,
    score: 90,
  });

  async function setup(stops: Poi[] = []) {
    const clock = new FakeClock();
    const backend = createDemoBackend({ latencyMs: 0 });
    vi.spyOn(backend, 'ensureArea').mockResolvedValue(undefined);
    vi.spyOn(backend, 'getPois').mockResolvedValue([]);
    // Content remains in flight so these tests can drive guide events without unrelated demo generation.
    vi.spyOn(backend, 'getNarration').mockImplementation(() => new Promise(() => {}));
    const audio = new SimulatedAudioEngine(clock);
    const runtime = new GuideRuntime({ backend, audio, lang: 'de', clock });
    const unsubscribe = vi.fn();
    const source = { subscribe: vi.fn(async () => unsubscribe) };
    await runtime.start(stops, source, { open: true });
    const pool = new PoiPool(backend, clock);
    const roam = new RoamController({ runtime, backend, pool, interests: [], frequency: 'high', clock });
    roam.attach();
    return { runtime, roam, pool, clock, source, unsubscribe, backend };
  }

  it('uses the live Gemini candidate order with the persistent tour question', async () => {
    const { runtime, roam, pool, clock, backend } = await setup();
    const first = { ...place('first', 90, 45), osmTags: { historic: 'castle' }, rawScore: 80 };
    const second = { ...place('second', 90, 55), osmTags: { historic: 'castle' }, rawScore: 80 };
    vi.spyOn(pool, 'load').mockResolvedValue(undefined);
    vi.spyOn(pool, 'all').mockReturnValue([first, second]);
    const select = vi
      .spyOn(backend, 'selectNearby')
      .mockResolvedValue({ poiIds: [second.id, first.id], source: 'gemini' });
    runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
    await clock.flush();
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ thread: runtime.getScript().question, candidateIds: [first.id, second.id] }),
    );
    expect(runtime.getSnapshot().target?.id).toBe(second.id);
    roam.detach();
    await runtime.dispose();
  });

  it('inserts a small wayside observation without losing the pinned destination', async () => {
    const destination = place('destination', 90, 900);
    const { runtime, roam, pool, clock } = await setup([destination]);
    const detail = {
      ...place('street', 90, 150),
      name: 'Kirchgasse',
      osmTags: { highway: 'residential' },
      rawScore: 8,
      score: 18,
      sources: { wikipedia: [], sitelinks: 0 },
    };
    vi.spyOn(pool, 'load').mockResolvedValue(undefined);
    vi.spyOn(pool, 'all').mockReturnValue([detail, destination]);
    expect(roam.choose(destination)).toBe(true);
    for (const seconds of [0, 4, 8, 12, 16]) {
      runtime.onFix({
        ...destinationPoint(paris, 90, seconds * 1.3),
        ts: clock.now() + seconds * 1000,
        speed: 1.3,
        accuracy: 5,
        heading: 90,
      });
      await clock.flush();
    }
    expect(runtime.getState().route.map((s) => s.id)).toEqual([detail.id, destination.id]);
    roam.detach();
    await runtime.dispose();
  });

  it('replaces an unreached destination in the same paused walk and preserves past stops and GPS', async () => {
    const past = place('past');
    const first = place('first');
    const next = place('next', 270);
    const { runtime, roam, source, unsubscribe, clock } = await setup([past, first]);
    runtime.skip();
    runtime.pause();
    expect(roam.canChoose()).toBe(true);
    expect(roam.choose(next)).toBe(true);
    expect(runtime.getState().route.map((s) => s.id)).toEqual(['past', 'next']);
    expect(runtime.getState().skipped).toEqual(['past']);
    expect(runtime.getSnapshot().phase).toBe('paused');
    runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
    expect(runtime.getSnapshot().user).toMatchObject(paris);
    expect(source.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
    roam.detach();
    await runtime.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('appends after an exhausted route without repeating skipped stops', async () => {
    const first = place('first');
    const next = place('next');
    const { runtime, roam } = await setup([first]);
    runtime.skip();
    expect(runtime.getSnapshot().awaitingRoute).toBe(true);
    expect(roam.choose(first)).toBe(false);
    expect(roam.choose(next)).toBe(true);
    expect(runtime.getState().route.map((s) => s.id)).toEqual(['first', 'next']);
    expect(runtime.getSnapshot()).toMatchObject({ awaitingRoute: false, index: 1, target: { id: 'next' } });
    roam.detach();
    await runtime.dispose();
  });

  it('keeps a reached stop until departure, skips its failed story and replaces only the next destination', async () => {
    const first = place('first', 90, 0);
    const { runtime, roam, clock } = await setup([first]);
    runtime.pause();
    runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5 });
    runtime.dispatch({ type: 'failed', poiId: first.id, ts: clock.now() });
    expect(roam.choose(place('next'))).toBe(true);
    expect(roam.choose(place('replacement', 270))).toBe(true);
    expect(runtime.getState().route.map((s) => s.id)).toEqual(['first', 'replacement']);
    expect(runtime.getSnapshot().index).toBe(0);
    runtime.onFix({ ...destinationPoint(paris, 270, 70), ts: clock.now() + 60_000, accuracy: 5 });
    expect(runtime.getState().visited).toEqual([]);
    expect(runtime.getState().skipped).toEqual(['first']);
    expect(runtime.getSnapshot().target?.id).toBe('replacement');
    expect(roam.choose(first)).toBe(false);
    roam.detach();
    await runtime.dispose();
  });

  it.each<Partial<GuideState>>([
    {
      playback: {
        kind: 'stop',
        poiId: 'first',
        tier: 'short',
        startedTs: 1,
        positionMs: 0,
        stopRequested: false,
      },
    },
    { pending: { poiId: 'first', tier: 'short' } },
    { pendingTransition: { fromPoiId: 'past', toPoiId: 'first', walkMinutes: 2 } },
    { finished: true },
    { open: false },
  ])('does not replace a playing, queued or closed route (%j)', async (state) => {
    const { runtime, roam } = await setup([place('first')]);
    const snapshot = { ...initialGuideState([place('first')]), open: true, ...state };
    const current = vi.spyOn(runtime, 'getState').mockReturnValue(snapshot);
    expect(roam.canChoose()).toBe(false);
    expect(roam.choose(place('next'))).toBe(false);
    current.mockRestore();
    expect(runtime.getSnapshot().target?.id).toBe('first');
    roam.detach();
    await runtime.dispose();
  });

  it('keeps a manual choice pinned when an older tile load and later GPS fixes finish', async () => {
    const { runtime, roam, pool, clock } = await setup([place('first', 0)]);
    vi.spyOn(pool, 'all').mockReturnValue([place('automatic')]);
    let finishLoading!: () => void;
    const loaded = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    vi.spyOn(pool, 'load').mockReturnValueOnce(loaded).mockResolvedValue(undefined);
    runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
    expect(roam.choose(place('chosen', 270))).toBe(true);
    finishLoading();
    await clock.flush();
    expect(runtime.getSnapshot().target?.id).toBe('chosen');
    runtime.onFix({ ...paris, ts: clock.now() + 5_000, accuracy: 5, heading: 90 });
    await clock.flush();
    expect(runtime.getSnapshot().target?.id).toBe('chosen');
    roam.detach();
    await runtime.dispose();
  });

  it('does not apply a delayed automatic destination after pausing or detaching', async () => {
    for (const action of ['pause', 'detach'] as const) {
      const { runtime, roam, pool, clock } = await setup([]);
      vi.spyOn(pool, 'all').mockReturnValue([place('automatic')]);
      let finishLoading!: () => void;
      vi.spyOn(pool, 'load').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishLoading = resolve;
          }),
      );
      runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
      if (action === 'pause') runtime.pause();
      else roam.detach();
      finishLoading();
      await clock.flush();
      expect(runtime.getState().route).toEqual([]);
      roam.detach();
      await runtime.dispose();
    }
  });

  it('automatically discovers an upcoming story after detecting car/public-transport speed', async () => {
    const { runtime, roam, pool, clock } = await setup();
    const upcoming = place('on-the-bus-route', 90, 1500);
    vi.spyOn(pool, 'load').mockResolvedValue(undefined);
    vi.spyOn(pool, 'all').mockReturnValue([upcoming]);
    const started = clock.now();
    for (let seconds = 0; seconds <= 32; seconds += 4) {
      runtime.onFix({
        ...destinationPoint(paris, 90, seconds * 14),
        ts: started + seconds * 1000,
        speed: 14,
        heading: 90,
        accuracy: 5,
      });
      await clock.flush();
    }
    expect(runtime.getState().travel.mode).toBe('vehicle');
    expect(runtime.getSnapshot().target?.id).toBe(upcoming.id);
    expect(runtime.getSnapshot().phase).toBe('approaching');
    expect(runtime.getState().tierFor[upcoming.id]).toBe('short');
    roam.detach();
    await runtime.dispose();
  });
});

describe('crossroads mode (demo backend)', () => {
  it('offers two distinct options with teasers at the start and after each waypoint; choices extend the route', async () => {
    const backend = createDemoBackend({ latencyMs: 0 });
    const tile = encodeGeohash(paris.lat, paris.lng, 6);
    await backend.ensureArea(tile, 1);
    await waitReady(backend, tile);
    const clock = new FakeClock();
    const runtime = new GuideRuntime({ backend, audio: new SimulatedAudioEngine(clock), lang: 'de', clock });
    const pool = new PoiPool(backend, clock);
    const fork = new ForkController({
      runtime,
      backend,
      pool,
      lang: 'de',
      interests: [],
      profile: 'foot-walking',
      budgetMinutes: 90,
      clock,
    });
    fork.attach();
    const first = await fork.compute(paris);
    expect(first.length).toBeGreaterThanOrEqual(1);
    if (first.length === 2) expect(first[0]!.poi.id).not.toBe(first[1]!.poi.id);
    for (const o of first) expect(o.teaser?.length).toBeGreaterThan(5);

    fork.clear();
    const pick = first[0]!;
    await runtime.start([{ id: pick.poi.id, name: pick.poi.name, location: pick.poi.location }], undefined, {
      open: true,
    });
    expect(runtime.getState().route).toHaveLength(1);

    // walk to the stop and let it play so that the waypoint fires
    const source = new SimulatedLocationSource(
      [
        destinationPoint(pick.poi.location, 270, 150),
        pick.poi.location,
        destinationPoint(pick.poi.location, 90, 30),
      ],
      { clock },
    );
    await source.subscribe((f) => runtime.onFix(f));
    let options: ReturnType<typeof fork.getSnapshot>['options'] = [];
    for (let i = 0; i < 900 && options.length === 0; i++) {
      await clock.advance(1000);
      options = fork.getSnapshot().options;
    }
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.every((o) => o.poi.id !== pick.poi.id)).toBe(true);
    fork.choose(options[0]!.poi.id);
    expect(runtime.getState().route.map((r) => r.id)).toContain(options[0]!.poi.id);
    expect(fork.getSnapshot().options).toHaveLength(0);
    await runtime.dispose();
  }, 60_000);
});
