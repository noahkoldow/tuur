import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveSession } from '../guide/session';
import type { GuideUi } from '../guide/runtime';
import type { LiveActivityContent } from './model';

const mocks = vi.hoisted(() => {
  type Settings = { language: 'de' | 'en' };
  const stateListeners = new Set<(state: string) => void>();
  const settingsListeners = new Set<(next: Settings, previous: Settings) => void>();
  const settings = { current: { language: 'de' } as Settings };
  const factory = { name: 'test-native-factory' };
  const activity = {
    initialize: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setForeground: vi.fn<(foreground: boolean) => Promise<void>>().mockResolvedValue(undefined),
    setSession: vi
      .fn<(id: string, content: LiveActivityContent | null) => Promise<void>>()
      .mockResolvedValue(undefined),
    endSession: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
  const appState = {
    currentState: 'active',
    addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
      stateListeners.add(listener);
      return { remove: () => stateListeners.delete(listener) };
    }),
  };
  return {
    factory,
    activity,
    appState,
    stateListeners,
    settingsListeners,
    settings,
    loadFactory: vi.fn<() => typeof factory | undefined>(() => factory),
    createController: vi.fn(() => activity),
  };
});

vi.mock('./nativeFactory.ios', () => ({ loadTourActivity: mocks.loadFactory }));
vi.mock('./controller', () => ({ createLiveActivityController: mocks.createController }));
vi.mock('react-native', () => ({ AppState: mocks.appState }));
vi.mock('../state/settings', () => ({
  useSettings: {
    getState: () => mocks.settings.current,
    subscribe: (listener: (next: { language: 'de' | 'en' }, previous: { language: 'de' | 'en' }) => void) => {
      mocks.settingsListeners.add(listener);
      return () => mocks.settingsListeners.delete(listener);
    },
  },
}));

