import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTourScript, encodePolyline, TourSchema, type SessionCheckpoint } from '@tuur/shared';
import type { AudioEngine } from '../audio/types';

const mocks = vi.hoisted(() => {
  type User = { uid: string } | null;
  const disk = new Map<string, string>();
  const authListeners = new Set<(user: User) => void>();
  const identity = { user: { uid: 'owner' } as User };
  const storage = {
    getItem: vi.fn(async (key: string) => disk.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      disk.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      disk.delete(key);
    }),
  };
  const audioInit = vi.fn<() => Promise<void>>();
  const audioPlay = vi.fn<AudioEngine['play']>();
  const audioDestroy = vi.fn<() => Promise<void>>();
  const audioFactory = vi.fn((): AudioEngine => ({
    init: audioInit,
    play: audioPlay,
    destroy: audioDestroy,
    setListener: vi.fn(),
    setRemoteHandlers: vi.fn(),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    stopAtParagraphEnd: vi.fn(),
    positionMs: () => 0,
    isPlaying: () => false,
  }));
  const unsubscribeLocation = vi.fn();
  const subscribeLocation = vi.fn(async () => unsubscribeLocation);
  const permission = vi.fn(async () => 'foreground' as const);
  const backend = {
    auth: {
      current: () => identity.user,
      onChange: (listener: (user: User) => void) => {
        authListeners.add(listener);
        listener(identity.user);
        return () => authListeners.delete(listener);
      },
    },
    claimTourStart: vi.fn(async () => undefined),
    leaveGroup: vi.fn(async () => undefined),
  };
  const history = {
    start: vi.fn(),
    addStop: vi.fn(),
    addTrackPoint: vi.fn(),
    finish: vi.fn((id: string) => ({ id })),
  };
  const attachActivity = vi.fn(() => vi.fn());
  return {
    disk,
    storage,
    identity,
    authListeners,
    audioInit,
    audioPlay,
    audioDestroy,
    audioFactory,
    subscribeLocation,
    unsubscribeLocation,
    permission,
    backend,
    history,
    attachActivity,
  };
});

// Keep session orchestration, the real guide runtime and checkpoint validation/storage queue under test.
// Only device/framework adapters and externally owned account/history state are replaced.
vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: mocks.storage }));
vi.mock('expo-crypto', () => {
  let next = 0;
  return { randomUUID: () => `new-personal-identity-${++next}` };
});
vi.mock('../audio/createEngine', () => ({ createAudioEngine: mocks.audioFactory }));
vi.mock('../backend', () => ({ getBackend: () => mocks.backend }));
vi.mock('../location/real', () => ({
  getPermissionState: mocks.permission,
  requestForeground: mocks.permission,
  RealLocationSource: class {
    subscribe = mocks.subscribeLocation;
  },
}));
vi.mock('../config', () => ({ config: { backend: 'firebase', tilePrecision: 6 } }));
vi.mock('../state/history', () => ({ useHistory: { getState: () => mocks.history } }));
vi.mock('../state/settings', () => ({
  useSettings: { getState: () => ({ voiceId: 'guide', interests: ['history'], frequency: 'normal' }) },
}));
vi.mock('../liveActivity/service', () => ({ attachTourLiveActivity: mocks.attachActivity }));

const KEY = 'tuur.session.v1';
const first = { lat: 52.5163, lng: 13.3777 };
const second = { lat: 52.5186, lng: 13.3762 };
const gateCleanup = new Set<() => void>();
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  gateCleanup.add(resolve);
  return { promise, resolve, reject };
}

function checkpoint(): SessionCheckpoint {
  const now = Date.now();
  const tour = TourSchema.parse({
    id: 'tour-berlin',
    placeId: 'berlin',
    source: 'auto',
    version: 1,
    template: 'history',
    profile: 'foot-walking',
    themes: ['history'],
    stops: [
      { poiId: 'gate', name: 'Gate', order: 0, location: first, dwellMinutes: 5, walkMinutesFromPrev: 0 },
      {
        poiId: 'parliament',
        name: 'Parliament',
        order: 1,
        location: second,
        dwellMinutes: 5,
        walkMinutesFromPrev: 5,
      },
    ],
    path: encodePolyline([
      [first.lat, first.lng],
      [second.lat, second.lng],
    ]),
    durationMinutes: 15,
    walkMinutes: 5,
    distanceMeters: 350,
    bbox: { south: first.lat, north: second.lat, west: second.lng, east: first.lng },
    texts: {
      de: {
        title: 'Berlin',
        teaser: 'Two places',
        description: 'A saved walk',
        intro: 'Start',
        transitions: [],
        outro: 'End',
      },
    },
    createdAt: now - 60_000,
    updatedAt: now - 60_000,
  });
  return {
    version: 1,
    ownerUid: 'owner',
    mode: 'tour',
    recordId: 'existing-history-record',
    startedAt: now - 120_000,
    savedAt: now - 5000,
    lang: 'de',
    interests: ['history'],
    frequency: 'normal',
    profile: 'foot-walking',
    budgetMinutes: 60,
    simulate: false,
    tour,
    script: {
      ...createTourScript({ lang: 'de', tour, instanceId: 'saved-personal-walk' }),
      question: 'Welche Spuren verbinden unseren Weg?',
    },
    claimId: 'original-start-claim',
    position: first,
    route: tour.stops.map((stop) => ({ id: stop.poiId, name: stop.name, location: stop.location })),
    progress: {
      index: 1,
      visited: ['gate'],
      skipped: [],
      narrated: ['gate'],
      playedTier: { gate: 'short' },
      reached: { gate: true },
      closest: { gate: 3 },
      playback: { poiId: 'parliament', tier: 'medium', positionMs: 12_000 },
    },
  };
}

