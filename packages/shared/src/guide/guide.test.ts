import { describe, expect, it } from 'vitest';
import { LENGTH_TIER_SECONDS, type LengthTier } from '../constants';
import { destinationPoint, distanceMeters, type LatLng } from '../geo/geohash';
import {
  guideStep,
  initialGuideState,
  type GuideCommand,
  type GuideEvent,
  type GuideState,
  type GuideStop,
  type NarrationInfo,
  DEFAULT_GUIDE_PREFS,
} from './engine';
import {
  chooseTier,
  DEFAULT_PACING,
  etaSeconds,
  msToParagraphEnd,
  nextLongerTier,
  nominalTiming,
  resumeParagraphIndex,
  startThresholdSeconds,
} from './pacing';
import { pathLength, pointAlong, simulateRoute } from './simulate';
import { classifySpeed, initialTravel, updateTravel } from './travel';

const origin: LatLng = { lat: 52.5, lng: 13.4 };
const T0 = 1_700_000_000_000;

/** Straight east-west street with stops every `gap` meters. */
function street(n: number, gap: number): { path: LatLng[]; stops: GuideStop[] } {
  const path = [origin, destinationPoint(origin, 90, gap * (n - 1) + 80)];
  const stops = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    name: `Stop ${i}`,
    location: destinationPoint(origin, 90, 60 + i * gap),
  }));
  return { path, stops };
}

describe('travel tracker', () => {
  const run = (speed: number, seconds = 60, opts: { noiseM?: number } = {}) => {
    const path = [origin, destinationPoint(origin, 90, speed * seconds + 10)];
    let t = initialTravel();
    for (const f of simulateRoute(path, { startTs: T0, speedMps: speed, ...opts })) t = updateTravel(t, f);
    return t;
  };

  it('classifies walking, cycling, vehicle and standing still', () => {
    expect(run(1.3).mode).toBe('walking');
    expect(run(4.5).mode).toBe('cycling');
    expect(run(14).mode).toBe('vehicle');
    let t = initialTravel();
    for (let i = 0; i < 30; i++) t = updateTravel(t, { ...origin, ts: T0 + i * 1000, accuracy: 5, speed: 0 });
    expect(t.mode).toBe('stationary');
    expect(t.stationarySinceTs).toBeDefined();
    expect(classifySpeed(0.2)).toBe('stationary');
    expect(classifySpeed(2)).toBe('walking');
    expect(classifySpeed(6)).toBe('cycling');
    expect(classifySpeed(12)).toBe('vehicle');
  });

  it('stays robust with GPS noise', () => {
    expect(run(1.3, 90, { noiseM: 4 }).mode).toBe('walking');
    expect(run(4.5, 60, { noiseM: 4 }).mode).toBe('cycling');
  });

  it('does not flap on a short stop (traffic light) and ignores glitches and poor fixes', () => {
    const path = [origin, destinationPoint(origin, 90, 400)];
    let t = initialTravel();
    const fixes = simulateRoute(path, { startTs: T0, speedMps: 1.3, stops: [{ atMeters: 60, seconds: 2 }] });
    const modes = new Set<string>();
    for (const f of fixes) {
      t = updateTravel(t, f);
      if (f.ts > T0 + 20_000) modes.add(t.mode);
    }
    expect(modes.has('stationary')).toBe(false);
    const before = t;
    expect(
      updateTravel(t, { ...destinationPoint(origin, 0, 50_000), ts: T0 + 500_000, accuracy: 5 }).mode,
    ).toBe(before.mode);
    expect(updateTravel(t, { ...origin, ts: T0 + 500_000, accuracy: 500 })).toBe(t);
  });

  it('tracks heading', () => {
    const t = run(1.3, 30);
    expect(t.heading).toBeGreaterThan(80);
    expect(t.heading).toBeLessThan(100);
  });
});

