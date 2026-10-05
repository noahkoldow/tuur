import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  files: new Map<string, { contents: string; creationTime: number }>(),
  directories: new Set<string>(),
  removed: [] as string[],
  isAvailableAsync: vi.fn<() => Promise<boolean>>(),
  shareAsync: vi.fn<(uri: string, options: unknown) => Promise<void>>(),
  writeError: undefined as Error | undefined,
  createError: undefined as Error | undefined,
  deleteError: undefined as Error | undefined,
}));

vi.mock('react-native', () => ({ Platform: fake.platform }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: fake.isAvailableAsync, shareAsync: fake.shareAsync }));
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...paths: string[]) {
      this.uri = [typeof base === 'string' ? base : base.uri, ...paths].join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return fake.files.has(this.uri);
    }
    get creationTime() {
      return fake.files.get(this.uri)?.creationTime ?? null;
    }
    get modificationTime() {
      return this.creationTime;
    }
    create() {
      fake.files.set(this.uri, { contents: '', creationTime: Date.now() });
      if (fake.createError) throw fake.createError;
    }
    write(contents: string) {
      fake.files.set(this.uri, { contents, creationTime: Date.now() });
      if (fake.writeError) throw fake.writeError;
    }
    delete() {
      fake.removed.push(this.uri);
      fake.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(base: string | { uri: string }, ...paths: string[]) {
      this.uri = [typeof base === 'string' ? base : base.uri, ...paths].join('/');
    }
    get exists() {
      return fake.directories.has(this.uri);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    create() {
      fake.directories.add(this.uri);
    }
    list() {
      const child = (uri: string) =>
        uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/');
      return [
        ...[...fake.directories].filter(child).map((uri) => new Directory(uri)),
        ...[...fake.files.keys()].filter(child).map((uri) => new File(uri)),
      ];
    }
    delete() {
      if (fake.deleteError) throw fake.deleteError;
      fake.removed.push(this.uri);
      for (const uri of fake.directories)
        if (uri === this.uri || uri.startsWith(`${this.uri}/`)) fake.directories.delete(uri);
      for (const uri of fake.files.keys()) if (uri.startsWith(`${this.uri}/`)) fake.files.delete(uri);
    }
  }
  return { File, Directory, Paths: { cache: 'file:///cache' } };
});

import { GpxSharingUnavailableError, shareGpx } from './shareGpx';
import { GpxExportUnavailableError } from './gpxExport';

