import { describe, expect, it, vi } from 'vitest';
import { distanceMeters, encodePolyline, type Tour, type WalkingRouteResult } from '@tuur/shared';
import { BackendError, type Backend } from '../backend/types';
import { FakeClock } from '../testing/fakeClock';
import type { GuideUi } from './runtime';
import { pathProgress, savedTourLeg } from './navigation-geometry';
import { NavigationRouteController } from './navigation-route';

const start = { lat: 52, lng: 13 };
const corner = { lat: 52.001, lng: 13 };
const end = { lat: 52.001, lng: 13.002 };
const street = [start, corner, end];
const target = { id: 'end', name: 'End', location: end, state: 'current' as const };
const result = (path = street): WalkingRouteResult => ({
  poiId: 'end',
  origin: path[0]!,
  destination: path.at(-1)!,
  profile: 'foot-walking',
  path: path.map((p) => [p.lat, p.lng]),
  distanceMeters: 250,
  durationSeconds: 190,
  routingSource: 'ors',
});
const tour = (routingSource: Tour['routingSource'] = 'ors') =>
  ({
    id: 'saved',
    routingSource,
    path: encodePolyline(street.map((p) => [p.lat, p.lng])),
  }) as Tour;

function setup(saved?: Tour) {
  const clock = new FakeClock();
  let ui: GuideUi = {
    phase: 'approaching',
    stops: [target],
    index: 0,
    target: { id: target.id, name: target.name, distanceM: distanceMeters(start, end) },
    positionMs: 0,
    playing: false,
    paragraphIndex: 0,
    travelMode: 'walking',
    awaitingRoute: false,
    user: { ...start, accuracy: 5, ts: clock.now() },
  };
  const getWalkingRoute = vi.fn<Backend['getWalkingRoute']>().mockResolvedValue(result());
  const controller = new NavigationRouteController({
    backend: { kind: 'firebase', getWalkingRoute },
    clock,
    getInput: () => ({ ui, profile: 'foot-walking', ...(saved ? { tour: saved } : {}) }),
    subscribe: () => () => undefined,
  });
  const update = (patch: Partial<GuideUi>) => {
    ui = { ...ui, ...patch };
    controller.update();
  };
  const move = (point: typeof start, accuracy = 5) =>
    update({ user: { ...point, accuracy, ts: clock.now() } });
  controller.attach();
  return { clock, controller, getWalkingRoute, update, move };
}

describe('street geometry', () => {
  it('projects between vertices and retains the next corner instead of cutting across it', () => {
    const user = { lat: 52.0003, lng: 13.00003 };
    const progress = pathProgress(street, user);
    expect(progress.remaining[0]?.lng).toBe(13);
    expect(progress.remaining.slice(1)).toEqual([corner, end]);
    expect(progress.remainingMeters).toBeGreaterThan(distanceMeters(user, end) + 20);
    expect(progress.bearing).toBeCloseTo(0);
    expect(progress.distanceFromPath).toBeLessThan(3);
    expect(pathProgress(street, { lat: 52.001, lng: 13.001 }).bearing).toBeCloseTo(90, 1);
  });

  it('never appends a GPS-to-road or road-to-POI straight connector', () => {
    expect(pathProgress([], start).remaining).toEqual([]);
    const offset = { ...end, lat: end.lat + 0.0002 };
    expect(savedTourLeg(street, [{ id: 'place', location: offset }], 'place').leg).toEqual(street);
  });
});

