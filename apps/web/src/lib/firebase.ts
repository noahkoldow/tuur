import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Browser Firebase client for the partner portal and the admin area. Only public identifiers come from the
 * environment (NEXT_PUBLIC_*); `process.env.NEXT_PUBLIC_*` must be written out literally so Next.js inlines it.
 */
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tuur-prod';
export const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FUNCTIONS_REGION || 'europe-west1';
const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY?.trim();

const firebaseConfig = {
  // the Auth emulator accepts any non-empty key; production needs the real (public) web API key
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulators ? 'demo-api-key' : ''),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  ...(process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? { appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID } : {}),
  ...(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    ? { messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }
    : {}),
};

export interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

let instance: Fb | undefined;
let appCheck: AppCheck | undefined;

/** Lazily created singleton (client side only); connects to the local emulators when configured. */
export function fb(): Fb {
  if (instance) return instance;
  if (typeof window === 'undefined') throw new Error('fb() is only available in the browser');
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (!useEmulators && appCheckSiteKey) {
    try {
      // Initialize before the other services so their requests carry App Check tokens.
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Keep sign-in available; protected actions report a recoverable verification error below.
    }
  }
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);
  const storage = getStorage(app);
  if (useEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    connectFunctionsEmulator(functions, emulatorHost, 5001);
    connectStorageEmulator(storage, emulatorHost, 9199);
  }
  instance = { app, auth, db, functions, storage };
  return instance;
}

/**
 * Error thrown by `callFn`: `code` is the callable error code without the `functions/` prefix (e.g.
 * `failed-precondition`, `unavailable`), `reason` the machine-readable `details.reason` set by the server.
 */
export class CallError extends Error {
  readonly code: string;
  readonly reason: string | undefined;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'CallError';
    this.code = code;
    this.details = details;
    const r = (details as { reason?: unknown } | undefined)?.reason;
    this.reason = typeof r === 'string' ? r : undefined;
  }
}

/** Calls a Cloud Function (callable) and normalizes its errors to `CallError`. */
export async function callFn<Req = unknown, Res = unknown>(name: string, data: Req): Promise<Res> {
  try {
    const client = fb();
    if (!useEmulators) {
      if (!appCheckSiteKey) {
        throw new CallError('failed-precondition', 'App Check is not configured for this website.', {
          reason: 'app_check_unconfigured',
        });
      }
      try {
        if (!appCheck) throw new Error('App Check initialization failed');
        // Fail locally with an actionable message instead of sending an unverified callable.
        // Firebase caches valid tokens and attaches them to httpsCallable automatically.
        await getToken(appCheck);
      } catch {
        throw new CallError('unavailable', 'Security verification failed. Reload the page and try again.', {
          reason: 'app_check_failed',
        });
      }
    }
    const res = await httpsCallable<Req, Res>(client.functions, name)(data);
    return res.data;
  } catch (e) {
    const err = e as { code?: string; message?: string; details?: unknown };
    const code = (err.code ?? 'internal').replace(/^functions\//, '');
    throw new CallError(code, err.message ?? code, err.details);
  }
}
