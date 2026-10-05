import type { LengthTier, TravelMode } from '../constants';
import { distanceMeters, type LatLng } from '../geo/geohash';
import {
  DEFAULT_PACING,
  chooseTier,
  etaSeconds,
  nextLongerTier,
  nominalTiming,
  startThresholdSeconds,
  type NarrationTiming,
  type PacingPrefs,
  type ParagraphTiming,
} from './pacing';
import { initialTravel, updateTravel, type Fix, type TravelState } from './travel';

export interface GuideStop {
  id: string;
  name: string;
  location: LatLng;
  /** Final route destination: navigate there without requesting a POI story or recording a visit. */
  navigationOnly?: boolean;
}

/** Device-local recovery data. Audio URLs, GPS history and native player state are deliberately omitted. */
export interface GuideProgress {
  index: number;
  visited: string[];
  skipped: string[];
  narrated: string[];
  playedTier: Record<string, LengthTier>;
  reached?: Record<string, true>;
  closest?: Record<string, number>;
  playback?: { poiId: string; tier: LengthTier; positionMs: number };
}

export interface NarrationInfo extends NarrationTiming {
  paragraphs: ParagraphTiming[];
}

export interface GuidePrefs extends PacingPrefs {
  /** Arrival radius for walking; scaled up for cycling and vehicles. */
  arrivalRadiusM: number;
  /** After this long standing at a finished stop the app offers "tell me more". */
  moreOfferAfterSec: number;
  /** How long the offer stays open before the tour moves on. */
  moreOfferTtlSec: number;
  /** Prefetch a stop's narration this many seconds (plus its duration) before the start threshold. */
  prefetchLeadSec: number;
  /** Extra time the listener is assumed to spend around a stop when choosing a narration length. */
  dwellAllowanceSec: number;
}

export const DEFAULT_GUIDE_PREFS: GuidePrefs = {
  ...DEFAULT_PACING,
  arrivalRadiusM: 35,
  moreOfferAfterSec: 8,
  moreOfferTtlSec: 20,
  prefetchLeadSec: 150,
  dwellAllowanceSec: 45,
};

export type PlaybackKind = 'stop' | 'transition';

export interface Playback {
  kind: PlaybackKind;
  poiId: string;
  tier: LengthTier;
  startedTs: number;
  positionMs: number;
  stopRequested: boolean;
}

export interface GuideState {
  route: GuideStop[];
  /** Index of the stop we are heading to / standing at. */
  index: number;
  visited: string[];
  skipped: string[];
  /** Stops whose narration has been played (fully or up to a paragraph end). */
  narrated: string[];
  /** Stops the listener physically reached (came within the arrival radius). */
  reached: Record<string, true>;
  /** Closest distance to each stop so far (detects passing by without reaching the radius). */
  closest: Record<string, number>;
  travel: TravelState;
  playback?: Playback;
  /** Content queued behind the current playback (played when it ends at a paragraph boundary). */
  pending?: { poiId: string; tier: LengthTier; skipMs?: number };
  /** Hand-over text waiting for the current narration to end. */
  pendingTransition?: { fromPoiId: string; toPoiId: string; walkMinutes: number };
  /** Tier chosen at first prefetch; may shorten before playback when vehicle travel begins. */
  tierFor: Record<string, LengthTier>;
  tierMode: Record<string, TravelMode>;
  /** Highest tier played per stop. */
  playedTier: Record<string, LengthTier>;
  /** Content the app reported as ready (with real timings). */
  ready: Record<string, NarrationInfo>;
  requested: Record<string, true>;
  paused: boolean;
  moreOffer?: { poiId: string; tier: LengthTier; ts: number };
  moreOffered: Record<string, true>;
  finished: boolean;
  /** Open-ended routes (crossroads, roam) wait for the next stop instead of finishing at the end. */
  open: boolean;
  awaitingRoute: boolean;
  waypointSent: Record<string, true>;
  lastTs: number;
}

