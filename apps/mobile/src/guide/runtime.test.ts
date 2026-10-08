import { describe, expect, it, vi } from 'vitest';
import {
  REGION_FIXTURES,
  decodePolyline,
  destinationPoint,
  encodeGeohash,
  type GuideCommand,
  type GuideStop,
  type LatLng,
} from '@tuur/shared';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { createDemoBackend } from '../backend/demoBackend';
import { BackendError } from '../backend/types';
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
  it('exposes current GPS course and speed so the map can hold its direction at rest', async () => {
    const clock = new FakeClock();
    const runtime = new GuideRuntime({
      backend: createDemoBackend({ latencyMs: 0 }),
      audio: new SimulatedAudioEngine(clock),
      lang: 'de',
      clock,
    });

    runtime.onFix({ ...berlin.center, ts: 1000, heading: 90, speed: 1.3, accuracy: 5 });
    expect(runtime.getSnapshot().user).toEqual({
      ...berlin.center,
      ts: 1000,
      heading: 90,
      speed: 1.3,
      accuracy: 5,
    });
    runtime.onFix({ ...berlin.center, ts: 2000, heading: 170, speed: 0 });
    expect(runtime.getSnapshot().user).toEqual({ ...berlin.center, ts: 2000, heading: 170, speed: 0 });
    runtime.onFix({ ...berlin.center, ts: 3000 });
    expect(runtime.getSnapshot().user).toEqual({ ...berlin.center, ts: 3000 });

    await runtime.dispose();
  });

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

