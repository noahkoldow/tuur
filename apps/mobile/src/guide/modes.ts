import {
  ROAM_PROFILES,
  NARRATION_LANGS,
  angleDiff,
  bearingDegrees,
  corridorLengthM,
  encodeGeohash,
  pickForkOptions,
  pickRoamTarget,
  pickWaysideStop,
  tilesAhead,
  tilesAround,
  type Interest,
  type LatLng,
  type NarrationFrequency,
  type Poi,
  type RoutingProfile,
} from '@tuur/shared';
import { realClock, type Clock } from '../audio/simulatedEngine';
import type { AccessInfo, Backend } from '../backend/types';
import { config } from '../config';
import type { GuideRuntime } from './runtime';
import { LiveCuration } from './curation';

function curationContext(runtime: GuideRuntime, lang: string | undefined, interests: Interest[]) {
  const state = runtime.getState();
  const previousPoiName = state.route
    .slice(0, state.index)
    .filter((s) => !state.skipped.includes(s.id))
    .at(-1)
    ?.name.slice(0, 120);
  const access = runtime.getAccess();
  return {
    lang: NARRATION_LANGS.find((l) => l === lang) ?? 'en',
    interests,
    thread: runtime.getScript().question,
    ...(previousPoiName ? { previousPoiName } : {}),
    ...(access ? { access } : {}),
  };
}

/** POIs around the listener, loaded tile by tile (the server only ever sees tile ids, never positions). */
export class PoiPool {
  private byId = new Map<string, Poi>();
  private lastTry = new Map<string, number>();
  private requestVersions = new Map<string, number>();
  private nextRequestVersion = 0;
  private dataRevision = 0;
  constructor(
    private readonly backend: Backend,
    private readonly clock: Clock = realClock,
  ) {}

  all(): Poi[] {
    return [...this.byId.values()];
  }

  get revision(): number {
    return this.dataRevision;
  }

  /** Reload completed tiles even if they already contain POIs or were queried before ingestion finished. */
  async refresh(tiles: string[]): Promise<void> {
    const requested = [...new Set(tiles)];
    if (!requested.length) return;
    const version = ++this.nextRequestVersion;
    for (const tile of requested) {
      this.lastTry.set(tile, this.clock.now());
      this.requestVersions.set(tile, version);
    }
    // Keep the previous snapshot on failure. Callers with a UI can surface the error and retry.
    const pois = await this.backend.getPois(requested);
    const current = new Set(requested.filter((tile) => this.requestVersions.get(tile) === version));
    if (!current.size) return;
    // A late, earlier read must never replace the completed-ingestion snapshot.
    for (const [id, poi] of this.byId) if (current.has(poi.tile)) this.byId.delete(id);
    for (const poi of pois) if (current.has(poi.tile)) this.byId.set(poi.id, poi);
    this.dataRevision++;
  }

  /** Loads tiles that have no POIs yet (retrying not-yet-ingested tiles at most every 8 s). */
  async load(tiles: string[]): Promise<void> {
    const have = new Set([...this.byId.values()].map((p) => p.tile));
    const now = this.clock.now();
    const need = tiles.filter((t) => !have.has(t) && now - (this.lastTry.get(t) ?? -Infinity) >= 8_000);
    if (need.length === 0) return;
    try {
      await this.refresh(need);
    } catch {
      // transient: retried on the next cycle
    }
  }
}

export interface ForkChoice {
  poi: Poi;
  walkMinutes: number;
  distanceM: number;
  teaser?: string;
}

export interface ForkSnapshot {
  options: ForkChoice[];
  loading: boolean;
}

interface ForkOpts {
  runtime: GuideRuntime;
  backend: Backend;
  pool: PoiPool;
  lang: string;
  interests: Interest[];
  profile: RoutingProfile;
  budgetMinutes: number;
  destination?: LatLng;
  clock?: Clock;
  access?: AccessInfo;
}

