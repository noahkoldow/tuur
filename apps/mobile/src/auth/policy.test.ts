import { describe, expect, it } from 'vitest';
import { createDemoBackend } from '../backend/demoBackend';
import { accountStep, authErrorKey, normalizedPhone, requireVerifiedAccount, validPhone } from './policy';

describe('required account and mobile verification', () => {
  it('rejects missing and legacy anonymous accounts even if they have a phone number', () => {
    for (const user of [null, { uid: 'old', isAnonymous: true, phoneNumber: '+491701234567' }]) {
      expect(accountStep(user)).toBe('sign-in');
      expect(() => requireVerifiedAccount(user)).toThrow('Sign in and verify');
    }
  });

  it('requires a linked phone for email and social accounts', () => {
    const user = { uid: 'u', isAnonymous: false, email: 'test@example.com' };
    expect(accountStep(user)).toBe('phone');
    expect(() => requireVerifiedAccount(user)).toThrow();
    expect(accountStep({ ...user, phoneNumber: '+491701234567' })).toBe('ready');
    expect(accountStep({ ...user, providerIds: ['phone'], phoneNumber: '+491701234567' })).toBe('sign-in');
    expect(accountStep({ ...user, providerIds: ['phone', 'apple.com'], phoneNumber: '+491701234567' })).toBe(
      'ready',
    );
  });

  it('normalizes an international phone without accepting a local number', () => {
    expect(normalizedPhone('+49 (170) 123-4567')).toBe('+491701234567');
    expect(validPhone('+49 (170) 123-4567')).toBe(true);
    expect(validPhone('01701234567')).toBe(false);
    expect(validPhone('+49')).toBe(false);
  });

  it('demo models sign-in, invalid SMS retry, verification and sign-out without guest creation', async () => {
    const { auth } = createDemoBackend({ latencyMs: 0 });
    await expect(auth.ensureSignedIn()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(auth.current()).toBeNull();
    await expect(auth.requestPhoneVerification('+491701234567')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    const updates: (string | undefined)[] = [];
    const off = auth.onChange((user) => updates.push(user?.phoneNumber));
    await auth.signInWithEmail('test@example.com', 'correct-password', true);
    await expect(auth.ensureSignedIn()).rejects.toMatchObject({ code: 'unauthenticated' });
    const id = await auth.requestPhoneVerification('+49 170 1234567');
    await expect(auth.confirmPhoneVerification(id, '123456')).rejects.toMatchObject({
      code: 'auth/invalid-verification-code',
    });
    expect(accountStep(auth.current())).toBe('phone');
    await auth.confirmPhoneVerification(id, '000000');
    await expect(auth.ensureSignedIn()).resolves.toMatchObject({
      phoneNumber: '+491701234567',
      isAnonymous: false,
    });
    expect(updates.at(-1)).toBe('+491701234567');
    await auth.signOut();
    await expect(auth.ensureSignedIn()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(auth.current()).toBeNull();
    off();
  });

  it('a replaced SMS challenge and a signed-out account cannot confirm an old code', async () => {
    const { auth } = createDemoBackend({ latencyMs: 0 });
    await auth.signInWithGoogle();
    const first = await auth.requestPhoneVerification('+491701234567');
    const second = await auth.requestPhoneVerification('+491709876543');
    await expect(auth.confirmPhoneVerification(first, '000000')).rejects.toThrow();
    await auth.signOut();
    await auth.signInWithApple();
    await expect(auth.confirmPhoneVerification(second, '000000')).rejects.toThrow();
    expect(accountStep(auth.current())).toBe('phone');
  });

  it('keeps provider cancellation quiet and gives an actionable SMS recovery message', () => {
    expect(authErrorKey({ code: 'ERR_REQUEST_CANCELED' })).toBeNull();
    expect(authErrorKey({ code: 'auth/invalid-verification-code' })).toBe('auth.invalidCode');
    expect(authErrorKey({ code: 'auth/session-expired' })).toBe('auth.expiredCode');
    expect(authErrorKey({ code: 'auth/credential-already-in-use' })).toBe('auth.phoneInUse');
  });
});
