import {
  DEFAULT_GUIDE_PREFS,
  createTourScript,
  narrationContextFor,
  storyFingerprint,
  distanceToTarget,
  guideStep,
  initialGuideState,
  restoreGuideState,
  resumeParagraphIndex,
  targetOf,
  type Fix,
  type GuideCommand,
  type GuideEvent,
  type GuidePrefs,
  type GuideProgress,
  type GuideState,
  type GuideStop,
  type Interest,
  type LengthTier,
  type NarrationResponse,
  type TravelMode,
  type TourScript,
  type TourTimeResult,
} from '@tuur/shared';
import type { AudioEngine, AudioItem } from '../audio/types';
import { realClock, type Clock } from '../audio/simulatedEngine';
import { BackendError, type AccessInfo, type Backend } from '../backend/types';
import type { LocationSource } from '../location/types';
import { preferStopNarration, type StopNarration } from './stopNarration';
import { textGuideStep } from './textGuide';

export type ContentMode = 'text' | 'audio';

export type Notice =
  | 'finished'
  | 'unavailable'
  | 'generation_paused'
  | 'rate_limited'
  | 'locked'
  | 'offline'
  | 'tour_time_exhausted'
  | 'ai_consent_updated'
  | 'ai_consent_pause_failed'
  | 'group_audio_pending';

export interface GuideUi {
  phase: 'idle' | 'approaching' | 'narrating' | 'paused' | 'finished';
  stops: {
    id: string;
    name: string;
    location: { lat: number; lng: number };
    state: 'visited' | 'current' | 'upcoming' | 'skipped';
    navigationOnly?: boolean;
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
  tourTime?: TourTimeResult;
  user?: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number; ts?: number };
}

export interface RuntimeDeps {
  contentMode?: ContentMode;
  backend: Backend;
  audio: AudioEngine;
  lang: string;
  /** Guide voice persona chosen in the settings; the server falls back to its default. */
  voice?: string;
  interest?: Interest;
  /** The same editorial brief is retained across reroutes and recovery. */
  script?: TourScript;
  /** What the listener is doing; the server decides access with it (tour id or dynamic mode). */
  access?: AccessInfo;
  clock?: Clock;
  prefs?: Partial<GuidePrefs>;
  /** Extra hook after each engine command (tests/analytics). */
  onCommand?: (c: GuideCommand) => void;
}

const keyOf = (poiId: string, tier: LengthTier) => `${poiId}:${tier}`;
type GroupRecording = { kind: 'narration' | 'transition'; key: string; poiId: string; fromPoiId?: string };

/**
 * Runs a tour: feeds GPS fixes and playback callbacks into the pure guide engine and executes its commands
 * (prefetch narrations, play, stop at paragraph ends, transitions). Framework free so it is fully testable.
 */
export class GuideRuntime {
  private state: GuideState = initialGuideState();
  private readonly prefs: GuidePrefs;
  private readonly script: TourScript;
  private access: AccessInfo | undefined;
  private contentMode: ContentMode;
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
  private readonly heardNarrations = new Map<string, StopNarration>();
  private readonly narrationListeners = new Set<(poiId: string, narration: StopNarration) => void>();
  private readonly inflight = new Map<string, Promise<NarrationResponse | undefined>>();
  private items = new Map<
    string,
    {
      poiId: string;
      kind: 'stop' | 'transition';
      tier: LengthTier;
      narration?: StopNarration;
      startMs?: number;
    }
  >();
  private itemCounter = 0;
  private playToken = 0;
  private resumeRevision = 0;
  private authorizeResume: (() => Promise<boolean>) | undefined;
  private readonly pauseListeners = new Set<() => void>();
  private readonly groupRecordings = new Map<string, GroupRecording>();
  private readonly groupWaits = new Map<unknown, () => void>();
  private readonly playbackWaits = new Set<() => void>();
  private unsubLocation: (() => void) | undefined;
  private disposed = false;
  private starting: Promise<void> | undefined;
  /** Guards against re-entrancy when commands dispatch events synchronously. */
  private commandListeners = new Set<(c: GuideCommand) => void>();
  private fixListeners = new Set<(f: Fix) => void>();
  private queue: GuideEvent[] = [];
  private draining = false;