/** Crossroads mode (spec 5.3): at every waypoint offer two distinct next stops; the choice extends the route. */
export class ForkController {
  private readonly curation: LiveCuration;
  private revision = 0;
  private snap: ForkSnapshot = { options: [], loading: false };
  private readonly listeners = new Set<() => void>();
  private unsub: (() => void) | undefined;
  private readonly startedAt: number;
  private readonly clock: Clock;
  constructor(private readonly o: ForkOpts) {
    this.clock = o.clock ?? realClock;
    this.startedAt = this.clock.now();
    this.curation = new LiveCuration(o.backend, () => this.clock.now());
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };
  getSnapshot = () => this.snap;
  private set(s: ForkSnapshot) {
    this.snap = s;
    this.listeners.forEach((l) => l());
  }

  attach() {
    this.unsub = this.o.runtime.addCommandListener((c) => {
      if (c.type === 'waypoint' || c.type === 'needNext') void this.compute();
    });
  }
  detach() {
    this.revision++;
    this.unsub?.();
  }

  /** Options for the current position (also used before the first stop). */
  async compute(at?: LatLng): Promise<ForkChoice[]> {
    const revision = ++this.revision;
    const here = at ?? this.o.runtime.getSnapshot().user;
    if (!here) return [];
    const tile = encodeGeohash(here.lat, here.lng, config.tilePrecision);
    await this.o.pool.load(tilesAround(tile, 2));
    const used = (this.clock.now() - this.startedAt) / 60_000;
    const st = this.o.runtime.getState();
    const visitedIds = [...new Set([...st.route.map((r) => r.id), ...st.visited, ...st.skipped])];
    const input = {
      here,
      candidates: this.o.pool.all(),
      visitedIds,
      remainingMinutes: Math.max(0, this.o.budgetMinutes - used),
      ...(this.o.destination ? { destination: this.o.destination } : {}),
      interests: this.o.interests,
      profile: this.o.profile,
    };
    const choices = pickForkOptions(input);
    const excluded = [...visitedIds, ...choices.map((choice) => choice.poi.id)];
    while (choices.length < 12) {
      const more = pickForkOptions({ ...input, visitedIds: excluded });
      if (!more.length) break;
      choices.push(...more);
      excluded.push(...more.map((choice) => choice.poi.id));
    }
    this.set({ ...this.snap, loading: true });
    const ranked = await this.curation.rank(
      choices.map((choice) => choice.poi),
      curationContext(this.o.runtime, this.o.lang, this.o.interests),
    );
    if (revision !== this.revision) return [];
    const first = choices.find((choice) => choice.poi.id === ranked[0]?.id);
    const second = first
      ? ranked
          .slice(1)
          .map((p) => choices.find((choice) => choice.poi.id === p.id)!)
          .find(
            (choice) =>
              choice.poi.primaryInterest !== first.poi.primaryInterest ||
              angleDiff(choice.bearing, first.bearing) >= 60,
          )
      : undefined;
    const picked = first ? [first, ...(second ? [second] : [])] : [];
    const options: ForkChoice[] = picked.map((p) => ({
      poi: p.poi,
      walkMinutes: p.walkMinutes,
      distanceM: p.distanceM,
    }));
    this.set({ options, loading: true });
    await Promise.all(
      options.map(async (opt) => {
        try {
          opt.teaser = await this.o.backend.getTeaser({
            poiId: opt.poi.id,
            lang: this.o.lang,
            ...(this.o.access ? { access: this.o.access } : {}),
          });
        } catch {
          // a card without teaser is fine
        }
      }),
    );
    if (revision === this.revision) this.set({ options: [...options], loading: false });
    return options;
  }

  /** Dismisses the current options (e.g. after the first choice was used to start the session). */
  clear() {
    this.set({ options: [], loading: false });
  }

  choose(poiId: string) {
    const opt = this.snap.options.find((x) => x.poi.id === poiId);
    if (!opt) return;
    this.revision++;
    this.o.runtime.appendStop({ id: opt.poi.id, name: opt.poi.name, location: opt.poi.location });
    this.set({ options: [], loading: false });
  }
}

