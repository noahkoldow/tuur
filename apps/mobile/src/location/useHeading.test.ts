import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationHeadingObject, LocationSubscription } from 'expo-location';

const controls = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  appStateChanged: (_state: string) => undefined as void,
  platform: { OS: 'ios' },
  config: { backend: 'firebase' },
  settings: { simulator: false },
  appState: { currentState: 'active' },
  setHeading: vi.fn(),
  removeAppState: vi.fn(),
  permission: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useState: () => [undefined, controls.setHeading],
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    controls.cleanup = effect();
  },
}));
vi.mock('react-native', () => ({
  Platform: controls.platform,
  AppState: {
    get currentState() {
      return controls.appState.currentState;
    },
    addEventListener: (_event: string, callback: (state: string) => void) => {
      controls.appStateChanged = callback;
      return { remove: controls.removeAppState };
    },
  },
}));
vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: controls.permission,
  watchHeadingAsync: controls.watch,
}));
vi.mock('../config', () => ({ config: controls.config }));
vi.mock('../state/settings', () => ({
  useSettings: (select: (state: typeof controls.settings) => unknown) => select(controls.settings),
}));

import { useHeading } from './useHeading';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const reading = (value: Partial<LocationHeadingObject> = {}): LocationHeadingObject => ({
  trueHeading: 90,
  magHeading: 85,
  accuracy: 3,
  ...value,
});
const deliver = (value: LocationHeadingObject, watch = 0) => controls.watch.mock.calls[watch]![0](value);

describe('map compass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controls.cleanup = undefined;
    controls.platform.OS = 'ios';
    controls.config.backend = 'firebase';
    controls.settings.simulator = false;
    controls.appState.currentState = 'active';
    controls.permission.mockResolvedValue({ granted: true });
    controls.watch.mockResolvedValue({ remove: vi.fn() });
  });
  afterEach(() => controls.cleanup?.());

  it('uses calibrated compass readings, including north and magnetic fallback', async () => {
    useHeading(true);
    await flush();
    deliver(reading());
    expect(controls.setHeading).toHaveBeenLastCalledWith(90);
    deliver(reading({ trueHeading: 0 }));
    expect(controls.setHeading).toHaveBeenLastCalledWith(0);
    deliver(reading({ trueHeading: -1, magHeading: 240 }));
    expect(controls.setHeading).toHaveBeenLastCalledWith(240);
    deliver(reading({ trueHeading: 360 }));
    expect(controls.setHeading).toHaveBeenLastCalledWith(0);
    for (const value of [
      reading({ accuracy: 0 }),
      reading({ accuracy: Infinity }),
      reading({ trueHeading: NaN, magHeading: Infinity }),
      reading({ trueHeading: -1, magHeading: -1 }),
      reading({ trueHeading: 400, magHeading: 400 }),
    ]) {
      deliver(value);
      expect(controls.setHeading).toHaveBeenLastCalledWith(undefined);
    }
  });

  it.each(['disabled', 'web', 'demo', 'simulator', 'permission'])(
    'does not start a compass watcher for %s',
    async (mode) => {
      if (mode === 'web') controls.platform.OS = 'web';
      if (mode === 'demo') controls.config.backend = 'demo';
      if (mode === 'simulator') controls.settings.simulator = true;
      if (mode === 'permission') controls.permission.mockResolvedValue({ granted: false });
      useHeading(mode !== 'disabled');
      await flush();
      expect(controls.watch).not.toHaveBeenCalled();
    },
  );

  it('suspends in the background, ignores stale readings, and resumes on return', async () => {
    const remove = vi.fn();
    controls.watch.mockResolvedValue({ remove });
    useHeading(true);
    await flush();
    deliver(reading());
    controls.appStateChanged('background');
    expect(remove).toHaveBeenCalledOnce();
    expect(controls.setHeading).toHaveBeenLastCalledWith(undefined);
    deliver(reading({ trueHeading: 180 }));
    expect(controls.setHeading).toHaveBeenLastCalledWith(undefined);
    controls.appStateChanged('active');
    await flush();
    expect(controls.watch).toHaveBeenCalledTimes(2);
    deliver(reading({ trueHeading: 220 }), 1);
    expect(controls.setHeading).toHaveBeenLastCalledWith(220);
    controls.cleanup?.();
    controls.cleanup = undefined;
    expect(remove).toHaveBeenCalledTimes(2);
    expect(controls.removeAppState).toHaveBeenCalledOnce();
  });

  it('waits until the app is active before subscribing', async () => {
    controls.appState.currentState = 'background';
    useHeading(true);
    await flush();
    expect(controls.watch).not.toHaveBeenCalled();
    controls.appStateChanged('active');
    await flush();
    expect(controls.watch).toHaveBeenCalledOnce();
  });

  it('does not subscribe if the map loses focus while permission lookup is pending', async () => {
    let resolve!: (permission: { granted: boolean }) => void;
    controls.permission.mockReturnValue(new Promise((done) => (resolve = done)));
    useHeading(true);
    controls.cleanup?.();
    controls.cleanup = undefined;
    resolve({ granted: true });
    await flush();
    expect(controls.watch).not.toHaveBeenCalled();
  });

  it('removes a watcher that finishes starting after the map loses focus', async () => {
    const remove = vi.fn();
    let resolve!: (subscription: LocationSubscription) => void;
    controls.watch.mockReturnValue(new Promise((done) => (resolve = done)));
    useHeading(true);
    await flush();
    controls.cleanup?.();
    controls.cleanup = undefined;
    resolve({ remove });
    await flush();
    expect(remove).toHaveBeenCalledOnce();
    controls.setHeading.mockClear();
    deliver(reading());
    expect(controls.setHeading).not.toHaveBeenCalled();
  });

  it('keeps heading unavailable when the device has no compass', async () => {
    controls.watch.mockRejectedValue(new Error('Heading unavailable'));
    useHeading(true);
    await flush();
    expect(controls.setHeading).toHaveBeenLastCalledWith(undefined);
  });
});
