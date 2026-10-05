import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  app: { name: 'test-web-app' },
  check: { name: 'app-check' },
  auth: { name: 'auth' },
  initializeAppCheck: vi.fn(),
  getToken: vi.fn(),
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  connectFunctionsEmulator: vi.fn(),
  invoke: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: () => sdk.app,
  initializeApp: () => sdk.app,
}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: sdk.initializeAppCheck,
  getToken: sdk.getToken,
  ReCaptchaV3Provider: class {
    constructor(readonly siteKey: string) {}
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: () => sdk.auth,
  connectAuthEmulator: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: sdk.getFunctions,
  connectFunctionsEmulator: sdk.connectFunctionsEmulator,
  httpsCallable: sdk.httpsCallable,
}));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  connectStorageEmulator: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('window', {});
  vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', 'false');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY', 'registered-site-key');
  sdk.initializeAppCheck.mockReset().mockReturnValue(sdk.check);
  sdk.getToken.mockReset().mockResolvedValue({ token: 'verified-token' });
  sdk.invoke.mockReset().mockResolvedValue({ data: { ok: true } });
  sdk.httpsCallable.mockReset().mockReturnValue(sdk.invoke);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('partner web App Check', () => {
  it('initializes once before Functions and verifies before exporting or deleting data', async () => {
    const { callFn } = await import('./firebase');

    await expect(callFn('exportMyData', {})).resolves.toEqual({ ok: true });
    await expect(callFn('deleteAccount', {})).resolves.toEqual({ ok: true });

    expect(sdk.initializeAppCheck).toHaveBeenCalledExactlyOnceWith(sdk.app, {
      provider: expect.objectContaining({ siteKey: 'registered-site-key' }),
      isTokenAutoRefreshEnabled: true,
    });
    expect(sdk.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.getFunctions.mock.invocationCallOrder[0]!,
    );
    expect(sdk.getToken).toHaveBeenCalledTimes(2);
    expect(sdk.getToken.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.httpsCallable.mock.invocationCallOrder[0]!,
    );
  });

  it('reports a missing site key without sending an unverified callable or breaking sign-in', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY', '  ');
    const { callFn, fb } = await import('./firebase');

    expect(fb().auth).toBe(sdk.auth);
    await expect(callFn('deleteAccount', {})).rejects.toMatchObject({
      code: 'failed-precondition',
      reason: 'app_check_unconfigured',
    });
    expect(sdk.initializeAppCheck).not.toHaveBeenCalled();
    expect(sdk.httpsCallable).not.toHaveBeenCalled();
  });

  it('reports failed verification and permits a successful retry', async () => {
    sdk.getToken.mockRejectedValueOnce(new Error('reCAPTCHA blocked'));
    const { callFn } = await import('./firebase');

    await expect(callFn('exportMyData', {})).rejects.toMatchObject({
      code: 'unavailable',
      reason: 'app_check_failed',
    });
    expect(sdk.httpsCallable).not.toHaveBeenCalled();
    await expect(callFn('exportMyData', {})).resolves.toEqual({ ok: true });
  });

  it('keeps sign-in available when App Check initialization fails, but blocks callables', async () => {
    sdk.initializeAppCheck.mockImplementation(() => {
      throw new Error('provider initialization failed');
    });
    const { callFn, fb } = await import('./firebase');

    expect(fb().auth).toBe(sdk.auth);
    await expect(callFn('deleteAccount', {})).rejects.toMatchObject({ reason: 'app_check_failed' });
    expect(sdk.httpsCallable).not.toHaveBeenCalled();
  });

  it('skips verification only when Firebase services are connected to emulators', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_EMULATORS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_EMULATOR_HOST', '127.0.0.1');
    const { callFn } = await import('./firebase');

    await expect(callFn('exportMyData', {})).resolves.toEqual({ ok: true });
    expect(sdk.connectFunctionsEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 5001);
    expect(sdk.initializeAppCheck).not.toHaveBeenCalled();
    expect(sdk.getToken).not.toHaveBeenCalled();
  });

  it('preserves callable errors after verification', async () => {
    sdk.invoke.mockRejectedValue({
      code: 'functions/permission-denied',
      message: 'Not allowed',
      details: { reason: 'account_restricted' },
    });
    const { callFn } = await import('./firebase');

    await expect(callFn('deleteAccount', {})).rejects.toMatchObject({
      code: 'permission-denied',
      reason: 'account_restricted',
      message: 'Not allowed',
    });
  });
});
