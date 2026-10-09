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

  async function setup(stops: Poi[] = [], pinnedTargetId?: string) {
    const clock = new FakeClock();
    const backend = createDemoBackend({ latencyMs: 0 });
    vi.spyOn(backend, 'ensureArea').mockResolvedValue(undefined);
    vi.spyOn(backend, 'getPois').mockResolvedValue([]);
    // Content remains in flight so these tests can drive guide events without unrelated demo generation.
    vi.spyOn(backend, 'getNarration').mockImplementation(() => new Promise(() => {}));
    const audio = new SimulatedAudioEngine(clock);
    const listen = vi.spyOn(audio, 'setListener');
    const runtime = new GuideRuntime({ backend, audio, lang: 'de', clock });
    const unsubscribe = vi.fn();
    const source = { subscribe: vi.fn(async () => unsubscribe) };
    await runtime.start(stops, source, { open: true });
    const pool = new PoiPool(backend, clock);
    const roam = new RoamController({
      runtime,
      backend,
      pool,
      interests: [],
      frequency: 'high',
      clock,
      ...(pinnedTargetId ? { pinnedTargetId } : {}),
    });
    roam.attach();
    return {
      runtime,
      roam,
      pool,
      clock,
      source,
      unsubscribe,
      backend,
      audio,
      listener: listen.mock.calls[0]![0],
    };
  }

  function provideStories(backend: ReturnType<typeof createDemoBackend>) {
    vi.mocked(backend.getNarration).mockImplementation(async ({ poiId }) => ({
      key: `${poiId}:story`,
      title: poiId,
      text: `The story of ${poiId}.`,
      paragraphs: [{ text: `The story of ${poiId}.`, startMs: 0, durationMs: 4_000 }],
      keyFacts: [],
      audioPath: `demo:${poiId}`,
      audioDurationMs: 4_000,
      images: [],
      cached: true,
      aiGenerated: true,
    }));
  }

  it('keeps the chosen first stop and automatically tells later stories without another selection', async () => {
    const first = place('chosen-first', 90, 0);
    const automatic = place('walked-past', 90, 250);
    const ignored = place('optional-other-direction', 270, 250);
    const { runtime, roam, pool, clock, backend } = await setup([first], first.id);
    provideStories(backend);
    vi.spyOn(pool, 'load').mockResolvedValue(undefined);
    vi.spyOn(pool, 'all').mockReturnValue([first, automatic, ignored]);

    runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
    await clock.flush();
    await clock.advance(5_000);
    expect(runtime.getState().narrated).toContain(first.id);
    for (let meters = 10; meters <= 270; meters += 10) {
      await clock.advance(8_000);
      runtime.onFix({
        ...destinationPoint(paris, 90, meters),
        ts: clock.now(),
        accuracy: 5,
        heading: 90,
        speed: 1.25,
      });
      await clock.flush();
    }

    expect(runtime.getState().narrated).toEqual([first.id, automatic.id]);
    expect(runtime.getState().route.map((stop) => stop.id)).toEqual([first.id, automatic.id]);
    expect(runtime.getState().visited).toEqual([first.id, automatic.id]);
    expect(runtime.getState().finished).toBe(false);
    roam.detach();
    await runtime.dispose();
  });

  it.each([
    ['automatic', 'completed'],
    ['chosen', 'completed'],
    ['automatic', 'failed after positive progress'],
    ['chosen', 'failed after positive progress'],
    ['automatic', 'failed before playback'],
  ] as const)(
    'retains only heard nearby points for an %s next destination after audio %s, without exact arrival',
    async (selection, outcome) => {
      const heard = place('heard-nearby', 0, 50);
      const next = place('next-nearby', 180, 50);
      const { runtime, roam, pool, clock, backend, audio, listener } = await setup([heard]);
      const play = vi.spyOn(audio, 'play');
      provideStories(backend);
      if (outcome === 'failed before playback')
        vi.mocked(backend.getNarration).mockRejectedValue(new Error('Story unavailable'));
      vi.spyOn(pool, 'load').mockResolvedValue(undefined);
      vi.spyOn(pool, 'all').mockReturnValue([heard, next]);
      runtime.pause();
      runtime.onFix({ ...paris, ts: clock.now(), accuracy: 5, heading: 90 });
      for (const meters of [10, 20]) {
        await clock.advance(8_000);
        runtime.onFix({
          ...destinationPoint(paris, 90, meters),
          ts: clock.now(),
          accuracy: 5,
          heading: 90,
          speed: 1.25,
        });
      }
      runtime.resume();
      await clock.flush();
      if (outcome !== 'failed after positive progress') await clock.advance(5_000);
      else {
        await clock.advance(1_000);
        expect(runtime.getStopNarration(heard.id)?.text).toBe(`The story of ${heard.id}.`);
        await audio.pause();
        listener.onError(play.mock.calls.at(-1)![0].id, 'Playback interrupted');
        await clock.advance(4_000);
      }
      expect(runtime.getState().narrated).toEqual([heard.id]);
      expect(runtime.getState().reached[heard.id]).toBeUndefined();

      if (selection === 'chosen') expect(roam.choose(next)).toBe(true);
      else {
        runtime.onFix({ ...destinationPoint(paris, 90, 20), ts: clock.now(), accuracy: 5, heading: 90 });
        await clock.flush();
      }

      expect(runtime.getState().route.map((stop) => stop.id)).toEqual(
        outcome === 'failed before playback' ? [next.id] : [heard.id, next.id],
      );
      expect(runtime.getSnapshot().target?.id).toBe(next.id);
      expect(runtime.getState().narrated).toContain(heard.id);
      expect(runtime.getStopNarration(heard.id)?.text).toBe(
        outcome === 'failed before playback' ? undefined : `The story of ${heard.id}.`,
      );
      roam.detach();
      await runtime.dispose();
    },
  );

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

  it('queues a place behind the unreached target and makes it the target once the first stop is done', async () => {
    const first = place('first');
    const queued = place('queued', 270);
    const { runtime, roam, pool, clock } = await setup([first]);
    vi.spyOn(pool, 'load').mockResolvedValue(undefined);
    vi.spyOn(pool, 'all').mockReturnValue([first, queued]);
    expect(roam.enqueue(queued)).toBe(true);
    expect(roam.getQueue().map((p) => p.id)).toEqual(['queued']);
    expect(runtime.getState().route.map((s) => s.id)).toEqual(['first']);
    expect(roam.enqueue(queued)).toBe(false);
    expect(roam.enqueue(first)).toBe(false);
    runtime.skip();
    runtime.onFix({ ...paris, ts: clock.now() + 10_000, accuracy: 5, heading: 90 });
    await clock.flush();
    expect(roam.getQueue()).toEqual([]);
    expect(runtime.getState().route.map((s) => s.id)).toContain('queued');
    roam.detach();
    await runtime.dispose();
  });

  it('removes a queued place again', async () => {
    const first = place('first');
    const queued = place('queued', 270);
    const { runtime, roam } = await setup([first]);
    roam.enqueue(queued);
    roam.dequeue('queued');
    expect(roam.getQueue()).toEqual([]);
    roam.detach();
    await runtime.dispose();
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
  it('previews the first choices without an active guide and shows them while teasers are loading', async () => {
    const backend = createDemoBackend({ latencyMs: 0 });
    const tile = encodeGeohash(paris.lat, paris.lng, 6);
    await backend.ensureArea(tile, 1);
    await waitReady(backend, tile);
    const select = vi.spyOn(backend, 'selectNearby');
    let finishTeaser!: (text: string) => void;
    const teaser = new Promise<string>((resolve) => {
      finishTeaser = resolve;
    });
    const getTeaser = vi.spyOn(backend, 'getTeaser').mockReturnValue(teaser);
    const fork = new ForkController({
      backend,
      pool: new PoiPool(backend),
      lang: 'de',
      interests: ['history'],
      profile: 'foot-walking',
      budgetMinutes: 90,
      access: { mode: 'fork' },
    });

    const loaded = fork.compute(paris);
    await vi.waitFor(() => expect(fork.getSnapshot().options.length).toBeGreaterThanOrEqual(1));
    const preview = fork.getSnapshot();
    expect(preview.loading).toBe(true);
    expect(preview.options.every((option) => !option.teaser)).toBe(true);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'de', interests: ['history'], access: { mode: 'fork' } }),
    );
    expect(getTeaser).toHaveBeenCalledWith(expect.objectContaining({ lang: 'de', access: { mode: 'fork' } }));

    finishTeaser('A story worth discovering.');
    const options = await loaded;
    expect(options.map((option) => option.poi.id)).toEqual(preview.options.map((option) => option.poi.id));
    expect(options.every((option) => option.teaser === 'A story worth discovering.')).toBe(true);
    expect(fork.getSnapshot().loading).toBe(false);
  });

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