  constructor(private readonly deps: RuntimeDeps) {
    this.script =
      deps.script ?? createTourScript({ lang: deps.lang, interests: deps.interest ? [deps.interest] : [] });
    this.access = deps.access;
    this.contentMode = deps.contentMode ?? 'audio';
    this.prefs = { ...DEFAULT_GUIDE_PREFS, ...deps.prefs };
    this.clock = deps.clock ?? realClock;
    deps.audio.setListener({
      onEnded: (id, completed) => {
        const meta = this.items.get(id);
        if (!meta || this.disposed) return;
        if (completed && meta.narration) this.rememberNarration(meta.poiId, meta.narration);
        this.dispatch({ type: 'ended', poiId: meta.poiId, kind: meta.kind, completed, ts: this.clock.now() });
      },
      onProgress: (id, positionMs) => {
        const meta = this.items.get(id);
        if (!meta || this.disposed) return;
        if (meta.narration && positionMs > (meta.startMs ?? 0))
          this.rememberNarration(meta.poiId, meta.narration);
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
  getContentMode = () => this.contentMode;
  getScript = (): TourScript => this.script;
  getGroupAudio = () => ({
    script: this.script,
    lang: this.deps.lang,
    ...(this.deps.voice ? { voice: this.deps.voice } : {}),
    ...(this.deps.interest ? { primaryInterest: this.deps.interest } : {}),
  });
  getGroupRecordings = () => {
    const recordings = new Map<string, GroupRecording>();
    for (const value of this.groupRecordings.values()) {
      const slot = `${value.kind}:${value.fromPoiId ?? ''}:${value.poiId}`;
      if (!recordings.has(slot)) recordings.set(slot, value);
    }
    // The recording already heard/currently playing takes precedence over speculative shorter tiers.
    for (const [poiId, heard] of this.heardNarrations) {
      const value = this.groupRecordings.get(heard.key);
      if (value) recordings.set(`narration::${poiId}`, value);
    }
    const current = this.ui.narration ? this.groupRecordings.get(this.ui.narration.key) : undefined;
    if (current) recordings.set(`${current.kind}:${current.fromPoiId ?? ''}:${current.poiId}`, current);
    return [...recordings.values()].slice(-200);
  };
  setTourTime(time: TourTimeResult) {
    this.refreshUi({ tourTime: time });
  }
  setResumeAuthorization(check: (() => Promise<boolean>) | undefined) {
    this.authorizeResume = check;
  }
  /** Pause intent also cancels an authorization that has not resumed playback yet. */
  addPauseListener(callback: () => void) {
    this.pauseListeners.add(callback);
    return () => void this.pauseListeners.delete(callback);
  }
  blockTourTime(notice: 'offline' | 'tour_time_exhausted' | 'locked' = 'tour_time_exhausted') {
    this.pause();
    this.setNotice(notice);
  }
  /** Returns heard content only; prefetching a suggestion never creates a readable tour stop. */
  getStopNarration = (poiId: string): StopNarration | undefined => this.heardNarrations.get(poiId);
  /** Rehydrate only saved heard stories; this never fetches or starts playback. */
  restoreStopNarrations(stops: { id: string; narration?: StopNarration }[]) {
    for (const stop of stops) {
      if (stop.narration) this.heardNarrations.set(stop.id, stop.narration);
    }
  }
  getProgress = (): GuideProgress => {
    const s = this.state;
    const playback = s.playback?.kind === 'stop' ? s.playback : undefined;
    const pending = s.pending;
    return {
      index: s.index,
      visited: [...s.visited],
      skipped: [...s.skipped],
      narrated: [...s.narrated],
      playedTier: { ...s.playedTier },
      reached: { ...s.reached },
      closest: { ...s.closest },
      ...(playback
        ? { playback: { poiId: playback.poiId, tier: playback.tier, positionMs: this.audioPosition() } }
        : pending
          ? { playback: { poiId: pending.poiId, tier: pending.tier, positionMs: pending.skipMs ?? 0 } }
          : {}),
    };
  };

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
      : s.paused
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
        ...(r.navigationOnly ? { navigationOnly: true } : {}),
        state:
          this.access?.mode === 'roam' && i < s.index && this.heardNarrations.has(r.id)
            ? 'visited'
            : s.skipped.includes(r.id)
              ? 'skipped'
              : i === s.index && !s.finished
                ? 'current'
                : s.visited.includes(r.id)
                  ? 'visited'
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
      playing: this.deps.audio.isPlaying() && !s.paused,
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
    opts: { startIndex?: number; open?: boolean; progress?: GuideProgress } = {},
  ) {
    // dispose() waits for a start that is still in flight, so a session ended during startup never leaks GPS or audio
    this.starting = this.doStart(stops, source, opts);
    await this.starting;
  }

  private async doStart(
    stops: GuideStop[],
    source: LocationSource | undefined,
    opts: { startIndex?: number; open?: boolean; progress?: GuideProgress },
  ) {
    if (this.contentMode === 'audio') await this.deps.audio.init();
    if (this.disposed) return;
    if (opts.progress) {
      this.state = restoreGuideState(stops, opts.progress, opts.open);
      this.refreshUi();
    } else {
      this.dispatch({
        type: 'setRoute',
        stops,
        startIndex: opts.startIndex ?? 0,
        ...(opts.open ? { open: true } : {}),
      });
    }
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

  /** Keep the current story and visited history while releasing the remaining itinerary. */
  explore() {
    const s = this.state;
    const current = s.route[s.index];
    // Keep a reached/heard stop current until its normal departure or waypoint handling finishes.
    const keepCurrent =
      current &&
      (s.narrated.includes(current.id) ||
        (s.reached[current.id] && (!s.playback || s.playback.poiId === current.id)));
    // A handover may mention the next destination, but it must not keep that itinerary stop.
    const playingIndex =
      s.playback?.kind === 'stop' ? s.route.findIndex((stop) => stop.id === s.playback!.poiId) : -1;
    const keepCount = Math.max(s.index + (keepCurrent ? 1 : 0), playingIndex + 1);
    this.setRoute(s.route.slice(0, keepCount), Math.min(s.index, keepCount), true);
  }

  addCommandListener(cb: (c: GuideCommand) => void) {
    this.commandListeners.add(cb);
    return () => void this.commandListeners.delete(cb);
  }
  addNarrationListener(cb: (poiId: string, narration: StopNarration) => void) {
    this.narrationListeners.add(cb);
    return () => void this.narrationListeners.delete(cb);
  }

  private rememberNarration(poiId: string, narration: StopNarration) {
    const previous = this.heardNarrations.get(poiId);
    const next = preferStopNarration(previous, narration);
    if (!next || next === previous) return;
    this.heardNarrations.set(poiId, next);
    this.narrationListeners.forEach((listener) => listener(poiId, next));
  }
  /** Access context sent with content requests (a host opening a live group adds the group id). */
  getAccess(): AccessInfo | undefined {
    return this.access;
  }
  setAccess(access: AccessInfo) {
    if (access.groupId !== this.access?.groupId) this.inflight.clear();
    this.access = access;
    if (access.groupId && this.ui.offerMore) {
      const next = { ...this.ui };
      delete next.offerMore;
      this.ui = next;
      this.emit();
    }
  }

  /** The session establishes a paid lease before enabling audio. GPS and the current destination stay intact. */
  async enableAudio(): Promise<void> {
    if (this.contentMode === 'audio' || this.disposed) return;
    const token = ++this.playToken;
    await this.deps.audio.init();
    if (this.disposed || token !== this.playToken) return;
    this.contentMode = 'audio';
    this.state = {
      ...this.state,
      narrated: [],
      playedTier: {},
      requested: {},
      ready: {},
      tierFor: {},
      tierMode: {},
    };
    this.clearNotice();
    const fix = this.state.travel.last;
    if (fix) this.dispatch({ type: 'location', fix });
    else this.refreshUi();
  }

  async disableAudio(): Promise<void> {
    this.contentMode = 'text';
    this.playToken++;
    this.resumeRevision++;
    this.items.clear();
    this.inflight.clear();
    for (const cancel of this.playbackWaits) cancel();
    this.playbackWaits.clear();
    await this.deps.audio.stop().catch(() => undefined);
    const { narration: _narration, offerMore: _offer, tourTime: _time, notice: _notice, ...ui } = this.ui;
    void _narration;
    void _offer;
    void _time;
    void _notice;
    this.ui = ui;
    this.dispatch({ type: 'resume', ts: this.clock.now() });
  }

  addFixListener(cb: (f: Fix) => void) {
    this.fixListeners.add(cb);
    return () => void this.fixListeners.delete(cb);
  }

  onFix(fix: Fix) {
    if (this.disposed) return;
    this.ui = {
      ...this.ui,
      user: {
        lat: fix.lat,
        lng: fix.lng,
        ts: fix.ts,
        ...(fix.accuracy !== undefined ? { accuracy: fix.accuracy } : {}),
        ...(fix.heading !== undefined ? { heading: fix.heading } : {}),
        ...(fix.speed !== undefined ? { speed: fix.speed } : {}),
      },
    };
    this.dispatch({ type: 'location', fix });
    this.fixListeners.forEach((l) => l(fix));
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const [timer, resolve] of this.groupWaits) {
      this.clock.clearTimeout(timer);
      resolve();
    }
    this.groupWaits.clear();
    for (const cancel of this.playbackWaits) cancel();
    this.playbackWaits.clear();
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
  pause = () => {
    this.resumeRevision++;
    this.pauseListeners.forEach((listener) => listener());
    this.dispatch({ type: 'pause', ts: this.clock.now() });
  };
  resume = () => {
    const revision = ++this.resumeRevision;
    if (!this.authorizeResume) this.dispatch({ type: 'resume', ts: this.clock.now() });
    else
      void this.authorizeResume().then((allowed) => {
        if (allowed && !this.disposed && revision === this.resumeRevision) {
          this.clearNotice();
          this.dispatch({ type: 'resume', ts: this.clock.now() });
        }
      });
  };
  more = () => {
    if (!this.access?.groupId) this.dispatch({ type: 'more', ts: this.clock.now() });
  };

  // ---- core ----
  dispatch(event: GuideEvent) {
    this.queue.push(event);
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const ev = this.queue.shift()!;
        const res =
          this.contentMode === 'text'
            ? textGuideStep(this.state, ev, this.prefs)
            : guideStep(this.state, ev, this.prefs);
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
    const context = narrationContextFor(
      this.script,
      this.state.route,
      poiId,
      this.state.open,
      this.state.skipped,
    );
    const k = `${keyOf(poiId, tier)}:${storyFingerprint(JSON.stringify(context))}`;
    const hit = this.narrations.get(k);
    if (hit && !this.access?.groupId) return hit;
    const running = this.inflight.get(k);
    if (running) return running;
    const p = this.waitForAudioRequest(() =>
      this.deps.backend.getNarration({
        poiId,
        lang: this.deps.lang,
        lengthTier: tier,
        context,
        ...(this.deps.voice ? { voice: this.deps.voice } : {}),
        ...(this.access ? { access: this.access } : {}),
        ...(this.deps.interest ? { primaryInterest: this.deps.interest } : {}),
      }),
    )
      .then((n) => {
        this.narrations.set(k, n);
        this.groupRecordings.set(n.key, { kind: 'narration', key: n.key, poiId });
        if (this.ui.notice === 'group_audio_pending') this.setNotice(undefined);
        return n;
      })
      .catch((e: unknown) => {
        if (this.contentMode === 'text' || this.disposed) return undefined;
        const code = e instanceof BackendError ? e.code : 'unknown';
        this.setNotice(
          e instanceof BackendError &&
            (e.reason === 'ai_consent_updated' || e.reason === 'ai_consent_pause_failed')
            ? e.reason
            : e instanceof BackendError && e.reason === 'group_audio_pending'
              ? 'group_audio_pending'
              : code === 'locked'
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

  private async waitForAudioRequest<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request();
      } catch (error) {
        if (
          error instanceof BackendError &&
          (error.reason === 'ai_consent_updated' || error.reason === 'ai_consent_pause_failed') &&
          !this.disposed &&
          this.contentMode === 'audio'
        ) {
          this.setNotice(error.reason);
          // Keep this stop pending: a normal failed event marks it as already narrated.
          // Only an explicit, billing-authorized resume may retry the provider request.
          if (!(await this.waitUntilPlayable(this.playToken))) throw error;
          this.clearNotice();
          continue;
        }
        if (
          !(error instanceof BackendError) ||
          error.reason !== 'group_audio_pending' ||
          !this.access?.groupId ||
          this.disposed
        )
          throw error;
        this.setNotice('group_audio_pending');
        await new Promise<void>((resolve) => {
          const timer = this.clock.setTimeout(
            () => {
              this.groupWaits.delete(timer);
              resolve();
            },
            Math.min(5000, (error.retryAfterMs ?? 1500) + attempt * 200),
          );
          this.groupWaits.set(timer, resolve);
        });
        if (this.disposed) throw error;
      }
    }
  }

  private execute(c: GuideCommand) {
    if (this.contentMode === 'text' && !['visited', 'notice', 'finish'].includes(c.type)) return;
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
        if (this.access?.groupId) break;
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
    if (!(await this.waitUntilPlayable(token))) return;
    let url: string;
    try {
      url = await this.deps.backend.audioUrl(n.audioPath);
    } catch {
      this.setNotice('offline');
      return this.dispatch({ type: 'failed', poiId, ts: this.clock.now() });
    }
    if (token !== this.playToken || this.disposed) return;
    if (!(await this.waitUntilPlayable(token))) return;
    const startIdx = skipMs ? resumeParagraphIndex(n.paragraphs, skipMs) : 0;
    const startMs = n.paragraphs[startIdx]?.startMs ?? 0;
    const id = `stop:${poiId}:${tier}:${++this.itemCounter}`;
    const narration: StopNarration = {
      key: n.key,
      title: n.title,
      text: n.text,
      tier,
      images: n.images,
      keyFacts: n.keyFacts,
      aiGenerated: true,
      ...(n.sponsored ? { sponsored: true } : {}),
      ...(n.grounding ? { grounding: n.grounding } : {}),
    };
    this.items.set(id, { poiId, kind: 'stop', tier, narration, startMs });
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
      if (this.state.paused) await this.deps.audio.pause();
    } catch {
      this.dispatch({ type: 'failed', poiId, ts: this.clock.now() });
      this.setNotice('unavailable');
    }
    this.refreshUi();
  }

  private async playTransition(fromPoiId: string, toPoiId: string, walkMinutes: number) {
    const token = ++this.playToken;
    try {
      const t = await this.waitForAudioRequest(() =>
        this.deps.backend.getTransition({
          fromPoiId,
          toPoiId,
          lang: this.deps.lang,
          walkMinutes,
          tourTitle: this.script.title,
          ...(this.script.instanceId ? { scriptInstanceId: this.script.instanceId } : {}),
          ...(this.deps.voice ? { voice: this.deps.voice } : {}),
          ...(this.access ? { access: this.access } : {}),
        }),
      );
      if (token !== this.playToken || this.disposed || this.contentMode === 'text') return;
      this.groupRecordings.set(t.key, { kind: 'transition', key: t.key, poiId: toPoiId, fromPoiId });
      const url = await this.deps.backend.audioUrl(t.audioPath);
      if (token !== this.playToken || this.disposed) return;
      if (!(await this.waitUntilPlayable(token))) return;
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
      if (this.state.paused) await this.deps.audio.pause();
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

  private async waitUntilPlayable(token: number): Promise<boolean> {
    if (this.disposed || token !== this.playToken) return false;
    if (!this.state.paused) return true;
    return new Promise<boolean>((resolve) => {
      const finish = (allowed: boolean) => {
        off();
        this.playbackWaits.delete(cancel);
        resolve(allowed);
      };
      const cancel = () => finish(false);
      const off = this.subscribe(() => {
        if (this.disposed || token !== this.playToken) finish(false);
        else if (!this.state.paused) finish(true);
      });
      this.playbackWaits.add(cancel);
    });
  }
}
