import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PhotoMetadata = { id: string; mediaType: string; creationTime: number | null };
type Permission = {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: 'all' | 'limited' | 'none';
};

const fake = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  getPermissions: vi.fn<() => Promise<Permission>>(),
  requestPermissions: vi.fn<() => Promise<Permission>>(),
  query: vi.fn<() => Promise<PhotoMetadata[]>>(),
  getUri: vi.fn<(id: string) => Promise<string>>(),
  getCreationTime: vi.fn<(id: string) => Promise<number | null>>(),
  querySteps: [] as unknown[][],
}));

vi.mock('react-native', () => ({ Platform: fake.platform }));
vi.mock('expo-media-library', () => ({
  getPermissionsAsync: fake.getPermissions,
  requestPermissionsAsync: fake.requestPermissions,
  AssetField: { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime' },
  MediaType: { IMAGE: 'image' },
  Query: class {
    eq(...args: unknown[]) {
      fake.querySteps.push(['eq', ...args]);
      return this;
    }
    gte(...args: unknown[]) {
      fake.querySteps.push(['gte', ...args]);
      return this;
    }
    lte(...args: unknown[]) {
      fake.querySteps.push(['lte', ...args]);
      return this;
    }
    orderBy(...args: unknown[]) {
      fake.querySteps.push(['orderBy', ...args]);
      return this;
    }
    limit(...args: unknown[]) {
      fake.querySteps.push(['limit', ...args]);
      return this;
    }
    exeForMetadata() {
      return fake.query();
    }
  },
  Asset: class {
    constructor(private id: string) {}
    getUri() {
      return fake.getUri(this.id);
    }
    getCreationTime() {
      return fake.getCreationTime(this.id);
    }
  },
}));

import { hasActivityPhotoPermission, loadActivityPhotos, MAX_ACTIVITY_PHOTOS } from './activity-photos';

const activity = { startedAt: 1_800_000_000_000, endedAt: 1_800_003_600_000 };
const granted: Permission = { granted: true, canAskAgain: true, accessPrivileges: 'all' };
const photo = (id: string, creationTime: number | null = activity.startedAt): PhotoMetadata => ({
  id,
  creationTime,
  mediaType: 'image',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.platform.OS = 'ios';
  fake.querySteps.length = 0;
  fake.getPermissions.mockResolvedValue(granted);
  fake.requestPermissions.mockResolvedValue(granted);
  fake.query.mockResolvedValue([]);
  fake.getUri.mockImplementation(async (id) => `file:///photos/${id}.jpg`);
  fake.getCreationTime.mockResolvedValue(activity.startedAt);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('activity photo discovery', () => {
  it('does not prompt or query on web', async () => {
    fake.platform.OS = 'web';
    await expect(loadActivityPhotos(activity)).resolves.toEqual({ status: 'unavailable' });
    await expect(hasActivityPhotoPermission()).resolves.toBe(false);
    expect(fake.getPermissions).not.toHaveBeenCalled();
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
  });

  it.each([
    { startedAt: activity.startedAt },
    { startedAt: Number.NaN, endedAt: activity.endedAt },
    { startedAt: activity.startedAt, endedAt: Number.POSITIVE_INFINITY },
    { startedAt: activity.endedAt, endedAt: activity.startedAt },
  ])('does not inspect the library for an incomplete or invalid activity: %j', async (invalid) => {
    await expect(loadActivityPhotos(invalid)).resolves.toEqual({ status: 'unavailable' });
    expect(fake.getPermissions).not.toHaveBeenCalled();
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
  });

  it('requests only photo reading when needed and respects a denied request', async () => {
    fake.getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    fake.requestPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      accessPrivileges: 'none',
    });
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'denied',
      canAskAgain: false,
    });
    expect(fake.getPermissions).toHaveBeenCalledWith(false, ['photo']);
    expect(fake.requestPermissions).toHaveBeenCalledWith(false, ['photo']);
    expect(fake.query).not.toHaveBeenCalled();
  });

  it('does not request permission again when the system disallows it', async () => {
    fake.getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'denied',
      canAskAgain: false,
    });
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
  });

  it('honours limited photo access without asking to expand it', async () => {
    fake.getPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      accessPrivileges: 'limited',
    });
    fake.query.mockResolvedValue([photo('allowed')]);
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'ready',
      limited: true,
      photos: [{ id: 'allowed', uri: 'file:///photos/allowed.jpg' }],
    });
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.getUri).toHaveBeenCalledExactlyOnceWith('allowed');
  });

  it('bounds the native query to images taken during the activity, including both endpoints', async () => {
    fake.query.mockResolvedValue([
      photo('end', activity.endedAt),
      photo('before', activity.startedAt - 1),
      photo('start', activity.startedAt),
      photo('after', activity.endedAt + 1),
      photo('unknown', null),
      photo('invalid', Number.NaN),
      { ...photo('video'), mediaType: 'video' },
    ]);
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'ready',
      limited: false,
      photos: [
        { id: 'start', uri: 'file:///photos/start.jpg' },
        { id: 'end', uri: 'file:///photos/end.jpg' },
      ],
    });
    expect(fake.querySteps).toEqual([
      ['eq', 'mediaType', 'image'],
      ['gte', 'creationTime', activity.startedAt],
      ['lte', 'creationTime', activity.endedAt],
      ['orderBy', 'creationTime'],
      ['limit', 40],
    ]);
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.getUri.mock.calls.map(([id]) => id)).toEqual(['start', 'end']);
  });

  it('stops resolving photos after four usable images in chronological order', async () => {
    fake.query.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => photo(String(index), activity.startedAt + index)),
    );
    const result = await loadActivityPhotos(activity);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.photos).toHaveLength(MAX_ACTIVITY_PHOTOS);
    expect(result.photos.map(({ id }) => id)).toEqual(['0', '1', '2', '3']);
    expect(fake.getUri).toHaveBeenCalledTimes(MAX_ACTIVITY_PHOTOS);
  });

  it('skips missing and unreadable cloud images, empty URIs and duplicate assets', async () => {
    fake.query.mockResolvedValue([
      photo('deleted'),
      photo('cloud-offline'),
      photo('empty'),
      photo('unresolved'),
      photo('good'),
      photo('good'),
      photo('last'),
    ]);
    fake.getUri.mockImplementation(async (id) => {
      if (id === 'deleted' || id === 'cloud-offline') throw new Error('Image unavailable');
      if (id === 'empty') return '';
      if (id === 'unresolved') return 'ph://unresolved';
      return `file:///photos/${id}.jpg`;
    });
    const result = await loadActivityPhotos(activity);
    expect(result).toEqual({
      status: 'ready',
      limited: false,
      photos: [
        { id: 'good', uri: 'file:///photos/good.jpg' },
        { id: 'last', uri: 'file:///photos/last.jpg' },
      ],
    });
    expect(fake.getUri.mock.calls.filter(([id]) => id === 'good')).toHaveLength(1);
  });

  it('accepts Android content URIs', async () => {
    fake.platform.OS = 'android';
    fake.query.mockResolvedValue([photo('123')]);
    fake.getUri.mockResolvedValue('content://media/external/images/media/123');
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'ready',
      limited: false,
      photos: [{ id: '123', uri: 'content://media/external/images/media/123' }],
    });
  });

  it('does not scan indefinitely if every candidate is unreadable', async () => {
    fake.query.mockResolvedValue(Array.from({ length: 100 }, (_, index) => photo(String(index))));
    fake.getUri.mockRejectedValue(new Error('Removed'));
    await expect(loadActivityPhotos(activity)).resolves.toEqual({
      status: 'ready',
      limited: false,
      photos: [],
    });
    expect(fake.getUri).toHaveBeenCalledTimes(40);
    expect(fake.query).toHaveBeenCalledOnce();
  });

  it('propagates library query failures so the screen can offer a retry', async () => {
    const error = new Error('Native media library unavailable');
    fake.query.mockRejectedValue(error);
    await expect(loadActivityPhotos(activity)).rejects.toBe(error);
    expect(fake.getUri).not.toHaveBeenCalled();
  });
});