let session: typeof import('./session');
let stopRecovery: (() => void) | undefined;
let saved: SessionCheckpoint;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.disk.clear();
  mocks.authListeners.clear();
  mocks.identity.user = { uid: 'owner' };
  mocks.audioInit.mockReset().mockResolvedValue(undefined);
  mocks.audioPlay.mockReset().mockResolvedValue(undefined);
  mocks.audioDestroy.mockReset().mockResolvedValue(undefined);
  mocks.permission.mockReset().mockResolvedValue('foreground');
  mocks.storage.removeItem.mockReset().mockImplementation(async (key) => {
    mocks.disk.delete(key);
  });
  mocks.storage.setItem.mockReset().mockImplementation(async (key, value) => {
    mocks.disk.set(key, value);
  });
  mocks.subscribeLocation.mockReset().mockResolvedValue(mocks.unsubscribeLocation);
  saved = checkpoint();
  mocks.disk.set(KEY, JSON.stringify(saved));
  session = await import('./session');
  stopRecovery = session.initializeSessionRecovery();
  await vi.waitFor(() => expect(session.useSavedSession()?.recordId).toBe(saved.recordId));
});

afterEach(async () => {
  for (const release of gateCleanup) release();
  gateCleanup.clear();
  stopRecovery?.();
  await session.endSession();
});