const xml = '<?xml version="1.0"?><gpx version="1.1" creator="tuur"/>';
const prepare = () => ({ xml, fileName: 'tuur-walk.gpx' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.platform.OS = 'ios';
  fake.files.clear();
  fake.directories.clear();
  fake.removed.length = 0;
  fake.writeError = undefined;
  fake.createError = undefined;
  fake.deleteError = undefined;
  fake.isAvailableAsync.mockResolvedValue(true);
  fake.shareAsync.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network is unavailable');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('native GPX sharing', () => {
  it('does not prepare route data or create a file when sharing is unavailable', async () => {
    fake.isAvailableAsync.mockResolvedValue(false);
    const build = vi.fn(prepare);
    await expect(shareGpx(build, 'Export')).rejects.toBeInstanceOf(GpxSharingUnavailableError);
    expect(build).not.toHaveBeenCalled();
    expect(fake.files.size).toBe(0);
    expect(fake.shareAsync).not.toHaveBeenCalled();
  });

  it('rechecks access only after async availability so an intervening account change cannot export an old snapshot', async () => {
    const available = deferred<boolean>();
    fake.isAvailableAsync.mockReturnValue(available.promise);
    let ownerReady = true;
    const build = vi.fn(() => {
      if (!ownerReady) throw new GpxExportUnavailableError();
      return prepare();
    });
    const operation = shareGpx(build, 'Export');
    const denied = expect(operation).rejects.toBeInstanceOf(GpxExportUnavailableError);
    expect(build).not.toHaveBeenCalled();
    expect(fake.files.size).toBe(0);
    ownerReady = false;
    available.resolve(true);
    await denied;
    expect(build).toHaveBeenCalledOnce();
    expect(fake.files.size).toBe(0);
    expect(fake.shareAsync).not.toHaveBeenCalled();
  });

  it('preserves the iOS cache file until sharing settles, then removes only that export', async () => {
    const finished = deferred<void>();
    const presented = deferred<string>();
    fake.shareAsync.mockImplementation(async (uri) => {
      presented.resolve(uri);
      await finished.promise;
    });
    fake.files.set('file:///documents/downloads/original.mp3', { contents: 'audio', creationTime: 1 });
    const operation = shareGpx(prepare, 'Route exportieren');
    const uri = await presented.promise;
    expect(uri).toMatch(/^file:\/\/\/cache\/.*\.gpx$/);
    expect(fake.files.get(uri)?.contents).toBe(xml);
    expect(fake.removed).toEqual([]);
    expect(fake.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: 'application/gpx+xml',
      UTI: 'com.topografix.gpx',
      dialogTitle: 'Route exportieren',
    });
    finished.resolve();
    await operation;
    expect(fake.files.has(uri)).toBe(false);
    expect(fake.removed).toEqual([uri.slice(0, uri.lastIndexOf('/'))]);
    expect(fake.files.get('file:///documents/downloads/original.mp3')?.contents).toBe('audio');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'])(
    'removes the exported file when %s sharing rejects and reports the original error',
    async (platform) => {
      fake.platform.OS = platform;
      const error = new Error('native sharing failed');
      fake.shareAsync.mockRejectedValue(error);
      await expect(shareGpx(prepare, 'Export')).rejects.toBe(error);
      expect(fake.removed).toHaveLength(1);
      expect(fake.files.size).toBe(0);
    },
  );

  it('retains each Android export after chooser completion so the recipient can still read it', async () => {
    fake.platform.OS = 'android';
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    await shareGpx(prepare, 'Export');
    await shareGpx(prepare, 'Export again');
    const first = fake.shareAsync.mock.calls[0]![0];
    const second = fake.shareAsync.mock.calls[1]![0];
    expect(first).not.toBe(second);
    expect(fake.files.get(first)?.contents).toBe(xml);
    expect(fake.files.get(second)?.contents).toBe(xml);
    expect(fake.removed).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prunes only its own export directories at least 24 hours old, preserving recent and unrelated files', async () => {
    fake.platform.OS = 'android';
    vi.useFakeTimers();
    const now = 1_800_000_000_000;
    vi.setSystemTime(now);
    const root = 'file:///cache/tuur-gpx';
    const old = `${root}/export-${now - 24 * 3600_000}-42`;
    const recent = `${root}/export-${now - 24 * 3600_000 + 1}-43`;
    const unrelated = `${root}/other-exports`;
    for (const directory of [root, old, recent, unrelated]) fake.directories.add(directory);
    for (const directory of [old, recent, unrelated])
      fake.files.set(`${directory}/route.gpx`, { contents: 'earlier route', creationTime: 1 });
    // Even a file named like an expired export directory must remain untouched.
    const otherFile = `${root}/export-1-1`;
    fake.files.set(otherFile, { contents: 'unrelated data', creationTime: 1 });
    await shareGpx(prepare, 'Export');
    expect(fake.removed).toEqual([old]);
    expect(fake.files.has(`${old}/route.gpx`)).toBe(false);
    expect(fake.files.has(`${recent}/route.gpx`)).toBe(true);
    expect(fake.files.has(`${unrelated}/route.gpx`)).toBe(true);
    expect(fake.files.get(otherFile)?.contents).toBe('unrelated data');
    expect(fake.files.get(fake.shareAsync.mock.calls[0]![0])?.contents).toBe(xml);
  });

  it('does not turn successful iOS sharing into an error when cache eviction fails', async () => {
    fake.deleteError = new Error('cache eviction failed');
    await expect(shareGpx(prepare, 'Export')).resolves.toBeUndefined();
    expect(fake.shareAsync).toHaveBeenCalledOnce();
  });

  it.each(['createError', 'writeError'] as const)(
    'cleans partial output when %s occurs before sharing',
    async (field) => {
      const error = new Error('disk full');
      fake[field] = error;
      await expect(shareGpx(prepare, 'Export')).rejects.toBe(error);
      expect(fake.files.size).toBe(0);
      expect(fake.removed).toHaveLength(1);
      expect(fake.shareAsync).not.toHaveBeenCalled();
    },
  );

  it('does not create or share a file if the serializer rejects the route', async () => {
    const error = new Error('invalid route');
    await expect(
      shareGpx(() => {
        throw error;
      }, 'Export'),
    ).rejects.toBe(error);
    expect(fake.files.size).toBe(0);
    expect(fake.shareAsync).not.toHaveBeenCalled();
  });

  it('propagates unavailable API errors without accessing route data', async () => {
    const error = new Error('sharing API failed');
    fake.isAvailableAsync.mockRejectedValue(error);
    const build = vi.fn(prepare);
    await expect(shareGpx(build, 'Export')).rejects.toBe(error);
    expect(build).not.toHaveBeenCalled();
    expect(fake.files.size).toBe(0);
  });
});