export type GuideEvent =
  | { type: 'setRoute'; stops: GuideStop[]; startIndex?: number; open?: boolean }
  | { type: 'location'; fix: Fix }
  | { type: 'ready'; poiId: string; tier: LengthTier; info: NarrationInfo }
  | { type: 'progress'; positionMs: number; ts: number }
  | { type: 'ended'; poiId: string; kind: PlaybackKind; completed: boolean; ts: number }
  | { type: 'failed'; poiId: string; kind?: PlaybackKind; ts: number }
  | { type: 'skip'; ts: number }
  | { type: 'previous'; ts: number }
  | { type: 'pause'; ts: number }
  | { type: 'resume'; ts: number }
  | { type: 'more'; ts: number };

export type GuideCommand =
  | { type: 'prefetch'; poiId: string; tier: LengthTier }
  | {
      type: 'play';
      poiId: string;
      tier: LengthTier;
      reason: 'approach' | 'pending' | 'more' | 'previous';
      skipMs?: number;
    }
  | { type: 'stopAtParagraphEnd' }
  | { type: 'stopNow' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'offerMore'; poiId: string; tier: LengthTier }
  | { type: 'dismissMore' }
  | { type: 'transition'; fromPoiId: string; toPoiId: string; walkMinutes: number }
  | { type: 'visited'; poiId: string }
  | { type: 'notice'; code: 'finished' }
  | { type: 'waypoint'; poiId: string }
  | { type: 'needNext' }
  | { type: 'finish' };

export interface StepResult {
  state: GuideState;
  commands: GuideCommand[];
}

export function initialGuideState(stops: GuideStop[] = [], startIndex = 0): GuideState {
  return {
    route: stops,
    index: startIndex,
    visited: [],
    skipped: [],
    narrated: [],
    reached: {},
    closest: {},
    travel: initialTravel(),
    tierFor: {},
    tierMode: {},
    playedTier: {},
    ready: {},
    requested: {},
    paused: false,
    moreOffered: {},
    finished: false,
    open: false,
    awaitingRoute: false,
    waypointSent: {},
    lastTs: 0,
  };
}

/** Restore only durable progress, paused until the listener explicitly continues. */
export function restoreGuideState(stops: GuideStop[], progress: GuideProgress, open = false): GuideState {
  const s = initialGuideState(stops, Math.min(stops.length, Math.max(0, progress.index)));
  const ids = new Set(stops.filter((stop) => !stop.navigationOnly).map((stop) => stop.id));
  s.visited = progress.visited.filter((id) => ids.has(id));
  s.skipped = progress.skipped.filter((id) => ids.has(id));
  s.narrated = progress.narrated.filter((id) => ids.has(id));
  s.playedTier = Object.fromEntries(Object.entries(progress.playedTier).filter(([id]) => ids.has(id)));
  s.reached = Object.fromEntries(Object.entries(progress.reached ?? {}).filter(([id]) => ids.has(id)));
  s.closest = Object.fromEntries(Object.entries(progress.closest ?? {}).filter(([id]) => ids.has(id)));
  s.paused = true;
  s.open = open;
  s.awaitingRoute = open && s.index >= stops.length;
  s.finished = !open && s.index >= stops.length;
  const playback = progress.playback;
  if (!s.finished && playback && ids.has(playback.poiId)) {
    s.pending = { poiId: playback.poiId, tier: playback.tier, skipMs: playback.positionMs };
    s.tierFor = { [playback.poiId]: playback.tier };
  }
  return s;
}

const MAX_PLAYBACK_MS = 20 * 60_000;
const key = (poiId: string, tier: LengthTier) => `${poiId}:${tier}`;
const tierRank = (t: LengthTier) => ['short', 'medium', 'long'].indexOf(t);

export function arrivalRadius(prefs: GuidePrefs, mode: TravelMode): number {
  return mode === 'cycling'
    ? prefs.arrivalRadiusM * 1.7
    : mode === 'vehicle'
      ? prefs.arrivalRadiusM * 2.5
      : prefs.arrivalRadiusM;
}

