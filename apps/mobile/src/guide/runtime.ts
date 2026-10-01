import {
  DEFAULT_GUIDE_PREFS,
  distanceToTarget,
  guideStep,
  initialGuideState,
  resumeParagraphIndex,
  targetOf,
  type Fix,
  type GuideCommand,
  type GuideEvent,
  type GuidePrefs,
  type GuideState,
  type GuideStop,
  type Interest,
  type LengthTier,
  type NarrationResponse,
  type TravelMode,
} from '@tuur/shared';
import type { AudioEngine, AudioItem } from '../audio/types';
import { realClock, type Clock } from '../audio/simulatedEngine';
import { BackendError, type AccessInfo, type Backend } from '../backend/types';
import type { LocationSource } from '../location/types';

export type Notice =
  | 'vehicle_paused'
  | 'vehicle_resumed'
  | 'finished'
  | 'unavailable'
  | 'generation_paused'
  | 'rate_limited'
  | 'locked'
  | 'offline';

export interface GuideUi {
  phase: 'idle' | 'approaching' | 'narrating' | 'paused' | 'finished';
  stops: {
    id: string;
    name: string;
    location: { lat: number; lng: number };
    state: 'visited' | 'current' | 'upcoming' | 'skipped';
  }[];
  index: number;
  target?: { id: string; name: string; distanceM?: number };
  narration?: {
    poiId: string;
    kind: 'stop' | 'transition';
    tier: LengthTier;
    title: string;
    text: string;
    paragraphs: NarrationResponse['paragraphs'];
    images: NarrationResponse['images'];
    /** Fact-checked claims of the narration (stop cards "did you know"). */
    keyFacts?: string[];
    key: string;
    aiGenerated: true;
    sponsored?: boolean;
    grounding?: NarrationResponse['grounding'];
  };
  positionMs: number;
  playing: boolean;
  paragraphIndex: number;
  offerMore?: { poiId: string; tier: LengthTier };
  notice?: Notice;
  travelMode: TravelMode;
  /** Open routes (crossroads, roam): the last stop is done and the next one has to be chosen. */
  awaitingRoute: boolean;
  user?: { lat: number; lng: number; heading?: number };
}

export interface RuntimeDeps {
  backend: Backend;
  audio: AudioEngine;
  lang: string;
  /** Guide voice persona chosen in the settings; the server falls back to its default. */
  voice?: string;
  interest?: Interest;
  /** What the listener is doing; the server decides access with it (tour id or dynamic mode). */
  access?: AccessInfo;
  clock?: Clock;
  prefs?: Partial<GuidePrefs>;
  /** Extra hook after each engine command (tests/analytics). */
  onCommand?: (c: GuideCommand) => void;
}

const keyOf = (poiId: string, tier: LengthTier) => `${poiId}:${tier}`;

/**
 * Runs a tour: feeds GPS fixes and playback callbacks into the pure guide engine and executes its commands
 * (prefetch narrations, play, stop at paragraph ends, transitions). Framework free so it is fully testable.
 */
export class GuideRuntime {
  private state: GuideState = initialGuideState();
  private readonly prefs: GuidePrefs;
  private access: AccessInfo | undefined;
  private readonly clock: Clock;
  private ui: GuideUi = {
    phase: 'idle',
    stops: [],
    index: 0,
    positionMs: 0,
    playing: false,
    paragraphIndex: 0,
    travelMode: 'stationary',
    awaitingRoute: false,
  };
  private readonly listeners = new Set<() => void>();
  private readonly narrations = new Map<string, NarrationResponse>();
  private readonly inflight = new Map<string, Promise<NarrationResponse | undefined>>();
  private items = new Map<string, { poiId: string; kind: 'stop' | 'transition'; tier: LengthTier }>();
  private itemCounter = 0;
  private playToken = 0;
  private unsubLocation: (() => void) | undefined;
  private disposed = false;
  private starting: Promise<void> | undefined;
  /** Guards against re-entrancy when commands dispatch events synchronously. */
  private commandListeners = new Set<(c: GuideCommand) => void>();
  private fixListeners = new Set<(f: Fix) => void>();
  private queue: GuideEvent[] = [];
  private draining = false;