describe('session street navigation', () => {
  it('keeps consumed loop segments behind the user when returning to the same crossing', async () => {
    const { controller, clock, getWalkingRoute, move, update } = setup();
    const c = { lat: 52.001, lng: 13.001 };
    const finish = { lat: 52, lng: 13.003 };
    const loop = [start, corner, c, start, finish];
    update({ stops: [{ ...target, location: finish }] });
    getWalkingRoute.mockResolvedValue(result(loop));
    await clock.advance(800);
    move(corner);
    move(c);
    move(start);
    expect(controller.getSnapshot().status).toBe('ready');
    expect(controller.getSnapshot().distanceM).toBeLessThan(220);
    expect(controller.getSnapshot().leg).not.toContainEqual(corner);
    expect(controller.getSnapshot().leg).not.toContainEqual(c);
    controller.dispose();
  });

  it('does not transmit directions while paused and discards the request that was already running', async () => {
    const { controller, clock, getWalkingRoute, update, move } = setup();
    update({ phase: 'paused' });
    await clock.advance(5000);
    expect(getWalkingRoute).not.toHaveBeenCalled();
    let resolve!: (route: WalkingRouteResult) => void;
    getWalkingRoute.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    update({ phase: 'approaching' });
    await clock.flush();
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    update({ phase: 'paused' });
    resolve(result());
    await clock.flush();
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', leg: [] });
    move({ lat: 52, lng: 13.002 });
    await clock.advance(30_000);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('does not keep requesting a road that is too far from a stationary GPS fix', async () => {
    const { controller, clock, getWalkingRoute, move } = setup();
    getWalkingRoute.mockResolvedValue(result([corner, end]));
    await clock.advance(800);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', leg: [] });
    for (let i = 0; i < 10; i++) {
      await clock.advance(30_000);
      move(start);
    }
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    move(corner);
    expect(controller.getSnapshot().status).toBe('ready');
    controller.dispose();
  });

  it.each([
    {
      ...result(),
      path: [
        [Number.NaN, 13],
        [52, 13.001],
      ],
    },
    { ...result(), profile: 'cycling-regular' },
    { ...result(), poiId: 'another-place' },
  ])('rejects malformed or mismatched provider geometry', async (response) => {
    const { controller, clock, getWalkingRoute } = setup();
    getWalkingRoute.mockResolvedValue(response as WalkingRouteResult);
    await clock.advance(800);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', leg: [] });
    controller.dispose();
  });

  it('uses saved ORS geometry offline and derives distance/bearing from its next segment', async () => {
    const { controller, clock, getWalkingRoute, move } = setup(tour());
    getWalkingRoute.mockRejectedValue(new BackendError('network', 'offline'));
    move({ lat: 52.0003, lng: 13 });
    await clock.advance(5000);
    expect(getWalkingRoute).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ status: 'ready', bearing: 0 });
    expect(controller.getSnapshot().distanceM).toBeGreaterThan(200);
    expect(controller.getSnapshot().leg).toContainEqual(corner);
    controller.dispose();
  });

  it('fetches one real route for a new open-route target, debounces, and ignores repeated UI ticks', async () => {
    const { controller, clock, getWalkingRoute, update } = setup();
    expect(controller.getSnapshot()).toMatchObject({ status: 'loading', leg: [] });
    await clock.advance(799);
    expect(getWalkingRoute).not.toHaveBeenCalled();
    await clock.advance(1);
    expect(getWalkingRoute).toHaveBeenCalledExactlyOnceWith({
      origin: start,
      poiId: 'end',
      profile: 'foot-walking',
    });
    expect(controller.getSnapshot().leg).toEqual(street);
    for (let i = 0; i < 20; i++) update({ positionMs: i * 500 });
    await clock.advance(30_000);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('rejects approximate saved tours and non-road live responses without displaying a line', async () => {
    const { controller, clock, getWalkingRoute } = setup(tour('approx'));
    getWalkingRoute.mockResolvedValue({ ...result(), routingSource: 'mock' });
    await clock.advance(800);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', leg: [], error: 'unavailable' });
    controller.dispose();
  });

  it('waits for sustained deviation and a 30-second gap before rerouting, hiding obsolete directions', async () => {
    const { controller, clock, getWalkingRoute, move } = setup();
    await clock.advance(800);
    move({ lat: 52, lng: 13.002 });
    expect(controller.getSnapshot()).toMatchObject({ status: 'loading', leg: [] });
    expect(controller.getSnapshot().distanceM).toBeUndefined();
    await clock.advance(4000);
    move(start); // GPS bounce / user returned to the route.
    await clock.advance(26_000);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    move({ lat: 52, lng: 13.002 });
    await clock.advance(7999);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    getWalkingRoute.mockResolvedValue(result([{ lat: 52, lng: 13.002 }, end]));
    await clock.advance(1);
    expect(getWalkingRoute).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().status).toBe('ready');
    controller.dispose();
  });

  it('does not route with imprecise GPS and discards coordinates from API errors', async () => {
    const { controller, clock, getWalkingRoute, move } = setup();
    move(start, 100);
    await clock.advance(20_000);
    expect(controller.getSnapshot().status).toBe('waiting_location');
    expect(getWalkingRoute).not.toHaveBeenCalled();
    move(start);
    getWalkingRoute.mockRejectedValue(new BackendError('network', 'private origin 52,13'));
    await clock.flush();
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: 'network', leg: [] });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('private origin');
    controller.dispose();
  });

  it('retries a failure only on explicit retry or material movement and observes server backoff', async () => {
    const { controller, clock, getWalkingRoute, move } = setup();
    getWalkingRoute.mockRejectedValue(new BackendError('rate_limited', 'limit', 60_000));
    await clock.advance(800);
    for (let i = 0; i < 5; i++) {
      await clock.advance(5000);
      move(start);
    }
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    controller.retry();
    getWalkingRoute.mockResolvedValue(result());
    await clock.advance(34_999);
    expect(getWalkingRoute).toHaveBeenCalledOnce();
    move(start);
    await clock.advance(1);
    expect(getWalkingRoute).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().status).toBe('ready');
    controller.dispose();
  });

  it('discards late responses after a target change and after disposal', async () => {
    const { controller, clock, getWalkingRoute, update } = setup();
    let resolve!: (route: WalkingRouteResult) => void;
    getWalkingRoute.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await clock.advance(800);
    update({ target: undefined, awaitingRoute: true });
    resolve(result());
    await clock.flush();
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', leg: [] });
    update({ target: { id: 'end', name: 'End' }, awaitingRoute: false });
    await clock.advance(5000);
    controller.dispose();
    const snapshot = controller.getSnapshot();
    resolve(result());
    await clock.flush();
    expect(controller.getSnapshot()).toBe(snapshot);
  });

  it('routes a navigation-only finish by coordinates without a narration POI identifier', async () => {
    const { controller, clock, getWalkingRoute, update } = setup();
    update({ stops: [{ ...target, navigationOnly: true }] });
    await clock.advance(800);
    expect(getWalkingRoute).toHaveBeenCalledExactlyOnceWith({
      origin: start,
      destination: end,
      profile: 'foot-walking',
    });
    controller.dispose();
  });

  it('times out requests and ignores their eventual results', async () => {
    const { controller, clock, getWalkingRoute } = setup();
    let resolve!: (route: WalkingRouteResult) => void;
    getWalkingRoute.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await clock.advance(20_800);
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: 'network', leg: [] });
    resolve(result());
    await clock.flush();
    expect(controller.getSnapshot().status).toBe('error');
    controller.dispose();
  });
});
