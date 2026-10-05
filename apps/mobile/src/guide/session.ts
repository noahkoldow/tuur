import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  decodePolyline,
  createTourScript,
  destinationPoint,
  type Interest,
  type LatLng,
  type NarrationFrequency,
  type Poi,
  type RoutingProfile,
  type SessionCheckpoint,
  type Tour,
  type TourScript,
} from '@tuur/shared';
import { createAudioEngine } from '../audio/createEngine';
import { getBackend } from '../backend';
import { getPermissionState, requestForeground, RealLocationSource } from '../location/real';
import { SimulatedLocationSource } from '../location/simulated';
import type { AccessInfo } from '../backend/types';
import type { LocationSource } from '../location/types';
import { ForkController, PoiPool, RoamController } from './modes';
import { GuideRuntime } from './runtime';
import { tourGuideStops } from './tourStops';
import { SessionCheckpointStore } from './checkpointStore';
import { config } from '../config';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';
import { attachTourLiveActivity } from '../liveActivity/service';

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
  ownerUid?: string;
  recovery?: RecoveryOptions;
}

type RecoveryOptions = Pick<
  SessionCheckpoint,
  'lang' | 'interests' | 'frequency' | 'profile' | 'budgetMinutes' | 'simulate' | 'claimId'
>;

let active: ActiveSession | undefined;
let detachLiveActivity: (() => void) | undefined;
let detachCheckpoint: (() => void) | undefined;
let savedSession: SessionCheckpoint | undefined;
let recoveryRevision = 0;
let sessionLifecycle = 0;
const checkpoints = new SessionCheckpointStore(AsyncStorage);
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

function makeRuntime(c: Common, access: AccessInfo, script?: TourScript) {
  return new GuideRuntime({
    access,
    backend: getBackend(),
    audio: createAudioEngine(),
    lang: c.lang,
    voice: useSettings.getState().voiceId,
    script:
      script ??
      createTourScript({
        lang: c.lang,
        instanceId: randomUUID(),
        interests: c.interest ? [c.interest] : useSettings.getState().interests,
      }),
    ...(c.interest ? { interest: c.interest } : {}),
  });
}

/** The demo backend has no data at the device's real position, so previews always walk the simulator. */
const simulating = (c: Common) => Boolean(c.simulate) || config.backend === 'demo';

function recoveryOptions(c: Common & Partial<RecoveryOptions>): RecoveryOptions {
  const settings = useSettings.getState();
  return {
    lang: c.lang,
    interests: c.interests ?? settings.interests,
    frequency: c.frequency ?? settings.frequency,
    profile: c.profile ?? 'foot-walking',
    budgetMinutes: c.budgetMinutes ?? 480,
    simulate: simulating(c),
    ...(c.claimId ? { claimId: c.claimId } : {}),
  };
}

/** Developer simulator: a straight walk of `lengthM` meters in `heading` direction (crossroads/roam have no path). */
function straightWalk(start: LatLng, heading: number, lengthM: number): SimulatedLocationSource {
  return new SimulatedLocationSource([
    destinationPoint(start, heading + 180, 40),
    destinationPoint(start, heading, lengthM),
  ]);
}

