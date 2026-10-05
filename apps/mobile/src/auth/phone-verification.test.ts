import { describe, expect, it, vi } from 'vitest';
import { requestNativePhoneCode, type PhoneVerificationSnapshot } from './phone-verification';

function fixture() {
  let receive: (snapshot: PhoneVerificationSnapshot) => void = () => undefined;
  const options = {
    subscribe: (callback: typeof receive) => {
      receive = callback;
    },
    ensureCurrent: vi.fn(),
    onSent: vi.fn(),
    onVerified: vi.fn(async () => undefined),
  };
  const request = requestNativePhoneCode(options);
  return { request, options, emit: (snapshot: PhoneVerificationSnapshot) => receive(snapshot) };
}

describe('native SMS verification events', () => {
  it('opens the code input on sent without waiting for the Android retrieval timeout', async () => {
    const f = fixture();
    f.emit({ state: 'sent', verificationId: 'sms-id', code: null });
    await expect(f.request).resolves.toBe('sms-id');
    expect(f.options.onSent).toHaveBeenCalledWith('sms-id');
    expect(f.options.onVerified).not.toHaveBeenCalled();
  });

  it('links Android instant verification with its native cached credential even without SMS/code/id', async () => {
    const f = fixture();
    const snapshot = { state: 'verified' as const, verificationId: null, code: null };
    f.emit(snapshot);
    await expect(f.request).resolves.toBe('');
    expect(f.options.onVerified).toHaveBeenCalledWith(snapshot);
  });

  it('still handles auto retrieval after the manual input is shown, once only', async () => {
    const f = fixture();
    f.emit({ state: 'sent', verificationId: 'sms-id', code: null });
    await f.request;
    const snapshot = { state: 'verified' as const, verificationId: 'sms-id', code: '123456' };
    f.emit(snapshot);
    f.emit(snapshot);
    expect(f.options.onVerified).toHaveBeenCalledOnce();
  });

  it('rejects a provider failure and never links a stale account request', async () => {
    const failed = fixture();
    failed.emit({ state: 'error', verificationId: null, code: null, error: new Error('SMS quota') });
    await expect(failed.request).rejects.toThrow('SMS quota');
    const stale = fixture();
    stale.options.ensureCurrent.mockImplementation(() => {
      throw new Error('Account changed');
    });
    stale.emit({ state: 'verified', verificationId: null, code: null });
    await expect(stale.request).rejects.toThrow('Account changed');
    expect(stale.options.onVerified).not.toHaveBeenCalled();
  });
});
