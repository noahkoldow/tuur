import { describe, expect, it } from 'vitest';
import { guideStep, initialGuideState, restoreGuideState, type GuideStop } from './engine';

const stop: GuideStop = { id: 'museum', name: 'Museum', location: { lat: 52.52, lng: 13.4 } };
const end: GuideStop = {
  id: 'destination',
  name: 'Destination',
  location: { lat: 52.53, lng: 13.4 },
  navigationOnly: true,
};
const fix = (location: GuideStop['location'], ts: number) => ({
  type: 'location' as const,
  fix: { ...location, ts, speed: 0, accuracy: 5 },
});

describe('final route leg', () => {
  it('does not finish after the last POI and never narrates or records the destination as a POI', () => {
    let state = initialGuideState([stop, end]);
    state.narrated = [stop.id];
    state.playedTier = { [stop.id]: 'long' };
    const first = guideStep(state, fix(stop.location, 1000));
    state = first.state;
    expect(state.index).toBe(1);
    expect(state.finished).toBe(false);
    expect(first.commands).not.toContainEqual(expect.objectContaining({ poiId: end.id }));
    const arrival = guideStep(state, fix(end.location, 2000));
    expect(arrival.state.finished).toBe(true);
    expect(arrival.state.visited).toEqual([stop.id]);
    expect(arrival.commands.map((c) => c.type)).toEqual(['notice', 'finish']);
  });

  it('does not count the first location at the round-trip start as final arrival', () => {
    let state = guideStep(initialGuideState([stop, end]), fix(end.location, 1000)).state;
    expect(state.reached[end.id]).toBeUndefined();
    state.narrated = [stop.id];
    state = guideStep(state, fix(stop.location, 2000)).state;
    expect(state.finished).toBe(false);
    expect(state.index).toBe(1);
  });
});

describe('guide recovery', () => {
  it('restores visited stops paused, then continues interrupted speech from its saved position', () => {
    const state = restoreGuideState([stop, end], {
      index: 0,
      visited: [],
      skipped: [],
      narrated: [],
      playedTier: {},
      playback: { poiId: stop.id, tier: 'medium', positionMs: 42_000 },
    });
    expect(state.paused).toBe(true);
    expect(guideStep(state, fix(stop.location, 1000)).commands.some((c) => c.type === 'play')).toBe(false);
    const resumed = guideStep(state, { type: 'resume', ts: 2000 });
    expect(resumed.commands).toContainEqual({
      type: 'play',
      poiId: stop.id,
      tier: 'medium',
      reason: 'pending',
      skipMs: 42_000,
    });
  });

  it('drops stale audio readiness and preserves open-route completion without reviving a finished tour', () => {
    const progress = {
      index: 1,
      visited: [stop.id, 'gone'],
      skipped: [],
      narrated: [stop.id],
      playedTier: {},
    };
    const open = restoreGuideState([stop], progress, true);
    expect(open.awaitingRoute).toBe(true);
    expect(open.finished).toBe(false);
    expect(open.visited).toEqual([stop.id]);
    expect(open.ready).toEqual({});
    expect(open.requested).toEqual({});
    expect(restoreGuideState([stop], progress).finished).toBe(true);
  });

  it('continues past an already heard and reached POI after reopening farther along the route', () => {
    const restored = restoreGuideState([stop, end], {
      index: 0,
      visited: [],
      skipped: [],
      narrated: [stop.id],
      playedTier: { [stop.id]: 'short' },
      reached: { [stop.id]: true },
      closest: { [stop.id]: 2 },
    });
    const walking = guideStep(restored, fix({ lat: 52.525, lng: 13.4 }, 1000));
    expect(walking.state.index).toBe(1);
    expect(walking.state.finished).toBe(false);
  });
});