export const targetOf = (s: GuideState): GuideStop | undefined => (s.finished ? undefined : s.route[s.index]);

/** Distance in meters from the last known position to the current target, if both exist. */
export function distanceToTarget(s: GuideState): number | undefined {
  const t = targetOf(s);
  return t && s.travel.last ? distanceMeters(s.travel.last, t.location) : undefined;
}

const walkMinutesBetween = (a: GuideStop, b: GuideStop) =>
  Math.max(1, Math.round(((distanceMeters(a.location, b.location) * 1.3) / 1000 / 4.5) * 60));

/**
 * Pure guide engine shared by all tour modes. It turns events (GPS fixes, playback callbacks, user actions) into
 * commands for the audio/prefetch layer. Fixed itineraries and dynamic ones (fork, roam) differ only in how
 * `route` is produced (`setRoute`). Speech is never cut mid-sentence: when the next stop becomes due while
 * something plays, that stop is queued and the running narration is asked to end at its paragraph boundary.
 */
export function guideStep(
  prev: GuideState,
  event: GuideEvent,
  prefs: GuidePrefs = DEFAULT_GUIDE_PREFS,
): StepResult {
  let s: GuideState = { ...prev };
  const cmds: GuideCommand[] = [];
  const ts = event.type === 'location' ? event.fix.ts : 'ts' in event ? event.ts : s.lastTs;
  if (ts > s.lastTs) s.lastTs = ts;

  switch (event.type) {
    case 'setRoute': {
      s = {
        ...s,
        route: event.stops,
        index: event.startIndex ?? 0,
        finished: event.stops.length === 0 && !(event.open ?? s.open),
        open: event.open ?? s.open,
        awaitingRoute: false,
      };
      // A changed itinerary must not play a queued story for a stop that was removed.
      if (s.pending && !event.stops.some((stop) => stop.id === s.pending!.poiId)) delete s.pending;
      if (s.pendingTransition && !event.stops.some((stop) => stop.id === s.pendingTransition!.toPoiId))
        delete s.pendingTransition;
      break;
    }
    case 'location': {
      s.travel = updateTravel(s.travel, event.fix);
      // Watchdog: a playback the app never reported as ended must not block the tour forever.
      if (s.playback && event.fix.ts - s.playback.startedTs > MAX_PLAYBACK_MS) delete s.playback;
      // Cars, buses and trains may cross an entire arrival radius between GPS updates.
      // Only bridge short, plausible segments, never tunnels, stale fixes or GPS jumps.
      if (s.travel.last === event.fix && prev.travel.last)
        recordCrossedStops(s, prev.travel.last, event.fix, prefs);
      break;
    }
    case 'ready': {
      s.ready = { ...s.ready, [key(event.poiId, event.tier)]: event.info };
      break;
    }
    case 'progress': {
      if (s.playback) s.playback = { ...s.playback, positionMs: event.positionMs };
      break;
    }
    case 'failed': {
      // Narration unavailable: keep the tour moving; the stop counts as narrated without audio.
      if (s.playback?.poiId === event.poiId) delete s.playback;
      if ((event.kind ?? 'stop') === 'stop' && !s.narrated.includes(event.poiId))
        s.narrated = [...s.narrated, event.poiId];
      break;
    }
    case 'ended': {
      if (s.playback && s.playback.poiId === event.poiId && s.playback.kind === event.kind) {
        const played = s.playback;
        delete s.playback;
        if (event.kind === 'stop') {
          if (!s.narrated.includes(event.poiId)) s.narrated = [...s.narrated, event.poiId];
          const prevTier = s.playedTier[event.poiId];
          if (!prevTier || tierRank(played.tier) > tierRank(prevTier))
            s.playedTier = { ...s.playedTier, [event.poiId]: played.tier };
        }
      }
      flushQueue(s, cmds, ts);
      break;
    }
    case 'skip': {
      const t = targetOf(s);
      if (t) {
        if (s.playback) cmds.push({ type: 'stopNow' });
        delete s.playback;
        delete s.pending;
        delete s.pendingTransition;
        clearOffer(s, cmds);
        s.skipped = [...s.skipped, t.id];
        advance(s, cmds, false, true);
      }
      break;
    }
    case 'previous': {
      if (s.playback && s.playback.kind === 'stop' && s.playback.positionMs > 5_000) {
        // restart what is playing
        const { poiId, tier } = s.playback;
        cmds.push({ type: 'stopNow' });
        delete s.playback;
        startPlayback(s, cmds, poiId, tier, 'stop', ts, 'previous');
      } else if (s.index > 0 || s.finished) {
        if (s.playback) cmds.push({ type: 'stopNow' });
        delete s.playback;
        delete s.pending;
        delete s.pendingTransition;
        clearOffer(s, cmds);
        s.index = Math.max(0, (s.finished ? s.route.length : s.index) - 1);
        s.finished = false;
        const back = s.route[s.index]!;
        s.narrated = s.narrated.filter((id) => id !== back.id);
        s.visited = s.visited.filter((id) => id !== back.id);
        s.skipped = s.skipped.filter((id) => id !== back.id);
        s.reached = Object.fromEntries(Object.entries(s.reached).filter(([id]) => id !== back.id)) as Record<
          string,
          true
        >;
        s.tierFor = Object.fromEntries(Object.entries(s.tierFor).filter(([id]) => id !== back.id));
        s.playedTier = Object.fromEntries(Object.entries(s.playedTier).filter(([id]) => id !== back.id));
        s.requested = Object.fromEntries(
          Object.entries(s.requested).filter(([k]) => !k.startsWith(`${back.id}:`)),
        ) as Record<string, true>;
        s.moreOffered = Object.fromEntries(
          Object.entries(s.moreOffered).filter(([id]) => id !== back.id),
        ) as Record<string, true>;
        s.closest = Object.fromEntries(Object.entries(s.closest).filter(([id]) => id !== back.id));
      }
      break;
    }
    case 'pause': {
      s.paused = true;
      if (s.playback) cmds.push({ type: 'pause' });
      break;
    }
    case 'resume': {
      s.paused = false;
      if (s.playback) cmds.push({ type: 'resume' });
      else flushQueue(s, cmds, ts);
      break;
    }
    case 'more': {
      const offer = s.moreOffer;
      if (offer && !s.playback) {
        const prevTier = s.playedTier[offer.poiId];
        const prevMs = prevTier
          ? (s.ready[key(offer.poiId, prevTier)]?.durationMs ?? nominalTiming(prevTier).durationMs)
          : 0;
        delete s.moreOffer;
        startPlayback(s, cmds, offer.poiId, offer.tier, 'stop', ts, 'more', Math.round(prevMs * 0.9));
      }
      break;
    }
  }

  if (s.route.length > 0) evaluate(s, cmds, ts, prefs);
  // Record an explored place once its story is audibly playing there, including when the listener ends the
  // session at this spot. Waiting for departure used to lose the last stop of short trial tours.
  for (const stop of s.route) {
    recordVisit(s, cmds, stop);
  }
  return { state: s, commands: cmds };
}

