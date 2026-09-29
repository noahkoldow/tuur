/** Small file abstraction so offline logic is testable without a device. Paths are relative to the app's data dir. */
export interface FileStore {
  writeText(path: string, text: string): Promise<void>;
  readText(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  /** Removes a file or a whole directory tree (no error if missing). */
  remove(path: string): Promise<void>;
  /** Recursive size in bytes (0 if missing). */
  sizeOf(path: string): Promise<number>;
  freeBytes(): Promise<number>;
  /** URL usable by the audio/image players. */
  toUrl(path: string): string;
  /** Downloads `url` to `path` (creating folders); returns the number of bytes written. */
  download(url: string, path: string): Promise<number>;
  listDirs(path: string): Promise<string[]>;
}

/** In-memory implementation for tests and the web preview. */
export class MemoryFileStore implements FileStore {
  files = new Map<string, string | number>();
  freeSpace = 5_000_000_000;
  /** Test hook: make downloads fail (airplane mode). */
  offline = false;
  async writeText(path: string, text: string) {
    this.files.set(path, text);
  }
  async readText(path: string) {
    const v = this.files.get(path);
    return typeof v === 'string' ? v : null;
  }
  async exists(path: string) {
    return this.files.has(path) || [...this.files.keys()].some((k) => k.startsWith(`${path}/`));
  }
  async remove(path: string) {
    for (const k of [...this.files.keys()]) if (k === path || k.startsWith(`${path}/`)) this.files.delete(k);
  }
  async sizeOf(path: string) {
    let n = 0;
    for (const [k, v] of this.files)
      if (k === path || k.startsWith(`${path}/`)) n += typeof v === 'number' ? v : v.length;
    return n;
  }
  async freeBytes() {
    return this.freeSpace;
  }
  toUrl(path: string) {
    return `file:///mem/${path}`;
  }
  async download(url: string, path: string) {
    if (this.offline) throw new Error('offline');
    const size = 50_000 + url.length;
    this.files.set(path, size);
    return size;
  }
  async listDirs(path: string) {
    const out = new Set<string>();
    for (const k of this.files.keys())
      if (k.startsWith(`${path}/`)) out.add(k.slice(path.length + 1).split('/')[0]!);
    return [...out];
  }
}