async function begin(
  s: Omit<ActiveSession, 'recordId'>,
  recovered?: SessionCheckpoint,
): Promise<ActiveSession> {
  // Local tour history (summary, profile list, city badges): created now, stops and the walked track follow.
  const title = s.tour?.texts ? Object.values(s.tour.texts)[0]?.title : undefined;
  const record = {
    id: recovered?.recordId ?? `${s.mode}_${s.startedAt}`,
    mode: s.mode,
    ...(title ? { title } : {}),
    ...(s.tour?.path ? { path: s.tour.path } : {}),
    ...(s.groupId ? { groupId: s.groupId } : {}),
    startedAt: s.startedAt,
  };
  const ownerUid = getBackend().auth.current()?.uid;
  const session: ActiveSession = { ...s, recordId: record.id, ...(ownerUid ? { ownerUid } : {}) };
  active = session;
  emit();
  const history = useHistory.getState();
  history.start(record);
  if (recovered) {
    const progress = recovered.progress;
    for (const stop of recovered.route) {
      const explored =
        progress.visited.includes(stop.id) ||
        (progress.reached?.[stop.id] &&
          (progress.playedTier[stop.id] ||
            (progress.playback?.poiId === stop.id && progress.playback.positionMs > 0)));
      if (explored && !stop.navigationOnly && !progress.skipped.includes(stop.id))
        history.addStop(record, { id: stop.id, name: stop.name, location: stop.location });
    }
  }
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

async function startRuntime(
  session: ActiveSession,
  ...args: Parameters<GuideRuntime['start']>
): Promise<void> {
  try {
    if (active?.runtime !== session.runtime) throw new Error('Session replaced');
    await session.runtime.start(...args);
    // Ending/replacing the session during asynchronous startup must not resurrect its activity.
    if (active?.runtime === session.runtime) {
      attachCheckpoint(session);
      detachLiveActivity = attachTourLiveActivity(session, () =>
        active?.runtime === session.runtime ? active : session,
      );
    }
  } catch (error) {
    if (active?.runtime === session.runtime) {
      active = undefined;
      detachLiveActivity?.();
      detachLiveActivity = undefined;
      detachCheckpoint?.();
      detachCheckpoint = undefined;
      session.fork?.detach();
      session.roam?.detach();
      await session.runtime.dispose();
      useHistory.getState().finish(session.recordId, Date.now());
      emit();
    } else await session.runtime.dispose();
    throw error;
  }
}

/** Starts (or replaces) a standard or planned tour; the session outlives screens so audio continues in the background. */
export async function startTourSession(
  o: Common & { tour: Tour; planned?: boolean; groupId?: string; guest?: boolean; script?: TourScript },
): Promise<ActiveSession> {
  // Group guests ride on the host's tour: no own start claim, the server checks the membership instead (D47).
  const tourStartSessionId = o.planned ? o.tour.id.replace(/^planned_/, '') : randomUUID();
  if (!o.guest) {
    await getBackend().claimTourStart(o.tour.id, tourStartSessionId, o.planned ? 'planned' : 'tour');
  }
  await endSession();
  const runtime = makeRuntime(
    o,
    {
      tourId: o.tour.id,
      mode: o.planned ? 'planned' : 'tour',
      ...(o.groupId ? { groupId: o.groupId } : {}),
    },
    o.script ?? createTourScript({ lang: o.lang, tour: o.tour, instanceId: randomUUID() }),
  );
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
    recovery: recoveryOptions({ ...o, claimId: tourStartSessionId }),
    ...(o.groupId ? { groupId: o.groupId } : {}),
    ...(o.guest ? { guest: true } : {}),
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
  });
  await startRuntime(session, tourGuideStops(o.tour, o.lang), source);
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
  const runtime = makeRuntime(
    o,
    { mode: 'fork' },
    createTourScript({ lang: o.lang, interests: o.interests, instanceId: randomUUID() }),
  );
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
    recovery: recoveryOptions(o),
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
  });
  fork.attach();
  await startRuntime(session, [{ id: o.first.id, name: o.first.name, location: o.first.location }], source, {
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
  const runtime = makeRuntime(
    o,
    { mode: 'roam' },
    createTourScript({ lang: o.lang, interests: o.interests, instanceId: randomUUID() }),
  );
  const pool = new PoiPool(getBackend());
  const roam = new RoamController({
    runtime,
    lang: o.lang,
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
    recovery: recoveryOptions(o),
    ...(simulator ? { simulator } : {}),
    startedAt: Date.now(),
    ...(o.foregroundOnly ? { foregroundOnly: true } : {}),
  });
  roam.attach();
  const first = o.first ? [{ id: o.first.id, name: o.first.name, location: o.first.location }] : [];
  await startRuntime(session, first, source, { open: true });
  return session;
}

/**
 * Ends the running session and closes its history record. Returns the record id when the tour is worth a summary
 * (a stop was reached or the listener really walked). A host ending the tour also ends a live group.
 */
export async function endSession(): Promise<string | undefined> {
  const lifecycle = ++sessionLifecycle;
  const cur = active;
  active = undefined;
  detachCheckpoint?.();
  detachCheckpoint = undefined;
  detachLiveActivity?.();
  detachLiveActivity = undefined;
  emit();
  cur?.fork?.detach();
  cur?.roam?.detach();
  await cur?.runtime.dispose();
  if (sessionLifecycle === lifecycle) await clearSavedSession();
  if (!cur) return undefined;
  if (cur.groupId)
    void getBackend()
      .leaveGroup(cur.groupId)
      .catch(() => undefined);
  return useHistory.getState().finish(cur.recordId, Date.now())?.id;
}

/** Continue the same walk in Explore: GPS, audio and the local summary stay intact. */
export function switchSessionToExplore(): boolean {
  const cur = active;
  if (!cur || cur.mode !== 'planned' || cur.groupId || cur.guest) return false;
  const settings = useSettings.getState();
  const backend = getBackend();
  const roam = new RoamController({
    runtime: cur.runtime,
    lang: cur.recovery?.lang ?? 'en',
    backend,
    pool: new PoiPool(backend),
    interests: settings.interests,
    frequency: settings.frequency,
  });
  cur.runtime.setAccess({ mode: 'roam' });
  cur.runtime.explore();
  roam.attach();
  const { tour: _tour, fork: _fork, ...continuing } = cur;
  void _tour;
  void _fork;
  active = { ...continuing, mode: 'roam', roam };
  if (active.recovery)
    active.recovery = { ...active.recovery, interests: settings.interests, frequency: settings.frequency };
  emit();
  attachCheckpoint(active);
  return true;
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

function attachCheckpoint(session: ActiveSession) {
  detachCheckpoint?.();
  let lastWrite = 0;
  let lastBoundary = '';
  const save = (force = false) => {
    const current = active;
    if (!current || current.runtime !== session.runtime || !current.recovery || !current.ownerUid) return;
    const state = current.runtime.getState();
    if (state.finished) {
      void clearSavedSession().catch(() => undefined);
      return;
    }
    const now = Date.now();
    const boundary = `${state.index}:${state.paused}:${state.route.length}:${state.playback?.poiId ?? ''}`;
    if (!force && boundary === lastBoundary && now - lastWrite < 5000) return;
    lastBoundary = boundary;
    lastWrite = now;
    const position = current.runtime.getSnapshot().user;
    const checkpoint: SessionCheckpoint = {
      version: 1,
      ...current.recovery,
      ownerUid: current.ownerUid,
      mode: current.mode,
      recordId: current.recordId,
      startedAt: current.startedAt,
      savedAt: now,
      route: state.route,
      progress: current.runtime.getProgress(),
      script: current.runtime.getScript(),
      ...(current.tour ? { tour: current.tour } : {}),
      ...(current.groupId ? { groupId: current.groupId } : {}),
      ...(current.guest ? { guest: true } : {}),
      ...(current.foregroundOnly ? { foregroundOnly: true } : {}),
      ...(position ? { position: { lat: position.lat, lng: position.lng } } : {}),
    };
    void checkpoints.save(checkpoint).catch(() => undefined);
  };
  const unsubscribe = session.runtime.subscribe(() => save());
  const stateListener = AppState.addEventListener('change', (state) => {
    if (state !== 'active') save(true);
  });
  detachCheckpoint = () => {
    unsubscribe();
    stateListener.remove();
  };
  savedSession = undefined;
  save(true);
}

export async function clearSavedSession(): Promise<void> {
  const revision = ++recoveryRevision;
  await checkpoints.clear();
  if (recoveryRevision === revision) {
    savedSession = undefined;
    emit();
  }
}

/** Recovery only offers local data for the signed-in owner; it never starts audio/GPS automatically. */
export function initializeSessionRecovery(): () => void {
  const off = getBackend().auth.onChange((user) => {
    const request = ++recoveryRevision;
    savedSession = undefined;
    emit();
    if (active?.ownerUid && active.ownerUid !== user?.uid) void endSession().catch(() => undefined);
    if (!user) return;
    void checkpoints
      .load(user.uid)
      .then((checkpoint) => {
        if (request !== recoveryRevision || active) return;
        savedSession = checkpoint;
        emit();
      })
      .catch(() => undefined);
  });
  return () => {
    recoveryRevision++;
    off();
  };
}

export function useSavedSession(): SessionCheckpoint | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => savedSession,
    () => undefined,
  );
}

