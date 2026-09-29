import { msToParagraphEnd } from '@tuur/shared';
import type { AudioEngine, AudioItem, AudioListener, RemoteHandlers } from './types';

export interface Clock {
  now(): number;
  setTimeout(f: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Timer-based playback: reports progress and ends exactly like a real engine (including stopping at paragraph
 * ends), without producing sound. `speak` lets a preview speak the paragraph text (Web Speech on web).
 */
export class SimulatedAudioEngine implements AudioEngine {
  private listener: AudioListener | undefined;
  private current:
    | {
        item: AudioItem;
        startMs: number;
        startedAt: number;
        pausedAt?: number;
        timer?: unknown;
        tick?: unknown;
        stopAtEnd: boolean;
      }
    | undefined;
  constructor(
    private readonly clock: Clock = realClock,
    private readonly hooks: { speak?: (text: string, lang?: string) => void; cancelSpeech?: () => void } = {},
  ) {}

  async init() {}
  setListener(l: AudioListener) {
    this.listener = l;
  }
  setRemoteHandlers(_h: RemoteHandlers) {}

  positionMs(): number {
    const c = this.current;
    if (!c) return 0;
    const at = c.pausedAt ?? this.clock.now();
    return c.startMs + (at - c.startedAt);
  }
  isPlaying() {
    return Boolean(this.current && this.current.pausedAt === undefined);
  }

  private clear() {
    const c = this.current;
    if (c?.timer !== undefined) this.clock.clearTimeout(c.timer);
    if (c?.tick !== undefined) this.clock.clearTimeout(c.tick);
    this.hooks.cancelSpeech?.();
  }

  private schedule() {
    const c = this.current;
    if (!c) return;
    if (c.timer !== undefined) this.clock.clearTimeout(c.timer);
    const pos = this.positionMs();
    const remaining = c.stopAtEnd ? msToParagraphEnd(c.item.paragraphs, pos) : c.item.durationMs - pos;
    c.timer = this.clock.setTimeout(
      () => this.finish(!c.stopAtEnd || pos + remaining >= c.item.durationMs - 1),
      Math.max(0, remaining),
    );
    const tick = () => {
      if (!this.current || this.current !== c || c.pausedAt !== undefined) return;
      this.listener?.onProgress(c.item.id, this.positionMs());
      c.tick = this.clock.setTimeout(tick, 500);
    };
    if (c.tick !== undefined) this.clock.clearTimeout(c.tick);
    c.tick = this.clock.setTimeout(tick, 500);
  }

  private finish(completed: boolean) {
    const c = this.current;
    if (!c) return;
    this.clear();
    this.current = undefined;
    this.listener?.onEnded(c.item.id, completed);
  }

  async play(item: AudioItem, opts: { startMs?: number } = {}) {
    if (this.current) {
      this.clear();
      this.current = undefined;
    }
    const startMs = opts.startMs ?? 0;
    this.current = { item, startMs, startedAt: this.clock.now(), stopAtEnd: false };
    const idx = item.paragraphs.findIndex((p) => startMs < p.startMs + p.durationMs);
    const text = item.paragraphTexts?.slice(Math.max(0, idx)).join(' ');
    if (text) this.hooks.speak?.(text, item.lang);
    this.schedule();
  }
  async pause() {
    const c = this.current;
    if (!c || c.pausedAt !== undefined) return;
    c.pausedAt = this.clock.now();
    if (c.timer !== undefined) this.clock.clearTimeout(c.timer);
    this.hooks.cancelSpeech?.();
  }
  async resume() {
    const c = this.current;
    if (!c || c.pausedAt === undefined) return;
    c.startMs = this.positionMs();
    c.startedAt = this.clock.now();
    delete c.pausedAt;
    this.schedule();
  }
  async stop() {
    this.finish(false);
  }
  stopAtParagraphEnd() {
    const c = this.current;
    if (!c) return;
    c.stopAtEnd = true;
    if (c.pausedAt === undefined) this.schedule();
  }
  async destroy() {
    this.clear();
    this.current = undefined;
  }
}
