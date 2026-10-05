import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('public legal links', () => {
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
