import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  db: { name: 'test-firestore' },
  report: vi.fn(async () => ({ id: 'report-1' })),
}));

vi.mock('firebase-admin/app', async (original) => ({
  ...(await original<typeof import('firebase-admin/app')>()),
  initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/firestore', async (original) => ({
  ...(await original<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => fixtures.db,
}));
vi.mock('./narration/service', async (original) => ({
  ...(await original<typeof import('./narration/service')>()),
  reportNarrationIssue: fixtures.report,
}));

type FunctionMetadata = {
  __endpoint: {
    secretEnvironmentVariables?: { key: string }[] | null;
    serviceAccountEmail?: unknown;
    minInstances?: unknown;
    maxInstances?: unknown;
    concurrency?: unknown;
  };
};
const secrets = (fn: FunctionMetadata) => fn.__endpoint.secretEnvironmentVariables?.map((s) => s.key) ?? [];
const parameterName = (value: unknown) => (value as { name?: string } | undefined)?.name;
const evaluated = (value: unknown) =>
  typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: () => unknown }).value()
    : value;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
  vi.stubEnv('TUUR_DEPLOYMENT_ENV', 'beta');
  vi.stubEnv('TUUR_TTS_PROVIDER', 'gemini');
  vi.stubEnv('TUUR_PAYMENTS_PROVIDER', 'mock');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
});
afterEach(() => vi.unstubAllEnvs());