describe('pacing', () => {
  it('chooses the longest tier that fits the window; cycling and vehicle travel stay short', () => {
    expect(chooseTier(400, 'walking')).toBe('long');
    expect(chooseTier(120, 'walking')).toBe('medium');
    expect(chooseTier(45, 'walking')).toBe('short');
    expect(chooseTier(5, 'walking')).toBe('short');
    expect(chooseTier(600, 'cycling')).toBe('short');
    expect(chooseTier(600, 'vehicle')).toBe('short');
    expect(chooseTier(600, 'walking', { ...DEFAULT_PACING, maxTier: 'medium' })).toBe('medium');
  });

  it('computes plausible ETAs and infinite ETA when standing', () => {
    expect(etaSeconds(135, 'walking', 1.35)).toBeCloseTo(100, 0);
    expect(etaSeconds(100, 'walking', 0.1)).toBeLessThan(130);
    expect(etaSeconds(100, 'stationary', 0)).toBe(Infinity);
    expect(etaSeconds(420, 'cycling', 4.2)).toBeCloseTo(100, 0);
    expect(etaSeconds(1600, 'vehicle', 32)).toBeCloseTo(50, 0);
  });

  it('starts before arrival so the closing part lands at the stop', () => {
    const t = nominalTiming('long');
    expect(startThresholdSeconds(t)).toBeCloseTo(180 - 54 + DEFAULT_PACING.leadSec, 5);
    expect(startThresholdSeconds({ durationMs: 30_000, lastParagraphMs: 30_000 })).toBe(
      DEFAULT_PACING.leadSec,
    );
  });

  it('resumes a longer tier after the paragraphs already heard and finds paragraph ends', () => {
    const ps = [0, 1, 2, 3].map((i) => ({ startMs: i * 45_000, durationMs: 45_000 }));
    expect(resumeParagraphIndex(ps, 30_000)).toBe(0);
    expect(resumeParagraphIndex(ps, 90_000)).toBe(2);
    expect(resumeParagraphIndex(ps, 10_000_000)).toBe(3);
    expect(resumeParagraphIndex([], 1000)).toBe(0);
    expect(msToParagraphEnd(ps, 10_000)).toBe(35_000);
    expect(msToParagraphEnd(ps, 999_999)).toBe(0);
    expect(nextLongerTier('short')).toBe('medium');
    expect(nextLongerTier('long')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Harness: executes engine commands like the app would (prefetch -> ready, play -> ends after its duration, stops at
// paragraph boundaries on request) while replaying simulated GPS fixes.

const PARAS: Record<LengthTier, number> = { short: 1, medium: 2, long: 4 };
const info = (tier: LengthTier): NarrationInfo => {
  const total = LENGTH_TIER_SECONDS[tier] * 1000;
  const n = PARAS[tier];
  const d = total / n;
  return {
    durationMs: total,
    lastParagraphMs: d,
    paragraphs: Array.from({ length: n }, (_, i) => ({ startMs: i * d, durationMs: d })),
  };
};

interface PlayLog {
  poiId: string;
  tier: LengthTier;
  ts: number;
  distToStop: number;
  reason: string;
  skipMs?: number;
}

function harness(
  stops: GuideStop[],
  opts: { prefs?: Partial<typeof DEFAULT_GUIDE_PREFS>; failIds?: string[] } = {},
) {
  const prefs = { ...DEFAULT_GUIDE_PREFS, ...opts.prefs };
  let state: GuideState = guideStep(initialGuideState(), { type: 'setRoute', stops }, prefs).state;
  const log = {
    transitions: [] as number[],
    plays: [] as PlayLog[],
    commands: [] as GuideCommand[],
    ended: [] as {
      poiId: string;
      kind: string;
      ts: number;
      positionMs: number;
      onBoundary: boolean;
      completed: boolean;
    }[],
  };
  let playing:
    | {
        kind: 'stop' | 'transition';
        poiId: string;
        tier: LengthTier;
        startTs: number;
        skipMs: number;
        endTs: number;
        stopAt?: number;
      }
    | undefined;
  let now = 0;

  const dispatch = (ev: GuideEvent) => {
    const res = guideStep(state, ev, prefs);
    state = res.state;
    for (const c of res.commands) {
      log.commands.push(c);
      exec(c);
    }
  };
  const exec = (c: GuideCommand) => {
    switch (c.type) {
      case 'prefetch':
        if (opts.failIds?.includes(c.poiId))
          queueMicro(() => dispatch({ type: 'failed', poiId: c.poiId, ts: now }));
        else dispatch({ type: 'ready', poiId: c.poiId, tier: c.tier, info: info(c.tier) });
        break;
      case 'play': {
        const stop = stops.find((x) => x.id === c.poiId)!;
        log.plays.push({
          poiId: c.poiId,
          tier: c.tier,
          ts: now,
          distToStop: state.travel.last ? distanceMeters(state.travel.last, stop.location) : NaN,
          reason: c.reason,
          ...(c.skipMs ? { skipMs: c.skipMs } : {}),
        });
        const skip = c.skipMs ?? 0;
        playing = {
          kind: 'stop',
          poiId: c.poiId,
          tier: c.tier,
          startTs: now,
          skipMs: skip,
          endTs: now + info(c.tier).durationMs - skip,
        };
        break;
      }
      case 'transition':
        log.transitions.push(now);
        playing = {
          kind: 'transition',
          poiId: c.toPoiId,
          tier: 'short',
          startTs: now,
          skipMs: 0,
          endTs: now + 8_000,
        };
        break;
      case 'stopAtParagraphEnd': {
        if (!playing) break;
        const pos = now - playing.startTs + playing.skipMs;
        const ps =
          playing.kind === 'transition' ? [{ startMs: 0, durationMs: 8_000 }] : info(playing.tier).paragraphs;
        const cur = ps.find((p) => pos < p.startMs + p.durationMs);
        playing.stopAt = cur ? playing.startTs + (cur.startMs + cur.durationMs - playing.skipMs) : now;
        break;
      }
      case 'stopNow':
        playing = undefined;
        break;
      default:
        break;
    }
  };
  const microQueue: (() => void)[] = [];
  const queueMicro = (f: () => void) => microQueue.push(f);

  const tick = (ts: number) => {
    // fire scheduled end events up to ts (in order)
    while (playing) {
      const end = Math.min(playing.endTs, playing.stopAt ?? Infinity);
      if (end > ts) break;
      const p = playing;
      playing = undefined;
      const pos = end - p.startTs + p.skipMs;
      const bounds =
        p.kind === 'transition' ? [8_000] : info(p.tier).paragraphs.map((x) => x.startMs + x.durationMs);
      log.ended.push({
        poiId: p.poiId,
        kind: p.kind,
        ts: end,
        positionMs: pos,
        onBoundary: bounds.some((b) => Math.abs(b - pos) < 5),
        completed: end === p.endTs,
      });
      now = end;
      dispatch({ type: 'ended', poiId: p.poiId, kind: p.kind, completed: end === p.endTs, ts: end });
    }
    while (microQueue.length) microQueue.shift()!();
    now = ts;
    if (playing)
      dispatch({ type: 'progress', positionMs: Math.max(0, ts - playing.startTs + playing.skipMs), ts });
  };

  return {
    prefs,
    get state() {
      return state;
    },
    log,
    fix: (f: Parameters<typeof updateTravel>[1]) => {
      tick(f.ts);
      dispatch({ type: 'location', fix: f });
    },
    event: (ev: GuideEvent) => {
      if ('ts' in ev) tick(ev.ts);
      dispatch(ev);
    },
    tick,
    isPlaying: () => Boolean(playing),
  };
}

/** The listener keeps standing at the end of the route (GPS keeps reporting). */
const tail = (fixes: ReturnType<typeof simulateRoute>, seconds: number) => {
  const last = fixes[fixes.length - 1]!;
  return [
    ...fixes,
    ...Array.from({ length: seconds }, (_, i) => ({ ...last, ts: last.ts + (i + 1) * 1000, speed: 0 })),
  ];
};

describe('guide engine with simulated GPS', () => {
  const { path, stops } = street(5, 220);

  it('walks a whole tour: every stop narrated once in order, narration starts before arrival, then finishes', () => {
    const h = harness(stops);
    for (const f of tail(simulateRoute(path, { startTs: T0, speedMps: 1.35, noiseM: 3, seed: 7 }), 90))
      h.fix(f);
    h.tick(T0 + 3_600_000);
    expect(h.state.finished).toBe(true);
    expect(h.state.visited).toEqual(stops.map((s) => s.id));
    const stopPlays = h.log.plays.filter((p) => p.reason === 'approach' || p.reason === 'pending');
    expect(stopPlays.map((p) => p.poiId)).toEqual(stops.map((s) => s.id));
    expect(new Set(stopPlays.map((p) => p.poiId)).size).toBe(stops.length);
    // the highlight (closing paragraph) should land at the stop: narration starts while still approaching
    for (const p of stopPlays.slice(1)) expect(p.distToStop).toBeGreaterThan(15);
    expect(h.log.commands.filter((c) => c.type === 'finish')).toHaveLength(1);
  });

  it('uses a shorter tier when the time window before arrival is small', () => {
    const close = street(4, 90);
    const h = harness(close.stops);
    for (const f of simulateRoute(close.path, { startTs: T0, speedMps: 1.35 })) h.fix(f);
    h.tick(T0 + 3_600_000);
    const tiers = h.log.plays.map((p) => p.tier);
    expect(tiers.slice(1).every((t) => t !== 'long')).toBe(true);
  });

  it('never stops narration mid-paragraph when the next stop is reached (queues and ends at the boundary)', () => {
    const tight = street(4, 20); // stops closer than any narration lasts
    const h = harness(tight.stops, { prefs: { arrivalRadiusM: 8 } });
    for (const f of tail(simulateRoute(tight.path, { startTs: T0, speedMps: 1.35 }), 120)) h.fix(f);
    h.tick(T0 + 3_600_000);
    expect(h.log.commands.some((c) => c.type === 'stopAtParagraphEnd')).toBe(true);
    for (const e of h.log.ended) expect(e.onBoundary).toBe(true);
    expect(h.log.plays.some((p) => p.reason === 'pending')).toBe(true);
    expect(h.state.finished).toBe(true);
  });

  it('cycling: short narrations only', () => {
    const h = harness(street(5, 300).stops);
    for (const f of simulateRoute(street(5, 300).path, { startTs: T0, speedMps: 4.5 })) h.fix(f);
    h.tick(T0 + 3_600_000);
    expect(h.log.plays.length).toBeGreaterThan(0);
    expect(h.log.plays.every((p) => p.tier === 'short')).toBe(true);
  });

  it('keeps narrating through car/public-transport travel and after returning to walking', () => {
    const h = harness(street(5, 400).stops);
    const p = street(5, 400).path;
    const fixes = simulateRoute(p, {
      startTs: T0,
      profile: [
        { untilMeters: 200, speedMps: 1.35 },
        { untilMeters: 900, speedMps: 14 },
        { untilMeters: Infinity, speedMps: 1.35 },
      ],
    });
    const vehicleCommands: GuideCommand[] = [];
    const modes = new Set<string>();
    for (const f of fixes) {
      const before = h.log.commands.length;
      h.fix(f);
      modes.add(h.state.travel.mode);
      if (h.state.travel.mode === 'vehicle') vehicleCommands.push(...h.log.commands.slice(before));
    }
    expect(modes.has('vehicle')).toBe(true);
    expect(h.state.travel.mode).toBe('walking');
    expect(h.log.commands.some((c) => c.type === 'pause')).toBe(false);
    const plays = vehicleCommands.filter((c) => c.type === 'play');
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((c) => c.tier === 'short')).toBe(true);
  });

  it('offers "tell me more" once when the user stands at a finished stop and continues seamlessly', () => {
    const { path: p, stops: st } = street(3, 200);
    const h = harness(st);
    const fixes = tail(
      simulateRoute(p, { startTs: T0, speedMps: 1.35, stops: [{ atMeters: 60 + 4, seconds: 120 }] }),
      120,
    );
    let offered = 0;
    for (const f of fixes) {
      h.fix(f);
      if (h.log.commands.filter((c) => c.type === 'offerMore').length > offered && offered === 0) {
        offered++;
        h.event({ type: 'more', ts: f.ts });
      }
    }
    h.tick(T0 + 3_600_000);
    expect(h.log.commands.filter((c) => c.type === 'offerMore').length).toBeGreaterThanOrEqual(1);
    const more = h.log.plays.find((x) => x.reason === 'more');
    expect(more).toBeDefined();
    expect(more!.poiId).toBe('s0');
    expect(more!.skipMs).toBeGreaterThan(0);
    expect(h.state.finished).toBe(true);
  });

  it('skip jumps to the next stop and stops audio; previous goes back', () => {
    const h = harness(stops);
    const fixes = simulateRoute(path, { startTs: T0, speedMps: 1.35 });
    let skipped = false;
    for (const f of fixes) {
      h.fix(f);
      if (!skipped && h.isPlaying()) {
        skipped = true;
        h.event({ type: 'skip', ts: f.ts });
        expect(h.state.skipped).toEqual(['s0']);
        expect(h.log.commands.some((c) => c.type === 'stopNow')).toBe(true);
        expect(h.state.index).toBe(1);
        h.event({ type: 'previous', ts: f.ts + 1 });
        expect(h.state.index).toBe(0);
        h.event({ type: 'skip', ts: f.ts + 2 });
      }
    }
    expect(skipped).toBe(true);
  });

  it('keeps going when a narration is unavailable (failed)', () => {
    const h = harness(stops, { failIds: ['s1'] });
    for (const f of tail(simulateRoute(path, { startTs: T0, speedMps: 1.35 }), 90)) h.fix(f);
    h.tick(T0 + 3_600_000);
    expect(h.state.finished).toBe(true);
    expect(h.state.visited).not.toContain('s1');
    expect(h.state.skipped).toContain('s1');
  });

  it('prefetches lazily: only the current target at the start, later stops shortly before they are needed (cost brake)', () => {
    const h = harness(stops);
    const fixes = simulateRoute(path, { startTs: T0, speedMps: 1.35 });
    for (const f of fixes.slice(0, 14)) h.fix(f);
    const first = h.log.commands.filter((c) => c.type === 'prefetch');
    expect(first.map((c) => (c as { poiId: string }).poiId)).toEqual(['s0']);
    for (const f of fixes.slice(14)) h.fix(f);
    h.tick(T0 + 3_600_000);
    const all = h.log.commands.filter((c) => c.type === 'prefetch');
    expect(new Set(all.map((c) => (c as { poiId: string }).poiId)).size).toBe(stops.length);
    expect(all.length).toBeLessThanOrEqual(stops.length + 1);
  });

  it('paused state blocks narration until resumed', () => {
    const h = harness(stops);
    h.event({ type: 'pause', ts: T0 });
    for (const f of simulateRoute(path, { startTs: T0, speedMps: 1.35 }).slice(0, 200)) h.fix(f);
    expect(h.log.plays).toHaveLength(0);
    h.event({ type: 'resume', ts: T0 + 201_000 });
    h.fix({ ...stops[0]!.location, ts: T0 + 202_000, accuracy: 5, speed: 1.3 });
    expect(h.log.plays.length).toBeGreaterThan(0);
  });

  it('handles an empty route gracefully and reports position helpers', () => {
    const res = guideStep(initialGuideState([]), { type: 'location', fix: { ...origin, ts: T0 } });
    expect(res.commands).toEqual([]);
    expect(pathLength([origin, destinationPoint(origin, 90, 100)])).toBeCloseTo(100, 0);
    expect(pointAlong([origin, destinationPoint(origin, 90, 100)], 50).heading).toBeCloseTo(90, 0);
  });
});