function recordCrossedStops(s: GuideState, from: Fix, to: Fix, prefs: GuidePrefs) {
  const seconds = (to.ts - from.ts) / 1000;
  if (s.travel.mode !== 'vehicle' && s.travel.mode !== 'cycling') return;
  if (seconds <= 0 || seconds > 15 || distanceMeters(from, to) / seconds > 60) return;
  const radius = arrivalRadius(prefs, s.travel.mode);
  // A local tangent plane is sufficient for a GPS segment of at most 900 m.
  const metersLat = 111_320;
  const metersLng = metersLat * Math.cos((from.lat * Math.PI) / 180);
  const lngDelta = (lng: number) => ((lng - from.lng + 540) % 360) - 180;
  const dx = lngDelta(to.lng) * metersLng;
  const dy = (to.lat - from.lat) * metersLat;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return;
  for (const stop of s.route.slice(s.index, s.index + 3)) {
    if (stop.navigationOnly) continue;
    const x = lngDelta(stop.location.lng) * metersLng;
    const y = (stop.location.lat - from.lat) * metersLat;
    const along = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
    const distance = Math.hypot(x - along * dx, y - along * dy);
    s.closest = { ...s.closest, [stop.id]: Math.min(s.closest[stop.id] ?? Infinity, distance) };
    if (distance <= radius) s.reached = { ...s.reached, [stop.id]: true };
  }
}

