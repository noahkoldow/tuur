/** TestFlight uses sandbox purchases. Only an explicitly isolated beta project may grant them outside emulators. */
export function allowSandboxBilling(env: Record<string, string | undefined>): boolean {
  if (env['FUNCTIONS_EMULATOR'] === 'true') return true;
  const project = env['GCLOUD_PROJECT'] ?? env['GOOGLE_CLOUD_PROJECT'];
  return Boolean(
    project &&
    project !== 'tuur-prod' &&
    env['TUUR_DEPLOYMENT_ENV'] === 'beta' &&
    env['TUUR_BETA_FIREBASE_PROJECT_ID'] === project &&
    env['TUUR_ALLOW_SANDBOX'] === 'true',
  );
}
