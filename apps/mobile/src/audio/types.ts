import type { ParagraphTiming } from '@tuur/shared';

export interface AudioItem {
  id: string;
  kind: 'stop' | 'transition';
  poiId: string;
  url: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs: number;
  paragraphs: ParagraphTiming[];
  /** Text per paragraph for engines that synthesize speech themselves (demo/web preview). */
  paragraphTexts?: string[];
  lang?: string;
}

export interface AudioListener {
  /** `completed` is false when playback was stopped early at a paragraph boundary or by the user. */
  onEnded(itemId: string, completed: boolean): void;
  onProgress(itemId: string, positionMs: number): void;
  onError(itemId: string, message: string): void;
}

export interface RemoteHandlers {
  onPlay(): void;
  onPause(): void;
  onNext(): void;
  onPrevious(): void;
}

/** Playback abstraction: react-native-track-player on devices, a simulated engine for tests and previews. */
export interface AudioEngine {
  init(): Promise<void>;
  setListener(l: AudioListener): void;
  setRemoteHandlers(h: RemoteHandlers): void;
  /** Starts an item, replacing whatever plays. */
  play(item: AudioItem, opts?: { startMs?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Stops immediately (user skip); reports onEnded(completed=false). */
  stop(): Promise<void>;
  /** Ends the current item at the end of the paragraph being spoken (never mid-sentence). */
  stopAtParagraphEnd(): void;
  positionMs(): number;
  isPlaying(): boolean;
  destroy(): Promise<void>;
}

/** Tiny event bus so the background playback service (lock screen / headset buttons) can reach the app logic. */
type RemoteEvent = 'play' | 'pause' | 'next' | 'previous';
const listeners = new Set<(e: RemoteEvent) => void>();
export const remoteBus = {
  emit: (e: RemoteEvent) => listeners.forEach((l) => l(e)),
  subscribe: (l: (e: RemoteEvent) => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
