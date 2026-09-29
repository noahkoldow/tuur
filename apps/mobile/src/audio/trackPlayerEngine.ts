import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';
import { msToParagraphEnd } from '@tuur/shared';
import type { AudioEngine, AudioItem, AudioListener, RemoteHandlers } from './types';
import { remoteBus } from './types';

let initialized = false;

/**
 * react-native-track-player engine: background playback, lock-screen and headset controls (spec 3/5).
 * Ends items at paragraph boundaries by timing against real playback progress; the ~450 ms pause after every
 * paragraph is silence, so stopping shortly after the paragraph end never cuts a sentence.
 */
export class TrackPlayerEngine implements AudioEngine {
  private listener: AudioListener | undefined;
  private current: { item: AudioItem; startMs: number; stopAtEnd: boolean } | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private subs: { remove(): void }[] = [];
  private unsubRemote: (() => void) | undefined;
  private position = 0;
  private playing = false;

  async init() {
    if (!initialized) {
      try {
        await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
      } catch {
        // already set up (fast refresh)
      }
      await TrackPlayer.updateOptions({
        android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
        capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
        progressUpdateEventInterval: 0.5,
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
      });
      await TrackPlayer.setRepeatMode(RepeatMode.Off);
      initialized = true;
    }
    this.subs.push(
      TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (e) => {
        this.position = e.position * 1000;
        if (this.current) this.listener?.onProgress(this.current.item.id, this.position);
      }),
      TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => this.finish(true)),
      TrackPlayer.addEventListener(Event.PlaybackError, (e) => {
        if (this.current) this.listener?.onError(this.current.item.id, e.message);
      }),
      TrackPlayer.addEventListener(Event.PlaybackState, (e) => {
        this.playing = e.state === State.Playing || e.state === State.Buffering || e.state === State.Loading;
      }),
    );
  }

  setListener(l: AudioListener) {
    this.listener = l;
  }

  setRemoteHandlers(h: RemoteHandlers) {
    this.unsubRemote?.();
    this.unsubRemote = remoteBus.subscribe((e) =>
      e === 'play' ? h.onPlay() : e === 'pause' ? h.onPause() : e === 'next' ? h.onNext() : h.onPrevious(),
    );
  }

  positionMs() {
    return this.position;
  }
  isPlaying() {
    return this.playing;
  }

  private finish(completed: boolean) {
    const c = this.current;
    if (!c) return;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.current = undefined;
    this.listener?.onEnded(c.item.id, completed);
  }

  async play(item: AudioItem, opts: { startMs?: number } = {}) {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.current = { item, startMs: opts.startMs ?? 0, stopAtEnd: false };
    this.position = this.current.startMs;
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: item.id,
      url: item.url,
      title: item.title,
      artist: item.artist,
      duration: item.durationMs / 1000,
      ...(item.artworkUrl ? { artwork: item.artworkUrl } : {}),
    });
    if (this.current.startMs > 0) await TrackPlayer.seekTo(this.current.startMs / 1000);
    await TrackPlayer.play();
  }
  async pause() {
    await TrackPlayer.pause();
    if (this.stopTimer) clearTimeout(this.stopTimer);
  }
  async resume() {
    await TrackPlayer.play();
    if (this.current?.stopAtEnd) this.armStop();
  }
  async stop() {
    if (!this.current) return;
    await TrackPlayer.pause();
    this.finish(false);
  }
  stopAtParagraphEnd() {
    if (!this.current) return;
    this.current.stopAtEnd = true;
    this.armStop();
  }
  private armStop() {
    const c = this.current;
    if (!c) return;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    void TrackPlayer.getProgress().then((p) => {
      const pos = p.position * 1000;
      const wait = msToParagraphEnd(c.item.paragraphs, pos);
      if (pos + wait >= c.item.durationMs - 300) return; // last paragraph: let the item end naturally
      this.stopTimer = setTimeout(() => {
        void TrackPlayer.pause().then(() => this.finish(false));
      }, wait + 150);
    });
  }
  async destroy() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.unsubRemote?.();
    this.current = undefined;
    await TrackPlayer.reset();
  }
}
