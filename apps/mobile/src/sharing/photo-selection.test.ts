import { describe, expect, it, vi } from 'vitest';
import { PhotoSelection } from './photo-selection';

const photos = [
  { id: 'one', uri: 'file:///one.jpg' },
  { id: 'two', uri: 'file:///two.jpg' },
];
const ready = { status: 'ready' as const, photos, limited: false };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const load = vi.fn().mockResolvedValue(ready);
  const permitted = vi.fn().mockResolvedValue(true);
  return { selection: new PhotoSelection({ load, permitted }), load, permitted };
}

describe('activity collage consent and share readiness', () => {
  it('does not access photos until explicitly requested, including a permission recheck', async () => {
    const { selection, load, permitted } = setup();
    expect(selection.canShare()).toBe(true);
    expect(await selection.revalidate()).toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(permitted).not.toHaveBeenCalled();
  });

  it('waits for each photo to be displayed, then shares; a failed photo is removed', async () => {
    const { selection } = setup();
    const loading = selection.load();
    expect(selection.canShare()).toBe(false);
    await loading;
    expect(selection.canShare()).toBe(false);
    selection.displayed('one');
    expect(selection.canShare()).toBe(false);
    selection.remove('two', true);
    expect(selection.canShare()).toBe(true);
    expect(selection.getSnapshot().photos).toEqual([photos[0]]);
    expect(selection.getSnapshot().failed).toBe(true);
  });

  it('keeps the route card shareable when loading is denied, empty, unavailable or fails', async () => {
    const { selection, load } = setup();
    for (const result of [
      { status: 'denied', canAskAgain: false },
      { status: 'ready', photos: [], limited: true },
      { status: 'unavailable' },
    ]) {
      load.mockResolvedValueOnce(result);
      await selection.load();
      expect(selection.canShare()).toBe(true);
      expect(selection.getSnapshot().photos).toEqual([]);
    }
    load.mockRejectedValueOnce(new Error('native error'));
    await selection.load();
    expect(selection.canShare()).toBe(true);
    expect(selection.getSnapshot().status).toBe('error');
  });

  it('does not restore photos after opting out during a pending native request', async () => {
    const { selection, load } = setup();
    const request = deferred<typeof ready>();
    load.mockReturnValueOnce(request.promise);
    const pending = selection.load();
    const signal = load.mock.calls[0]![0] as AbortSignal;
    selection.clear();
    expect(signal.aborted).toBe(true);
    request.resolve(ready);
    await pending;
    expect(selection.getSnapshot().photos).toEqual([]);
    expect(selection.getSnapshot().status).toBe('idle');
  });

  it('ignores an earlier request when a new selection has started', async () => {
    const { selection, load } = setup();
    const request = deferred<typeof ready>();
    load.mockReturnValueOnce(request.promise);
    const pending = selection.load();
    await selection.load();
    selection.remove('one');
    request.resolve(ready);
    await pending;
    expect(selection.getSnapshot().photos).toEqual([photos[1]]);
  });

  it('invalidates pending work when leaving the activity', async () => {
    const { selection, load } = setup();
    const request = deferred<typeof ready>();
    load.mockReturnValueOnce(request.promise);
    const pending = selection.load();
    selection.cancel();
    request.resolve(ready);
    await pending;
    expect(selection.getSnapshot().photos).toEqual([]);
  });

  it('clears photos if full or per-photo permission has been revoked', async () => {
    const { selection, permitted } = setup();
    await selection.load();
    photos.forEach((photo) => selection.displayed(photo.id));
    permitted.mockResolvedValueOnce(false);
    expect(await selection.revalidate()).toBe(false);
    expect(permitted).toHaveBeenCalledWith(photos);
    expect(selection.getSnapshot().photos).toEqual([]);
    expect(selection.getSnapshot().status).toBe('denied');
    expect(selection.canShare()).toBe(true);
  });

  it('blocks sharing during revalidation and discards an outdated permission result', async () => {
    const { selection, permitted } = setup();
    await selection.load();
    photos.forEach((photo) => selection.displayed(photo.id));
    const check = deferred<boolean>();
    permitted.mockReturnValueOnce(check.promise);
    const pending = selection.revalidate();
    expect(selection.canShare()).toBe(false);
    selection.clear();
    check.resolve(false);
    expect(await pending).toBe(false);
    expect(selection.getSnapshot().status).toBe('idle');
  });

  it('drops photos on a failed permission check and permits retry', async () => {
    const { selection, permitted } = setup();
    await selection.load();
    permitted.mockRejectedValueOnce(new Error('library unavailable'));
    expect(await selection.revalidate()).toBe(false);
    expect(selection.getSnapshot().photos).toEqual([]);
    expect(selection.getSnapshot().status).toBe('error');
    await selection.load();
    expect(selection.getSnapshot().photos).toEqual(photos);
  });

  it('keeps sharing blocked until the newest overlapping permission check finishes', async () => {
    const { selection, permitted } = setup();
    await selection.load();
    photos.forEach((photo) => selection.displayed(photo.id));
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    permitted.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const previousCheck = selection.revalidate();
    const currentCheck = selection.revalidate();
    first.resolve(true);
    expect(await previousCheck).toBe(false);
    expect(selection.canShare()).toBe(false);
    second.resolve(false);
    expect(await currentCheck).toBe(false);
    expect(selection.getSnapshot().photos).toEqual([]);
    expect(selection.getSnapshot().status).toBe('denied');
  });

  it('ignores stale image callbacks after a selection is removed', async () => {
    const { selection } = setup();
    await selection.load();
    selection.clear();
    selection.displayed('one');
    selection.remove('two', true);
    expect(selection.getSnapshot().displayed).toEqual([]);
    expect(selection.getSnapshot().failed).toBe(false);
    expect(selection.canShare()).toBe(true);
  });
});