describe('activity photo permission rechecking', () => {
  it('does not prompt or query the library while checking a grant', async () => {
    await expect(hasActivityPhotoPermission()).resolves.toBe(true);
    expect(fake.getPermissions).toHaveBeenCalledWith(false, ['photo']);
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.getUri).not.toHaveBeenCalled();
  });

  it('returns false after access is revoked without reading any assets', async () => {
    fake.getPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      accessPrivileges: 'none',
    });
    await expect(hasActivityPhotoPermission([{ id: 'selected', uri: 'file:///selected.jpg' }])).resolves.toBe(
      false,
    );
    expect(fake.getCreationTime).not.toHaveBeenCalled();
    expect(fake.requestPermissions).not.toHaveBeenCalled();
  });

  it('checks every selected asset so a revoked limited selection cannot be reused', async () => {
    fake.getPermissions.mockResolvedValue({ ...granted, accessPrivileges: 'limited' });
    fake.getCreationTime.mockImplementation(async (id) => {
      if (id === 'revoked') throw new Error('Asset not found');
      return activity.startedAt;
    });
    await expect(
      hasActivityPhotoPermission([
        { id: 'allowed', uri: 'file:///allowed.jpg' },
        { id: 'revoked', uri: 'file:///revoked.jpg' },
      ]),
    ).resolves.toBe(false);
    expect(fake.getCreationTime.mock.calls).toEqual([['allowed'], ['revoked']]);
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.getUri).not.toHaveBeenCalled();
    expect(fake.requestPermissions).not.toHaveBeenCalled();
  });

  it('accepts photos still individually accessible with limited permissions', async () => {
    fake.getPermissions.mockResolvedValue({ ...granted, accessPrivileges: 'limited' });
    await expect(hasActivityPhotoPermission([{ id: 'allowed', uri: 'file:///allowed.jpg' }])).resolves.toBe(
      true,
    );
    expect(fake.getCreationTime).toHaveBeenCalledExactlyOnceWith('allowed');
  });
});

