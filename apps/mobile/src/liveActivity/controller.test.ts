import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createLiveActivityController, type NativeLiveActivity } from './controller';
import type { LiveActivityContent } from './model';

interface TestActivity {
  id: string;
  getId(): string;
  update: Mock<NativeLiveActivity['update']>;
  end: Mock<NativeLiveActivity['end']>;
}

function content(patch: Partial<LiveActivityContent> = {}): LiveActivityContent {
  return {
    title: 'Museum',
    subtitle: 'Berlin stories',
    status: 'Next stop',
    distance: '240 m · straight-line',
    compactText: '240 m',
    progress: '1 of 3 stops done',
    progressValue: 1 / 3,
    symbol: 'location.fill',
    staleStatus: 'Open tuur for an update',
    staleCompact: 'Open',
    ...patch,
  };
}

function distance(meters: number) {
  return content({ distance: `${meters} m · straight-line`, compactText: `${meters} m` });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function harness() {
  const instances: NativeLiveActivity[] = [];
  const all: TestActivity[] = [];
  const events: string[] = [];
  function remove(id: string) {
    const index = instances.findIndex((activity) => activity.getId() === id);
    if (index >= 0) instances.splice(index, 1);
  }
  function makeActivity(): TestActivity {
    const id = `activity-${all.length}`;
    const activity = {
      id,
      getId: () => id,
      update: vi.fn((_content: LiveActivityContent, _staleDate: Date): Promise<void> | void => {
        events.push(`update:${id}`);
      }),
      end: vi.fn((_policy: 'immediate'): Promise<void> | void => {
        events.push(`end:${id}`);
        remove(id);
      }),
    };
    all.push(activity);
    instances.push(activity);
    return activity;
  }
  const factory = {
    getInstances: vi.fn(() => [...instances]),
    start: vi.fn(
      (
        _content: LiveActivityContent,
        _url: string,
        _staleDate: Date,
      ): NativeLiveActivity | Promise<NativeLiveActivity> => {
        const activity = makeActivity();
        events.push(`start:${activity.id}`);
        return activity;
      },
    ),
  };
  const onError = vi.fn();
  const controller = createLiveActivityController(factory, { url: () => 'tuur://play', onError });
  return { controller, factory, instances, all, makeActivity, remove, events, onError };
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('Live Activity lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('ends process-orphaned activities once before creating the current session', async () => {
    const h = harness();
    const orphan = h.makeActivity();
    const ending = deferred<void>();
    orphan.end.mockImplementation(() => ending.promise.then(() => h.remove(orphan.id)));
    const initializing = h.controller.initialize();
    const foregrounding = h.controller.setForeground(true);
    const setting = h.controller.setSession('session', content());
    await flush();
    expect(orphan.end).toHaveBeenCalledExactlyOnceWith('immediate');
    expect(h.factory.start).not.toHaveBeenCalled();
    ending.resolve();
    await Promise.all([initializing, foregrounding, setting]);
    await h.controller.initialize();
    expect(orphan.end).toHaveBeenCalledOnce();
    expect(h.factory.start).toHaveBeenCalledExactlyOnceWith(content(), 'tuur://play', new Date(60_000));
    expect(h.all[1]!.end).not.toHaveBeenCalled();
  });

  it('does not start in the background but keeps an existing activity updated there', async () => {
    const h = harness();
    await h.controller.setSession('session', content());
    expect(h.factory.start).not.toHaveBeenCalled();
    await h.controller.setForeground(true);
    await h.controller.setForeground(false);
    const paused = content({ status: 'Tour paused', symbol: 'pause.fill', compactText: 'Pause' });
    await h.controller.setSession('session', paused);
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(h.all[0]!.update).toHaveBeenCalledExactlyOnceWith(paused, new Date(60_000));
  });

  it('does not start if backgrounding wins before the native start is issued', async () => {
    const h = harness();
    const calls = [
      h.controller.setForeground(true),
      h.controller.setSession('session', content()),
      h.controller.setForeground(false),
    ];
    await Promise.all(calls);
    expect(h.factory.start).not.toHaveBeenCalled();
  });

  it('deduplicates equivalent snapshots and coalesces distance updates to the newest value', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', { ...content() });
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    await h.controller.setSession('session', distance(230));
    await vi.advanceTimersByTimeAsync(3_000);
    await h.controller.setSession('session', distance(210));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.all[0]!.update).toHaveBeenCalledExactlyOnceWith(distance(210), new Date(65_000));
    expect(vi.getTimerCount()).toBe(1); // Only the freshness lease remains scheduled.
  });

  it('updates status and stop changes immediately and cancels obsolete distance work', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', distance(230));
    const nextStop = content({ title: 'Square', progress: '2 of 3 stops done', progressValue: 2 / 3 });
    await h.controller.setSession('session', nextStop);
    expect(h.all[0]!.update).toHaveBeenCalledExactlyOnceWith(nextStop, new Date(60_000));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.all[0]!.update).toHaveBeenCalledOnce();
  });

  it('drops a queued distance update when the newest snapshot matches what is already visible', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', distance(230));
    await h.controller.setSession('session', content());
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.all[0]!.update).not.toHaveBeenCalled();
  });

  it('renews native freshness every 30 seconds even without changing the presentation', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setForeground(false);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.all[0]!.update).toHaveBeenCalledExactlyOnceWith(content(), new Date(90_000));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.all[0]!.update).toHaveBeenLastCalledWith(content(), new Date(120_000));
    expect(h.all[0]!.update).toHaveBeenCalledTimes(2);
    await h.controller.endSession('session');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recognizes existing activities by stable native ID across new JS wrappers', async () => {
    const h = harness();
    h.factory.getInstances.mockImplementation(() =>
      h.instances.map((activity) => ({
        getId: () => activity.getId(),
        update: (next, staleDate) => activity.update(next, staleDate),
        end: (policy) => activity.end(policy),
      })),
    );
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', content({ title: 'Square' }));
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(h.all[0]!.update).toHaveBeenCalledOnce();
  });

  it('closes a start that resolves after its guide has ended without applying late updates', async () => {
    const h = harness();
    const starting = deferred<NativeLiveActivity>();
    h.factory.start.mockImplementationOnce(() => starting.promise);
    await h.controller.setForeground(true);
    const setting = h.controller.setSession('session', content());
    await flush();
    const stopping = h.controller.endSession('session');
    const late = h.controller.setSession('session', content({ status: 'Guide speaking' }));
    const activity = h.makeActivity();
    starting.resolve(activity);
    await Promise.all([setting, stopping, late]);
    expect(activity.end).toHaveBeenCalledExactlyOnceWith('immediate');
    expect(activity.update).not.toHaveBeenCalled();
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an in-flight update to finish before ending, then ignores late session emissions', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    const updating = deferred<void>();
    const activity = h.all[0]!;
    activity.update.mockImplementationOnce(() => updating.promise);
    const change = h.controller.setSession('session', content({ status: 'Guide speaking' }));
    await flush();
    const stopping = h.controller.endSession('session');
    expect(activity.end).not.toHaveBeenCalled();
    updating.resolve();
    await Promise.all([change, stopping]);
    await h.controller.setSession('session', distance(200));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(activity.end).toHaveBeenCalledOnce();
    expect(activity.update).toHaveBeenCalledOnce();
    expect(h.factory.start).toHaveBeenCalledOnce();
  });

  it('ends a delayed start before creating the newest requested session', async () => {
    const h = harness();
    const starting = deferred<NativeLiveActivity>();
    h.factory.start.mockImplementationOnce(() => starting.promise);
    await h.controller.setForeground(true);
    const first = h.controller.setSession('first', content());
    await flush();
    const second = h.controller.setSession('second', content({ title: 'Square' }));
    const third = h.controller.setSession('third', content({ title: 'Park' }));
    const old = h.makeActivity();
    starting.resolve(old);
    await Promise.all([first, second, third]);
    expect(old.end).toHaveBeenCalledExactlyOnceWith('immediate');
    expect(old.update).not.toHaveBeenCalled();
    expect(h.factory.start).toHaveBeenCalledTimes(2);
    expect(h.factory.start).toHaveBeenLastCalledWith(
      content({ title: 'Park' }),
      'tuur://play',
      new Date(60_000),
    );
    expect(h.events).toEqual(['end:activity-0', 'start:activity-1']);
  });

  it('uses the latest content after a delayed update and never overlaps native mutations', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    const updating = deferred<void>();
    const activity = h.all[0]!;
    activity.update.mockImplementationOnce(() => updating.promise);
    const first = h.controller.setSession('session', content({ title: 'Square' }));
    await flush();
    const second = h.controller.setSession('session', content({ title: 'Park' }));
    const third = h.controller.setSession('session', content({ title: 'Gallery' }));
    expect(activity.update).toHaveBeenCalledOnce();
    updating.resolve();
    await Promise.all([first, second, third]);
    expect(activity.update).toHaveBeenCalledTimes(2);
    expect(activity.update).toHaveBeenLastCalledWith(content({ title: 'Gallery' }), new Date(60_000));
  });

  it('ends a previous session before starting its replacement, even when end is delayed', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('old', content());
    const ending = deferred<void>();
    const old = h.all[0]!;
    old.end.mockImplementationOnce(() => ending.promise.then(() => h.remove(old.id)));
    const replacement = h.controller.setSession('new', content({ title: 'Park' }));
    await flush();
    const stale = h.controller.setSession('old', content({ title: 'Stale' }));
    expect(h.factory.start).toHaveBeenCalledOnce();
    ending.resolve();
    await Promise.all([replacement, stale]);
    expect(h.factory.start).toHaveBeenCalledTimes(2);
    expect(h.factory.start).toHaveBeenLastCalledWith(
      content({ title: 'Park' }),
      'tuur://play',
      new Date(60_000),
    );
    await h.controller.endSession('old');
    expect(h.all[1]!.end).not.toHaveBeenCalled();
  });

  it('does not create a replacement if the app backgrounds while the old activity ends', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('old', content());
    const ending = deferred<void>();
    const old = h.all[0]!;
    old.end.mockImplementationOnce(() => ending.promise.then(() => h.remove(old.id)));
    const replacement = h.controller.setSession('new', content());
    await flush();
    const background = h.controller.setForeground(false);
    ending.resolve();
    await Promise.all([replacement, background]);
    expect(h.factory.start).toHaveBeenCalledOnce();
    await h.controller.setForeground(true);
    expect(h.factory.start).toHaveBeenCalledTimes(2);
  });

  it('ends completed guides, cancels scheduled updates and cannot resurrect the completed run', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', distance(230));
    await h.controller.setSession('session', null);
    expect(vi.getTimerCount()).toBe(0);
    await h.controller.setSession('session', content());
    await h.controller.setForeground(false);
    await h.controller.setForeground(true);
    expect(h.all[0]!.end).toHaveBeenCalledExactlyOnceWith('immediate');
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    expect(h.factory.start).toHaveBeenCalledOnce();
  });

  it('respects user dismissal for the rest of the session, including after foregrounding', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    h.remove(h.all[0]!.id);
    await h.controller.setSession('session', distance(230));
    await h.controller.setForeground(false);
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content({ title: 'Park' }));
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    await h.controller.setSession('another-session', content());
    expect(h.factory.start).toHaveBeenCalledTimes(2);
  });

  it('detects dismissal before a scheduled distance update reaches ActivityKit', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', distance(230));
    h.remove(h.all[0]!.id);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.all[0]!.update).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await h.controller.setSession('session', content({ title: 'Park' }));
    expect(h.factory.start).toHaveBeenCalledOnce();
  });

  it('does not repeatedly retry a disabled/failed start on GPS ticks or duplicate active events', async () => {
    const h = harness();
    const error = new Error('Live Activities disabled');
    h.factory.start.mockImplementationOnce(() => {
      throw error;
    });
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    await h.controller.setSession('session', distance(230));
    await h.controller.setForeground(true);
    await h.controller.setSession('session', distance(220));
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledExactlyOnceWith(error);
    await h.controller.setForeground(false);
    await h.controller.setForeground(true);
    expect(h.factory.start).toHaveBeenCalledTimes(2);
    expect(h.factory.start).toHaveBeenLastCalledWith(distance(220), 'tuur://play', new Date(60_000));
  });

  it('contains an update failure and retries the newest snapshot on the next foreground entry', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    const activity = h.all[0]!;
    activity.update.mockRejectedValueOnce(new Error('Native update failed'));
    await h.controller.setSession('session', content({ title: 'Square' }));
    await h.controller.setSession('session', content({ title: 'Park' }));
    expect(activity.update).toHaveBeenCalledOnce();
    await h.controller.setForeground(false);
    await h.controller.setForeground(true);
    expect(activity.update).toHaveBeenCalledTimes(2);
    expect(activity.update).toHaveBeenLastCalledWith(content({ title: 'Park' }), new Date(60_000));
    expect(h.onError).toHaveBeenCalledOnce();
  });

  it('lets native freshness expire after a failed renewal rather than repeatedly retrying it', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    h.all[0]!.update.mockRejectedValueOnce(new Error('Native update failed'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(90_000);
    await h.controller.setSession('session', distance(200));
    expect(h.all[0]!.update).toHaveBeenCalledOnce();
    expect(h.onError).toHaveBeenCalledOnce();
  });

  it('does not start a second activity after an end failure and retries cleanup on foreground', async () => {
    const h = harness();
    await h.controller.setForeground(true);
    await h.controller.setSession('old', content());
    h.all[0]!.end.mockRejectedValueOnce(new Error('Native end failed'));
    await h.controller.setSession('new', content());
    await h.controller.setSession('new', distance(230));
    expect(h.factory.start).toHaveBeenCalledOnce();
    expect(h.all[0]!.end).toHaveBeenCalledOnce();
    await h.controller.setForeground(false);
    await h.controller.setForeground(true);
    expect(h.all[0]!.end).toHaveBeenCalledTimes(2);
    expect(h.factory.start).toHaveBeenCalledTimes(2);
    expect(h.factory.start).toHaveBeenLastCalledWith(distance(230), 'tuur://play', new Date(60_000));
  });

  it('continues orphan cleanup and guide operation when cleanup or diagnostic callbacks fail', async () => {
    const h = harness();
    const first = h.makeActivity();
    const second = h.makeActivity();
    first.end.mockRejectedValueOnce(new Error('Already ended'));
    h.onError.mockImplementation(() => {
      throw new Error('Diagnostics unavailable');
    });
    await h.controller.initialize();
    expect(second.end).toHaveBeenCalledExactlyOnceWith('immediate');
    await h.controller.setForeground(true);
    await h.controller.setSession('session', content());
    expect(h.factory.start).toHaveBeenCalledOnce();
  });
});
