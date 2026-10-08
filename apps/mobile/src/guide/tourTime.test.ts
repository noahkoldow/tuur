import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourTimeResult, UpdateTourTimeRequest } from '@tuur/shared';
import { BackendError } from '../backend/types';
import { TourTimeController } from './tourTime';
import { createDemoTimeBudget } from '../backend/demoTimeBudget';

function setup() {
  const onBlocked = vi.fn();
  const onTime = vi.fn();
  let current = true;
  const update = vi.fn(async (request: UpdateTourTimeRequest): Promise<TourTimeResult> => ({
    sessionId: request.sessionId,
    sequence: request.sequence,
    source: 'credit',
    state: request.state,
    serverNow: Date.now(),
    remainingSeconds: 5400,
    leaseExpiresAt: request.state === 'active' ? Date.now() + 90_000 : null,
  }));
  const time = new TourTimeController({
    request: { sessionId: 'walk', mode: 'roam', tile: 'u33dc0' },
    update,
    isCurrent: () => current,
    onBlocked,
    onTime,
  });
  return {
    time,
    update,
    onBlocked,
    onTime,
    changeAccount: () => {
      current = false;
    },
  };
}

describe('tour-time lease lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('awaits the server pause before a privacy dialog and remains paused until explicit activation', async () => {
    const { time, update } = setup();
    await time.start();
    await time.pauseAndWait();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(update.mock.calls.map(([request]) => request.state)).toEqual(['active', 'paused']);
    expect(await time.activate()).toBe(true);
    await time.stop();
  });

  it('sends heartbeats while active, stops charging during pause and closes once', async () => {
    const { time, update } = setup();
    await time.start();
    await vi.advanceTimersByTimeAsync(30_000);
    time.pause();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(update.mock.calls.map(([req]) => req.state)).toEqual(['active', 'active', 'paused']);
    expect(await time.activate()).toBe(true);
    await time.stop();
    await time.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(update.mock.calls.map(([req]) => req.state)).toEqual([
      'active',
      'active',
      'paused',
      'active',
      'ended',
    ]);
  });

  it('retries an uncertain response with the identical sequence', async () => {
    const { time, update } = setup();
    update.mockRejectedValueOnce(new BackendError('network', 'Response lost'));
    await time.start();
    expect(update.mock.calls[1]![0]).toEqual(update.mock.calls[0]![0]);
    await time.stop();
  });

  it('pauses when a disconnected client reaches its last confirmed lease deadline', async () => {
    const { time, update, onBlocked } = setup();
    await time.start();
    update.mockRejectedValue(new BackendError('network', 'Offline'));
    await vi.advanceTimersByTimeAsync(89_999);
    expect(onBlocked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'tour_time_lease_expired' }));
    await time.stop().catch(() => undefined);
  });

  it('cannot resume after the server reports an exhausted allowance', async () => {
    const { time, update, onBlocked } = setup();
    await time.start('paused');
    update.mockImplementation(async (req) => ({
      ...req,
      source: 'credit',
      remainingSeconds: 0,
      leaseExpiresAt: null,
      serverNow: Date.now(),
      state: 'paused',
    }));
    expect(await time.activate()).toBe(false);
    expect(onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'tour_time_exhausted' }));
    await time.stop();
  });

  it('does not submit the old account’s session after identity changes', async () => {
    const { time, update, changeAccount } = setup();
    await time.start();
    changeAccount();
    await vi.advanceTimersByTimeAsync(180_000);
    await time.stop();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not reactivate a queued heartbeat after a local pause', async () => {
    const { time, update } = setup();
    await time.start();
    let complete!: (value: TourTimeResult) => void;
    update.mockImplementationOnce(
      () =>
        new Promise<TourTimeResult>((resolve) => {
          complete = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    time.pause();
    complete({
      sessionId: 'walk',
      sequence: Date.now(),
      source: 'credit',
      state: 'active',
      serverNow: Date.now(),
      remainingSeconds: 5300,
      leaseExpiresAt: Date.now() + 90_000,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(update.mock.calls.map(([req]) => req.state)).toEqual(['active', 'active', 'paused']);
    await time.stop();
  });

  it('continues through monthly renewal only within server-confirmed leases', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:45Z'));
    const { time, update, onBlocked, onTime } = setup();
    const context = { mode: 'roam' as const, placeId: 'berlin' };
    const budget = createDemoTimeBudget(() => [
      {
        type: 'subscription',
        active: true,
        productId: 'tuur_sub_yearly',
        expiresAt: null,
        willRenew: true,
        updatedAt: 0,
      },
    ]);
    budget.reserveDownload(context, 499.5, 'old-usage');
    update.mockImplementation(async (req) => budget.update(req, context));
    await time.start();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onTime).toHaveBeenLastCalledWith(
      expect.objectContaining({ remainingSeconds: 29985, state: 'active' }),
    );
    expect(update.mock.calls.map(([req]) => req.state)).toEqual(['active', 'active']);
    await time.stop();
  });

  it('stops at the crossing lease deadline if the connection is lost, without extending permission', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:45Z'));
    const { time, update, onBlocked } = setup();
    update.mockImplementationOnce(async (req) => ({
      ...req,
      source: 'subscription',
      serverNow: Date.now(),
      remainingSeconds: 30,
      leaseExpiresAt: Date.now() + 90_000,
    }));
    await time.start();
    update.mockRejectedValue(new BackendError('network', 'Offline'));
    await vi.advanceTimersByTimeAsync(89_999);
    expect(onBlocked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onBlocked).toHaveBeenCalledWith(expect.objectContaining({ reason: 'tour_time_lease_expired' }));
    await time.stop().catch(() => undefined);
  });

  it('does not resume a user-paused walk when its monthly allowance renews', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:45Z'));
    const { time, update, onBlocked } = setup();
    const context = { mode: 'roam' as const, placeId: 'berlin' };
    const budget = createDemoTimeBudget(() => [
      {
        type: 'subscription',
        active: true,
        productId: 'tuur_sub_monthly',
        expiresAt: null,
        willRenew: true,
        updatedAt: 0,
      },
    ]);
    update.mockImplementation(async (req) => budget.update(req, context));
    await time.start();
    await vi.advanceTimersByTimeAsync(10_000);
    time.pause();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(update.mock.calls.map(([req]) => req.state)).toEqual(['active', 'paused']);
    expect(onBlocked).not.toHaveBeenCalled();
    await time.stop();
  });
});
