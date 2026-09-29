import { describe, expect, it } from 'vitest';
import { toBackendError } from './errors';

const err = (code: string, reason?: string, extra: object = {}) => ({
  code: `functions/${code}`,
  message: 'm',
  details: { ...(reason ? { reason } : {}), ...extra },
});

describe('toBackendError', () => {
  it('maps the codes the app reacts to', () => {
    expect(toBackendError(err('permission-denied'))).toMatchObject({ code: 'locked' });
    expect(toBackendError(err('failed-precondition', 'insufficient'))).toMatchObject({
      code: 'insufficient_credit',
    });
    expect(toBackendError(err('failed-precondition', 'too_far'))).toMatchObject({
      code: 'redeem_denied',
      reason: 'too_far',
    });
    expect(toBackendError(err('failed-precondition', 'already_redeemed_today'))).toMatchObject({
      code: 'redeem_denied',
    });
    expect(toBackendError(err('failed-precondition', 'already_redeemed'))).toMatchObject({
      code: 'invite_invalid',
    });
    expect(toBackendError(err('already-exists'))).toMatchObject({ code: 'invite_invalid' });
    expect(toBackendError(err('resource-exhausted', undefined, { retryAfterMs: 5 }))).toMatchObject({
      code: 'rate_limited',
      retryAfterMs: 5,
    });
    expect(toBackendError(err('unavailable', 'kill_switch'))).toMatchObject({ code: 'paused' });
    expect(toBackendError(err('unavailable'))).toMatchObject({ code: 'network' });
    expect(toBackendError(err('not-found'))).toMatchObject({ code: 'not_found' });
    expect(toBackendError(err('unauthenticated'))).toMatchObject({ code: 'unauthenticated' });
    expect(toBackendError(new Error('x'))).toMatchObject({ code: 'unknown' });
  });
});