function clearOffer(s: GuideState, cmds: GuideCommand[]) {
  if (s.moreOffer) {
    delete s.moreOffer;
    cmds.push({ type: 'dismissMore' });
  }
}

function startPlayback(
  s: GuideState,
  cmds: GuideCommand[],
  poiId: string,
  tier: LengthTier,
  kind: PlaybackKind,
  ts: number,
  reason: 'approach' | 'pending' | 'more' | 'previous',
  skipMs?: number,
) {
  s.playback = { kind, poiId, tier, startedTs: ts, positionMs: 0, stopRequested: false };
  if (kind === 'stop') delete s.pendingTransition;
  cmds.push({ type: 'play', poiId, tier, reason, ...(skipMs ? { skipMs } : {}) });
}

/** After a playback ended: play the queued stop, otherwise the waiting hand-over text. */
function flushQueue(s: GuideState, cmds: GuideCommand[], ts: number) {
  if (s.paused || s.playback) return;
  if (s.pending) {
    const p = s.pending;
    delete s.pending;
    startPlayback(s, cmds, p.poiId, p.tier, 'stop', ts, 'pending', p.skipMs);
  } else if (s.pendingTransition) {
    const t = s.pendingTransition;
    delete s.pendingTransition;
    s.playback = {
      kind: 'transition',
      poiId: t.toPoiId,
      tier: 'short',
      startedTs: ts,
      positionMs: 0,
      stopRequested: false,
    };
    cmds.push({ type: 'transition', ...t });
  }
}

function recordVisit(s: GuideState, cmds: GuideCommand[], stop: GuideStop) {
  const heard =
    Boolean(s.playedTier[stop.id]) ||
    (s.playback?.kind === 'stop' && s.playback.poiId === stop.id && s.playback.positionMs > 0);
  if (
    stop.navigationOnly ||
    !s.reached[stop.id] ||
    !heard ||
    s.visited.includes(stop.id) ||
    s.skipped.includes(stop.id)
  )
    return;
  s.visited = [...s.visited, stop.id];
  cmds.push({ type: 'visited', poiId: stop.id });
}

/** Moves to the next stop. Returns false if the tour cannot end yet (last narration still running). */
function advance(s: GuideState, cmds: GuideCommand[], announceTransition: boolean, force = false): boolean {
  const from = s.route[s.index];
  if (!from) return false;
  const isLast = s.index + 1 >= s.route.length;
  if (isLast && !force && s.playback?.poiId === from.id) return false;
  recordVisit(s, cmds, from);
  if (
    !from.navigationOnly &&
    s.playback?.poiId !== from.id &&
    !s.visited.includes(from.id) &&
    !s.skipped.includes(from.id)
  )
    s.skipped = [...s.skipped, from.id];
  clearOffer(s, cmds);
  s.index += 1;
  if (s.index >= s.route.length && s.open) {
    s.awaitingRoute = true;
    cmds.push({ type: 'needNext' });
    return true;
  }
  if (s.index >= s.route.length) {
    s.finished = true;
    cmds.push({ type: 'notice', code: 'finished' }, { type: 'finish' });
    return true;
  }
  const next = s.route[s.index]!;
  if (announceTransition && !from.navigationOnly && !next.navigationOnly) {
    const minutes = walkMinutesBetween(from, next);
    if (minutes >= 2) s.pendingTransition = { fromPoiId: from.id, toPoiId: next.id, walkMinutes: minutes };
  }
  return true;
}