describe('continuing a planned tour in Explore', () => {
  const first: GuideStop = { id: 'first', name: 'First place', location: berlin.center };
  const next: GuideStop = {
    id: 'next',
    name: 'Next place',
    location: destinationPoint(berlin.center, 90, 240),
  };
  const last: GuideStop = {
    id: 'last',
    name: 'Last place',
    location: destinationPoint(berlin.center, 90, 900),
  };

  async function setup() {
    const backend = createDemoBackend({ latencyMs: 0 });
    const narration = vi.spyOn(backend, 'getNarration').mockImplementation(async ({ poiId }) => ({
      key: `${poiId}:story`,
      title: poiId,
      text: 'First paragraph. Second paragraph.',
      paragraphs: [
        { text: 'First paragraph.', startMs: 0, durationMs: 30_000 },
        { text: 'Second paragraph.', startMs: 30_000, durationMs: 30_000 },
      ],
      keyFacts: [],
      audioPath: `demo:${poiId}`,
      audioDurationMs: 60_000,
      images: [],
      cached: true,
      aiGenerated: true,
    }));
    const transition = vi.spyOn(backend, 'getTransition').mockResolvedValue({
      key: 'handover',
      text: 'Walk to the next place.',
      audioPath: 'demo:handover',
      audioDurationMs: 10_000,
    });
    const clock = new FakeClock();
    const audio = new SimulatedAudioEngine(clock);
    const play = vi.spyOn(audio, 'play');
    const stop = vi.spyOn(audio, 'stop');
    const unsubscribe = vi.fn();
    const source = { subscribe: vi.fn(async () => unsubscribe) };
    const runtime = new GuideRuntime({
      backend,
      audio,
      clock,
      lang: 'en',
      access: { mode: 'planned', tourId: 'planned-tour' },
    });
    await runtime.start([first, next, last], source);
    return { runtime, clock, audio, play, stop, source, unsubscribe, narration, transition };
  }

  it('preserves current audio and GPS while releasing the rest of the itinerary', async () => {
    const { runtime, clock, audio, play, stop, source, unsubscribe, transition } = await setup();
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.advance(5_000);
    expect(audio.isPlaying()).toBe(true);
    const position = audio.positionMs();
    const story = runtime.getSnapshot().narration;

    runtime.explore();

    expect(runtime.getState().route.map((s) => s.id)).toEqual([first.id]);
    expect(runtime.getState()).toMatchObject({ open: true, finished: false, index: 0 });
    expect(runtime.getSnapshot().narration).toEqual(story);
    expect(audio.positionMs()).toBe(position);
    expect(play).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(source.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();

    await clock.advance(60_000);
    expect(runtime.getState().narrated).toEqual([first.id]);
    expect(runtime.getState().visited).toEqual([first.id]);
    expect(runtime.getState().finished).toBe(false);
    expect(runtime.getSnapshot().awaitingRoute).toBe(true);
    expect(transition).not.toHaveBeenCalled();
    await runtime.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each(['ai_consent_updated', 'ai_consent_pause_failed'] as const)(
    'keeps the unheard stop pending after %s and retries only when the listener resumes',
    async (reason) => {
      const { runtime, clock, audio, narration } = await setup();
      narration.mockImplementationOnce(async () => {
        runtime.pause();
        throw new BackendError('unavailable', 'Privacy choice needs attention', undefined, reason);
      });
      runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
      await clock.flush();
      expect(runtime.getState().paused).toBe(true);
      expect(runtime.getState().narrated).not.toContain(first.id);
      expect(runtime.getSnapshot().notice).toBe(reason);
      expect(audio.isPlaying()).toBe(false);
      const requestsWhilePaused = narration.mock.calls.length;
      await clock.advance(60_000);
      expect(narration).toHaveBeenCalledTimes(requestsWhilePaused);
      expect(runtime.getState().narrated).not.toContain(first.id);

      runtime.resume();
      await clock.flush();
      await clock.advance(1_000);
      expect(narration.mock.calls.length).toBeGreaterThan(requestsWhilePaused);
      expect(audio.isPlaying()).toBe(true);
      expect(runtime.getSnapshot().narration?.title).toBe(first.id);
      await runtime.dispose();
    },
  );

  it('drops queued stories and handovers for removed stops without losing the visited stop', async () => {
    const { runtime, clock, audio, play, transition } = await setup();
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.flush();
    await clock.advance(5_000);
    runtime.onFix({ ...next.location, ts: clock.now(), accuracy: 5, speed: 1.3 });
    await clock.flush();
    expect(runtime.getState().pending?.poiId).toBe(next.id);
    expect(runtime.getState().visited).toEqual([first.id]);
    expect(audio.isPlaying()).toBe(true);

    runtime.explore();

    expect(runtime.getState().route.map((s) => s.id)).toEqual([first.id]);
    expect(runtime.getState().pending).toBeUndefined();
    expect(runtime.getState().pendingTransition).toBeUndefined();
    expect(runtime.getState().visited).toEqual([first.id]);
    await clock.advance(65_000);
    expect(play.mock.calls.map(([item]) => item.poiId)).toEqual([first.id]);
    expect(transition).not.toHaveBeenCalled();
    expect(runtime.getState().finished).toBe(false);
    await runtime.dispose();
  });

  it('records an explored stop before departure and keeps it current when continuing in Explore', async () => {
    const { runtime, clock } = await setup();
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.advance(5_000);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 1.3 });
    await clock.advance(5_000);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 1.3 });
    expect(runtime.getState().travel.mode).toBe('walking');
    await clock.advance(55_000);
    expect(runtime.getState().playback).toBeUndefined();
    expect(runtime.getState().narrated).toEqual([first.id]);
    expect(runtime.getState().visited).toEqual([first.id]);
    expect(runtime.getSnapshot().stops[0]?.state).toBe('current');

    runtime.explore();

    expect(runtime.getState().route.map((stop) => stop.id)).toEqual([first.id]);
    await clock.advance(1_000);
    runtime.onFix({ ...destinationPoint(first.location, 270, 80), ts: clock.now(), accuracy: 5, speed: 1.3 });
    expect(runtime.getState().visited).toEqual([first.id]);
    expect(runtime.getSnapshot().awaitingRoute).toBe(true);
    await runtime.dispose();
  });

  it('preserves pause and skipped history, then sends new narration requests with Explore access', async () => {
    const { runtime, clock, narration, source, unsubscribe } = await setup();
    runtime.skip();
    runtime.pause();
    runtime.setAccess({ mode: 'roam' });
    runtime.explore();
    expect(runtime.getSnapshot().phase).toBe('paused');
    expect(runtime.getSnapshot().target).toBeUndefined();
    expect(runtime.getState().skipped).toEqual([first.id]);
    expect(runtime.getState().route.map((s) => s.id)).toEqual([first.id]);

    const chosen = {
      id: 'chosen',
      name: 'Chosen place',
      location: destinationPoint(berlin.center, 270, 200),
    };
    runtime.retarget(chosen);
    runtime.onFix({ ...chosen.location, ts: clock.now(), accuracy: 5, speed: 0 });
    runtime.resume();
    await clock.flush();
    expect(narration).toHaveBeenCalledWith(
      expect.objectContaining({ poiId: chosen.id, access: { mode: 'roam' } }),
    );
    expect(runtime.getState().route.map((s) => s.id)).toEqual([first.id, chosen.id]);
    expect(runtime.getState().skipped).toEqual([first.id]);
    expect(source.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('releases a future destination even when the old tour handover is already playing', async () => {
    const { runtime, clock, audio, stop } = await setup();
    runtime.setRoute([first, last]);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.advance(5_000);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 1.3 });
    await clock.advance(5_000);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 1.3 });
    await clock.advance(55_000);
    runtime.onFix({ ...destinationPoint(first.location, 90, 80), ts: clock.now(), accuracy: 5, speed: 1.3 });
    await clock.flush();
    expect(runtime.getState().playback).toMatchObject({ kind: 'transition', poiId: last.id });
    expect(audio.isPlaying()).toBe(true);

    runtime.explore();

    expect(runtime.getState().route.map((stop) => stop.id)).toEqual([first.id]);
    expect(runtime.getSnapshot().target).toBeUndefined();
    expect(stop).not.toHaveBeenCalled();
    await clock.advance(15_000);
    expect(runtime.getState().playback).toBeUndefined();
    expect(runtime.getState().visited).toEqual([first.id]);
    expect(runtime.getState().finished).toBe(false);
    await runtime.dispose();
  });
});