  constructor(private readonly deps: RuntimeDeps) {
    this.access = deps.access;
    this.prefs = { ...DEFAULT_GUIDE_PREFS, ...deps.prefs };
    this.clock = deps.clock ?? realClock;
    deps.audio.setListener({
      onEnded: (id, completed) => {
        const meta = this.items.get(id);
        if (!meta) return;
        this.dispatch({ type: 'ended', poiId: meta.poiId, kind: meta.kind, completed, ts: this.clock.now() });
      },
      onProgress: (id, positionMs) => {
        if (!this.items.has(id)) return;
        this.dispatch({ type: 'progress', positionMs, ts: this.clock.now() });
      },
      onError: (id) => {
        const meta = this.items.get(id);
        if (meta) this.dispatch({ type: 'failed', poiId: meta.poiId, kind: meta.kind, ts: this.clock.now() });
        this.setNotice('unavailable');
      },
    });
    deps.audio.setRemoteHandlers({
      onPlay: () => this.resume(),
      onPause: () => this.pause(),
      onNext: () => this.skip(),
      onPrevious: () => this.previous(),
    });
  }

  // ---- observable UI state (useSyncExternalStore friendly) ----
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };
  getSnapshot = () => this.ui;
  getState = () => this.state;

  private emit() {
    if (this.disposed) return;
    this.listeners.forEach((l) => l());
  }

  private refreshUi(patch: Partial<GuideUi> = {}) {
    const s = this.state;
    const target = targetOf(s);
    const dist = distanceToTarget(s);
    const phase: GuideUi['phase'] = s.finished
      ? 'finished'
      : s.paused || s.vehiclePaused
        ? 'paused'
        : s.playback
          ? 'narrating'
          : this.ui.phase === 'idle' && s.route.length === 0
            ? 'idle'
            : 'approaching';
    this.ui = {
      ...this.ui,
      phase,
      index: s.index,
      stops: s.route.map((r, i) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        state: s.skipped.includes(r.id)
          ? 'skipped'
          : s.visited.includes(r.id)
            ? 'visited'
            : i === s.index && !s.finished
              ? 'current'
              : 'upcoming',
      })),
      ...(target
        ? {
            target: {
              id: target.id,
              name: target.name,
              ...(dist !== undefined ? { distanceM: Math.round(dist) } : {}),
            },
          }
        : {}),
      travelMode: s.travel.mode,
      awaitingRoute: s.awaitingRoute,
      positionMs: this.audioPosition(),
      playing: this.deps.audio.isPlaying() && !s.paused && !s.vehiclePaused,
      ...patch,
    };
    if (!target) delete this.ui.target;
    const n = this.ui.narration;
    if (n) {
      const p = n.paragraphs.findIndex((x) => this.ui.positionMs < x.startMs + x.durationMs);
      this.ui = { ...this.ui, paragraphIndex: p < 0 ? Math.max(0, n.paragraphs.length - 1) : p };
    }
    this.emit();
  }

  private audioPosition() {
    return this.state.playback ? this.deps.audio.positionMs() : 0;
  }

  private setNotice(notice: Notice | undefined) {
    const next = { ...this.ui };
    if (notice) next.notice = notice;
    else delete next.notice;
    this.ui = next;
    this.emit();
  }
  clearNotice() {
    this.setNotice(undefined);
  }

  // ---- lifecycle ----
  async start(
    stops: GuideStop[],
    source?: LocationSource,
    opts: { startIndex?: number; open?: boolean } = {},
  ) {
    // dispose() waits for a start that is still in flight, so a session ended during startup never leaks GPS or audio
    this.starting = this.doStart(stops, source, opts);
    await this.starting;
  }

  private async doStart(
    stops: GuideStop[],
    source: LocationSource | undefined,
    opts: { startIndex?: number; open?: boolean },
  ) {
    await this.deps.audio.init();
    if (this.disposed) return;
    this.dispatch({
      type: 'setRoute',
      stops,
      startIndex: opts.startIndex ?? 0,
      ...(opts.open ? { open: true } : {}),
    });
    if (!source) return;
    const unsub = await source.subscribe((fix) => this.onFix(fix));
    if (this.disposed) unsub();
    else this.unsubLocation = unsub;
  }

  setRoute(stops: GuideStop[], startIndex = 0, open?: boolean) {
    this.dispatch({ type: 'setRoute', stops, startIndex, ...(open !== undefined ? { open } : {}) });
  }

  /** Appends a stop to an open route and keeps the current position in it (crossroads choice). */
  appendStop(stop: GuideStop) {
    const s = this.state;
    const route = [...s.route, stop];
    this.dispatch({
      type: 'setRoute',
      stops: route,
      startIndex: s.awaitingRoute ? route.length - 1 : s.index,
      open: true,
    });
  }

  /** Replaces the target of a roam route with `stop` (the previous, unreached target is dropped). */
  retarget(stop: GuideStop) {
    const s = this.state;
    const keep = s.route.slice(0, s.awaitingRoute ? s.route.length : s.index);
    this.dispatch({ type: 'setRoute', stops: [...keep, stop], startIndex: keep.length, open: true });
  }

  addCommandListener(cb: (c: GuideCommand) => void) {
    this.commandListeners.add(cb);
    return () => void this.commandListeners.delete(cb);
  }
  /** Access context sent with content requests (a host opening a live group adds the group id). */
  getAccess(): AccessInfo | undefined {
    return this.access;
  }
  setAccess(access: AccessInfo) {
    this.access = access;
  }

  addFixListener(cb: (f: Fix) => void) {
    this.fixListeners.add(cb);
    return () => void this.fixListeners.delete(cb);
  }

  onFix(fix: Fix) {
    if (this.disposed) return;
    this.ui = {
      ...this.ui,
      user: { lat: fix.lat, lng: fix.lng, ...(fix.heading !== undefined ? { heading: fix.heading } : {}) },
    };
    this.dispatch({ type: 'location', fix });
    this.fixListeners.forEach((l) => l(fix));
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    await this.starting?.catch(() => undefined);
    this.unsubLocation?.();
    this.unsubLocation = undefined;
    await this.deps.audio.stop().catch(() => undefined);
    // remove the engine's player listeners and remote-control (lock screen / headset) handlers
    await this.deps.audio.destroy().catch(() => undefined);
  }

  // ---- user actions ----
  skip = () => this.dispatch({ type: 'skip', ts: this.clock.now() });
  previous = () => this.dispatch({ type: 'previous', ts: this.clock.now() });
  pause = () => this.dispatch({ type: 'pause', ts: this.clock.now() });
  resume = () => this.dispatch({ type: 'resume', ts: this.clock.now() });
  more = () => this.dispatch({ type: 'more', ts: this.clock.now() });

  // ---- core ----
  dispatch(event: GuideEvent) {
    this.queue.push(event);
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const ev = this.queue.shift()!;
        const res = guideStep(this.state, ev, this.prefs);
        this.state = res.state;
        for (const c of res.commands) {
          this.deps.onCommand?.(c);
          this.commandListeners.forEach((l) => l(c));
          this.execute(c);
        }
        this.refreshUi();
      }
    } finally {
      this.draining = false;
    }
  }

  private async ensureNarration(poiId: string, tier: LengthTier): Promise<NarrationResponse | undefined> {
    const k = keyOf(poiId, tier);
    const hit = this.narrations.get(k);
    if (hit) return hit;
    const running = this.inflight.get(k);
    if (running) return running;
    const p = this.deps.backend
      .getNarration({
        poiId,
        lang: this.deps.lang,
        lengthTier: tier,
        ...(this.deps.voice ? { voice: this.deps.voice } : {}),
        ...(this.access ? { access: this.access } : {}),
        ...(this.deps.interest ? { primaryInterest: this.deps.interest } : {}),
      })
      .then((n) => {
        this.narrations.set(k, n);
        return n;
      })
      .catch((e: unknown) => {
        const code = e instanceof BackendError ? e.code : 'unknown';
        this.setNotice(
          code === 'locked'
            ? 'locked'
            : code === 'paused'
              ? 'generation_paused'
              : code === 'rate_limited'
                ? 'rate_limited'
                : code === 'network'
                  ? 'offline'
                  : 'unavailable',
        );
        return undefined;
      })
      .finally(() => void this.inflight.delete(k));
    this.inflight.set(k, p);
    return p;
  }

  private execute(c: GuideCommand) {
    switch (c.type) {
      case 'prefetch':
        void this.ensureNarration(c.poiId, c.tier).then((n) => {
          if (this.disposed) return;
          if (!n) return this.dispatch({ type: 'failed', poiId: c.poiId, ts: this.clock.now() });
          const last = n.paragraphs[n.paragraphs.length - 1];
          this.dispatch({
            type: 'ready',
            poiId: c.poiId,
            tier: c.tier,
            info: {
              durationMs: n.audioDurationMs,
              lastParagraphMs: last?.durationMs ?? n.audioDurationMs,
              paragraphs: n.paragraphs,
            },
          });
        });
        break;
      case 'play':
        void this.playStop(c.poiId, c.tier, c.skipMs);
        break;
      case 'transition':
        void this.playTransition(c.fromPoiId, c.toPoiId, c.walkMinutes);
        break;
      case 'stopAtParagraphEnd':
        this.deps.audio.stopAtParagraphEnd();
        break;
      case 'stopNow':
        this.playToken++;
        void this.deps.audio.stop();
        break;
      case 'pause':
        void this.deps.audio.pause();
        break;
      case 'resume':
        void this.deps.audio.resume();
        break;
      case 'offerMore':
        this.ui = { ...this.ui, offerMore: { poiId: c.poiId, tier: c.tier } };
        break;
      case 'dismissMore': {
        const next = { ...this.ui };
        delete next.offerMore;
        this.ui = next;
        break;
      }
      case 'notice':
        this.setNotice(c.code);
        break;
      case 'visited':
        // anonymous explorer count; best effort, never allowed to disturb the tour (offline, errors)
        void Promise.resolve()
          .then(() => this.deps.backend.recordVisit(c.poiId))
          .catch(() => undefined);
        break;
      case 'finish':
        break;
    }
  }

  private async playStop(poiId: string, tier: LengthTier, skipMs?: number) {
    const token = ++this.playToken;
    const n = await this.ensureNarration(poiId, tier);
    if (token !== this.playToken || this.disposed) return;
    if (!n) return this.dispatch({ type: 'failed', poiId, ts: this.clock.now() });
    let url: string;
    try {
      url = await this.deps.backend.audioUrl(n.audioPath);
    } catch {
      this.setNotice('offline');
      return this.dispatch({ type: 'failed', poiId, ts: this.clock.now() });
    }
    if (token !== this.playToken || this.disposed) return;
    const startIdx = skipMs ? resumeParagraphIndex(n.paragraphs, skipMs) : 0;
    const startMs = n.paragraphs[startIdx]?.startMs ?? 0;
    const id = `stop:${poiId}:${tier}:${++this.itemCounter}`;
    this.items.set(id, { poiId, kind: 'stop', tier });
    const item: AudioItem = {
      id,
      kind: 'stop',
      poiId,
      url,
      title: n.title,
      artist: 'tuur',
      ...(n.images[0] ? { artworkUrl: n.images[0].thumbUrl ?? n.images[0].url } : {}),
      durationMs: n.audioDurationMs,
      paragraphs: n.paragraphs,
      paragraphTexts: n.paragraphs.map((p) => p.text),
      lang: this.deps.lang,
    };
    this.ui = {
      ...this.ui,
      narration: {
        poiId,
        kind: 'stop',
        tier,
        title: n.title,
        text: n.text,
        paragraphs: n.paragraphs,
        images: n.images,
        keyFacts: n.keyFacts,
        key: n.key,
        aiGenerated: true,
        ...(n.sponsored ? { sponsored: true } : {}),
        ...(n.grounding ? { grounding: n.grounding } : {}),
      },
    };
    try {
      await this.deps.audio.play(item, { startMs });
    } catch {
      this.dispatch({ type: 'failed', poiId, ts: this.clock.now() });
      this.setNotice('unavailable');
    }
    this.refreshUi();
  }

  private async playTransition(fromPoiId: string, toPoiId: string, walkMinutes: number) {
    const token = ++this.playToken;
    try {
      const t = await this.deps.backend.getTransition({
        fromPoiId,
        toPoiId,
        lang: this.deps.lang,
        walkMinutes,
        ...(this.deps.voice ? { voice: this.deps.voice } : {}),
        ...(this.access ? { access: this.access } : {}),
      });
      const url = await this.deps.backend.audioUrl(t.audioPath);
      if (token !== this.playToken || this.disposed) return;
      const id = `transition:${toPoiId}:${++this.itemCounter}`;
      this.items.set(id, { poiId: toPoiId, kind: 'transition', tier: 'short' });
      await this.deps.audio.play({
        id,
        kind: 'transition',
        poiId: toPoiId,
        url,
        title: t.text,
        artist: 'tuur',
        durationMs: t.audioDurationMs,
        paragraphs: [{ startMs: 0, durationMs: t.audioDurationMs }],
        paragraphTexts: [t.text],
        lang: this.deps.lang,
      });
    } catch {
      // Hand-over texts are optional: continue silently.
      if (token === this.playToken)
        this.dispatch({
          type: 'ended',
          poiId: toPoiId,
          kind: 'transition',
          completed: false,
          ts: this.clock.now(),
        });
    }
  }
}
