import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
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
import { config } from '../config';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';

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
  foregroundOnly?: boolean;
  /** Local history record of this session (summary, profile, badges). */
  recordId: string;
  /** Live group (D47): host shares, guests ride along online. */
  groupId?: string;
  guest?: boolean;
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
  /** Background location was not granted: the player shows a hint. */
  foregroundOnly?: boolean;
}

function makeRuntime(c: Common, access: AccessInfo) {
  return new GuideRuntime({
    access,
    backend: getBackend(),
    audio: createAudioEngine(),
    lang: c.lang,
    voice: useSettings.getState().voiceId,
    ...(c.interest ? { interest: c.interest } : {}),
  });
}

/** The demo backend has no data at the device's real position, so previews always walk the simulator. */
const simulating = (c: Common) => Boolean(c.simulate) || config.backend === 'demo';

/** Developer simulator: a straight walk of `lengthM` meters in `heading` direction (crossroads/roam have no path). */
function straightWalk(start: LatLng, heading: number, lengthM: number): SimulatedLocationSource {
  return new SimulatedLocationSource([
    destinationPoint(start, heading + 180, 40),
    destinationPoint(start, heading, lengthM),
  ]);
}

async function begin(s: Omit<ActiveSession, 'recordId'>): Promise<ActiveSession> {
  // Local tour history (summary, profile list, city badges): created now, stops and the walked track follow.
  const title = s.tour?.texts ? Object.values(s.tour.texts)[0]?.title : undefined;
  const record = {
    id: `${s.mode}_${s.startedAt}`,
    mode: s.mode,
    ...(title ? { title } : {}),
    ...(s.tour?.path ? { path: s.tour.path } : {}),
    ...(s.groupId ? { groupId: s.groupId } : {}),
    startedAt: s.startedAt,
  };
  const session: ActiveSession = { ...s, recordId: record.id };
  active = session;
  emit();
  const history = useHistory.getState();
  history.start(record);
  s.runtime.addCommandListener((c) => {
    if (c.type !== 'visited') return;
    const stop = s.runtime.getState().route.find((r) => r.id === c.poiId);
    if (stop)
      useHistory.getState().addStop(record, { id: stop.id, name: stop.name, location: stop.location });
  });
  s.runtime.addFixListener((f) =>
    useHistory.getState().addTrackPoint(record.id, { lat: f.lat, lng: f.lng, ts: f.ts }),
  );
  return session;
}

/** Starts (or replaces) a standard or planned tour; the session outlives screens so audio continues in the background. */
export async function startTourSession(
  o: Common & { tour: Tour; planned?: boolean; groupId?: string; guest?: boolean },
): Promise<ActiveSession> {
  // Group guests ride on the host's tour: no own start claim, the server checks the membership instead (D47).
  if (!o.guest) {
    const tourStartSessionId = o.planned ? o.tour.id.replace(/^planned_/, '') : randomUUID();
    await getBackend().claimTourStart(o.tour.id, tourStartSessionId, o.planned ? 'planned' : 'tour');
  }
  await endSession();
  const runtime = makeRuntime(o, {
    tourId: o.tour.id,
    mode: o.planned ? 'planned' : 'tour',
    ...(o.groupId ? { groupId: o.groupId } : {}),
  });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (simulating(o)) {
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
    ...(o.groupId ? { groupId: o.groupId } : {}),
    ...(o.guest ? { guest: true } : {}),
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
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
  if (simulating(o)) {
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
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
  });
  fork.attach();
  await runtime.start([{ id: o.first.id, name: o.first.name, location: o.first.location }], source, {
    open: true,
  });
  return session;
}

/**
 * Roam: no route at all; the controller feeds the best POI ahead to the guide engine. With `first` the listener is
 * guided to that stop first ("just go" or a picked start) and roaming continues from there.
 */
export async function startRoamSession(
  o: Common & { start: LatLng; frequency: NarrationFrequency; interests: Interest[]; first?: Poi },
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
    ...(o.first ? { pinnedTargetId: o.first.id } : {}),
  });
  let simulator: SimulatedLocationSource | undefined;
  let source: LocationSource;
  if (simulating(o)) {
    simulator = o.first
      ? new SimulatedLocationSource([
          destinationPoint(o.start, 270, 40),
          o.first.location,
          destinationPoint(o.first.location, 90, 2500),
        ])
      : straightWalk(o.start, 90, 3000);
    source = simulator;
  } else source = o.location ?? new RealLocationSource();
  const session = await begin({
    mode: 'roam',
    runtime,
    roam,
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
  });
  roam.attach();
  const first = o.first ? [{ id: o.first.id, name: o.first.name, location: o.first.location }] : [];
  await runtime.start(first, source, { open: true });
  return session;
}

/**
 * Ends the running session and closes its history record. Returns the record id when the tour is worth a summary
 * (a stop was reached or the listener really walked). A host ending the tour also ends a live group.
 */
export async function endSession(): Promise<string | undefined> {
  const cur = active;
  active = undefined;
  emit();
  cur?.fork?.detach();
  cur?.roam?.detach();
  await cur?.runtime.dispose();
  if (!cur) return undefined;
  if (cur.groupId)
    void getBackend()
      .leaveGroup(cur.groupId)
      .catch(() => undefined);
  return useHistory.getState().finish(cur.recordId, Date.now())?.id;
}

/** Host invites friends into the running tour; returns the share link (D47). */
export async function inviteToGroup(): Promise<{ url: string; groupId: string; capacity: number }> {
  const cur = active;
  if (!cur?.tour || cur.guest) throw new Error('No tour to share');
  const { token, group } = await getBackend().createGroup({
    tourId: cur.tour.id,
    mode: cur.mode === 'planned' ? 'planned' : 'tour',
  });
  active = { ...cur, groupId: group.id };
  cur.runtime.setAccess({ ...(cur.runtime.getAccess() ?? {}), groupId: group.id });
  emit();
  return { url: `${config.legal.webBaseUrl}/join/${token}`, groupId: group.id, capacity: group.capacity };
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
