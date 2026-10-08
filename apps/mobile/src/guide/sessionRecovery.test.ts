import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTourScript,
  destinationPoint,
  encodePolyline,
  TourSchema,
  type SessionCheckpoint,
  type UpdateTourTimeRequest,
  type TourTimeResult,
  type Entitlement,
} from '@tuur/shared';
import type { AudioEngine, AudioListener } from '../audio/types';
import type { TourRecord } from '../state/history';
import { BackendError } from '../backend/types';

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
  const freeIntro = vi.fn(async () => true);
  const cancelIntro = vi.fn();
  const appState = { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) };
  const entitlements = { entitlements: [] as Entitlement[], loaded: true };
  const entitlementListeners = new Set<(state: typeof entitlements) => void>();
  const audioPlay = vi.fn<AudioEngine['play']>();
  const audioDestroy = vi.fn<() => Promise<void>>();
  const audioListener = { current: undefined as AudioListener | undefined };
  const audioFactory = vi.fn((): AudioEngine => ({
    init: audioInit,
    play: audioPlay,
    destroy: audioDestroy,
    setListener: vi.fn((listener: AudioListener) => {
      audioListener.current = listener;
    }),
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
    updateTourTime: vi.fn(async (request: UpdateTourTimeRequest): Promise<TourTimeResult> => ({
      sessionId: request.sessionId,
      sequence: request.sequence,
      source: 'credit',
      state: request.state,
      remainingSeconds: 5400,
      leaseExpiresAt: request.state === 'active' ? Date.now() + 90_000 : null,
      serverNow: Date.now(),
    })),
    leaveGroup: vi.fn(async () => undefined),
    createGroup: vi.fn(),
    getNarration: vi.fn(async ({ poiId }: { poiId: string }) => ({
      key: `${poiId}:heard-story`,
      title: poiId,
      text: 'This is the story heard on the walk.',
      paragraphs: [{ text: 'This is the story heard on the walk.', startMs: 0, durationMs: 30_000 }],
      keyFacts: ['A remembered fact.'],
      audioPath: `audio:${poiId}`,
      audioDurationMs: 30_000,
      images: [],
      cached: true,
      aiGenerated: true as const,
    })),
    audioUrl: vi.fn(async (path: string) => path),
    recordVisit: vi.fn(async () => undefined),
    getPois: vi.fn(async () => []),
    ensureArea: vi.fn(async () => undefined),
  };
  const history = {
    records: [] as TourRecord[],
    start: vi.fn(),
    addStop: vi.fn(),
    addTrackPoint: vi.fn(),
    finish: vi.fn((id: string) => ({ id })),
  };
  const attachActivity = vi.fn(() => vi.fn());
  return {
    disk,
    freeIntro,
    cancelIntro,
    appState,
    entitlements,
    entitlementListeners,
    storage,
    identity,
    authListeners,
    audioInit,
    audioPlay,
    audioDestroy,
    audioListener,
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
vi.mock('react-native', () => ({ AppState: mocks.appState }));
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
vi.mock('../ads/freeTourIntro', () => ({
  runFreeTourIntro: mocks.freeIntro,
  cancelFreeTourIntro: mocks.cancelIntro,
}));
vi.mock('../billing/entitlements', async () => ({
  subscribed: (await import('../billing/access')).subscribed,
  useEntitlementStore: {
    getState: () => mocks.entitlements,
    subscribe: (listener: (state: typeof mocks.entitlements) => void) => {
      mocks.entitlementListeners.add(listener);
      return () => mocks.entitlementListeners.delete(listener);
    },
  },
}));

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
  mocks.entitlements.entitlements = [];
  mocks.entitlements.loaded = true;
  mocks.entitlementListeners.clear();
  mocks.freeIntro.mockReset().mockResolvedValue(true);
  mocks.appState.currentState = 'active';
  mocks.audioInit.mockReset().mockResolvedValue(undefined);
  mocks.audioPlay.mockReset().mockResolvedValue(undefined);
  mocks.audioDestroy.mockReset().mockResolvedValue(undefined);
  mocks.audioListener.current = undefined;
  mocks.history.records = [];
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
  it('transfers intro pause ownership so a replaced start cannot resume audio during the next preview', async () => {
    const previous = await session.startTourSession({
      tour: saved.tour!,
      lang: saved.lang,
      contentMode: 'audio',
    });
    const resume = vi.spyOn(previous.runtime, 'resume');
    let finishFirst!: (completed: boolean) => void;
    let finishSecond!: (completed: boolean) => void;
    mocks.freeIntro.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    mocks.freeIntro.mockImplementationOnce(() => {
      finishFirst(false);
      return new Promise((resolve) => {
        finishSecond = resolve;
      });
    });
    const firstStart = session
      .startTourSession({ tour: saved.tour!, lang: saved.lang })
      .catch((error: unknown) => error);
    expect(previous.runtime.getState().paused).toBe(true);
    const secondStart = session
      .startTourSession({ tour: saved.tour!, lang: saved.lang })
      .catch((error: unknown) => error);
    expect(await firstStart).toBeInstanceOf(session.FreeTourIntroCancelled);
    expect(resume).not.toHaveBeenCalled();
    expect(previous.runtime.getState().paused).toBe(true);
    finishSecond(false);
    expect(await secondStart).toBeInstanceOf(session.FreeTourIntroCancelled);
    expect(resume).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(previous.runtime.getState().paused).toBe(false));
    expect(session.getActiveSession()).toBe(previous);
  });

  it.each(['background', 'manual pause'] as const)(
    'does not resume the old tour when an intro ends after %s',
    async (reason) => {
      const previous = await session.startTourSession({
        tour: saved.tour!,
        lang: saved.lang,
        contentMode: 'audio',
      });
      const resume = vi.spyOn(previous.runtime, 'resume');
      let finish!: (completed: boolean) => void;
      mocks.freeIntro.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = session
        .startTourSession({ tour: saved.tour!, lang: saved.lang })
        .catch((error: unknown) => error);
      if (reason === 'background') mocks.appState.currentState = 'background';
      else previous.runtime.pause();
      finish(false);
      expect(await pending).toBeInstanceOf(session.FreeTourIntroCancelled);
      expect(resume).not.toHaveBeenCalled();
      expect(previous.runtime.getState().paused).toBe(true);
    },
  );

  it('does not create a new tour when an obsolete intro completes after the current tour was explicitly ended', async () => {
    await session.startTourSession({ tour: saved.tour!, lang: saved.lang, contentMode: 'audio' });
    let finish!: (completed: boolean) => void;
    mocks.freeIntro.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = session
      .startTourSession({ tour: saved.tour!, lang: saved.lang })
      .catch((error: unknown) => error);
    await session.endSession();
    finish(true);
    expect(await pending).toBeInstanceOf(session.FreeTourIntroCancelled);
    expect(session.getActiveSession()).toBeUndefined();
    expect(mocks.history.start).toHaveBeenCalledOnce();
  });

  it('waits for entitlements so a Premium account never starts a free intro while access is loading', async () => {
    mocks.entitlements.loaded = false;
    const pending = session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    expect(mocks.freeIntro).not.toHaveBeenCalled();
    expect(mocks.backend.updateTourTime).not.toHaveBeenCalled();
    mocks.entitlements.entitlements = [
      {
        type: 'subscription',
        active: true,
        productId: 'tuur_sub_monthly',
        expiresAt: null,
        willRenew: true,
        updatedAt: 0,
      },
    ];
    mocks.entitlements.loaded = true;
    for (const listener of mocks.entitlementListeners) listener(mocks.entitlements);
    expect((await pending).contentMode).toBe('audio');
    expect(mocks.freeIntro).not.toHaveBeenCalled();
  });
  it('starts ordinary accounts in text after the intro without audio or billing calls, even with paid credits', async () => {
    mocks.entitlements.entitlements = [
      { type: 'tour', tourId: saved.tour!.id, source: 'credit', grantedAt: 0, expiresAt: null },
    ];
    const text = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    text.runtime.onFix({ ...first, ts: Date.now(), accuracy: 5, speed: 0 });
    expect(text.contentMode).toBe('text');
    expect(mocks.freeIntro).toHaveBeenCalledExactlyOnceWith('de');
    expect(text.runtime.getState().visited).toContain('gate');
    expect(mocks.backend.updateTourTime).not.toHaveBeenCalled();
    expect(mocks.backend.claimTourStart).not.toHaveBeenCalled();
    expect(mocks.backend.getNarration).not.toHaveBeenCalled();
    expect(mocks.audioInit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(JSON.parse(mocks.disk.get(KEY)!).contentMode).toBe('text'));
  });

  it('starts Premium with audio and a normal lease without a free intro', async () => {
    mocks.entitlements.entitlements = [
      {
        type: 'subscription',
        active: true,
        productId: 'tuur_sub_monthly',
        expiresAt: null,
        willRenew: true,
        updatedAt: 0,
      },
    ];
    const audio = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    expect(audio.contentMode).toBe('audio');
    expect(mocks.freeIntro).not.toHaveBeenCalled();
    expect(mocks.backend.updateTourTime).toHaveBeenCalledOnce();
  });

  it('does not start GPS, a record or a lease when the free intro is canceled', async () => {
    mocks.freeIntro.mockResolvedValueOnce(false);
    await expect(session.startTourSession({ tour: saved.tour!, lang: saved.lang })).rejects.toBeInstanceOf(
      session.FreeTourIntroCancelled,
    );
    expect(session.getActiveSession()).toBeUndefined();
    expect(mocks.subscribeLocation).not.toHaveBeenCalled();
    expect(mocks.backend.updateTourTime).not.toHaveBeenCalled();
    expect(mocks.history.start).not.toHaveBeenCalled();
  });

  it('restores a text checkpoint with no intro, audio initialization or billing lease', async () => {
    saved.contentMode = 'text';
    delete saved.progress.playback;
    mocks.disk.set(KEY, JSON.stringify(saved));
    stopRecovery?.();
    stopRecovery = session.initializeSessionRecovery();
    await vi.waitFor(() => expect(session.useSavedSession()?.contentMode).toBe('text'));
    const text = await session.resumeSavedSession();
    text.runtime.resume();
    text.runtime.onFix({ ...second, ts: Date.now(), accuracy: 5, speed: 0 });
    expect(text.contentMode).toBe('text');
    expect(mocks.freeIntro).not.toHaveBeenCalled();
    expect(mocks.backend.updateTourTime).not.toHaveBeenCalled();
    expect(mocks.audioInit).not.toHaveBeenCalled();
    expect(mocks.backend.getNarration).not.toHaveBeenCalled();
  });

  it('upgrades in place and ends its lease when continuing as text without another intro', async () => {
    const text = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    const originalTarget = text.runtime.getSnapshot().target?.id;
    await session.enableSessionAudio();
    expect(session.getActiveSession()?.recordId).toBe(text.recordId);
    expect(session.getActiveSession()?.runtime).toBe(text.runtime);
    expect(text.runtime.getSnapshot().target?.id).toBe(originalTarget);
    expect(session.getActiveSession()?.contentMode).toBe('audio');
    expect(mocks.backend.updateTourTime).toHaveBeenCalledOnce();
    await session.continueSessionAsText();
    expect(session.getActiveSession()?.contentMode).toBe('text');
    expect(session.getActiveSession()?.time).toBeUndefined();
    expect(mocks.backend.updateTourTime.mock.calls.map(([request]) => request.state)).toEqual([
      'active',
      'ended',
    ]);
    expect(text.runtime.getSnapshot().tourTime).toBeUndefined();
    text.runtime.resume();
    expect(mocks.backend.updateTourTime).toHaveBeenCalledTimes(2);
    expect(mocks.freeIntro).toHaveBeenCalledOnce();
  });

  it('keeps a text walk free and usable if the server rejects the audio upgrade', async () => {
    const text = await session.startTourSession({ tour: saved.tour!, lang: saved.lang });
    const { BackendError: CurrentBackendError } = await import('../backend/types');
    mocks.backend.updateTourTime.mockRejectedValueOnce(
      new CurrentBackendError('locked', 'Audio requires purchase'),
    );
    await expect(session.enableSessionAudio()).rejects.toMatchObject({ code: 'locked' });
    expect(session.getActiveSession()?.contentMode).toBe('text');
    expect(text.runtime.getState().paused).toBe(false);
    expect(mocks.audioInit).not.toHaveBeenCalled();
    expect(mocks.backend.getNarration).not.toHaveBeenCalled();
  });

  it('starts a real Explore lease when leaving a prepaid archive and saves that context for recovery', async () => {
    const tour = {
      ...saved.tour!,
      id: 'planned_archive',
      source: 'planned' as const,
      template: 'planned' as const,
    };
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => ({
      ...request,
      source: 'legacy',
      offline: true,
      remainingSeconds: null,
      leaseExpiresAt: null,
      serverNow: Date.now(),
    }));
    const original = await session.startTourSession({
      contentMode: 'audio',
      tour,
      planned: true,
      lang: 'de',
      script: saved.script,
    });
    const originalClaim = original.recovery!.claimId;
    original.runtime.pause();
    await vi.waitFor(() => expect(mocks.backend.updateTourTime).toHaveBeenCalledTimes(2));
    // A real offline wrapper marks every local heartbeat; preserve that fact in this adapter mock.
    original.runtime.setTourTime({
      sessionId: original.recovery!.claimId!,
      sequence: 1,
      source: 'legacy',
      offline: true,
      state: 'paused',
      remainingSeconds: null,
      leaseExpiresAt: null,
      serverNow: Date.now(),
    });
    await expect(session.switchSessionToExplore()).resolves.toBe(true);
    const exploring = session.getActiveSession()!;
    expect(exploring.runtime).toBe(original.runtime);
    expect(exploring.runtime.getState().paused).toBe(true);
    expect(exploring.recovery?.billingContext).toEqual({ mode: 'roam', placeId: tour.placeId });
    expect(exploring.recovery?.claimId).not.toBe(originalClaim);
    exploring.runtime.resume();
    await vi.waitFor(() => expect(exploring.runtime.getState().paused).toBe(false));
    const request = mocks.backend.updateTourTime.mock.calls.at(-1)![0];
    expect(request).toMatchObject({ mode: 'roam', placeId: tour.placeId, state: 'active' });
    expect(request.tourId).toBeUndefined();
    await vi.waitFor(() =>
      expect(JSON.parse(mocks.disk.get(KEY)!).billingContext).toEqual({
        mode: 'roam',
        placeId: tour.placeId,
      }),
    );
  });

  it('keeps archive playback available when Explore cannot obtain online time', async () => {
    const tour = {
      ...saved.tour!,
      id: 'planned_archive',
      source: 'planned' as const,
      template: 'planned' as const,
    };
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => ({
      ...request,
      source: 'legacy',
      offline: true,
      remainingSeconds: null,
      leaseExpiresAt: null,
      serverNow: Date.now(),
    }));
    const original = await session.startTourSession({
      contentMode: 'audio',
      tour,
      planned: true,
      lang: 'de',
      script: saved.script,
    });
    mocks.backend.updateTourTime.mockRejectedValueOnce(new BackendError('locked', 'No tour minutes'));
    await expect(session.switchSessionToExplore()).resolves.toBe(false);
    expect(session.getActiveSession()).toBe(original);
    expect(original.mode).toBe('planned');
    original.runtime.resume();
    await vi.waitFor(() => expect(original.runtime.getState().paused).toBe(false));
    expect(mocks.backend.updateTourTime.mock.calls.at(-1)![0]).toMatchObject({
      mode: 'planned',
      tourId: tour.id,
      state: 'active',
    });
  });

  it('honors a pause while an archive-to-Explore authorization is still pending', async () => {
    const tour = {
      ...saved.tour!,
      id: 'planned_archive',
      source: 'planned' as const,
      template: 'planned' as const,
    };
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => ({
      ...request,
      source: 'legacy',
      offline: true,
      remainingSeconds: null,
      leaseExpiresAt: null,
      serverNow: Date.now(),
    }));
    const original = await session.startTourSession({
      contentMode: 'audio',
      tour,
      planned: true,
      lang: 'de',
      script: saved.script,
    });
    const pending = deferred();
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => {
      await pending.promise;
      return {
        ...request,
        source: 'credit',
        remainingSeconds: 5400,
        leaseExpiresAt: null,
        serverNow: Date.now(),
      };
    });
    const switching = session.switchSessionToExplore();
    await vi.waitFor(() => expect(mocks.backend.updateTourTime).toHaveBeenCalledTimes(2));
    original.runtime.pause();
    pending.resolve();
    await expect(switching).resolves.toBe(true);
    expect(original.runtime.getState().paused).toBe(true);
    expect(
      mocks.backend.updateTourTime.mock.calls.some(
        ([request]) => request.mode === 'roam' && request.state === 'active',
      ),
    ).toBe(false);
  });

  it('does not restore an ended tour when its group creation finishes late', async () => {
    await session.resumeSavedSession();
    const pending = deferred();
    mocks.backend.createGroup.mockImplementationOnce(async () => {
      await pending.promise;
      return { token: 'invite', group: { id: 'late-group', capacity: 3 } };
    });
    const invitation = session.inviteToGroup().catch((error: unknown) => error);
    await vi.waitFor(() => expect(mocks.backend.createGroup).toHaveBeenCalledOnce());
    await session.endSession();
    pending.resolve();
    expect(await invitation).toMatchObject({ code: 'unavailable' });
    expect(session.getActiveSession()).toBeUndefined();
    expect(mocks.backend.leaveGroup).toHaveBeenCalledWith('late-group');
  });

  it('persists a roaming place only after confirmed narration, even when walking nearby', async () => {
    const roaming = await session.startRoamSession({
      contentMode: 'audio',
      start: first,
      lang: 'en',
      frequency: 'normal',
      interests: ['history'],
    });
    roaming.runtime.setRoute([{ id: 'gate', name: 'Gate', location: first }], 0, true);
    const nearby = destinationPoint(first, 180, 80);
    const now = Date.now();
    for (let i = 0; i < 3; i++)
      roaming.runtime.onFix({ ...nearby, ts: now + i * 5000, accuracy: 5, speed: 1.3 });
    await vi.waitFor(() => expect(mocks.audioPlay).toHaveBeenCalledOnce());
    expect(mocks.history.addStop).not.toHaveBeenCalled();
    expect(roaming.runtime.getState().reached.gate).toBeUndefined();
    const item = mocks.audioPlay.mock.calls[0]![0];
    mocks.audioListener.current!.onProgress(item.id, 1000);
    expect(mocks.history.addStop).toHaveBeenCalledWith(
      expect.objectContaining({ id: roaming.recordId }),
      expect.objectContaining({
        id: 'gate',
        name: 'Gate',
        location: first,
        narration: expect.objectContaining({ text: 'This is the story heard on the walk.' }),
      }),
    );
    mocks.audioListener.current!.onProgress(item.id, 2000);
    expect(mocks.history.addStop).toHaveBeenCalledOnce();
  });

  it('restores saved place information without fetching or replaying its narration', async () => {
    const narration = {
      key: 'saved-story',
      title: 'Gate story',
      text: 'Previously heard text.',
      tier: 'short' as const,
      images: [],
      aiGenerated: true as const,
    };
    mocks.history.records = [
      {
        id: saved.recordId,
        mode: 'tour',
        startedAt: saved.startedAt,
        updatedAt: saved.savedAt,
        stops: [{ id: 'gate', name: 'Gate', location: first, narration }],
        stopsVisited: 1,
        center: first,
        track: [],
      },
    ];
    const restored = await session.resumeSavedSession();
    expect(restored.runtime.getStopNarration('gate')).toEqual(narration);
    expect(mocks.backend.getNarration).not.toHaveBeenCalled();
    expect(mocks.audioPlay).not.toHaveBeenCalled();
  });

  it('creates a new personal script for independent starts of the same tour and retains a saved download instance', async () => {
    const first = await session.startTourSession({
      contentMode: 'audio',
      tour: saved.tour!,
      lang: saved.lang,
    });
    const second = await session.startTourSession({
      contentMode: 'audio',
      tour: saved.tour!,
      lang: saved.lang,
    });
    expect(first.runtime.getScript().id).toBe(second.runtime.getScript().id);
    expect(first.runtime.getScript().instanceId).toBeTruthy();
    expect(first.runtime.getScript().instanceId).not.toBe(second.runtime.getScript().instanceId);
    const downloaded = await session.startTourSession({
      contentMode: 'audio',
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
    expect(mocks.backend.updateTourTime).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tourId: saved.tour!.id,
        sessionId: saved.claimId,
        mode: 'tour',
        state: 'paused',
      }),
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

  it('resumes a restored tour after the time check without treating its metadata update as another pause', async () => {
    const restored = await session.resumeSavedSession();
    restored.runtime.resume();
    await vi.waitFor(() => expect(restored.runtime.getState().paused).toBe(false));
    expect(mocks.backend.updateTourTime.mock.calls.map(([r]) => r.state)).toEqual(['paused', 'active']);
  });

  it('settles a pending resume when another pause arrives before its authorization completes', async () => {
    const restored = await session.resumeSavedSession();
    const pending = deferred();
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => {
      await pending.promise;
      return {
        sessionId: request.sessionId,
        sequence: request.sequence,
        source: 'credit',
        state: 'active',
        remainingSeconds: 5300,
        leaseExpiresAt: Date.now() + 90_000,
        serverNow: Date.now(),
      };
    });
    restored.runtime.resume();
    await vi.waitFor(() => expect(mocks.backend.updateTourTime).toHaveBeenCalledTimes(2));
    restored.runtime.pause();
    pending.resolve();
    await vi.waitFor(() =>
      expect(mocks.backend.updateTourTime.mock.calls.map(([r]) => r.state)).toEqual([
        'paused',
        'active',
        'paused',
      ]),
    );
    expect(restored.runtime.getState().paused).toBe(true);
    expect(mocks.audioPlay).not.toHaveBeenCalled();
  });

  it('keeps delayed audio silent when its lease is blocked while resolving the audio URL', async () => {
    const restored = await session.resumeSavedSession();
    const pending = deferred();
    mocks.backend.audioUrl.mockImplementationOnce(async (path) => {
      await pending.promise;
      return path;
    });
    restored.runtime.resume();
    await vi.waitFor(() => expect(mocks.backend.audioUrl).toHaveBeenCalledOnce());
    restored.runtime.blockTourTime();
    pending.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(restored.runtime.getState().paused).toBe(true);
    expect(mocks.audioPlay).not.toHaveBeenCalled();
  });

  it('stops local audio before waiting for a delayed end-of-tour settlement', async () => {
    await session.resumeSavedSession();
    const pending = deferred();
    mocks.backend.updateTourTime.mockImplementationOnce(async (request) => {
      await pending.promise;
      return {
        sessionId: request.sessionId,
        sequence: request.sequence,
        source: 'credit',
        state: request.state,
        remainingSeconds: 5300,
        leaseExpiresAt: null,
        serverNow: Date.now(),
      };
    });
    const ended = session.endSession();
    await vi.waitFor(() => expect(mocks.audioDestroy).toHaveBeenCalledOnce());
    pending.resolve();
    await ended;
  });

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
    expect(mocks.backend.updateTourTime.mock.calls.map(([r]) => [r.tourId, r.sessionId, r.state])).toEqual([
      [saved.tour!.id, saved.claimId, 'paused'],
      [saved.tour!.id, saved.claimId, 'paused'],
      [saved.tour!.id, saved.claimId, 'paused'],
    ]);
    expect(mocks.attachActivity).toHaveBeenCalledOnce();
  });
});
