import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewAudio, PreviewState } from './voice-preview-player';

const controls = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: new Map<number, { deps: unknown[]; cleanup?: (() => void) | undefined }>(),
  appState: { currentState: 'active' },
  appListeners: new Set<(state: string) => void>(),
  settings: { voiceId: 'mara', language: 'de' },
  makePlayer: vi.fn(),
}));
const same = (first: unknown[], second: unknown[]) =>
  first.length === second.length && first.every((item, index) => Object.is(item, second[index]));
vi.mock('react', () => {
  const memo = (create: () => unknown, deps: unknown[]) => {
    const slot = controls.cursor++;
    const previous = controls.slots[slot] as { deps: unknown[]; value: unknown } | undefined;
    if (!previous || !same(previous.deps, deps)) controls.slots[slot] = { deps, value: create() };
    return (controls.slots[slot] as { value: unknown }).value;
  };
  return {
    useState: (initial: unknown) => {
      const slot = controls.cursor++;
      if (!(slot in controls.slots)) controls.slots[slot] = initial;
      return [
        controls.slots[slot],
        (value: unknown) => {
          controls.slots[slot] = typeof value === 'function' ? value(controls.slots[slot]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const slot = controls.cursor++;
      if (!(slot in controls.slots)) controls.slots[slot] = { current: initial };
      return controls.slots[slot];
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const slot = controls.cursor++;
      const previous = controls.effects.get(slot);
      if (previous && same(previous.deps, deps)) return;
      previous?.cleanup?.();
      controls.effects.set(slot, { deps, cleanup: effect() });
    },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => PreviewState) => getSnapshot(),
  };
});
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return controls.appState.currentState;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      controls.appListeners.add(listener);
      return { remove: () => controls.appListeners.delete(listener) };
    },
  },
}));
vi.mock('../state/settings', () => ({
  useSettings: Object.assign(
    (select: (settings: typeof controls.settings) => unknown) => select(controls.settings),
    {
      getState: () => ({
        ...controls.settings,
        set: (patch: Partial<typeof controls.settings>) => Object.assign(controls.settings, patch),
      }),
    },
  ),
}));
vi.mock('./voice-previews', () => ({
  previewVoice: (value: string) => (['mara', 'jonas', 'lina'].includes(value) ? value : 'mara'),
  voicePreview: controls.makePlayer,
}));

import { createVoicePreviewPlayer } from './voice-preview-player';
import { useVoicePreview, type VoicePreviewOptions } from './useVoicePreview';