/** Decides prefetching, narration start, arrival handling and the "tell me more" offer after every event. */
function evaluate(s: GuideState, cmds: GuideCommand[], ts: number, prefs: GuidePrefs) {
  const here = s.travel.last;
  let target = targetOf(s);
  if (!target || !here) {
    flushQueue(s, cmds, ts);
    return;
  }

  let guard = 0;
  while (target && guard++ < 4) {
    const mode = s.travel.mode;
    const radius = arrivalRadius(prefs, mode);
    const dist = distanceMeters(here, target.location);
    const atStop = dist <= radius;
    if (target.navigationOnly) {
      // Arrival must happen on this final leg; a round trip's starting GPS fix must not count as arrival.
      if (atStop && !s.paused && !s.playback) advance(s, cmds, false);
      return;
    }
    s.closest = { ...s.closest, [target.id]: Math.min(s.closest[target.id] ?? Infinity, dist) };
    if (atStop && !s.reached[target.id]) s.reached = { ...s.reached, [target.id]: true };
    // Look ahead: remember how close we got to the next stops even while an earlier one still speaks.
    for (let k = 1; k <= 2; k++) {
      const nx = s.route[s.index + k];
      if (!nx) break;
      if (nx.navigationOnly) continue;
      const d = distanceMeters(here, nx.location);
      s.closest = { ...s.closest, [nx.id]: Math.min(s.closest[nx.id] ?? Infinity, d) };
      if (d <= radius && !s.reached[nx.id]) s.reached = { ...s.reached, [nx.id]: true };
    }

    const narrationDone = s.narrated.includes(target.id);
    const playingThis = s.playback?.kind === 'stop' && s.playback.poiId === target.id;
    const closest = s.closest[target.id] ?? Infinity;
    const passed = s.reached[target.id]
      ? dist > radius * 1.3
      : closest <= radius * 2.5 && dist > closest + radius * 2;

    // Leaving a stop we reached/passed: move on right away, even while its narration is still finishing.
    if (passed && (narrationDone || playingThis)) {
      if (advance(s, cmds, true)) {
        target = targetOf(s);
        continue;
      }
    }
    // Left without ever hearing it (e.g. content not ready in time): drop it and continue.
    if (passed && !narrationDone && !playingThis && s.pending?.poiId !== target.id) {
      s.skipped = [...s.skipped, target.id];
      if (advance(s, cmds, false, true)) {
        target = targetOf(s);
        continue;
      }
    }

    handleTarget(s, cmds, ts, prefs, target, dist, atStop, mode);
    break;
  }
}

