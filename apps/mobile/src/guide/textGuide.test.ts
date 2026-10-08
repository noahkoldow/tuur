import { describe, expect, it, vi } from 'vitest';
import { destinationPoint, type GuideStop, type NarrationResponse } from '@tuur/shared';
import { createDemoBackend } from '../backend/demoBackend';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { FakeClock } from '../testing/fakeClock';
import { GuideRuntime } from './runtime';

const first: GuideStop = { id: 'gate', name: 'Gate', location: { lat: 52.5163, lng: 13.3777 } };
const second: GuideStop = { id: 'next', name: 'Next', location: destinationPoint(first.location, 90, 250) };

async function setup(open = false) {
  const clock = new FakeClock();
  const backend = createDemoBackend({ enforceAccess: true, latencyMs: 0 });
  const narration = vi.spyOn(backend, 'getNarration');
  const transition = vi.spyOn(backend, 'getTransition');
  const audioUrl = vi.spyOn(backend, 'audioUrl');
  const audio = new SimulatedAudioEngine(clock);
  const play = vi.spyOn(audio, 'play');
  const init = vi.spyOn(audio, 'init');
  const runtime = new GuideRuntime({ contentMode: 'text', backend, audio, clock, lang: 'en' });
  await runtime.start([first, second], undefined, { open });
  let ts = 1000;
  const fix = (stop: GuideStop | { location: GuideStop['location'] }) => {
    runtime.onFix({ ...stop.location, ts: (ts += 10000), accuracy: 5, speed: 1.2 });
  };
  return { runtime, narration, transition, audioUrl, play, init, fix };
}

describe('free text guide', () => {
  it('keeps reading at an arrived stop, navigates on departure and never requests or initializes audio', async () => {
    const { runtime, narration, transition, audioUrl, play, init, fix } = await setup();
    fix(first);
    expect(runtime.getState().visited).toEqual(['gate']);
    expect(runtime.getSnapshot().target?.id).toBe('gate');
    fix(first);
    expect(runtime.getSnapshot().target?.id).toBe('gate');
    fix({ location: destinationPoint(first.location, 90, 70) });
    expect(runtime.getSnapshot().target?.id).toBe('next');
    fix(second);
    expect(runtime.getState().visited).toEqual(['gate', 'next']);
    runtime.pause();
    runtime.resume();
    runtime.more();
    runtime.skip();
    expect(runtime.getState().finished).toBe(true);
    expect(runtime.getState().narrated).toEqual([]);
    expect(runtime.getState().playedTier).toEqual({});
    for (const mock of [narration, transition, audioUrl, play, init]) expect(mock).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('emits one crossroads choice on arrival and preserves the current target when navigating back', async () => {
    const { runtime, fix } = await setup(true);
    const commands = vi.fn();
    runtime.addCommandListener(commands);
    fix(first);
    fix(first);
    expect(commands.mock.calls.filter(([c]) => c.type === 'waypoint')).toHaveLength(1);
    runtime.skip();
    fix(second);
    runtime.previous();
    fix(second);
    expect(runtime.getSnapshot().target?.id).toBe(first.id);
    await runtime.dispose();
  });

  it('upgrades at the same destination and cancels an in-flight recording before returning to text', async () => {
    const { runtime, narration, play, init, fix } = await setup();
    let finish!: (value: NarrationResponse) => void;
    narration.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fix(first);
    await runtime.enableAudio();
    expect(runtime.getContentMode()).toBe('audio');
    expect(runtime.getSnapshot().target?.id).toBe(first.id);
    expect(narration).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledOnce();
    await runtime.disableAudio();
    finish({
      key: 'late',
      title: 'Late',
      text: 'Late',
      paragraphs: [],
      audioPath: 'late',
      audioDurationMs: 1000,
      images: [],
      keyFacts: [],
      cached: true,
      aiGenerated: true,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.getContentMode()).toBe('text');
    expect(runtime.getSnapshot().narration).toBeUndefined();
    expect(play).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('does not reactivate audio if its initialization finishes after the return to text', async () => {
    const { runtime, init, narration, fix } = await setup();
    let finish!: () => void;
    init.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fix(first);
    const enabling = runtime.enableAudio();
    await runtime.disableAudio();
    finish();
    await enabling;
    expect(runtime.getContentMode()).toBe('text');
    expect(narration).not.toHaveBeenCalled();
    await runtime.dispose();
  });
});