// The first cold import includes provider SDKs and can exceed 30 s on a synced Windows workspace.
describe('function deployment boundaries', { timeout: 90_000 }, () => {
  it('rejects unsupported area precision before reserving quota or enqueueing a discarded task', async () => {
    const { ensureArea } = await import('./index');
    // The worker accepts exactly six characters. The mocked database cannot reserve a claim,
    // so accidentally accepting one of these requests also fails this validation regression.
    for (const geohash of ['u33d', 'u33db', 'u33dbbb', 'u33dbbbb'])
      await expect(
        ensureArea.run({
          auth: { uid: 'user-1', token: {} },
          data: { geohash, withNeighbors: false },
        } as Parameters<typeof ensureArea.run>[0]),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('uses no provider credentials for bounded beta snapshot lookup', async () => {
    vi.stubEnv('TUUR_BETA_SNAPSHOT_TILES', 'u33dbb');
    const functions = await import('./index');
    expect(secrets(functions.ensureArea)).toEqual([]);
    expect(parameterName(functions.ensureArea.__endpoint.serviceAccountEmail)).toBe(
      'TUUR_CORE_SERVICE_ACCOUNT',
    );
  });

  it('does not require OpenAI or partner secrets for the Gemini-only consumer backend', async () => {
    const functions = await import('./index');
    expect(secrets(functions.getNarration)).toEqual(['GEMINI_API_KEY']);
    expect(secrets(functions.getTransition)).toEqual(['GEMINI_API_KEY']);
    expect(secrets(functions.generateAutoTours)).toEqual(['GEMINI_API_KEY', 'ORS_API_KEY']);
    expect(secrets(functions.composePlannedRoute)).toEqual(['GEMINI_API_KEY', 'ORS_API_KEY']);
    expect(secrets(functions.getWalkingRoute)).toEqual(['ORS_API_KEY']);
    expect(secrets(functions.getTeaser)).toEqual(['GEMINI_API_KEY']);
    expect(secrets(functions.getPoiText)).toEqual([]);
    expect(secrets(functions.selectNearby)).toEqual(['GEMINI_API_KEY']);
    expect(secrets(functions.reportNarration)).toEqual([]);
    expect(secrets(functions.reportContent)).toEqual([]);
    expect(secrets(functions.getAiConsent)).toEqual([]);
    expect(secrets(functions.updateAiConsent)).toEqual([]);
    expect(secrets(functions.adminModerateOffer)).toEqual([]);
    expect(secrets(functions.deleteAccount)).toEqual([]);
    expect(secrets(functions.exportMyData)).toEqual([]);
  });

  it('queues live discovery without provider credentials and serializes its protected worker', async () => {
    vi.stubEnv('TUUR_BETA_SNAPSHOT_TILES', '');
    vi.stubEnv('TUUR_CORE_SERVICE_ACCOUNT', 'core@tuur-beta-test.iam.gserviceaccount.com');
    const functions = await import('./index');
    expect(secrets(functions.ensureArea)).toEqual([]);
    expect(functions.ensureArea.__endpoint.callableTrigger).toBeDefined();
    expect(functions.ingestArea.__endpoint.taskQueueTrigger).toMatchObject({
      invoker: ['core@tuur-beta-test.iam.gserviceaccount.com'],
      rateLimits: { maxConcurrentDispatches: 1, maxDispatchesPerSecond: 1 },
      retryConfig: { maxAttempts: 3, minBackoffSeconds: 120 },
    });
  });

  it('adds OpenAI only to endpoints that actually synthesize audio in explicit live mode', async () => {
    vi.stubEnv('TUUR_TTS_PROVIDER', 'live');
    const functions = await import('./index');
    expect(secrets(functions.getNarration)).toEqual(['GEMINI_API_KEY', 'OPENAI_API_KEY']);
    expect(secrets(functions.getTransition)).toEqual(['GEMINI_API_KEY', 'OPENAI_API_KEY']);
    expect(secrets(functions.generateAutoTours)).toEqual(['GEMINI_API_KEY', 'ORS_API_KEY']);
    expect(secrets(functions.composePlannedRoute)).toEqual(['GEMINI_API_KEY', 'ORS_API_KEY']);
    expect(secrets(functions.getTeaser)).toEqual(['GEMINI_API_KEY']);
  });

  it.each(['', 'mock', 'gemini', 'LIVE'])(
    'does not bind optional keys for TTS selection %j',
    async (mode) => {
      vi.stubEnv('TUUR_TTS_PROVIDER', mode);
      const { NARRATION_SECRETS } = await import('./config');
      expect(NARRATION_SECRETS.map((s) => s.name)).toEqual(['GEMINI_API_KEY']);
    },
  );

  it('binds only Stripe secrets for accounts when the Stripe provider is explicitly selected', async () => {
    vi.stubEnv('TUUR_PAYMENTS_PROVIDER', 'stripe');
    const functions = await import('./index');
    for (const fn of [functions.deleteAccount, functions.exportMyData])
      expect(secrets(fn)).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  });

  it('separates core and AI identities while retaining the existing callback identities and beta bounds', async () => {
    const functions = await import('./index');
    for (const fn of [
      functions.spendCredit,
      functions.getPoiText,
      functions.prepareTourDownload,
      functions.reportNarration,
      functions.reportContent,
      functions.getAiConsent,
      functions.updateAiConsent,
      functions.adminModerateOffer,
      functions.deleteAccount,
      functions.exportMyData,
    ])
      expect(parameterName(fn.__endpoint.serviceAccountEmail)).toBe('TUUR_CORE_SERVICE_ACCOUNT');
    for (const fn of [
      functions.getNarration,
      functions.getTransition,
      functions.generateAutoTours,
      functions.composePlannedRoute,
      functions.getWalkingRoute,
      functions.getTeaser,
      functions.selectNearby,
      functions.ingestArea,
    ])
      expect(parameterName(fn.__endpoint.serviceAccountEmail)).toBe('TUUR_AI_SERVICE_ACCOUNT');
    expect(parameterName(functions.health.__endpoint.serviceAccountEmail)).toBe(
      'TUUR_HEALTH_SERVICE_ACCOUNT',
    );
    expect(parameterName(functions.revenueCatWebhook.__endpoint.serviceAccountEmail)).toBe(
      'TUUR_REVENUECAT_SERVICE_ACCOUNT',
    );
    expect(parameterName(functions.admobSsv.__endpoint.serviceAccountEmail)).toBe(
      'TUUR_ADMOB_SERVICE_ACCOUNT',
    );
    for (const fn of [functions.spendCredit, functions.getNarration, functions.revenueCatWebhook]) {
      expect(evaluated(fn.__endpoint.minInstances)).toBe(0);
      expect(evaluated(fn.__endpoint.maxInstances)).toBe(1);
      expect(evaluated(fn.__endpoint.concurrency)).toBe(1);
    }
  });

  it('accepts audio feedback without constructing any AI provider or reading a secret', async () => {
    vi.stubEnv('TUUR_LLM_PROVIDER', 'invalid');
    vi.stubEnv('TUUR_TTS_PROVIDER', 'invalid');
    const { reportNarration } = await import('./index');
    const input = { narrationKey: 'narration-1', reason: 'audio_issue' };
    await expect(
      reportNarration.run({ auth: { uid: 'user-1', token: {} }, data: input } as Parameters<
        typeof reportNarration.run
      >[0]),
    ).resolves.toEqual({ id: 'report-1' });
    expect(fixtures.report).toHaveBeenCalledWith(
      { db: fixtures.db, store: expect.any(Object), now: expect.any(Function) },
      'user-1',
      input,
    );
  });

  it('requires authentication before constructing a walking-route provider', async () => {
    vi.stubEnv('TUUR_ROUTING_PROVIDER', 'invalid');
    const { getWalkingRoute } = await import('./index');
    await expect(
      getWalkingRoute.run({ data: {} } as Parameters<typeof getWalkingRoute.run>[0]),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('protects report/consent writes and refuses unversioned consent or non-admin moderation', async () => {
    const functions = await import('./index');
    for (const fn of [functions.reportContent, functions.getAiConsent, functions.updateAiConsent]) {
      await expect(fn.run({ data: {} } as Parameters<typeof fn.run>[0])).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    }
    await expect(
      functions.updateAiConsent.run({
        auth: { uid: 'user-1', token: {} },
        data: { granted: true },
      } as Parameters<typeof functions.updateAiConsent.run>[0]),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      functions.adminModerateOffer.run({ auth: { uid: 'user-1', token: {} }, data: {} } as Parameters<
        typeof functions.adminModerateOffer.run
      >[0]),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('requires authentication for POI text and constructs no AI providers for source text', async () => {
    vi.stubEnv('TUUR_LLM_PROVIDER', 'invalid');
    vi.stubEnv('TUUR_TTS_PROVIDER', 'invalid');
    const { getPoiText } = await import('./index');
    await expect(getPoiText.run({ data: {} } as Parameters<typeof getPoiText.run>[0])).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    const { poiTextDeps } = await import('./config');
    expect(Object.keys(poiTextDeps()).sort()).toEqual(['db', 'now', 'sources']);
    expect(secrets(getPoiText)).toEqual([]);
  });

  it('constructs teaser dependencies without configuring TTS or an audio encoder/store', async () => {
    vi.stubEnv('TUUR_LLM_PROVIDER', 'gemini');
    vi.stubEnv('TUUR_POI_PROVIDER', 'live');
    vi.stubEnv('TUUR_TTS_PROVIDER', 'invalid');
    vi.stubEnv('GEMINI_API_KEY', 'test-key-not-a-real-provider-key');
    const { teaserDeps, narrationDeps } = await import('./config');
    const deps = teaserDeps();
    expect(Object.keys(deps).sort()).toEqual(['authorize', 'db', 'llm', 'now', 'sources']);
    expect(deps.authorize).toBeTypeOf('function');
    expect(() => narrationDeps()).toThrow('TUUR_TTS_PROVIDER');
  });
});
