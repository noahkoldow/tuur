import { describe, expect, it } from 'vitest';
import { destinationPoint } from '../geo/geohash';
import { guideStep, initialGuideState, type GuideStop, type NarrationInfo } from './engine';

const stop: GuideStop = {
  id: 'berlin-gate',
  name: 'Brandenburg Gate',
  location: { lat: 52.5163, lng: 13.3777 },
};
const info: NarrationInfo = {
  durationMs: 30_000,
  lastParagraphMs: 30_000,
  paragraphs: [{ startMs: 0, durationMs: 30_000 }],
};

describe('explored stops and city-badge history', () => {
  it('records the current reached stop immediately, without needing to walk away or finish the story', () => {
    let state = guideStep(initialGuideState([stop]), {
      type: 'location',
      fix: { ...stop.location, ts: 1000, accuracy: 5, speed: 0 },
    }).state;
    expect(state.visited).toEqual([]);
    const started = guideStep(state, { type: 'ready', poiId: stop.id, tier: state.tierFor[stop.id]!, info });
    expect(started.state.index).toBe(0);
    expect(started.state.finished).toBe(false);
    expect(started.commands.some((c) => c.type === 'visited')).toBe(false);
    state = started.state;
    const progress = guideStep(state, { type: 'progress', positionMs: 1000, ts: 2000 });
    expect(progress.state.visited).toEqual([stop.id]);
    expect(progress.commands).toContainEqual({ type: 'visited', poiId: stop.id });
    expect(guideStep(progress.state, { type: 'progress', positionMs: 2000, ts: 3000 }).commands).toEqual([]);
  });

  it('does not award a visit for a story heard remotely or a place skipped before playback', () => {
    const state = initialGuideState([stop]);
    state.travel = {
      mode: 'walking',
      speedMps: 1.3,
      last: { ...destinationPoint(stop.location, 270, 60), ts: 1000, speed: 1.3 },
    };
    const ready = guideStep(state, { type: 'ready', poiId: stop.id, tier: 'short', info });
    expect(ready.state.visited).toEqual([]);
    const skipped = guideStep(ready.state, { type: 'skip', ts: 2000 });
    expect(skipped.state.visited).toEqual([]);
    expect(skipped.commands.filter((c) => c.type === 'visited')).toEqual([]);
  });

  it('does not award an arrival badge while content is loading or when audio fails before playing', () => {
    let state = guideStep(initialGuideState([stop]), {
      type: 'location',
      fix: { ...stop.location, ts: 1000, accuracy: 5, speed: 0 },
    }).state;
    expect(state.reached[stop.id]).toBe(true);
    expect(state.visited).toEqual([]);
    state = guideStep(state, { type: 'ready', poiId: stop.id, tier: state.tierFor[stop.id]!, info }).state;
    const failed = guideStep(state, { type: 'failed', poiId: stop.id, ts: 2000 });
    expect(failed.state.visited).toEqual([]);
    expect(failed.state.skipped).toEqual([stop.id]);
    expect(failed.commands.some((c) => c.type === 'visited')).toBe(false);
  });
});

describe('car and public-transport arrivals between GPS fixes', () => {
  function approaching(playing = true) {
    const state = initialGuideState([stop]);
    state.travel = {
      mode: 'vehicle',
      speedMps: 25,
      last: { ...destinationPoint(stop.location, 270, 200), ts: 1000, speed: 25, accuracy: 5 },
    };
    if (!playing) return state;
    const started = guideStep(state, { type: 'ready', poiId: stop.id, tier: 'short', info }).state;
    return guideStep(started, { type: 'progress', positionMs: 1000, ts: 2000 }).state;
  }

  it('recognizes a narrated stop crossed between reliable vehicle GPS updates', () => {
    const state = approaching();
    expect(state.playback?.tier).toBe('short');
    const crossing = guideStep(state, {
      type: 'location',
      fix: { ...destinationPoint(stop.location, 90, 200), ts: 11_000, speed: 40, accuracy: 5 },
    });
    expect(crossing.state.reached[stop.id]).toBe(true);
    expect(crossing.state.visited).toEqual([stop.id]);
    expect(crossing.commands).toContainEqual({ type: 'visited', poiId: stop.id });
    expect(crossing.commands.some((c) => c.type === 'pause')).toBe(false);
  });

  it.each([
    { ts: 61_000, speed: 25, accuracy: 5 }, // GPS lost in a tunnel
    { ts: 2000, speed: 25, accuracy: 5 }, // implausible positional jump despite a plausible reported speed
    { ts: 11_000, speed: 25, accuracy: 150 }, // poor accuracy
  ])('does not infer a visit from a gap or bad fix (%j)', (fix) => {
    const result = guideStep(approaching(), {
      type: 'location',
      fix: { ...destinationPoint(stop.location, 90, 300), ...fix },
    });
    expect(result.state.reached[stop.id]).toBeUndefined();
    expect(result.state.visited).toEqual([]);
  });

  it('does not count a passed stop whose story was never ready', () => {
    const result = guideStep(approaching(false), {
      type: 'location',
      fix: { ...destinationPoint(stop.location, 90, 200), ts: 11_000, speed: 40, accuracy: 5 },
    });
    expect(result.state.skipped).toEqual([stop.id]);
    expect(result.state.visited).toEqual([]);
  });

  it('shortens a prefetched walking story when vehicle travel starts before playback', () => {
    const state = approaching(false);
    state.tierFor[stop.id] = 'long';
    state.tierMode[stop.id] = 'walking';
    state.requested[`${stop.id}:long`] = true;
    const ready = guideStep(state, { type: 'ready', poiId: stop.id, tier: 'long', info });
    expect(ready.state.tierFor[stop.id]).toBe('short');
    expect(ready.commands).toContainEqual({ type: 'prefetch', poiId: stop.id, tier: 'short' });
    expect(ready.commands.some((c) => c.type === 'play')).toBe(false);
  });
});
