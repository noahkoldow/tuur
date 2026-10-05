import { describe, expect, it, vi } from 'vitest';
import { createTourScript, type GuideStop } from '@tuur/shared';
import { createDemoBackend } from '../backend/demoBackend';
import { SimulatedAudioEngine } from '../audio/simulatedEngine';
import { FakeClock } from '../testing/fakeClock';
import { GuideRuntime } from './runtime';

describe('tour story context throughout a walk', () => {
  it('retains the original script when changing destinations or continuing a planned tour in Explore', async () => {
    const backend = createDemoBackend({ latencyMs: 0 });
    const narration = vi.spyOn(backend, 'getNarration').mockImplementation(() => new Promise(() => {}));
    const clock = new FakeClock();
    const script = createTourScript({ lang: 'de', interests: ['architecture'] });
    const first: GuideStop = { id: 'first', name: 'Platz', location: { lat: 52.5, lng: 13.4 } };
    const second: GuideStop = { id: 'second', name: 'Gasse', location: { lat: 52.501, lng: 13.4 } };
    const runtime = new GuideRuntime({
      backend,
      audio: new SimulatedAudioEngine(clock),
      lang: 'de',
      clock,
      script,
    });
    await runtime.start([first, second]);
    runtime.onFix({ ...first.location, ts: clock.now(), accuracy: 5, speed: 0 });
    expect(narration.mock.calls[0]![0].context).toMatchObject({
      script,
      chapter: 1,
      chapters: 2,
      nextPoiName: 'Gasse',
    });

    runtime.setAccess({ mode: 'roam' });
    runtime.explore();
    runtime.retarget(second);
    runtime.onFix({ ...second.location, ts: clock.now() + 5000, accuracy: 5, speed: 0 });
    expect(runtime.getScript()).toEqual(script);
    const latest = narration.mock.calls.at(-1)![0];
    expect(latest.context?.script).toEqual(script);
    expect(latest.context?.chapters).toBeUndefined();
    expect(latest.access?.mode).toBe('roam');
    await runtime.dispose();
  });
});
