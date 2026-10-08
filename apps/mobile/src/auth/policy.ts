import { BackendError, type UserInfo } from '../backend/types';

export type AccountStep = 'sign-in' | 'ready';

/** A primary account enables the app; a phone credential is optional and never grants access by itself. */
export function accountStep(user: UserInfo | null): AccountStep {
  if (!user || user.isAnonymous) return 'sign-in';
  if (
    user.providerIds &&
    !user.providerIds.some((id) => ['password', 'apple.com', 'google.com'].includes(id))
  )
    return 'sign-in';
  return 'ready';
}

export function requirePrimaryAccount(user: UserInfo | null): UserInfo {
  if (!user || accountStep(user) !== 'ready')
    throw new BackendError('unauthenticated', 'Sign in to continue');
  return user;
}

export const normalizedPhone = (value: string) => value.replace(/[\s().-]/g, '');
export const validPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(normalizedPhone(value));

export function authErrorKey(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ERR_REQUEST_CANCELED' || code === 'SIGN_IN_CANCELLED' || code === 'auth/popup-closed-by-user')
    return null;
  if (code === 'auth/network-request-failed' || code === 'network') return 'errors.network';
  if (code === 'auth/too-many-requests') return 'auth.tooManyRequests';
  if (code === 'auth/email-already-in-use') return 'auth.emailInUse';
  if (code === 'auth/weak-password') return 'auth.weakPassword';
  if (code === 'auth/invalid-email') return 'auth.invalidEmail';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
    return 'auth.invalidCredentials';
  if (code === 'auth/invalid-phone-number') return 'auth.invalidPhone';
  if (code === 'auth/invalid-verification-code') return 'auth.invalidCode';
  if (code === 'auth/code-expired' || code === 'auth/session-expired') return 'auth.expiredCode';
  if (code === 'auth/credential-already-in-use') return 'auth.phoneInUse';
  if (code === 'auth/operation-not-allowed' || code === 'auth/unauthorized-domain' || code === 'unavailable')
    return 'auth.unavailable';
  return 'errors.generic';
}
