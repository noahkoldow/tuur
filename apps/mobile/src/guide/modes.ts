import {
  ROAM_PROFILES,
  angleDiff,
  bearingDegrees,
  corridorLengthM,
  encodeGeohash,
  pickForkOptions,
  pickRoamTarget,
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

/** POIs around the listener, loaded tile by tile (the server only ever sees tile ids, never positions). */
export class PoiPool {
  private byId = new Map<string, Poi>();
  private lastTry = new Map<string, number>();
  constructor(
    private readonly backend: Backend,
    private readonly clock: Clock = realClock,
  ) {}

  all(): Poi[] {
    return [...this.byId.values()];
  }

  /** Loads tiles that have no POIs yet (retrying not-yet-ingested tiles at most every 8 s). */
  async load(tiles: string[]): Promise<void> {
    const have = new Set([...this.byId.values()].map((p) => p.tile));
    const now = this.clock.now();
    const need = tiles.filter((t) => !have.has(t) && now - (this.lastTry.get(t) ?? -Infinity) >= 8_000);
    if (need.length === 0) return;
    for (const t of need) this.lastTry.set(t, now);
    try {
      for (const p of await this.backend.getPois(need)) this.byId.set(p.id, p);
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
  private snap: ForkSnapshot = { options: [], loading: false };
  private readonly listeners = new Set<() => void>();
  private unsub: (() => void) | undefined;
  private readonly startedAt: number;
  private readonly clock: Clock;
  constructor(private readonly o: ForkOpts) {
    this.clock = o.clock ?? realClock;
    this.startedAt = this.clock.now();
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
    this.unsub?.();
  }

  /** Options for the current position (also used before the first stop). */
  async compute(at?: LatLng): Promise<ForkChoice[]> {
    const here = at ?? this.o.runtime.getSnapshot().user;
    if (!here) return [];
    const tile = encodeGeohash(here.lat, here.lng, config.tilePrecision);
    await this.o.pool.load(tilesAround(tile, 2));
    const used = (this.clock.now() - this.startedAt) / 60_000;
    const st = this.o.runtime.getState();
    const visitedIds = [...new Set([...st.route.map((r) => r.id), ...st.visited, ...st.skipped])];
    const picked = pickForkOptions({
      here,
      candidates: this.o.pool.all(),
      visitedIds,
      remainingMinutes: Math.max(0, this.o.budgetMinutes - used),
      ...(this.o.destination ? { destination: this.o.destination } : {}),
      interests: this.o.interests,
      profile: this.o.profile,
    });
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
    this.set({ options: [...options], loading: false });
    return options;
  }

  /** Dismisses the current options (e.g. after the first choice was used to start the session). */
  clear() {
    this.set({ options: [], loading: false });
  }

  choose(poiId: string) {
    const opt = this.snap.options.find((x) => x.poi.id === poiId);
    if (!opt) return;
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
  /** First stop chosen at the start ("just go" / picked start): kept as target until it is reached. */
  pinnedTargetId?: string;
  clock?: Clock;
}

/**
 * Roam mode (spec 5.4): no fixed route. Looks in a corridor ahead (radius depends on speed), warms tiles that are
 * not ingested yet, and hands the best matching, not yet told POI to the guide engine (which paces the narration).
 */
export class RoamController {
  private unsub: (() => void) | undefined;
  private lastRun = -Infinity;
  private lastNarrated = 0;
  private lastNarratedAt: LatLng | undefined;
  private readonly requested = new Set<string>();
  private readonly clock: Clock;
  constructor(private readonly o: RoamOpts) {
    this.clock = o.clock ?? realClock;
  }

  attach() {
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
  }

  private async onFix(f: { lat: number; lng: number; ts: number }) {
    if (f.ts - this.lastRun < 4_000) return;
    this.lastRun = f.ts;
    const rt = this.o.runtime;
    const st = rt.getState();
    const { mode, speedMps, heading } = st.travel;
    if (mode === 'vehicle') return;
    const pos = { lat: f.lat, lng: f.lng };
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

    // 2) pick the next target when idle (after cooldown) or when the current one was left behind
    const cfg = ROAM_PROFILES[this.o.frequency];
    const target = st.route[st.index];
    if (target && target.id === this.o.pinnedTargetId && !st.reached[target.id]) return;
    const idle = st.awaitingRoute || !target || st.route.length === 0;
    const cooled = this.clock.now() - this.lastNarrated >= cfg.cooldownSec * 1000;
    const busy = Boolean(st.playback) || Boolean(st.pending);
    if (busy || (!idle && st.reached[target!.id])) return;
    if (idle && !cooled && st.narrated.length > 0) return;
    const seen = [...new Set([...st.narrated, ...st.visited, ...st.skipped])];
    const next = pickRoamTarget({
      pos,
      heading,
      mode,
      speedMps,
      candidates: this.o.pool.all(),
      seenIds: seen,
      interests: this.o.interests,
      frequency: this.o.frequency,
      ...(this.lastNarratedAt ? { lastNarratedAt: this.lastNarratedAt } : {}),
    });
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
