import { describe, expect, it } from 'vitest';
import { REGION_FIXTURES } from '../fixtures/regions';
import {
  angleDiff,
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  encodeGeohash,
  geohashBounds,
} from '../geo/geohash';
import { buildPois } from '../poi/pipeline';
import type { Poi } from '../schemas';
import { guideStep, initialGuideState, type GuideCommand } from './engine';
import { pickForkOptions } from './fork';
import { ROAM_PROFILES, corridorLengthM, pickRoamTarget, tilesAhead } from './roam';
import { simulateRoute } from './simulate';

const NOW = 1_700_000_000_000;
const pois = buildPois(REGION_FIXTURES[0]!.raw, { now: NOW }).pois;
const here = { lat: 52.5165, lng: 13.3905 };

describe('pickForkOptions (crossroads)', () => {
  const base = {
    here,
    candidates: pois,
    visitedIds: [] as string[],
    remainingMinutes: 60,
    interests: [],
    profile: 'foot-walking' as const,
  };

  it('returns two distinct options that fit the remaining time', () => {
    const opts = pickForkOptions(base);
    expect(opts.length).toBe(2);
    const [a, b] = opts as [(typeof opts)[0], (typeof opts)[0]];
    expect(a.poi.id).not.toBe(b.poi.id);
    expect(a.poi.primaryInterest !== b.poi.primaryInterest || angleDiff(a.bearing, b.bearing) >= 60).toBe(
      true,
    );
    for (const o of opts) expect(o.walkMinutes + o.poi.dwellMinutes).toBeLessThanOrEqual(60);
  });

  it('never offers visited, hidden or inaccessible places', () => {
    const first = pickForkOptions(base);
    const visited = first.map((o) => o.poi.id);
    const hidden = { ...pois[0]!, hidden: true } as Poi;
    const next = pickForkOptions({ ...base, candidates: [hidden, ...pois], visitedIds: visited });
    for (const o of next) {
      expect(visited).not.toContain(o.poi.id);
      expect(o.poi.hidden).toBe(false);
      expect(o.poi.accessible).toBe(true);
    }
  });

  it('respects the time left including the way to the destination', () => {
    const destination = { lat: 52.5193, lng: 13.399 };
    const tight = pickForkOptions({ ...base, remainingMinutes: 12, destination });
    for (const o of tight) {
      expect(o.walkMinutes + o.poi.dwellMinutes).toBeLessThanOrEqual(12);
    }
    expect(pickForkOptions({ ...base, remainingMinutes: 1 })).toEqual([]);
  });

  it('keeps roughly to the direction of the destination', () => {
    const destination = destinationPoint(here, 90, 1500);
    for (const o of pickForkOptions({ ...base, destination })) {
      expect(angleDiff(o.bearing, bearingDegrees(here, destination))).toBeLessThanOrEqual(100);
    }
  });

  it('prefers the selected interests', () => {
    const nature = pickForkOptions({ ...base, interests: ['nature'] });
    const history = pickForkOptions({ ...base, interests: ['history'] });
    const share = (o: typeof nature, i: 'nature' | 'history') =>
      o.filter((x) => x.poi.interests.includes(i)).length;
    expect(share(nature, 'nature')).toBeGreaterThanOrEqual(share(history, 'nature'));
  });

  it('returns a single option when no distinct alternative exists and none when nothing fits', () => {
    const one = pickForkOptions({ ...base, candidates: [pois[1]!] });
    expect(one.length).toBeLessThanOrEqual(1);
    expect(pickForkOptions({ ...base, candidates: [] })).toEqual([]);
  });
});

