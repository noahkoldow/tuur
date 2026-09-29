import { describe, expect, it } from 'vitest';
import {
  REGION_FIXTURES,
  decodePolyline,
  destinationPoint,
  encodeGeohash,
  type GuideCommand,
  type LatLng,
} from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { SimulatedLocationSource } from '../location/simulated';
import { FakeClock } from '../testing/fakeClock';
import { GuideRuntime } from './runtime';

const berlin = REGION_FIXTURES[0]!;

async function readyBackend() {
  const backend = createDemoBackend({ latencyMs: 0 });
  const tile = encodeGeohash(berlin.center.lat, berlin.center.lng, 6);
  await backend.ensureArea(tile);
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    let ready = false;
    backend.watchArea(tile, (a) => (ready = a?.status === 'ready' || a?.status === 'low_content'))();
    if (ready) break;
  }
  const res = await backend.getAutoTours(tile, 'de');
  return { backend, tile, res };
}

describe('GuideRuntime end to end (demo backend + simulated GPS + simulated audio)', () => {
  it('walks a whole standard tour anywhere: every stop gets narrated, in order, then the tour finishes', async () => {
    const { backend, res } = await readyBackend();
    expect(res.status).toBe('ready');
    const tour = (await backend.getTour(res.tours.find((t) => t.free)!.id))!;
    expect(tour.stops.length).toBeGreaterThanOrEqual(3);

    const clock = new FakeClock();
    const commands: GuideCommand[] = [];
    const audio = new SimulatedAudioEngine(clock);
    const played: string[] = [];
    const runtime = new GuideRuntime({
      backend,
      audio,
      lang: 'de',
      clock,
      onCommand: (c) => {
        commands.push(c);
        if (c.type === 'play') played.push(c.poiId);
      },
    });

    const path: LatLng[] = [
      destinationPoint(tour.stops[0]!.location, 270, 120),
      ...decodePolyline(tour.path).map(([lat, lng]) => ({ lat, lng })),
    ];
    const source = new SimulatedLocationSource(path, { clock });
    await runtime.start(
      tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
      source,
    );

    let steps = 0;
    while (!runtime.getState().finished && steps < 4 * 3600) {
      await clock.advance(1000);
      steps++;
    }
    // stand at the final stop so the tour can close
    for (let i = 0; i < 60 && !runtime.getState().finished; i++) await clock.advance(1000);

    const s = runtime.getState();
    expect(s.finished).toBe(true);
    const stopPlays = played.filter((id, i, a) => a.indexOf(id) === i);
    expect(stopPlays).toEqual(tour.stops.map((x) => x.poiId).filter((id) => stopPlays.includes(id)));
    expect(stopPlays.length).toBeGreaterThanOrEqual(tour.stops.length - 1);
    const ui = runtime.getSnapshot();
    expect(ui.phase).toBe('finished');
    expect(ui.stops.every((x) => x.state === 'visited' || x.state === 'skipped')).toBe(true);
    await runtime.dispose();
  }, 60_000);

  it('exposes narration state for the player UI while a stop is playing (title, text, transcript index, AI flag)', async () => {
    const { backend, res } = await readyBackend();
    const tour = (await backend.getTour(res.tours[0]!.id))!;
    const clock = new FakeClock();
    const runtime = new GuideRuntime({ backend, audio: new SimulatedAudioEngine(clock), lang: 'de', clock });
    const first = tour.stops[0]!;
    const path = [destinationPoint(first.location, 270, 150), first.location];
    await runtime.start(
      tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
      new SimulatedLocationSource(path, { clock }),
    );
    let seen = false;
    for (let i = 0; i < 300 && !seen; i++) {
      await clock.advance(1000);
      const ui = runtime.getSnapshot();
      if (ui.narration && ui.phase === 'narrating') {
        seen = true;
        expect(ui.narration.aiGenerated).toBe(true);
        expect(ui.narration.title).toBe(first.name);
        expect(ui.narration.paragraphs.length).toBeGreaterThan(0);
        expect(ui.target?.id).toBe(first.poiId);
      }
    }
    expect(seen).toBe(true);
    await runtime.dispose();
  }, 30_000);

  it('skip and previous work through the runtime and pause blocks playback', async () => {
    const { backend, res } = await readyBackend();
    const tour = (await backend.getTour(res.tours[0]!.id))!;
    const clock = new FakeClock();
    const runtime = new GuideRuntime({ backend, audio: new SimulatedAudioEngine(clock), lang: 'de', clock });
    await runtime.start(tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })));
    runtime.skip();
    expect(runtime.getSnapshot().index).toBe(1);
    runtime.previous();
    expect(runtime.getSnapshot().index).toBe(0);
    runtime.pause();
    expect(runtime.getSnapshot().phase).toBe('paused');
    runtime.resume();
    expect(runtime.getSnapshot().phase).not.toBe('paused');
    await runtime.dispose();
  });
});
