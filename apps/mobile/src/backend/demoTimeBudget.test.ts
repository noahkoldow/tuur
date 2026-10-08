import { describe, expect, it } from 'vitest';
import type { Entitlement, UpdateTourTimeRequest } from '@tuur/shared';
import { createDemoTimeBudget } from './demoTimeBudget';

const context = { mode: 'tour' as const, tourId: 'a', placeId: 'berlin' };
const request = (
  sequence: number,
  state: UpdateTourTimeRequest['state'] = 'active',
): UpdateTourTimeRequest => ({ ...context, sessionId: 'walk-a', sequence, state });
const credit = (): Entitlement => ({
  type: 'tour',
  tourId: 'a',
  source: 'credit',
  grantedAt: 0,
  expiresAt: null,
  timeAllowanceSeconds: 5400,
  timeRemainingSeconds: 5400,
});
const subscription = (productId = 'tuur_sub_monthly'): Entitlement => ({
  type: 'subscription',
  active: true,
  productId,
  expiresAt: null,
  willRenew: true,
  updatedAt: 0,
});

describe('demo active tour minutes', () => {
  it('keeps purchased legacy gift audio and refuses using it for new downloads or metered gifts', () => {
    const grant: Entitlement = { type: 'tour', tourId: 'a', source: 'invite', grantedAt: 0, expiresAt: null };
    const budget = createDemoTimeBudget(
      () => [grant],
      () => 1000,
    );
    expect(budget.update(request(0), context)).toMatchObject({ source: 'legacy', remainingSeconds: null });
    expect(() => budget.reserveDownload(context, 90, 'gift-download')).toThrow('locked');
    grant.timeAllowanceSeconds = 5400;
    expect(() => budget.update(request(1), context)).toThrow('locked');
  });
  it('charges active time once, excludes pauses and bounds lost connections to the last lease', () => {
    let now = Date.UTC(2026, 9, 7);
    const grants = [credit()];
    const budget = createDemoTimeBudget(
      () => grants,
      () => now,
    );
    expect(budget.update(request(0), context).remainingSeconds).toBe(5400);
    now += 30_000;
    const paused = budget.update(request(1, 'paused'), context);
    expect(paused).toMatchObject({ remainingSeconds: 5370, leaseExpiresAt: null, state: 'paused' });
    now += 60 * 60_000;
    expect(budget.update(request(1, 'paused'), context)).toEqual(paused);
    expect(budget.update(request(2), context).remainingSeconds).toBe(5370);
    now += 10 * 60_000;
    expect(budget.update(request(3, 'paused'), context).remainingSeconds).toBe(5280);
  });

  it('requires a matching active lease and blocks concurrent sessions and ended-session restarts', () => {
    let now = Date.UTC(2026, 9, 7);
    const budget = createDemoTimeBudget(
      () => [subscription()],
      () => now,
    );
    expect(() => budget.assertAccess({ ...context, sessionId: 'walk-a' })).toThrow('Start or resume');
    budget.update(request(0), context);
    expect(() => budget.assertAccess({ ...context, sessionId: 'wrong' })).toThrow('Start or resume');
    expect(() => budget.update({ ...request(0), sessionId: 'other' }, context)).toThrow('Pause the active');
    expect(() => budget.update(request(1), { ...context, tourId: 'b' })).toThrow('belongs to another');
    now += 90_001;
    expect(() => budget.assertAccess({ ...context, sessionId: 'walk-a' })).toThrow('Start or resume');
    budget.update(request(1, 'ended'), context);
    expect(() => budget.update(request(2), context)).toThrow('has ended');
  });

  it.each(['tuur_sub_monthly', 'tuur_sub_yearly'])(
    'provides exactly 500 minutes each calendar month for %s',
    (product) => {
      let now = Date.UTC(2026, 9, 31, 23, 59, 30);
      const budget = createDemoTimeBudget(
        () => [subscription(product)],
        () => now,
      );
      budget.reserveDownload(context, 499, 'offline');
      const started = budget.update(request(0), context);
      expect(started.remainingSeconds).toBe(60);
      expect(started.leaseExpiresAt).toBe(Date.UTC(2026, 10, 1, 0, 1));
      now += 60_000;
      expect(budget.update(request(1), context).remainingSeconds).toBe(29_970);
      budget.update(request(2, 'paused'), context);
      budget.reserveDownload(context, 499.5, 'offline-next-month');
      expect(budget.update(request(3), context)).toMatchObject({ remainingSeconds: 0, state: 'paused' });
      expect(() => budget.assertAccess({ ...context, planning: true })).toThrow('minutes exhausted');
    },
  );

  it('binds prepaid downloads to one script and itinerary, rejecting extra generation after exhaustion', () => {
    const grants = [credit()];
    const budget = createDemoTimeBudget(
      () => grants,
      () => 1000,
    );
    expect(() => budget.reserveDownload(context, 90)).toThrow('script instance');
    budget.reserveDownload(context, 90, 'offline-a');
    budget.reserveDownload(context, 90, 'offline-a');
    expect(grants[0]).toMatchObject({ timeRemainingSeconds: 0 });
    expect(() => budget.assertDownload({ ...context, downloadId: 'offline-a' })).not.toThrow();
    expect(() => budget.assertDownload({ ...context, downloadId: 'other' })).toThrow('Prepare the download');
    expect(() => budget.reserveDownload(context, 1, 'extra')).toThrow('Not enough');
  });

  it('preserves old permanent grants and keeps the preview free without inventing purchased minutes', () => {
    const legacy: Entitlement = {
      type: 'tour',
      tourId: 'a',
      source: 'credit',
      grantedAt: 0,
      expiresAt: null,
    };
    const budget = createDemoTimeBudget(
      () => [legacy],
      () => 1000,
    );
    expect(budget.update(request(0), context)).toMatchObject({ remainingSeconds: null, source: 'legacy' });
    const preview = createDemoTimeBudget(
      () => [],
      () => 1000,
    );
    expect(preview.update(request(0), context, true)).toMatchObject({
      remainingSeconds: null,
      source: 'free',
    });
    expect(() => preview.reserveDownload(context, 20, 'offline')).toThrow('locked');
  });
});