function handleTarget(
  s: GuideState,
  cmds: GuideCommand[],
  ts: number,
  prefs: GuidePrefs,
  target: GuideStop,
  dist: number,
  atStop: boolean,
  mode: TravelMode,
) {
  const eta = etaSeconds(dist, mode, s.travel.speedMps);
  const narrationDone = s.narrated.includes(target.id);
  const blocked = s.paused;

  // 1) Choose once movement is known. Keep the queue stable, shortening before playback for vehicle travel.
  const known = mode !== 'stationary' || atStop;
  if (known && !narrationDone && !s.playedTier[target.id]) {
    const chosen = s.tierFor[target.id];
    const modeChanged =
      s.tierMode[target.id] !== undefined &&
      s.tierMode[target.id] !== mode &&
      mode !== 'stationary' &&
      !atStop;
    const shortenForVehicle =
      mode === 'vehicle' &&
      chosen !== 'short' &&
      s.playback?.poiId !== target.id &&
      s.pending?.poiId !== target.id;
    if (!chosen || shortenForVehicle || (modeChanged && !s.requested[key(target.id, chosen)])) {
      const next = s.route[s.index + 1];
      // Time we can plausibly keep the listener at/around this stop: dwell allowance, but never longer than the
      // walk to the next stop, so dense stops get shorter narrations instead of talking over each other.
      const gapSec = next
        ? etaSeconds(
            distanceMeters(target.location, next.location),
            mode === 'stationary' ? 'walking' : mode,
            s.travel.speedMps,
          )
        : prefs.dwellAllowanceSec * 2;
      const window = mode === 'stationary' ? 600 : eta + Math.min(prefs.dwellAllowanceSec, gapSec);
      s.tierFor = {
        ...s.tierFor,
        [target.id]: chooseTier(window, mode === 'stationary' ? 'walking' : mode, prefs),
      };
      s.tierMode = { ...s.tierMode, [target.id]: mode };
    }
  }
  // Recovered/already completed stops need no new tier decision merely to advance the route.
  const tier = s.tierFor[target.id] ?? (narrationDone ? (s.playedTier[target.id] ?? 'short') : undefined);
  if (!tier) return;

  // 2) Prefetch shortly before it is needed (cache-first on the server, so repeats are free).
  const timing: NarrationTiming = s.ready[key(target.id, tier)] ?? nominalTiming(tier);
  const startAt = startThresholdSeconds(timing, prefs);
  if (
    !narrationDone &&
    !s.requested[key(target.id, tier)] &&
    (atStop || eta <= startAt + prefs.prefetchLeadSec + timing.durationMs / 1000)
  ) {
    s.requested = { ...s.requested, [key(target.id, tier)]: true };
    cmds.push({ type: 'prefetch', poiId: target.id, tier });
  }

  // 3) Start narration so that its closing part (the highlight) lands at the stop.
  const alreadyPlayingOrQueued =
    (s.playback?.kind === 'stop' && s.playback.poiId === target.id) || s.pending?.poiId === target.id;
  if (!blocked && !narrationDone && !alreadyPlayingOrQueued) {
    const ready = Boolean(s.ready[key(target.id, tier)]);
    // Open routes (roam) have no navigation: passing within ~110 m counts as "there" ("on your left...").
    const due = atStop || eta <= startAt || (s.open && dist <= 110);
    if (due && ready) {
      if (s.playback) {
        s.pending = { poiId: target.id, tier };
        if (!s.playback.stopRequested) {
          s.playback = { ...s.playback, stopRequested: true };
          cmds.push({ type: 'stopAtParagraphEnd' });
        }
      } else {
        startPlayback(s, cmds, target.id, tier, 'stop', ts, 'approach');
      }
    }
  }
  if (!blocked) flushQueue(s, cmds, ts);

  // Open routes (crossroads, roam): tell the controller the listener has heard this stop and may choose where to go.
  if (s.open && narrationDone && !s.playback && s.reached[target.id] && !s.waypointSent[target.id]) {
    s.waypointSent = { ...s.waypointSent, [target.id]: true };
    cmds.push({ type: 'waypoint', poiId: target.id });
  }

  // 4) Standing at a stop after the narration: offer "tell me more", then move on.
  if (narrationDone && !s.playback && atStop && !blocked && mode === 'stationary') {
    const stoodSec = s.travel.stationarySinceTs !== undefined ? (ts - s.travel.stationarySinceTs) / 1000 : 0;
    const longer = s.playedTier[target.id] ? nextLongerTier(s.playedTier[target.id]!) : undefined;
    if (longer && !s.moreOffered[target.id] && stoodSec >= prefs.moreOfferAfterSec) {
      s.moreOffered = { ...s.moreOffered, [target.id]: true };
      s.moreOffer = { poiId: target.id, tier: longer, ts };
      cmds.push({ type: 'offerMore', poiId: target.id, tier: longer });
    } else if (!longer || s.moreOffered[target.id]) {
      const offerAge = s.moreOffer ? (ts - s.moreOffer.ts) / 1000 : Infinity;
      if (offerAge >= prefs.moreOfferTtlSec) advance(s, cmds, true);
    }
  }
}
