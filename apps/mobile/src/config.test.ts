import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('public legal links', () => {
  it('uses the configured beta origin for invite and join links', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', 'https://tuur-beta-noehxpo.web.app');
    vi.stubEnv('EXPO_PUBLIC_LEGAL_BASE_URL', 'https://tuur-beta-noehxpo.web.app');
    const { config } = await import('./config');
    expect(`${config.legal.webBaseUrl}/invite/example-token`).toBe(
      'https://tuur-beta-noehxpo.web.app/invite/example-token',
    );
    expect(`${config.legal.webBaseUrl}/join/group-id.secret`).toBe(
      'https://tuur-beta-noehxpo.web.app/join/group-id.secret',
    );
  });

  it('keeps invite/join landing pages on the app origin while legal documents use their own host', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', 'https://tuur.app');
    vi.stubEnv('EXPO_PUBLIC_LEGAL_BASE_URL', 'https://tuur-beta.web.app');
    const { config } = await import('./config');
    expect(config.legal.webBaseUrl).toBe('https://tuur.app');
    expect(config.legal.documentsBaseUrl).toBe('https://tuur-beta.web.app');
  });

  it('preserves the existing app origin when a separate legal host is not configured', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', 'https://existing.tuur.app');
    vi.stubEnv('EXPO_PUBLIC_LEGAL_BASE_URL', undefined);
    const { config } = await import('./config');
    expect(config.legal.documentsBaseUrl).toBe(config.legal.webBaseUrl);
    expect(config.legal.documentsBaseUrl).toBe('https://existing.tuur.app');
  });

  it('retains the established default origin when neither host is set', async () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', undefined);
    vi.stubEnv('EXPO_PUBLIC_LEGAL_BASE_URL', undefined);
    const { config } = await import('./config');
    expect(config.legal.documentsBaseUrl).toBe('https://tuur.app');
    expect(config.legal.webBaseUrl).toBe('https://tuur.app');
  });
});

describe('native beta universal links', () => {
  it('adds the beta host for the isolated Firebase beta while retaining the existing host', async () => {
    vi.stubEnv('EXPO_PUBLIC_BACKEND', 'firebase');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'tuur-beta-noehxpo');
    const { default: appConfig } = await import('../app.config');
    const output = appConfig({ config: { name: 'tuur', slug: 'tuur' } } as Parameters<typeof appConfig>[0]);
    expect(output.scheme).toBe('tuur');
    expect(output.ios?.associatedDomains).toEqual([
      'applinks:tuur.app',
      'applinks:tuur-beta-noehxpo.web.app',
    ]);
  });

  it.each([
    ['firebase', 'tuur-prod'],
    ['demo', 'tuur-beta-noehxpo'],
    [undefined, undefined],
  ])('does not add the beta host for backend %s / project %s', async (backend, project) => {
    vi.stubEnv('EXPO_PUBLIC_BACKEND', backend);
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', project);
    const { default: appConfig } = await import('../app.config');
    const output = appConfig({ config: { name: 'tuur', slug: 'tuur' } } as Parameters<typeof appConfig>[0]);
    expect(output.ios?.associatedDomains).toEqual(['applinks:tuur.app']);
  });
});