let resuming: Promise<ActiveSession> | undefined;
export function resumeSavedSession(): Promise<ActiveSession> {
  if (resuming) return resuming;
  resuming = restoreSavedSession().finally(() => {
    resuming = undefined;
  });
  return resuming;
}

async function restoreSavedSession(): Promise<ActiveSession> {
  const checkpoint = savedSession;
  const initialRevision = recoveryRevision;
  const backend = getBackend();
  if (!checkpoint || backend.auth.current()?.uid !== checkpoint.ownerUid) throw new Error('No saved session');
  if (!checkpoint.simulate) {
    let permission = await getPermissionState();
    if (permission === 'undetermined') permission = await requestForeground();
    if (permission === 'denied') throw new Error('Location permission required');
    checkpoint.foregroundOnly = permission !== 'background';
  }
  if (checkpoint.groupId) {
    await new Promise<void>((resolve, reject) => {
      const off = backend.watchGroup(checkpoint.groupId!, (group) => {
        // Defer cleanup because the demo backend can publish before watchGroup returns.
        queueMicrotask(() => {
          clearTimeout(timer);
          off();
          if (group?.status === 'live' && group.expiresAt > Date.now()) resolve();
          else reject(new Error('Group ended'));
        });
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error('Group unavailable'));
      }, 10_000);
    });
  }
  if (checkpoint.tour && !checkpoint.guest) {
    await backend.claimTourStart(
      checkpoint.tour.id,
      checkpoint.claimId ?? checkpoint.tour.id.replace(/^planned_/, ''),
      checkpoint.mode === 'planned' ? 'planned' : 'tour',
    );
  }
  // Revalidate the owner after asynchronous permission/access checks.
  if (
    backend.auth.current()?.uid !== checkpoint.ownerUid ||
    savedSession !== checkpoint ||
    recoveryRevision !== initialRevision
  )
    throw new Error('Session changed');
  const lifecycle = sessionLifecycle + 1;
  const revision = recoveryRevision + 1;
  await endSession();
  if (
    backend.auth.current()?.uid !== checkpoint.ownerUid ||
    sessionLifecycle !== lifecycle ||
    recoveryRevision !== revision
  )
    throw new Error('Session changed');
  const runtime = makeRuntime(
    { ...checkpoint, ...(checkpoint.interests[0] ? { interest: checkpoint.interests[0] } : {}) },
    {
      mode: checkpoint.mode,
      ...(checkpoint.tour ? { tourId: checkpoint.tour.id } : {}),
      ...(checkpoint.groupId ? { groupId: checkpoint.groupId } : {}),
    },
    checkpoint.script ??
      createTourScript({
        lang: checkpoint.lang,
        instanceId: randomUUID(),
        ...(checkpoint.tour ? { tour: checkpoint.tour } : {}),
        interests: checkpoint.interests,
      }),
  );
  const source = checkpoint.simulate
    ? new SimulatedLocationSource([
        checkpoint.position ??
          checkpoint.route[checkpoint.progress.index]?.location ?? { lat: 52.52, lng: 13.405 },
        ...checkpoint.route.slice(checkpoint.progress.index).map((s) => s.location),
      ])
    : new RealLocationSource();
  const pool = new PoiPool(backend);
  const fork =
    checkpoint.mode === 'fork'
      ? new ForkController({
          runtime,
          backend,
          pool,
          lang: checkpoint.lang,
          interests: checkpoint.interests,
          profile: checkpoint.profile,
          access: { mode: 'fork' },
          budgetMinutes: Math.max(0, checkpoint.budgetMinutes - (Date.now() - checkpoint.startedAt) / 60_000),
        })
      : undefined;
  const roam =
    checkpoint.mode === 'roam'
      ? new RoamController({
          runtime,
          lang: checkpoint.lang,
          backend,
          pool,
          interests: checkpoint.interests,
          frequency: checkpoint.frequency,
          ...(checkpoint.route[checkpoint.progress.index]
            ? { pinnedTargetId: checkpoint.route[checkpoint.progress.index]!.id }
            : {}),
        })
      : undefined;
  const session = await begin(
    {
      mode: checkpoint.mode,
      runtime,
      startedAt: checkpoint.startedAt,
      recovery: recoveryOptions(checkpoint),
      ...(checkpoint.tour ? { tour: checkpoint.tour } : {}),
      ...(checkpoint.groupId ? { groupId: checkpoint.groupId } : {}),
      ...(checkpoint.guest ? { guest: true } : {}),
      ...(checkpoint.foregroundOnly ? { foregroundOnly: true } : {}),
      ...(source instanceof SimulatedLocationSource ? { simulator: source } : {}),
      ...(fork ? { fork } : {}),
      ...(roam ? { roam } : {}),
    },
    checkpoint,
  );
  fork?.attach();
  roam?.attach();
  try {
    await startRuntime(session, checkpoint.route, source, {
      open: checkpoint.mode === 'fork' || checkpoint.mode === 'roam',
      progress: checkpoint.progress,
    });
    if (fork && runtime.getState().awaitingRoute) {
      const off = runtime.addFixListener((fix) => {
        off();
        void fork.compute(fix).catch(() => undefined);
      });
    }
    return session;
  } catch (error) {
    // A failed native start should still allow another recovery attempt.
    if (
      backend.auth.current()?.uid === checkpoint.ownerUid &&
      !active &&
      sessionLifecycle === lifecycle &&
      recoveryRevision === revision
    ) {
      await checkpoints.save(checkpoint);
      savedSession = checkpoint;
      emit();
    }
    throw error;
  }
}
