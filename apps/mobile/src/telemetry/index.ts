import { config } from '../config';

/**
 * Crash reporting (Firebase Crashlytics) is off until the user consents in the settings (spec 10, GDPR). Auto collection
 * is disabled natively in `firebase.json`; this switches collection on/off at runtime.
 */
export async function setCrashReporting(enabled: boolean): Promise<void> {
  if (config.backend === 'demo') return;
  try {
    const { getCrashlytics, setCrashlyticsCollectionEnabled } =
      require('@react-native-firebase/crashlytics') as typeof import('@react-native-firebase/crashlytics');
    await setCrashlyticsCollectionEnabled(getCrashlytics(), enabled);
  } catch {
    // reporting is optional; the app must never fail because of it
  }
}

/** Records a handled error (a no-op unless the user consented). */
export function recordError(error: unknown): void {
  if (config.backend === 'demo') return;
  try {
    const { getCrashlytics, recordError: record } =
      require('@react-native-firebase/crashlytics') as typeof import('@react-native-firebase/crashlytics');
    record(getCrashlytics(), error instanceof Error ? error : new Error(String(error)));
  } catch {
    // ignore
  }
}