describe('bounded native activity photo reads', () => {
  it('times out a stuck permission read without prompting or querying', async () => {
    vi.useFakeTimers();
    fake.getPermissions.mockReturnValue(new Promise(() => {}));
    const result = loadActivityPhotos(activity);
    const rejected = expect(result).rejects.toMatchObject({ name: 'PhotoReadTimeoutError' });
    await vi.waitFor(() => expect(fake.getPermissions).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(fake.requestPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limits the entire URI discovery to twenty seconds instead of timing out every candidate', async () => {
    vi.useFakeTimers();
    fake.query.mockResolvedValue(Array.from({ length: 40 }, (_, index) => photo(String(index))));
    fake.getUri.mockReturnValue(new Promise(() => {}));
    const result = loadActivityPhotos(activity);
    const rejected = expect(result).rejects.toMatchObject({ name: 'PhotoReadTimeoutError' });
    await vi.waitFor(() => expect(fake.getUri).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(fake.getUri).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not time out the user while the system permission prompt is open', async () => {
    vi.useFakeTimers();
    fake.getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    const prompt = deferred<Permission>();
    fake.requestPermissions.mockReturnValue(prompt.promise);
    const result = loadActivityPhotos(activity);
    const finished = vi.fn();
    void result.then(finished);
    await vi.waitFor(() => expect(fake.requestPermissions).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(finished).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
    prompt.resolve(granted);
    await expect(result).resolves.toEqual({ status: 'ready', photos: [], limited: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops before any native work when the selection was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadActivityPhotos(activity, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fake.getPermissions).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
  });

  it('ignores a permission response that arrives after the user has opted out', async () => {
    fake.getPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    const prompt = deferred<Permission>();
    fake.requestPermissions.mockReturnValue(prompt.promise);
    const controller = new AbortController();
    const result = loadActivityPhotos(activity, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fake.requestPermissions).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    prompt.resolve(granted);
    await Promise.resolve();
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.getUri).not.toHaveBeenCalled();
  });

  it('ignores a late asset URI after cancellation and never resolves another asset', async () => {
    vi.useFakeTimers();
    fake.query.mockResolvedValue([photo('first'), photo('next')]);
    const uri = deferred<string>();
    fake.getUri.mockReturnValueOnce(uri.promise);
    const controller = new AbortController();
    const result = loadActivityPhotos(activity, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fake.getUri).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    uri.resolve('file:///first.jpg');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.getUri).toHaveBeenCalledExactlyOnceWith('first');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes a stuck per-photo permission check within fifteen seconds', async () => {
    vi.useFakeTimers();
    fake.getCreationTime.mockReturnValue(new Promise(() => {}));
    const result = hasActivityPhotoPermission([
      { id: 'first', uri: 'file:///first.jpg' },
      { id: 'next', uri: 'file:///next.jpg' },
    ]);
    await vi.waitFor(() => expect(fake.getCreationTime).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