describe('session recovery orchestration', () => {
  it('creates a new personal script for independent starts of the same tour and retains a saved download instance', async () => {
    const first = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    const second = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    expect(first.runtime.getScript().id).toBe(second.runtime.getScript().id);
    expect(first.runtime.getScript().instanceId).toBeTruthy();
    expect(first.runtime.getScript().instanceId).not.toBe(second.runtime.getScript().instanceId);
    const downloaded = await session.startTourSession({
      tour: saved.tour!,
      lang: saved.lang,
      script: saved.script!,
    });
    expect(downloaded.runtime.getScript()).toEqual(saved.script);
  });
  it('recovers the reached, heard last stop into local badge history before the next GPS fix', async () => {
    saved.progress.index = 0;
    saved.progress.visited = [];
    saved.progress.playback = { poiId: 'gate', tier: 'short', positionMs: 12_000 };
    mocks.disk.set(KEY, JSON.stringify(saved));
    stopRecovery?.();
    stopRecovery = session.initializeSessionRecovery();
    await vi.waitFor(() => expect(session.useSavedSession()?.progress.index).toBe(0));
    const restored = await session.resumeSavedSession();
    expect(mocks.history.addStop).toHaveBeenCalledWith(expect.objectContaining({ id: saved.recordId }), {
      id: 'gate',
      name: 'Gate',
      location: first,
    });
    expect(restored.runtime.getState().paused).toBe(true);
  });

  it('restores the same record and start claim, paused with progress and no automatic audio', async () => {
    const pending = session.resumeSavedSession();
    expect(session.resumeSavedSession()).toBe(pending);
    const restored = await pending;

    expect(restored.recordId).toBe(saved.recordId);
    expect(restored.startedAt).toBe(saved.startedAt);
    expect(restored.runtime.getScript()).toEqual(saved.script);
    expect(restored.foregroundOnly).toBe(true);
    expect(mocks.backend.claimTourStart).toHaveBeenCalledExactlyOnceWith(
      saved.tour!.id,
      saved.claimId,
      'tour',
    );
    expect(mocks.history.start).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: saved.recordId, startedAt: saved.startedAt }),
    );
    expect(restored.runtime.getState()).toMatchObject({
      paused: true,
      index: 1,
      visited: ['gate'],
      narrated: ['gate'],
      pending: { poiId: 'parliament', tier: 'medium', skipMs: 12_000 },
    });
    expect(restored.runtime.getSnapshot().phase).toBe('paused');
    expect(restored.runtime.getProgress().playback).toEqual(saved.progress.playback);
    expect(mocks.audioPlay).not.toHaveBeenCalled();
    expect(mocks.subscribeLocation).toHaveBeenCalledOnce();
    expect(session.getActiveSession()).toBe(restored);
    expect(session.useSavedSession()).toBeUndefined();
  });

  it('rejects an account switch while endSession is awaiting checkpoint deletion', async () => {
    const clear = deferred();
    mocks.storage.removeItem.mockImplementationOnce(async (key) => {
      await clear.promise;
      mocks.disk.delete(key);
    });
    const outcome = session.resumeSavedSession().catch((error: unknown) => error);
    await vi.waitFor(() => expect(mocks.storage.removeItem).toHaveBeenCalledOnce());
    mocks.identity.user = { uid: 'other-account' };
    mocks.authListeners.forEach((listener) => listener(mocks.identity.user));
    clear.resolve();

    expect(await outcome).toEqual(expect.objectContaining({ message: 'Session changed' }));
    expect(session.getActiveSession()).toBeUndefined();
    expect(session.useSavedSession()).toBeUndefined();
    expect(mocks.audioFactory).not.toHaveBeenCalled();
    expect(mocks.history.start).not.toHaveBeenCalled();
  });

  it('keeps recovery available when checkpoint deletion fails before native startup', async () => {
    mocks.storage.removeItem.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(session.resumeSavedSession()).rejects.toThrow('Storage unavailable');
    expect(session.useSavedSession()?.recordId).toBe(saved.recordId);
    expect(JSON.parse(mocks.disk.get(KEY)!)).toMatchObject({ recordId: saved.recordId });
    expect(mocks.audioFactory).not.toHaveBeenCalled();
    const restored = await session.resumeSavedSession();
    expect(restored.recordId).toBe(saved.recordId);
    expect(restored.runtime.getSnapshot().phase).toBe('paused');
  });

  it('does not overtake a discard whose disk deletion is pending when permission returns', async () => {
    const permission = deferred();
    const diskClear = deferred();
    mocks.permission.mockImplementationOnce(async () => {
      await permission.promise;
      return 'foreground';
    });
    mocks.storage.removeItem.mockImplementationOnce(async (key) => {
      await diskClear.promise;
      mocks.disk.delete(key);
    });
    const outcome = session.resumeSavedSession().catch((error: unknown) => error);
    await vi.waitFor(() => expect(mocks.permission).toHaveBeenCalledOnce());
    const discard = session.clearSavedSession();
    await vi.waitFor(() => expect(mocks.storage.removeItem).toHaveBeenCalledOnce());
    // The card/data stay visible until disk deletion succeeds, but the discard already cancels recovery.
    expect(session.useSavedSession()?.recordId).toBe(saved.recordId);
    permission.resolve();

    expect(await outcome).toEqual(expect.objectContaining({ message: 'Session changed' }));
    expect(mocks.audioFactory).not.toHaveBeenCalled();
    expect(mocks.history.start).not.toHaveBeenCalled();
    expect(session.getActiveSession()).toBeUndefined();
    expect(mocks.storage.removeItem).toHaveBeenCalledOnce();
    diskClear.resolve();
    await discard;
    expect(session.useSavedSession()).toBeUndefined();
    expect(mocks.disk.has(KEY)).toBe(false);
  });

  it.each(['end', 'discard'] as const)(
    'does not resurrect recovery after explicit %s during a failed native start',
    async (action) => {
      const nativeStart = deferred();
      mocks.audioInit.mockImplementationOnce(() => nativeStart.promise);
      const outcome = session.resumeSavedSession().catch((error: unknown) => error);
      await vi.waitFor(() => expect(mocks.audioInit).toHaveBeenCalledOnce());
      const cleanup = action === 'end' ? session.endSession() : session.clearSavedSession();
      nativeStart.reject(new Error('Audio startup failed'));
      expect(await outcome).toEqual(expect.objectContaining({ message: 'Audio startup failed' }));
      await cleanup;

      expect(session.getActiveSession()).toBeUndefined();
      expect(session.useSavedSession()).toBeUndefined();
      expect(mocks.disk.has(KEY)).toBe(false);
      expect(mocks.storage.setItem).not.toHaveBeenCalled();
      expect(mocks.attachActivity).not.toHaveBeenCalled();
      await expect(session.resumeSavedSession()).rejects.toThrow('No saved session');
    },
  );

  it('preserves the checkpoint on native startup failure so a second attempt can restore it', async () => {
    mocks.audioInit.mockRejectedValueOnce(new Error('Audio startup failed'));
    await expect(session.resumeSavedSession()).rejects.toThrow('Audio startup failed');
    expect(session.getActiveSession()).toBeUndefined();
    expect(session.useSavedSession()?.recordId).toBe(saved.recordId);
    expect(JSON.parse(mocks.disk.get(KEY)!)).toMatchObject({
      recordId: saved.recordId,
      claimId: saved.claimId,
      progress: saved.progress,
    });
    expect(mocks.audioDestroy).toHaveBeenCalledOnce();
    expect(mocks.attachActivity).not.toHaveBeenCalled();

    const restored = await session.resumeSavedSession();
    expect(restored.recordId).toBe(saved.recordId);
    expect(restored.runtime.getSnapshot().phase).toBe('paused');
    expect(restored.runtime.getProgress().playback).toEqual(saved.progress.playback);
    expect(mocks.backend.claimTourStart.mock.calls).toEqual([
      [saved.tour!.id, saved.claimId, 'tour'],
      [saved.tour!.id, saved.claimId, 'tour'],
    ]);
    expect(mocks.attachActivity).toHaveBeenCalledOnce();
  });
});