function audio() {
  let listener: Parameters<PreviewAudio['addListener']>[1] | undefined;
  const native = {
    isLoaded: true,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
    addListener: (_event: string, next: Parameters<PreviewAudio['addListener']>[1]) => {
      listener = next;
      return { remove: vi.fn() };
    },
  } satisfies PreviewAudio;
  return {
    native,
    emit: (status: Partial<Parameters<NonNullable<typeof listener>>[0]> = {}) =>
      listener?.({
        isLoaded: true,
        playing: true,
        currentTime: 0,
        duration: 24,
        didJustFinish: false,
        ...status,
      }),
  };
}
let recordings: ReturnType<typeof audio>[] = [];
function Reader(options: VoicePreviewOptions = {}) {
  controls.cursor = 0;
  return useVoicePreview(options);
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function appState(state: string) {
  controls.appState.currentState = state;
  controls.appListeners.forEach((listener) => listener(state));
}
function unmount() {
  for (const entry of controls.effects.values()) entry.cleanup?.();
  controls.effects.clear();
}
beforeEach(() => {
  vi.useFakeTimers();
  controls.cursor = 0;
  controls.slots = [];
  controls.effects.clear();
  controls.appListeners.clear();
  controls.appState.currentState = 'active';
  controls.settings = { voiceId: 'mara', language: 'de' };
  controls.makePlayer.mockReset().mockImplementation(() =>
    createVoicePreviewPlayer({
      init: async () => undefined,
      create: () => {
        const recording = audio();
        recordings.push(recording);
        return recording.native;
      },
    }),
  );
  recordings = [];
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe('shared voice preview controls', () => {
  it('uses saved voice/language, starts only on request and persists an explicitly selected voice', async () => {
    controls.settings.voiceId = 'jonas';
    const beforePlay = vi.fn();
    let preview = Reader({ lang: 'en-GB', beforePlay });
    expect(preview).toMatchObject({
      voice: 'jonas',
      language: 'en',
      status: { phase: 'idle' },
      progress: 0,
      continueUnlocked: false,
    });
    expect(recordings).toHaveLength(0);
    preview.selectVoice('lina');
    expect(controls.settings.voiceId).toBe('lina');
    preview = Reader({ lang: 'en-GB', beforePlay });
    await flush();
    expect(recordings[0]?.native.play).toHaveBeenCalledOnce();
    expect(beforePlay).toHaveBeenCalledOnce();
    expect(preview.voice).toBe('lina');
    expect(preview.voiceName).toBe('Linus');
  });

  it('ties progress to playback positions and unlocks only on the real end, retaining completion on replay/voice change', async () => {
    const options = { autoPlay: true };
    Reader(options);
    await flush();
    recordings[0]!.emit({ currentTime: 6 });
    expect(Reader(options)).toMatchObject({ progress: 0.25, completed: false, continueUnlocked: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Reader(options).continueUnlocked).toBe(false);
    recordings[0]!.emit({ currentTime: 24, didJustFinish: true });
    let preview = Reader(options);
    expect(preview).toMatchObject({ progress: 1, completed: true, continueUnlocked: true });
    preview.replay();
    await flush();
    preview = Reader(options);
    expect(preview).toMatchObject({ completed: true, continueUnlocked: true, progress: 0 });
    preview.selectVoice('lina');
    preview = Reader(options);
    await flush();
    expect(preview.continueUnlocked).toBe(true);
    expect(recordings).toHaveLength(3);
  });

  it('latches completion immediately before a voice change and never advances by itself', async () => {
    let preview = Reader({ autoPlay: true });
    await flush();
    recordings[0]!.emit({ didJustFinish: true, currentTime: 24 });
    preview.selectVoice('jonas');
    preview = Reader({ autoPlay: true });
    expect(preview.completed).toBe(true);
    await flush();
    recordings[1]!.emit({ didJustFinish: true, currentTime: 24 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(recordings).toHaveLength(2);
    expect(Reader({ autoPlay: true }).status.phase).toBe('ended');
  });

  it('unlocks on a playback error without claiming completed audio and keeps that fallback after retry', async () => {
    Reader({ autoPlay: true });
    await flush();
    recordings[0]!.emit({ error: 'unavailable recording' });
    const preview = Reader({ autoPlay: true });
    expect(preview).toMatchObject({ completed: false, continueUnlocked: true, status: { phase: 'error' } });
    preview.replay();
    await flush();
    expect(Reader({ autoPlay: true }).continueUnlocked).toBe(true);
  });

  it('pauses on inactive, stops on background and never resumes from lifecycle changes', async () => {
    const options = { autoPlay: true };
    Reader(options);
    await flush();
    appState('inactive');
    expect(Reader(options).status.phase).toBe('paused');
    appState('active');
    Reader(options);
    expect(recordings[0]!.native.play).toHaveBeenCalledOnce();
    Reader(options).play();
    expect(recordings[0]!.native.play).toHaveBeenCalledTimes(2);
    appState('background');
    expect(Reader(options).status.phase).toBe('idle');
    appState('active');
    Reader(options);
    expect(recordings).toHaveLength(1);
    expect(Reader(options).continueUnlocked).toBe(false);
  });

  it('stops while inactive and does not autoplay again on reactivation or external settings changes', async () => {
    const beforePlay = vi.fn();
    Reader({ active: false, autoPlay: true, beforePlay });
    await flush();
    expect(recordings).toHaveLength(0);
    Reader({ active: true, autoPlay: true, beforePlay });
    await flush();
    Reader({ active: false, autoPlay: true, beforePlay });
    expect(recordings[0]!.native.remove).toHaveBeenCalledOnce();
    Reader({ active: true, autoPlay: true, beforePlay: vi.fn() });
    controls.settings.voiceId = 'lina';
    Reader({ active: true, autoPlay: true, beforePlay });
    await flush();
    expect(recordings).toHaveLength(1);
    expect(beforePlay).toHaveBeenCalledOnce();
  });

  it('cancels a pending voice selection if the app backgrounds before the new player renders', async () => {
    const options = { autoPlay: true };
    let preview = Reader(options);
    await flush();
    preview.selectVoice('jonas');
    appState('background');
    preview = Reader(options);
    appState('active');
    preview = Reader(options);
    await flush();
    expect(preview.voice).toBe('jonas');
    expect(recordings).toHaveLength(1);
    expect(preview.continueUnlocked).toBe(false);
  });

  it('releases playback/listeners on unmount and ignores late native completion', async () => {
    Reader({ autoPlay: true });
    await flush();
    unmount();
    expect(recordings[0]!.native.remove).toHaveBeenCalledOnce();
    expect(controls.appListeners.size).toBe(0);
    recordings[0]!.emit({ didJustFinish: true, currentTime: 24 });
    expect(recordings).toHaveLength(1);
  });
});