function guideSession(patch: Partial<ActiveSession> = {}) {
  const listeners = new Set<() => void>();
  const routeListeners = new Set<() => void>();
  const route = { status: 'ready', distanceM: 240 };
  const ui: GuideUi = {
    phase: 'approaching',
    stops: [{ id: 'square', name: 'Square', location: { lat: 52.5, lng: 13.4 }, state: 'current' }],
    index: 0,
    target: { id: 'square', name: 'Square', distanceM: 240 },
    positionMs: 0,
    playing: false,
    paragraphIndex: 0,
    travelMode: 'walking',
    awaitingRoute: false,
    user: { lat: 52.51, lng: 13.41 },
  };
  const state = { travel: { last: { ts: Date.now() } } };
  const session = {
    mode: 'tour',
    recordId: 'tour-run-1',
    startedAt: Date.now(),
    tour: { texts: { de: { title: 'Berliner Geschichten' }, en: { title: 'Berlin stories' } } },
    runtime: {
      getSnapshot: () => ui,
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    navigation: {
      getSnapshot: () => route,
      subscribe: (listener: () => void) => {
        routeListeners.add(listener);
        return () => routeListeners.delete(listener);
      },
    },
    ...patch,
  } as unknown as ActiveSession;
  return {
    session,
    ui,
    state,
    listeners,
    route,
    routeListeners,
    emit: () => listeners.forEach((listener) => listener()),
    emitRoute: () => routeListeners.forEach((listener) => listener()),
  };
}

function changeAppState(state: string) {
  mocks.appState.currentState = state;
  mocks.stateListeners.forEach((listener) => listener(state));
}

function changeLanguage(language: 'de' | 'en') {
  const previous = mocks.settings.current;
  mocks.settings.current = { language };
  mocks.settingsListeners.forEach((listener) => listener(mocks.settings.current, previous));
}

function latestContent() {
  return mocks.activity.setSession.mock.calls.at(-1)?.[1];
}

const cleanups = new Set<() => void>();
let service: typeof import('./service.ios');

function attach(session: ActiveSession, currentSession?: () => ActiveSession) {
  const detach = service.attachTourLiveActivity(session, currentSession);
  const stop = () => {
    detach();
    cleanups.delete(stop);
  };
  cleanups.add(stop);
  return stop;
}

beforeEach(async () => {
  vi.resetModules();
  // Finish loading the isolated singleton before starting fake time or any test actions.
  // A slow import inside a timed-out test can otherwise mutate the following test's fixtures.
  service = await import('./service.ios');
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  mocks.appState.currentState = 'active';
  mocks.settings.current = { language: 'de' };
  mocks.loadFactory.mockReturnValue(mocks.factory);
});

afterEach(() => {
  cleanups.forEach((stop) => stop());
  mocks.stateListeners.clear();
  mocks.settingsListeners.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('session-owned iOS Live Activities', () => {
  it('is a no-op when the native capability loader is unavailable', () => {
    mocks.loadFactory.mockReturnValue(undefined);
    const guide = guideSession();
    attach(guide.session);
    guide.emit();
    changeAppState('background');
    changeLanguage('en');
    vi.advanceTimersByTime(90_000);
    expect(mocks.createController).not.toHaveBeenCalled();
    expect(mocks.activity.setSession).not.toHaveBeenCalled();
    expect(guide.listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes the session snapshot using the current UI language and tour title', () => {
    const { session } = guideSession();
    attach(session);
    expect(mocks.activity.setSession).toHaveBeenLastCalledWith(
      session.recordId,
      expect.objectContaining({
        title: 'Square',
        subtitle: 'Berliner Geschichten',
        status: 'Nächste Station',
        distance: '240 m · entlang der Route',
      }),
    );
  });

  it('preserves an explicit session title over the tour translation', () => {
    attach(guideSession({ title: 'My afternoon walk' }).session);
    expect(latestContent()?.subtitle).toBe('My afternoon walk');
  });

  it('reads current session metadata when a planned tour changes into exploration', () => {
    const guide = guideSession({ mode: 'planned' });
    let current = guide.session;
    attach(guide.session, () => current);
    current = { ...current, mode: 'roam', title: 'My afternoon walk' };
    guide.ui.awaitingRoute = true;
    guide.emit();
    expect(mocks.activity.setSession).toHaveBeenLastCalledWith(
      guide.session.recordId,
      expect.objectContaining({
        title: 'My afternoon walk',
        status: 'Suche nach Geschichten in der Nähe',
        progress: '0 Stationen besucht',
      }),
    );
  });

  it('hides foreground-only positions on leaving the app and restores fresh positions on return', () => {
    attach(guideSession({ foregroundOnly: true }).session);
    changeAppState('background');
    expect(latestContent()).toMatchObject({
      distance: '',
      status: 'tuur öffnen, um den Standort zu aktualisieren',
    });
    expect(mocks.activity.setForeground).toHaveBeenLastCalledWith(false);
    changeAppState('active');
    expect(latestContent()?.distance).toBe('240 m · entlang der Route');
    expect(mocks.activity.setForeground).toHaveBeenLastCalledWith(true);
  });

  it('expires a GPS distance without waiting for another runtime event, then accepts a fresh fix', () => {
    const guide = guideSession();
    attach(guide.session);
    vi.advanceTimersByTime(60_000);
    expect(latestContent()?.distance).toBe('240 m · entlang der Route');
    vi.advanceTimersByTime(15_000);
    expect(latestContent()).toMatchObject({ distance: '', compactText: 'GPS' });
    guide.state.travel.last.ts = Date.now();
    guide.ui.target!.distanceM = 90;
    guide.route.distanceM = 90;
    guide.emit();
    expect(latestContent()?.distance).toBe('90 m · entlang der Route');
  });

  it('continues processing session events while the app has no visible player screen', () => {
    const guide = guideSession();
    attach(guide.session);
    changeAppState('background');
    guide.route.distanceM = 70;
    guide.emitRoute();
    expect(latestContent()?.distance).toBe('70 m · entlang der Route');
    guide.ui.phase = 'paused';
    guide.emit();
    expect(latestContent()?.status).toBe('Tour pausiert');
    guide.ui.phase = 'finished';
    guide.emit();
    expect(mocks.activity.setSession).toHaveBeenLastCalledWith(guide.session.recordId, null);
  });

  it('refreshes both the tour translation and presentation copy when language changes', () => {
    attach(guideSession().session);
    changeLanguage('en');
    expect(latestContent()).toMatchObject({
      subtitle: 'Berlin stories',
      status: 'Next stop',
      distance: '240 m · along route',
    });
  });

  it('removes all session subscriptions and timers and ignores callbacks queued before cleanup', () => {
    const guide = guideSession();
    const stop = attach(guide.session);
    const queuedRuntimeCallback = [...guide.listeners][0]!;
    stop();
    expect(mocks.activity.endSession).toHaveBeenCalledWith(guide.session.recordId);
    expect(guide.listeners.size).toBe(0);
    expect(guide.routeListeners.size).toBe(0);
    expect(mocks.settingsListeners.size).toBe(0);
    expect(mocks.stateListeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    mocks.activity.setSession.mockClear();
    queuedRuntimeCallback();
    guide.emit();
    changeLanguage('en');
    changeAppState('background');
    vi.advanceTimersByTime(90_000);
    expect(mocks.activity.setSession).not.toHaveBeenCalled();
  });

  it('initializes the native controller once per process even when called before a session', () => {
    service.initializeTourLiveActivities();
    service.initializeTourLiveActivities();
    attach(guideSession().session);
    expect(mocks.loadFactory).toHaveBeenCalledTimes(1);
    expect(mocks.createController).toHaveBeenCalledTimes(1);
    expect(mocks.activity.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.createController).toHaveBeenCalledWith(
      mocks.factory,
      expect.objectContaining({ url: expect.any(Function) }),
    );
  });
});
