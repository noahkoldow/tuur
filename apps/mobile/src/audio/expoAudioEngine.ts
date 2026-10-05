import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { msToParagraphEnd } from '@tuur/shared';
import type { AudioEngine, AudioItem, AudioListener, RemoteHandlers } from './types';

/** Plays the server's actual narration audio in Expo Go and browsers. */
export class ExpoAudioEngine implements AudioEngine {
  private listener?: AudioListener;
  private current?: { item: AudioItem; player: AudioPlayer; stopAt?: number };
  private subscription?: { remove(): void };
  private position = 0;
  private paused = false;
  private loadTimer?: ReturnType<typeof setTimeout>;

  async init() {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
  }
  setListener(listener: AudioListener) {
    this.listener = listener;
  }
  setRemoteHandlers(_handlers: RemoteHandlers) {}
  positionMs() {
    return this.position;
  }
  isPlaying() {
    return this.current?.player.playing ?? false;
  }

  private release() {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = undefined;
    this.subscription?.remove();
    this.subscription = undefined;
    const current = this.current;
    this.current = undefined;
    current?.player.pause();
    current?.player.remove();
  }
  private finish(completed: boolean) {
    const id = this.current?.item.id;
    this.release();
    if (id) this.listener?.onEnded(id, completed);
  }

  async play(item: AudioItem, options: { startMs?: number } = {}) {
    this.release();
    const player = createAudioPlayer({ uri: item.url }, { updateInterval: 100 });
    const current = { item, player };
    this.current = current;
    this.paused = false;
    this.position = options.startMs ?? 0;
    let started = false;
    const start = async () => {
      if (started || !player.isLoaded || this.current !== current) return;
      started = true;
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = undefined;
      try {
        if (options.startMs) await player.seekTo(options.startMs / 1000);
        if (this.current === current && !this.paused) player.play();
      } catch (error) {
        if (this.current === current) {
          this.release();
          this.listener?.onError(item.id, error instanceof Error ? error.message : 'Audio could not play');
        }
      }
    };
    this.subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (this.current !== current) return;
      if (status.error) {
        this.release();
        this.listener?.onError(item.id, status.error);
        return;
      }
      void start();
      if (!started) return;
      this.position = status.currentTime * 1000;
      this.listener?.onProgress(item.id, this.position);
      if (status.didJustFinish) this.finish(true);
      else if (this.current?.stopAt !== undefined && this.position >= this.current.stopAt) this.finish(false);
    });
    this.loadTimer = setTimeout(() => {
      if (this.current !== current || started) return;
      this.release();
      this.listener?.onError(item.id, 'Audio could not load. Check your connection and try again.');
    }, 30_000);
    await start();
  }
  async pause() {
    this.paused = true;
    this.current?.player.pause();
  }
  async resume() {
    this.paused = false;
    this.current?.player.play();
  }
  async stop() {
    this.finish(false);
  }
  stopAtParagraphEnd() {
    if (!this.current) return;
    const end = this.position + msToParagraphEnd(this.current.item.paragraphs, this.position);
    // The final paragraph completes naturally, preserving completed/visited semantics.
    if (end < this.current.item.durationMs - 300) this.current.stopAt = end + 100;
  }
  async destroy() {
    this.release();
    this.listener = undefined;
  }
}