interface RoamOpts {
  runtime: GuideRuntime;
  backend: Backend;
  pool: PoiPool;
  interests: Interest[];
  frequency: NarrationFrequency;
  lang?: string;
  /** A chosen stop is kept as target until it is reached. */
  pinnedTargetId?: string;
  clock?: Clock;
}

/**
 * Roam mode (spec 5.4): no fixed route. Looks in a corridor ahead (radius depends on speed), warms tiles that are
 * not ingested yet, and hands the best matching, not yet told POI to the guide engine (which paces the narration).
 */
export class RoamController {
  private readonly curation: LiveCuration;
  private selecting = false;
  private unsub: (() => void) | undefined;
  private lastRun = -Infinity;
  private lastNarrated = 0;
  private lastNarratedAt: LatLng | undefined;
  private readonly requested = new Set<string>();
  private readonly clock: Clock;
  private pinnedTargetId: string | undefined;
  private revision = 0;
  private detached = false;
  constructor(private readonly o: RoamOpts) {
    this.clock = o.clock ?? realClock;
    this.pinnedTargetId = o.pinnedTargetId;
    this.curation = new LiveCuration(o.backend, () => this.clock.now());
  }

  attach() {
    this.detached = false;
    this.unsub = this.o.runtime.addFixListener((f) => void this.onFix(f));
    const off = this.o.runtime.addCommandListener((c) => {
      if (c.type === 'visited') {
        this.lastNarrated = this.clock.now();
        const st = this.o.runtime.getState();
        const stop = st.route.find((r) => r.id === c.poiId);
        if (stop) this.lastNarratedAt = stop.location;
      }
    });
    const prev = this.unsub;
    this.unsub = () => {
      prev();
      off();
    };
  }
  detach() {
    this.unsub?.();
    this.detached = true;
    this.revision++;
  }

  /** Changing destination must leave a playing or queued story intact; pausing alone does not block it. */
  canChoose(): boolean {
    const st = this.o.runtime.getState();
    return !this.detached && st.open && !st.finished && !st.playback && !st.pending && !st.pendingTransition;
  }

  /** Pick the next place in this walk without restarting GPS, audio or the history record. */
  choose(poi: Poi): boolean {
    const rt = this.o.runtime;
    const st = rt.getState();
    if (
      !this.canChoose() ||
      poi.hidden ||
      !poi.accessible ||
      st.visited.includes(poi.id) ||
      st.skipped.includes(poi.id) ||
      st.narrated.includes(poi.id)
    )
      return false;
    this.pinnedTargetId = poi.id;
    this.revision++;
    const target = st.route[st.index];
    if (target?.id === poi.id) return true;
    const stop = { id: poi.id, name: poi.name, location: poi.location };
    if (st.awaitingRoute) rt.appendStop(stop);
    // Keep a reached/heard stop until the engine handles its departure or waypoint.
    else if (target && (st.reached[target.id] || st.narrated.includes(target.id)))
      rt.setRoute([...st.route.slice(0, st.index + 1), stop], st.index, true);
    else rt.retarget(stop);
    return true;
  }

  private async onFix(f: { lat: number; lng: number; ts: number }) {
    if (this.selecting) return;
    this.selecting = true;
    try {
      await this.updateForFix(f);
    } finally {
      this.selecting = false;
    }
  }

