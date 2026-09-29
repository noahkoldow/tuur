import type { Bounds } from '@tuur/shared';

export interface MapPackManager {
  /** Downloads map tiles for the bounds; resolves when complete. */
  create(name: string, bounds: Bounds, onProgress: (fraction: number) => void): Promise<void>;
  remove(name: string): Promise<void>;
}

/** No-op (web preview, tests): reports instant completion. */
export class NoopMapPackManager implements MapPackManager {
  created: string[] = [];
  async create(name: string, _b: Bounds, onProgress: (f: number) => void) {
    this.created.push(name);
    onProgress(1);
  }
  async remove(name: string) {
    this.created = this.created.filter((n) => n !== name);
  }
}
