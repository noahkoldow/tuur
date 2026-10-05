import {
  decodePolyline,
  distanceMeters,
  WalkingRouteResultSchema,
  type LatLng,
  type RoutingProfile,
  type Tour,
} from '@tuur/shared';
import { realClock, type Clock } from '../audio/simulatedEngine';
import { BackendError, type Backend } from '../backend/types';
import type { GuideUi } from './runtime';
import { pathProgress, savedTourLeg } from './navigation-geometry';

export interface NavigationRouteState {
  status: 'idle' | 'waiting_location' | 'loading' | 'ready' | 'error';
  leg: LatLng[];
  ahead: LatLng[];
  distanceM?: number;
  bearing?: number;
  error?: 'network' | 'rate_limited' | 'outside_area' | 'unavailable';
}

interface RouteInput {
  ui: GuideUi;
  tour?: Tour;
  profile: RoutingProfile;
}

const EMPTY: NavigationRouteState = { status: 'idle', leg: [], ahead: [] };
const TARGET_DEBOUNCE_MS = 800;
const REQUEST_GAP_MS = 5000;
const REROUTE_GAP_MS = 30_000;
const DEVIATION_MS = 8000;

/** One controller per walk, shared by home/player. Route coordinates stay only in session memory. */
export class NavigationRouteController {
  private state: NavigationRouteState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly clock: Clock;
  private detachRuntime: (() => void) | undefined;
  private timer: unknown;
  private timerAt = Infinity;
  private requestTimeout: unknown;
  private disposed = false;
  private generation = 0;
  private targetKey = '';
  private targetChangedAt = 0;
  private route: LatLng[] = [];
  private ahead: LatLng[] = [];
  private lastRequestAt = -Infinity;
  private retryAfter = -Infinity;
  private failedOrigin: LatLng | undefined;
  private routeWasFollowed = false;
  private lastRoutePosition: LatLng | undefined;
  private offRouteSince: number | undefined;
  private pending = false;
  private retryRequested = false;
  private error: NavigationRouteState['error'];