  private async updateForFix(f: { lat: number; lng: number; ts: number }) {
    if (f.ts - this.lastRun < 4_000) return;
    this.lastRun = f.ts;
    const revision = ++this.revision;
    const rt = this.o.runtime;
    let st = rt.getState();
    let { mode, speedMps, heading } = st.travel;
    if (st.paused || this.detached) return;
    let pos = { lat: f.lat, lng: f.lng };
    const tile = encodeGeohash(pos.lat, pos.lng, config.tilePrecision);

    // 1) make sure the area ahead exists (spec 5.4: prefetch ingest for tiles not yet covered)
    const ahead = tilesAhead(pos, heading ?? 0, corridorLengthM(mode, speedMps) * 1.6, config.tilePrecision);
    let started = 0;
    for (const t of [tile, ...ahead]) {
      if (this.requested.has(t) || started >= 3) continue;
      this.requested.add(t);
      started++;
      void this.o.backend.ensureArea(t, 0).catch(() => this.requested.delete(t));
    }
    await this.o.pool.load([...new Set([tile, ...ahead])]);

    // Location, playback or a manual choice may have changed while tiles were loading.
    if (this.detached || revision !== this.revision) return;
    st = rt.getState();
    ({ mode, speedMps, heading } = st.travel);
    if (st.paused || st.finished) return;
    pos = st.travel.last ?? pos;

    // 2) pick the next target when idle (after cooldown) or when the current one was left behind
    const cfg = ROAM_PROFILES[this.o.frequency];
    const target = st.route[st.index];
    const idle = st.awaitingRoute || !target || st.route.length === 0;
    const cooled = this.clock.now() - this.lastNarrated >= cfg.cooldownSec * 1000;
    const busy = Boolean(st.playback) || Boolean(st.pending) || Boolean(st.pendingTransition);
    if (busy || (!idle && st.reached[target!.id])) return;
    if (idle && !cooled && st.narrated.length > 0) return;
    if (target && !idle && cooled && mode === 'walking') {
      const detail = pickWaysideStop({
        from: pos,
        to: target.location,
        candidates: this.o.pool.all(),
        seenIds: [...st.route.map((s) => s.id), ...st.narrated, ...st.visited, ...st.skipped],
        seenNames: st.route.map((s) => s.name),
      });
      if (detail) {
        rt.setRoute(
          [
            ...st.route.slice(0, st.index),
            { id: detail.id, name: detail.name, location: detail.location },
            ...st.route.slice(st.index),
          ],
          st.index,
          true,
        );
        return;
      }
    }
    if (target && target.id === this.pinnedTargetId && !st.reached[target.id]) return;
    if (!idle && target && this.stillAhead(pos, heading, target.location)) return;
    const seen = [...new Set([...st.narrated, ...st.visited, ...st.skipped])];
    const input = {
      pos,
      heading,
      mode,
      speedMps,
      candidates: this.o.pool.all(),
      seenIds: seen,
      interests: this.o.interests,
      frequency: this.o.frequency,
      ...(this.lastNarratedAt ? { lastNarratedAt: this.lastNarratedAt } : {}),
    };
    const candidates: Poi[] = [];
    for (let i = 0; i < 12; i++) {
      const candidate = pickRoamTarget({ ...input, seenIds: [...seen, ...candidates.map((p) => p.id)] });
      if (!candidate) break;
      candidates.push(candidate);
    }
    const ranked = await this.curation.rank(candidates, curationContext(rt, this.o.lang, this.o.interests));
    if (this.detached || revision !== this.revision) return;
    st = rt.getState();
    if (st.paused || st.finished || st.playback || st.pending || st.pendingTransition) return;
    // The listener may have moved during the AI call. Recheck direction, distance and duplicates now.
    const next = ranked.find((candidate) =>
      pickRoamTarget({
        ...input,
        pos: st.travel.last ?? pos,
        heading: st.travel.heading,
        mode: st.travel.mode,
        speedMps: st.travel.speedMps,
        candidates: [candidate],
        seenIds: [...st.narrated, ...st.visited, ...st.skipped],
      }),
    );
    if (!next || next.id === target?.id) return;
    // keep an existing, still valid target unless the listener turned away from it
    if (!idle && target && this.stillAhead(pos, heading, target.location)) return;
    const stop = { id: next.id, name: next.name, location: next.location };
    if (st.awaitingRoute) rt.appendStop(stop);
    else rt.retarget(stop);
  }

  private stillAhead(pos: LatLng, heading: number | undefined, target: LatLng): boolean {
    if (heading === undefined) return true;
    return angleDiff(bearingDegrees(pos, target), heading) <= 70;
  }
}
