import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from 'expo-audio';
import type { AudioItem } from './types';

const fake = vi.hoisted(() => ({
  callback: (_status: Partial<AudioStatus>) => {},
  player: {
    isLoaded: true,
    playing: false,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(),
  },
}));
vi.mock('expo-audio', () => ({ createAudioPlayer: () => fake.player, setAudioModeAsync: vi.fn() }));
import { ExpoAudioEngine } from './expoAudioEngine';

const item: AudioItem = {
  id: 'a',
  poiId: 'p',
  kind: 'stop',
  url: 'https://example.com/voice.mp3',
  title: 'Place',
  artist: 'Tuu',
  durationMs: 10000,
  paragraphs: [
    { startMs: 0, durationMs: 4000 },
    { startMs: 4400, durationMs: 5600 },
  ],
};

describe('real narration playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.player.isLoaded = true;
    fake.player.addListener.mockImplementation((_event, cb) => {
      fake.callback = cb;
      return { remove: vi.fn() };
    });
  });

  it('seeks to the saved position and ends at a paragraph using actual playback progress', async () => {
    const engine = new ExpoAudioEngine();
    const onEnded = vi.fn();
    engine.setListener({ onEnded, onError: vi.fn(), onProgress: vi.fn() });
    await engine.play(item, { startMs: 2000 });
    expect(fake.player.seekTo).toHaveBeenCalledWith(2);
    engine.stopAtParagraphEnd();
    fake.callback({ currentTime: 3.9 });
    expect(onEnded).not.toHaveBeenCalled();
    fake.callback({ currentTime: 4.2 });
    expect(onEnded).toHaveBeenCalledWith('a', false);
    expect(fake.player.remove).toHaveBeenCalled();
  });

  it('respects pause while audio loads and reports playback errors', async () => {
    const engine = new ExpoAudioEngine();
    const onError = vi.fn();
    engine.setListener({ onEnded: vi.fn(), onError, onProgress: vi.fn() });
    fake.player.isLoaded = false;
    await engine.play(item);
    await engine.pause();
    fake.player.isLoaded = true;
    fake.callback({ currentTime: 0 });
    expect(fake.player.play).not.toHaveBeenCalled();
    await engine.resume();
    expect(fake.player.play).toHaveBeenCalledOnce();
    fake.callback({ error: 'expired URL' });
    expect(onError).toHaveBeenCalledWith('a', 'expired URL');
    await engine.destroy();
  });
});
