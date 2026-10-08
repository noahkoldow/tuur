export type PreviewPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
export interface PreviewState {
  phase: PreviewPhase;
  position: number;
  duration: number;
}
export interface PreviewAudio {
  isLoaded: boolean;
  play(): void;
  pause(): void;
  remove(): void;
  seekTo(seconds: number): Promise<void>;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (status: {
      isLoaded: boolean;
      playing: boolean;
      currentTime: number;
      duration: number;
      didJustFinish: boolean;
      error?: string | null;
    }) => void,
  ): { remove(): void };
}

/** A single short, bundled recording. Never requests narration, speech synthesis or a billing lease. */
export function createVoicePreviewPlayer(adapter: { init(): Promise<void>; create(): PreviewAudio }) {
  let state: PreviewState = { phase: 'idle', position: 0, duration: 0 };
  let audio: PreviewAudio | undefined;
  let subscription: { remove(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let wantsPlayback = false;
  const listeners = new Set<() => void>();
  const publish = (next: PreviewState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const release = () => {
    generation++;
    if (timer) clearTimeout(timer);
    timer = undefined;
    subscription?.remove();
    subscription = undefined;
    const current = audio;
    audio = undefined;
    current?.pause();
    current?.remove();
  };
  const fail = () => {
    release();
    publish({ ...state, phase: 'error' });
  };
  const player = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async play() {
      if (state.phase === 'loading' || state.phase === 'playing') return;
      wantsPlayback = true;
      if (audio && state.phase === 'paused') {
        try {
          audio.play();
          publish({ ...state, phase: 'playing' });
        } catch {
          fail();
        }
        return;
      }
      release();
      const request = generation;
      publish({ phase: 'loading', position: 0, duration: 0 });
      try {
        await adapter.init();
        if (request !== generation) return;
        const current = adapter.create();
        audio = current;
        let started = false;
        const start = () => {
          if (request !== generation || started || !current.isLoaded) return;
          started = true;
          if (timer) clearTimeout(timer);
          timer = undefined;
          if (wantsPlayback) current.play();
          publish({ ...state, phase: wantsPlayback ? 'playing' : 'paused' });
        };
        subscription = current.addListener('playbackStatusUpdate', (status) => {
          if (request !== generation) return;
          if (status.error) return fail();
          try {
            start();
          } catch {
            return fail();
          }
          if (status.didJustFinish) {
            release();
            publish({ phase: 'ended', position: status.duration, duration: status.duration });
          } else if (started) {
            publish({
              phase: status.playing ? 'playing' : 'paused',
              position: status.currentTime,
              duration: status.duration,
            });
          }
        });
        timer = setTimeout(() => {
          if (request === generation && !started) fail();
        }, 8_000);
        start();
      } catch {
        if (request === generation) fail();
      }
    },
    pause() {
      wantsPlayback = false;
      audio?.pause();
      if (state.phase === 'playing') publish({ ...state, phase: 'paused' });
    },
    async replay() {
      player.stop();
      await player.play();
    },
    stop() {
      wantsPlayback = false;
      release();
      publish({ phase: 'idle', position: 0, duration: 0 });
    },
  };
  return player;
}