describe('GuideRuntime teardown', () => {
  it('releases GPS and the audio engine when the session is disposed while it is still starting', async () => {
    const { backend } = await readyBackend();
    const clock = new FakeClock();
    let unsubscribed = 0;
    let subscribed = 0;
    const slowSource = {
      async subscribe() {
        subscribed++;
        await new Promise((r) => setTimeout(r, 30)); // permission prompt / service start takes a moment
        return () => void unsubscribed++;
      },
    };
    const audio = new SimulatedAudioEngine(clock);
    let destroyed = 0;
    const origDestroy = audio.destroy.bind(audio);
    audio.destroy = async () => {
      destroyed++;
      return origDestroy();
    };
    const runtime = new GuideRuntime({ backend, audio, lang: 'de', clock });
    const starting = runtime.start([], slowSource as never);
    await new Promise((r) => setTimeout(r, 10)); // audio is initialised, the GPS subscription is still pending
    const disposing = runtime.dispose(); // the user leaves now
    await Promise.all([starting, disposing]);
    expect(subscribed).toBe(1);
    expect(unsubscribed).toBe(1);
    expect(destroyed).toBe(1);
    // late fixes after dispose are ignored
    runtime.onFix({ lat: 52.5, lng: 13.4, ts: 1 });
    expect(runtime.getSnapshot().user).toBeUndefined();
  });

  it('a second dispose is a no-op and never leaves handlers behind', async () => {
    const { backend } = await readyBackend();
    const audio = new SimulatedAudioEngine(new FakeClock());
    let destroyed = 0;
    audio.destroy = async () => void destroyed++;
    const runtime = new GuideRuntime({ backend, audio, lang: 'de' });
    await runtime.start([], undefined);
    await runtime.dispose();
    await runtime.dispose();
    expect(destroyed).toBe(1);
  });
});

