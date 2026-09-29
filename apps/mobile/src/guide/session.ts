import { useSyncExternalStore } from 'react';
import {
  decodePolyline,
  destinationPoint,
  type Interest,
  type LatLng,
  type NarrationFrequency,
  type Poi,
  type RoutingProfile,
  type Tour,
} from '@tuur/shared';
import { createAudioEngine } from '../audio/createEngine';
import { getBackend } from '../backend';
import { RealLocationSource } from '../location/real';
import { SimulatedLocationSource } from '../location/simulated';
import type { AccessInfo } from '../backend/types';
import type { LocationSource } from '../location/types';
import { ForkController, PoiPool, RoamController } from './modes';
import { GuideRuntime } from './runtime';

export type SessionMode = 'tour' | 'planned' | 'fork' | 'roam';

export interface ActiveSession {
  mode: SessionMode;
  runtime: GuideRuntime;
  /** Present for standard and planned tours; crossroads and roam build their route on the way. */
  tour?: Tour;
  title?: string;
  simulator?: SimulatedLocationSource;
  fork?: ForkController;
  roam?: RoamController;
  startedAt: number;
}

let active: ActiveSession | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function tourPath(tour: Tour): LatLng[] {
  return decodePolyline(tour.path).map(([lat, lng]) => ({ lat, lng }));
}

interface Common {
  lang: string;
  interest?: Interest;
  simulate?: boolean;
  location?: LocationSource;
}

function makeRuntime(c: Common, access: AccessInfo) {
  return new GuideRuntime({
    access,
    backend: getBackend(),
    audio: createAudioEngine(),
    lang: c.lang,
    ...(c.interest ? { interest: c.interest } : {}),
  });
}

/** Developer simulator: a straight walk of `lengthM` meters in `heading` direction (crossroads/roam have no path). */
function straightWalk(start: LatLng, heading: number, lengthM: number): SimulatedLocationSource {
  return new SimulatedLocationSource([
    destinationPoint(start, heading + 180, 40),
    destinationPoint(start, heading, lengthM),
  ]);
}

async function begin(s: ActiveSession): Promise<ActiveSession> {
  active = s;
  emit();
  return s;
}

/** Starts (or replaces) a standard or planned tour; the session outlives screens so audio continues in the background. */
export async function startTourSession(
  o: Common & { tour: Tour; planned?: boolean },
): Promise<ActiveSession> {
  await endSession();
  const runtime = makeRuntime(o, o.planned ? { mode: 'planned' } : { tourId: o.tour.id, mode: 'tour' });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (o.simulate) {
    const first = o.tour.stops[0]!;
    // start ~150 m before the first stop so the approach and the arrival narration can be observed
    const lead = { lat: first.location.lat - 0.0012, lng: first.location.lng - 0.0012 };
    simulator = new SimulatedLocationSource([lead, ...tourPath(o.tour)]);
    source = simulator;
  } else {
    source = o.location ?? new RealLocationSource();
  }
  const session = await begin({
    mode: o.planned ? 'planned' : 'tour',
    runtime,
    tour: o.tour,
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
  });
  await runtime.start(
    o.tour.stops.map((s) => ({ id: s.poiId, name: s.name, location: s.location })),
    source,
  );
  return session;
}

/** Crossroads: starts with the stop the listener chose at the first fork; more forks follow at every waypoint. */
export async function startForkSession(
  o: Common & {
    first: Poi;
    start: LatLng;
    pool: PoiPool;
    profile: RoutingProfile;
    budgetMinutes: number;
    interests: Interest[];
  },
): Promise<ActiveSession> {
  await endSession();
  const runtime = makeRuntime(o, { mode: 'fork' });
  const fork = new ForkController({
    runtime,
    backend: getBackend(),
    pool: o.pool,
    access: { mode: 'fork' },
    lang: o.lang,
    interests: o.interests,
    profile: o.profile,
    budgetMinutes: o.budgetMinutes,
  });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (o.simulate) {
    simulator = new SimulatedLocationSource([
      destinationPoint(o.first.location, 270, 120),
      o.first.location,
      destinationPoint(o.first.location, 90, 400),
    ]);
    source = simulator;
  } else source = o.location ?? new RealLocationSource();
  const session = await begin({
    mode: 'fork',
    runtime,
    fork,
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
  });
  fork.attach();
  await runtime.start([{ id: o.first.id, name: o.first.name, location: o.first.location }], source, {
    open: true,
  });
  return session;
}

/** Roam: no route at all; the controller feeds the best POI ahead to the guide engine. */
export async function startRoamSession(
  o: Common & { start: LatLng; frequency: NarrationFrequency; interests: Interest[] },
): Promise<ActiveSession> {
  await endSession();
  const runtime = makeRuntime(o, { mode: 'roam' });
  const pool = new PoiPool(getBackend());
  const roam = new RoamController({
    runtime,
    backend: getBackend(),
    pool,
    interests: o.interests,
    frequency: o.frequency,
  });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (o.simulate) {
    simulator = straightWalk(o.start, 90, 3000);
    source = simulator;
  } else source = o.location ?? new RealLocationSource();
  const session = await begin({
    mode: 'roam',
    runtime,
    roam,
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
  });
  roam.attach();
  await runtime.start([], source, { open: true });
  return session;
}

export async function endSession(): Promise<void> {
  const cur = active;
  active = undefined;
  emit();
  cur?.fork?.detach();
  cur?.roam?.detach();
  await cur?.runtime.dispose();
}

export function useActiveSession(): ActiveSession | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => active,
    () => active,
  );
}

export function getActiveSession() {
  return active;
}
