import { describe, expect, it } from 'vitest';
import { allowSandboxBilling } from './environment';

describe('isolated TestFlight billing', () => {
  const beta = {
    GCLOUD_PROJECT: 'tuur-beta',
    TUUR_DEPLOYMENT_ENV: 'beta',
    TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta',
    TUUR_ALLOW_SANDBOX: 'true',
  };
  it('accepts only explicitly isolated beta projects and local emulators', () => {
    expect(allowSandboxBilling(beta)).toBe(true);
    expect(allowSandboxBilling({ FUNCTIONS_EMULATOR: 'true' })).toBe(true);
    for (const key of Object.keys(beta))
      expect(allowSandboxBilling({ ...beta, [key]: undefined })).toBe(false);
    expect(
      allowSandboxBilling({
        ...beta,
        GCLOUD_PROJECT: 'tuur-prod',
        TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-prod',
      }),
    ).toBe(false);
    expect(allowSandboxBilling({ ...beta, TUUR_DEPLOYMENT_ENV: 'production' })).toBe(false);
  });
});