  constructor(
    private readonly deps: {
      backend: Pick<Backend, 'kind' | 'getWalkingRoute'>;
      getInput(): RouteInput;
      subscribe(cb: () => void): () => void;
      clock?: Clock;
    },
  ) {
    this.clock = deps.clock ?? realClock;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  attach() {
    if (this.detachRuntime || this.disposed) return;
    this.detachRuntime = this.deps.subscribe(this.update);
    this.update();
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.detachRuntime?.();
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    if (this.requestTimeout !== undefined) this.clock.clearTimeout(this.requestTimeout);
    this.listeners.clear();
  }
  retry = () => {
    if (this.pending || this.state.status !== 'error') return;
    this.retryRequested = true;
    this.update();
  };

  private emit(state: NavigationRouteState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private later(ms: number) {
    const at = this.clock.now() + Math.max(1, ms);
    if (at >= this.timerAt) return;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = this.clock.setTimeout(
      () => {
        this.timer = undefined;
        this.timerAt = Infinity;
        this.update();
      },
      Math.max(1, ms),
    );
  }

  update = () => {
    if (this.disposed) return;
    const { ui, tour, profile } = this.deps.getInput();
    const target =
      ui.phase !== 'finished' && !ui.awaitingRoute
        ? ui.stops.find((stop) => stop.id === ui.target?.id)
        : undefined;
    const key = target
      ? `${target.id}:${target.location.lat}:${target.location.lng}:${profile}:${tour?.id ?? ''}`
      : '';
    const now = this.clock.now();
    if (key !== this.targetKey) {
      this.generation++;
      if (this.requestTimeout !== undefined) this.clock.clearTimeout(this.requestTimeout);
      this.targetKey = key;
      this.targetChangedAt = now;
      this.pending = false;
      this.error = undefined;
      this.failedOrigin = undefined;
      this.retryRequested = false;
      this.routeWasFollowed = false;
      this.lastRoutePosition = undefined;
      this.offRouteSince = undefined;
      const trusted =
        tour &&
        (tour.routingSource === 'ors' ||
          (tour.routingSource === 'mock' && this.deps.backend.kind === 'demo'));
      const saved =
        trusted && target
          ? savedTourLeg(
              decodePolyline(tour.path).map(([lat, lng]) => ({ lat, lng })),
              ui.stops,
              target.id,
            )
          : { leg: [], ahead: [] };
      this.route = saved.leg;
      this.ahead = saved.ahead;
    }
    if (!target) {
      this.emit(EMPTY);
      return;
    }
    if (ui.phase === 'paused' && this.pending) {
      this.generation++;
      this.pending = false;
      if (this.requestTimeout !== undefined) this.clock.clearTimeout(this.requestTimeout);
    }
    const user = ui.user;
    // Poor/stale GPS never triggers paid routing or shows an invented navigation arrow.
    if (!user || (user.accuracy ?? 0) > 50 || (user.ts !== undefined && now - user.ts > 60_000)) {
      this.emit({ status: 'waiting_location', leg: this.route, ahead: this.ahead });
      return;
    }
    if (distanceMeters(user, target.location) < 25) {
      this.emit({ status: 'ready', leg: [], ahead: this.ahead, distanceM: 0 });
      return;
    }
    const progress = pathProgress(
      this.route,
      user,
      this.lastRoutePosition
        ? Math.max(60, distanceMeters(user, this.lastRoutePosition) * 2 + (user.accuracy ?? 0) * 2)
        : Infinity,
    );
    const onRoute =
      this.route.length >= 2 && progress.distanceFromPath <= Math.max(35, (user.accuracy ?? 0) * 1.5);
    if (onRoute) {
      this.routeWasFollowed = true;
      this.lastRoutePosition = user;
      // Consumed segments cannot capture the user again at a later crossing or loop return.
      this.route = progress.remaining;
      this.offRouteSince = undefined;
      this.error = undefined;
      this.failedOrigin = undefined;
      this.emit({
        status: 'ready',
        leg: progress.remaining,
        ahead: this.ahead,
        distanceM: Math.round(progress.remainingMeters),
        ...(progress.bearing === undefined ? {} : { bearing: progress.bearing }),
      });
      return;
    }
    this.offRouteSince ??= now;
    if (ui.phase === 'paused') {
      this.emit({ status: 'idle', leg: [], ahead: this.ahead });
      return;
    }
    if (this.pending) {
      this.emit({ status: 'loading', leg: [], ahead: this.ahead });
      return;
    }
    if (this.error && !this.retryRequested) {
      this.emit({ status: 'error', leg: [], ahead: this.ahead, error: this.error });
      // A failure is not retried on every location or audio tick. A materially new position may try once.
      if (!this.failedOrigin || distanceMeters(user, this.failedOrigin) < 80 || now < this.retryAfter) return;
    }
    const readyAt = Math.max(
      this.targetChangedAt + TARGET_DEBOUNCE_MS,
      this.lastRequestAt + (this.routeWasFollowed && !this.retryRequested ? REROUTE_GAP_MS : REQUEST_GAP_MS),
      this.retryAfter,
      this.routeWasFollowed && !this.retryRequested ? this.offRouteSince + DEVIATION_MS : -Infinity,
    );
    this.emit({ status: 'loading', leg: [], ahead: this.ahead });
    if (now < readyAt) {
      this.later(readyAt - now);
      return;
    }
    this.pending = true;
    this.retryRequested = false;
    this.lastRequestAt = now;
    const requestGeneration = ++this.generation;
    const origin = { lat: user.lat, lng: user.lng };
    const fail = (error: unknown) => {
      if (this.disposed || requestGeneration !== this.generation) return;
      this.generation++;
      this.pending = false;
      this.failedOrigin = origin;
      this.error =
        error instanceof BackendError && error.reason === 'beta_area_unavailable'
          ? 'outside_area'
          : error instanceof BackendError && (error.code === 'network' || error.code === 'rate_limited')
            ? error.code
            : 'unavailable';
      this.retryAfter =
        this.clock.now() + Math.max(5000, error instanceof BackendError ? (error.retryAfterMs ?? 0) : 0);
      this.emit({ status: 'error', leg: [], ahead: this.ahead, error: this.error });
    };
    const timeout = this.clock.setTimeout(
      () => fail(new BackendError('network', 'Directions timed out')),
      20_000,
    );
    this.requestTimeout = timeout;
    // The callable does not expose abort; a generation guard discards target changes, teardown and late timeouts.
    void Promise.resolve()
      .then(() => {
        if (this.disposed || requestGeneration !== this.generation) return undefined;
        return this.deps.backend.getWalkingRoute({
          origin,
          profile,
          ...(target.navigationOnly ? { destination: target.location } : { poiId: target.id }),
        });
      })
      .then((response) => {
        if (!response || this.disposed || requestGeneration !== this.generation) return;
        const result = WalkingRouteResultSchema.parse(response);
        if (
          result.profile !== profile ||
          distanceMeters(result.destination, target.location) > 30 ||
          (!target.navigationOnly && result.poiId !== target.id)
        )
          throw new BackendError('unavailable', 'Directions do not match the destination');
        if (result.routingSource !== 'ors' && this.deps.backend.kind !== 'demo')
          throw new BackendError('unavailable', 'No road geometry');
        if (result.path.length < 2) throw new BackendError('unavailable', 'Empty road geometry');
        this.route = result.path.map(([lat, lng]) => ({ lat, lng }));
        this.lastRoutePosition = undefined;
        const currentUser = this.deps.getInput().ui.user;
        if (
          currentUser &&
          distanceMeters(origin, currentUser) < 40 &&
          pathProgress(this.route, currentUser).distanceFromPath >
            Math.max(35, (currentUser.accuracy ?? 0) * 1.5)
        )
          throw new BackendError('unavailable', 'No reachable route from this location');
        this.pending = false;
        this.error = undefined;
        this.failedOrigin = undefined;
        this.offRouteSince = undefined;
        // Even if the listener moved while loading, wait before another request.
        this.routeWasFollowed = true;
        this.update();
      })
      .catch(fail)
      .finally(() => {
        this.clock.clearTimeout(timeout);
      });
  };
}