describe('heard place information', () => {
  const place: GuideStop = { id: 'gate', name: 'Gate', location: berlin.center };

  async function setup() {
    const clock = new FakeClock();
    const backend = createDemoBackend({ latencyMs: 0 });
    const getNarration = vi.spyOn(backend, 'getNarration').mockResolvedValue({
      key: 'gate:story',
      title: 'The story of the gate',
      text: 'A story to remember after the walk.',
      paragraphs: [{ text: 'A story to remember after the walk.', startMs: 0, durationMs: 5000 }],
      keyFacts: ['A fact about the gate.'],
      audioPath: 'demo:gate',
      audioDurationMs: 5000,
      images: [],
      cached: true,
      aiGenerated: true,
      grounding: { queries: 1, sources: [{ uri: 'https://example.org/gate' }] },
    });
    const audio = new SimulatedAudioEngine(clock);
    const runtime = new GuideRuntime({ backend, audio, clock, lang: 'en', access: { mode: 'roam' } });
    const heard = vi.fn();
    runtime.addNarrationListener(heard);
    await runtime.start([place], undefined, { open: true });
    return { runtime, audio, clock, getNarration, heard };
  }

  it('retains only confirmed heard content, with one update per story and no request when reading it', async () => {
    const { runtime, clock, getNarration, heard } = await setup();
    runtime.pause();
    runtime.onFix({ ...place.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.flush();
    expect(getNarration).toHaveBeenCalledOnce();
    expect(runtime.getStopNarration(place.id)).toBeUndefined();
    expect(heard).not.toHaveBeenCalled();

    runtime.resume();
    await clock.flush();
    expect(runtime.getSnapshot().narration?.text).toBe('A story to remember after the walk.');
    expect(runtime.getStopNarration(place.id)).toBeUndefined();
    await clock.advance(1000);
    const remembered = runtime.getStopNarration(place.id);
    expect(remembered).toMatchObject({
      title: 'The story of the gate',
      text: 'A story to remember after the walk.',
      keyFacts: ['A fact about the gate.'],
      grounding: { queries: 1, sources: [{ uri: 'https://example.org/gate' }] },
    });
    expect(remembered).not.toHaveProperty('audioPath');
    await clock.advance(6000);
    expect(runtime.getStopNarration(place.id)).toBe(remembered);
    expect(heard).toHaveBeenCalledOnce();
    expect(getNarration).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it('does not retain content when audio fails before anything was heard', async () => {
    const { runtime, audio, clock, heard } = await setup();
    vi.spyOn(audio, 'play').mockRejectedValue(new Error('Playback unavailable'));
    runtime.onFix({ ...place.location, ts: clock.now(), accuracy: 5, speed: 0 });
    await clock.flush();
    await clock.advance(1000);
    expect(runtime.getStopNarration(place.id)).toBeUndefined();
    expect(heard).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('keeps a spoken roaming place readable after passing nearby without entering the arrival radius', async () => {
    const { runtime, clock, heard } = await setup();
    const nearby = destinationPoint(place.location, 180, 80);
    for (let i = 0; i < 3; i++) {
      runtime.onFix({ ...nearby, ts: clock.now(), accuracy: 5, speed: 1.3 });
      await clock.advance(5000);
    }
    await clock.advance(6000);
    expect(runtime.getState().reached[place.id]).toBeUndefined();
    expect(runtime.getState().narrated).toContain(place.id);
    expect(heard).toHaveBeenCalledOnce();
    runtime.setRoute(
      [place, { id: 'next', name: 'Next', location: destinationPoint(nearby, 90, 400) }],
      1,
      true,
    );
    expect(runtime.getSnapshot().stops[0]?.state).toBe('visited');
    expect(runtime.getStopNarration(place.id)?.text).toBe('A story to remember after the walk.');
    await runtime.dispose();
  });
});
