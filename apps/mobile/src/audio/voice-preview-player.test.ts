import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoicePreviewPlayer, type PreviewAudio } from './voice-preview-player';

function setup(init = vi.fn().mockResolvedValue(undefined)) {
  let notify!: Parameters<PreviewAudio['addListener']>[1];
  const off = vi.fn();
  const audio = {
    isLoaded: false as boolean,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn((_event, listener) => {
      notify = listener;
      return { remove: off };
    }),
  } satisfies PreviewAudio;
  const create = vi.fn(() => audio);
  const player = createVoicePreviewPlayer({ init, create });
  const emit = (patch = {}) =>
    notify({ isLoaded: true, playing: true, currentTime: 3, duration: 21, didJustFinish: false, ...patch });
  return { player, audio, emit, off, create };
}

afterEach(() => vi.useRealTimers());

describe('fixed voice preview playback', () => {
  it('does not start a superseded recording after asynchronous audio setup', async () => {
    let ready!: () => void;
    const { player, create } = setup(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            ready = resolve;
          }),
      ),
    );
    const start = player.play();
    player.stop();
    ready();
    await start;
    expect(create).not.toHaveBeenCalled();
    expect(player.getState().phase).toBe('idle');
  });

  it('waits for audio, pauses/resumes, and releases the player at the actual end', async () => {
    const { player, audio, emit, off } = setup();
    await player.play();
    expect(audio.play).not.toHaveBeenCalled();
    audio.isLoaded = true;
    emit();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(player.getState()).toMatchObject({ phase: 'playing', position: 3, duration: 21 });
    player.pause();
    expect(player.getState().phase).toBe('paused');
    await player.play();
    expect(audio.play).toHaveBeenCalledTimes(2);
    emit({ didJustFinish: true, currentTime: 21 });
    expect(player.getState()).toEqual({ phase: 'ended', position: 21, duration: 21 });
    expect(off).toHaveBeenCalledOnce();
    expect(audio.remove).toHaveBeenCalledOnce();
    emit({ currentTime: 1 });
    expect(player.getState().phase).toBe('ended');
  });

  it('times out a broken bundled asset and allows a fresh retry', async () => {
    vi.useFakeTimers();
    const { player, audio, create } = setup();
    await player.play();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(player.getState().phase).toBe('error');
    expect(audio.remove).toHaveBeenCalledOnce();
    audio.isLoaded = true;
    await player.play();
    expect(create).toHaveBeenCalledTimes(2);
    expect(player.getState().phase).toBe('playing');
    player.stop();
  });

  it('preserves a pause requested while the recording loads', async () => {
    const { player, audio, emit } = setup();
    await player.play();
    player.pause();
    audio.isLoaded = true;
    emit({ playing: false });
    expect(audio.play).not.toHaveBeenCalled();
    expect(player.getState().phase).toBe('paused');
    player.stop();
  });
});
