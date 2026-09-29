import { describe, expect, it } from 'vitest';
import {
  buildPois,
  destinationPoint,
  encodeGeohash,
  geohashBounds,
  syntheticRawPois,
  type GuideCommand,
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
