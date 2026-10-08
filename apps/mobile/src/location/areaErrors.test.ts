import { describe, expect, it } from 'vitest';
import { toBackendError } from '../backend/errors';
import { areaErrorCode, areaErrorKeys } from './areaErrors';

function failure(code: string, reason?: string) {
  return toBackendError({
    code: `functions/${code}`,
    message: 'Provider implementation detail',
    details: { reason, retryAfterMs: 1500 },
  });
}

describe('nearby place failures', () => {
  it('identifies the legacy coverage restriction independently of its callable status', () => {
    for (const code of ['failed-precondition', 'unavailable']) {
      expect(areaErrorCode(failure(code, 'beta_area_unavailable'))).toBe('coverage');
    }
  });

  it('distinguishes temporary discovery limits from connectivity failures', () => {
    expect(areaErrorCode(failure('resource-exhausted'))).toBe('temporary');
    expect(areaErrorCode(failure('unavailable', 'kill_switch'))).toBe('temporary');
    expect(areaErrorCode(failure('unavailable'))).toBe('network');
  });

  it('preserves the provider reason and retry delay for unavailable responses', () => {
    expect(failure('unavailable', 'kill_switch')).toMatchObject({
      reason: 'kill_switch',
      retryAfterMs: 1500,
    });
  });

  it('shows localized loading failures, never provider text or the no-results message', () => {
    const code = areaErrorCode(new Error('Provider implementation detail'));
    expect(areaErrorKeys[code]).toBe('errors.placesUnavailable');
  });
});
