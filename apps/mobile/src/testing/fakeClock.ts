import type { Clock } from '../audio/simulatedEngine';

/** Deterministic clock: timers only fire when `advance` moves time forward. */
export class FakeClock implements Clock {
  private t: number;
  private seq = 0;
  private timers = new Map<number, { at: number; f: () => void }>();
  constructor(start = 1_700_000_000_000) {
    this.t = start;
  }
  now() {
    return this.t;
  }
  setTimeout(f: () => void, ms: number) {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), f });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers.delete(h as number);
  }
  /** Lets pending promise continuations (backend calls) run. */
  async flush() {
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
  }
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; f: () => void }] | undefined;
      for (const e of this.timers)
        if (e[1].at <= end && (!next || e[1].at < next[1].at || (e[1].at === next[1].at && e[0] < next[0])))
          next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      next[1].f();
      await this.flush();
    }
    this.t = end;
    await this.flush();
  }
}