describe('roam mode', () => {
  const start = { lat: 52.514, lng: 13.38 };
  const east = 90;
  const base = {
    pos: start,
    heading: east,
    mode: 'walking' as const,
    speedMps: 1.3,
    candidates: pois,
    seenIds: [] as string[],
    interests: [],
    frequency: 'normal' as const,
  };

  it('only picks POIs ahead in the corridor and never behind', () => {
    const t = pickRoamTarget(base);
    if (t) expect(angleDiff(bearingDegrees(start, t.location), east)).toBeLessThanOrEqual(40);
    const west = pickRoamTarget({
      ...base,
      heading: 270,
      candidates: pois.filter((p) => p.location.lng > start.lng + 0.001),
    });
    expect(west).toBeUndefined();
  });

  it('does not repeat: seen ids and same-named places are excluded', () => {
    const seen: string[] = [];
    const picked: string[] = [];
    let pos = start;
    for (let i = 0; i < 12; i++) {
      const t = pickRoamTarget({ ...base, pos, seenIds: seen, frequency: 'high' });
      if (!t) {
        pos = destinationPoint(pos, east, 150);
        continue;
      }
      picked.push(t.id);
      seen.push(t.id);
      pos = t.location;
    }
    expect(new Set(picked).size).toBe(picked.length);
    const dup = { ...pois.find((p) => p.name.includes('Reichstag'))!, id: 'dup', score: 99 } as Poi;
    const orig = pois.find((p) => p.name.includes('Reichstag'))!;
    const res = pickRoamTarget({
      ...base,
      pos: orig.location,
      heading: undefined,
      candidates: [orig, dup],
      seenIds: [orig.id],
      frequency: 'high',
    });
    expect(res).toBeUndefined();
  });

  it('frequency controls how much is narrated (score threshold and spacing)', () => {
    const count = (f: 'low' | 'normal' | 'high') => {
      const seen: string[] = [];
      let last: typeof start | undefined;
      let pos = start;
      for (let step = 0; step < 60; step++) {
        pos = destinationPoint(pos, east, 60);
        const t = pickRoamTarget({
          ...base,
          pos,
          seenIds: seen,
          frequency: f,
          ...(last ? { lastNarratedAt: last } : {}),
        });
        if (t) {
          seen.push(t.id);
          last = t.location;
        }
      }
      return seen.length;
    };
    expect(count('high')).toBeGreaterThanOrEqual(count('normal'));
    expect(count('normal')).toBeGreaterThanOrEqual(count('low'));
    expect(ROAM_PROFILES.low.minGapM).toBeGreaterThan(ROAM_PROFILES.high.minGapM);
  });

  it('looks farther ahead when faster and not at all in a vehicle', () => {
    expect(corridorLengthM('cycling', 5)).toBeGreaterThan(corridorLengthM('walking', 1.3));
    expect(corridorLengthM('vehicle', 15)).toBe(0);
    expect(pickRoamTarget({ ...base, mode: 'vehicle' })).toBeUndefined();
  });

  it('lists the tiles ahead, including neighbouring tiles across a tile boundary', () => {
    const tile = encodeGeohash(start.lat, start.lng, 6);
    const b = geohashBounds(tile);
    const nearEdge = { lat: (b.south + b.north) / 2, lng: b.east - 0.0003 };
    const ahead = tilesAhead(nearEdge, 90, 400);
    expect(ahead.length).toBeGreaterThan(1);
    expect(ahead).toContain(tile);
    expect(ahead.some((t) => t !== tile)).toBe(true);
    expect(tilesAhead(start, 0, 0)).toHaveLength(1);
  });
});

describe('guide engine with open routes (crossroads / roam)', () => {
  const s0 = { id: 'a', name: 'A', location: destinationPoint({ lat: 52.5, lng: 13.4 }, 90, 60) };
  const s1 = { id: 'b', name: 'B', location: destinationPoint({ lat: 52.5, lng: 13.4 }, 90, 260) };
  const readyInfo = {
    durationMs: 30_000,
    lastParagraphMs: 30_000,
    paragraphs: [{ startMs: 0, durationMs: 30_000 }],
  };

  it('emits a waypoint once the stop was heard, waits for the next stop instead of finishing, then continues', () => {
    let state = guideStep(initialGuideState(), { type: 'setRoute', stops: [s0], open: true }).state;
    const cmds: GuideCommand[] = [];
    const feed = (ev: Parameters<typeof guideStep>[1]) => {
      const r = guideStep(state, ev);
      state = r.state;
      cmds.push(...r.commands);
    };
    const path = [{ lat: 52.5, lng: 13.4 }, destinationPoint({ lat: 52.5, lng: 13.4 }, 90, 120)];
    let ended = false;
    for (const f of simulateRoute(path, { startTs: NOW, speedMps: 1.35 })) {
      feed({ type: 'location', fix: f });
      if (cmds.some((c) => c.type === 'prefetch') && !state.ready['a:short'] && !state.ready['a:medium'])
        feed({ type: 'ready', poiId: 'a', tier: state.tierFor['a'] ?? 'short', info: readyInfo });
      if (state.playback && !ended && f.ts - state.playback.startedTs > 31_000) {
        ended = true;
        feed({ type: 'ended', poiId: 'a', kind: 'stop', completed: true, ts: f.ts });
      }
    }
    expect(cmds.filter((c) => c.type === 'waypoint')).toHaveLength(1);
    expect(state.finished).toBe(false);
    expect(state.awaitingRoute).toBe(true);
    expect(cmds.some((c) => c.type === 'needNext')).toBe(true);
    expect(cmds.some((c) => c.type === 'finish')).toBe(false);
    feed({ type: 'setRoute', stops: [s0, s1], startIndex: 1, open: true });
    expect(state.awaitingRoute).toBe(false);
    expect(state.route.map((r) => r.id)).toEqual(['a', 'b']);
    expect(state.narrated).toContain('a');
  });

  it('a closed route still finishes', () => {
    const r = guideStep(initialGuideState(), { type: 'setRoute', stops: [s0] });
    expect(r.state.open).toBe(false);
    expect(distanceMeters(s0.location, s1.location)).toBeGreaterThan(150);
  });
});
