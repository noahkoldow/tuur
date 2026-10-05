// Default: print a plan only. Run explicitly after deployment: node scripts/smoke-beta-backend.mjs --run
// Optional --tour-id=<existing-standard-tour> adds read-only checks of that tour's download gate.
// Optional --content generates reusable real OSM tours and verifies Gemini audio and signed Storage URLs.
// This checks server behavior with seeded entitlements, NOT StoreKit/RevenueCat purchases or native attestation.
// REST references:
// https://firebase.google.com/docs/reference/appcheck/rest/v1/projects.apps.debugTokens/create
// https://firebase.google.com/docs/reference/appcheck/rest/v1/projects.apps/exchangeDebugToken
// https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/projects/accounts
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertBetaProject,
  cloud,
  firestoreBase,
  firestoreFields,
  projectId,
  projectNumber,
  region,
} from './lib/firebase-beta.mjs';

const webAppId = '1:1075077973046:web:c54ddfdbd51d56eb970497';
const appName = `projects/${projectNumber}/apps/${webAppId}`;
const appCheckBase = `https://firebaseappcheck.googleapis.com/v1/${appName}`;
const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
const functionBase = `https://${region}-${projectId}.cloudfunctions.net`;
const knownCallables = [
  'ensureArea',
  'prepareTourDownload',
  'spendCredit',
  'claimTourStart',
  'recordPurchaseConsent',
  'createRewardNonce',
  'getNarration',
  'getTransition',
  'getTeaser',
  'selectNearby',
  'generateAutoTours',
  'composePlannedRoute',
  'reportNarration',
  'exportMyData',
  'deleteAccount',
];

export const smokePlan = {
  projectId,
  region,
  webAppId,
  creates: [
    'one temporary Auth user',
    'one temporary App Check debug token',
    'one private planned-route fixture',
    'temporary entitlement fixtures for that user',
  ],
  checks: [
    'active consumer callables reject missing Auth/App Check',
    'allowed snapshot tile succeeds; outside tile is rejected',
    'free/reward/invite downloads denied',
    'seeded Premium download allowed, expired Premium denied',
  ],
  cleanup:
    'Exact owned fixtures, rate limit, Auth user and debug token in finally; non-secret recovery journal on disk.',
  boundaries:
    'No SMS, real purchase, AI/audio/route generation, existing-user changes, provider configuration or IAM changes. Debug App Check is not native-device attestation.',
};

class SmokeFailure extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function requireCondition(condition, code, status) {
  if (!condition) throw new SmokeFailure(code, status);
}
function statusOf(error) {
  return Number.isInteger(error?.status) ? error.status : undefined;
}
function value(field) {
  if (field?.stringValue !== undefined) return field.stringValue;
  if (field?.booleanValue !== undefined) return field.booleanValue;
  if (field?.integerValue !== undefined) return Number(field.integerValue);
  return undefined;
}

/** Dependency injection supports offline safety tests. Tokens/passwords never enter the returned report. */
export async function runSmoke({
  apiKey,
  tourId,
  content = false,
  cloudApi = cloud,
  fetchApi = fetch,
  assertProject = assertBetaProject,
  onState = async () => {},
  interrupted = () => false,
}) {
  requireCondition(typeof apiKey === 'string' && apiKey.length > 10, 'missing_beta_api_key');
  requireCondition(tourId === undefined || /^[A-Za-z0-9_-]{1,200}$/.test(tourId), 'invalid_standard_tour_id');
  const runId = `beta-smoke-${randomUUID()}`;
  const uid = runId;
  const email = `${runId}@example.invalid`;
  const password = `${randomBytes(32).toString('base64url')}aA1!`;
  const debugSecret = randomUUID();
  const requestedDebugName = `${appName}/debugTokens/${randomUUID()}`;
  let debugName;
  let debugAttempted = false;
  let authAttempted = false;
  let idToken;
  let appCheckToken;
  let stage = 'preflight';
  const ownedDocs = new Set();
  const report = {
    projectId,
    runId,
    status: 'running',
    checks: [],
    cleanup: [],
    fixtures: { uid, debugTokenDisplayName: runId, documents: [] },
    limitations: content
      ? 'Real route/audio generation enabled under existing beta budgets. Download entitlements are temporary seeded fixtures, not StoreKit purchases. Debug App Check is not native-device attestation.'
      : smokePlan.boundaries,
  };
  const saveState = async () => {
    report.fixtures.documents = [...ownedDocs];
    if (debugName) report.fixtures.debugTokenName = debugName;
    await onState(report);
  };
  const checkInterrupted = () => requireCondition(!interrupted(), 'interrupted');
  const step = async (name, action) => {
    stage = name;
    checkInterrupted();
    const result = await action();
    checkInterrupted();
    report.checks.push({ name, passed: true });
    await saveState();
    return result;
  };
  const publicPost = async (url, body, headers = {}, timeoutMs = 45_000) => {
    const response = await fetchApi(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new SmokeFailure('non_json_response', response.status);
    }
    return { status: response.status, data };
  };
  const callable = async (name, data, credentials = { idToken, appCheckToken }) => {
    requireCondition(knownCallables.includes(name), 'unexpected_callable');
    return publicPost(
      `${functionBase}/${name}`,
      { data },
      {
        ...(credentials.idToken ? { Authorization: `Bearer ${credentials.idToken}` } : {}),
        ...(credentials.appCheckToken ? { 'X-Firebase-AppCheck': credentials.appCheckToken } : {}),
      },
      ['generateAutoTours', 'getNarration'].includes(name) ? 330_000 : 45_000,
    );
  };
  const expectDenied = (result, status, reason) => {
    requireCondition(
      result.status === status &&
        result.data?.error?.status ===
          (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'PERMISSION_DENIED' : 'FAILED_PRECONDITION'),
      'unexpected_rejection',
      result.status,
    );
    if (reason) requireCondition(result.data.error.details?.reason === reason, 'unexpected_rejection_reason');
  };
  const putOwned = async (path, data) => {
    requireCondition(path.startsWith(`users/${uid}/`), 'fixture_path_outside_test_user');
    if (!ownedDocs.has(path)) {
      // An exists=false precondition protects against replacing any pre-existing document.
      ownedDocs.add(path);
      await saveState();
      await cloudApi('PATCH', `${firestoreBase}/${path}?currentDocument.exists=false`, {
        fields: firestoreFields(data),
      });
    } else
      await cloudApi('PATCH', `${firestoreBase}/${path}?currentDocument.exists=true`, {
        fields: firestoreFields(data),
      });
  };

  try {
    await assertProject();
    await saveState();
    const config = await cloudApi(
      'GET',
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    );
    requireCondition(
      config.signIn?.email?.enabled === true && config.signIn.email.passwordRequired === true,
      'email_password_provider_unavailable',
    );
    const inventory = await cloudApi(
      'GET',
      `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${region}/functions?pageSize=100`,
    );
    requireCondition(!inventory.nextPageToken, 'function_inventory_requires_pagination');
    const active = new Map(
      (inventory.functions ?? [])
        .filter((fn) => fn.state === 'ACTIVE')
        .map((fn) => [fn.name.split('/').at(-1), fn]),
    );
    requireCondition(
      active.has('ensureArea') && active.has('prepareTourDownload'),
      'required_backend_not_active',
    );
    const env = active.get('ensureArea').serviceConfig?.environmentVariables ?? {};
    requireCondition(
      env.TUUR_DEPLOYMENT_ENV === 'beta' && env.TUUR_BETA_FIREBASE_PROJECT_ID === projectId,
      'snapshot_project_configuration_invalid',
    );
    const tiles = (env.TUUR_BETA_SNAPSHOT_TILES ?? '').split(',');
    requireCondition(
      tiles.length <= 64 && tiles.every((tile) => /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(tile)),
      'snapshot_tiles_unavailable',
    );
    const tile = tiles[0];
    const outside = ['000000', 'zzzzzz', '111111'].find((candidate) => !tiles.includes(candidate));
    requireCondition(outside, 'outside_tile_unavailable');
    const area = await cloudApi('GET', `${firestoreBase}/areas/${tile}`);
    requireCondition(
      value(area.fields?.locked) === true && ['ready', 'low_content'].includes(value(area.fields?.status)),
      'snapshot_not_ready',
    );
    const placeId = value(area.fields?.placeId);
    requireCondition(typeof placeId === 'string' && placeId.length > 0, 'snapshot_place_missing');
    if (tourId) {
      const tour = await cloudApi('GET', `${firestoreBase}/tours/${tourId}`);
      requireCondition(
        ['auto', 'edited'].includes(value(tour.fields?.source)) && value(tour.fields?.locked) !== true,
        'standard_tour_unavailable',
      );
    }
    const existingDebug = await cloudApi('GET', `${appCheckBase}/debugTokens?pageSize=100`);
    requireCondition(
      !existingDebug.nextPageToken && (existingDebug.debugTokens ?? []).length < 20,
      'debug_token_capacity_unavailable',
    );
    const priorUser = await cloudApi('POST', `${authBase}/accounts:lookup`, { localId: [uid] });
    requireCondition(!priorUser.users?.length, 'temporary_uid_collision');

    await step('create_app_check_debug_fixture', async () => {
      debugAttempted = true;
      const token = await cloudApi('POST', `${appCheckBase}/debugTokens`, {
        name: requestedDebugName,
        displayName: runId,
        token: debugSecret,
      });
      requireCondition(
        typeof token.name === 'string' && token.name.startsWith(`${appName}/debugTokens/`),
        'invalid_debug_token_resource',
      );
      debugName = token.name;
      const exchange = await publicPost(
        `${appCheckBase}:exchangeDebugToken?key=${encodeURIComponent(apiKey)}`,
        { debugToken: debugSecret },
      );
      requireCondition(
        exchange.status === 200 && typeof exchange.data?.token === 'string',
        'app_check_exchange_failed',
        exchange.status,
      );
      appCheckToken = exchange.data.token;
    });
    await step('create_auth_fixture', async () => {
      authAttempted = true;
      const created = await cloudApi('POST', `${authBase}/accounts?key=${encodeURIComponent(apiKey)}`, {
        localId: uid,
        email,
        password,
        displayName: runId,
        emailVerified: true,
      });
      requireCondition(created.localId === uid, 'created_uid_mismatch');
      const signedIn = await publicPost(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        { email, password, returnSecureToken: true },
        { 'X-Firebase-AppCheck': appCheckToken },
      );
      requireCondition(
        signedIn.status === 200 &&
          signedIn.data?.localId === uid &&
          typeof signedIn.data.idToken === 'string',
        'password_sign_in_failed',
        signedIn.status,
      );
      idToken = signedIn.data.idToken;
    });
    for (const name of knownCallables.filter((name) => active.has(name))) {
      await step(`${name}:missing_auth`, async () =>
        expectDenied(await callable(name, {}, { appCheckToken }), 401),
      );
      await step(`${name}:missing_app_check`, async () =>
        expectDenied(await callable(name, {}, { idToken }), 401),
      );
    }
    await step('prepareTourDownload:invalid_app_check', async () =>
      expectDenied(await callable('prepareTourDownload', {}, { idToken, appCheckToken: 'invalid' }), 401),
    );
    await step('prepareTourDownload:invalid_auth', async () =>
      expectDenied(await callable('prepareTourDownload', {}, { idToken: 'invalid', appCheckToken }), 401),
    );

    // ensureArea is the only successful tested callable that writes state; track its exact private counter first.
    const ratePath = `rateLimits/ensureArea_${uid}`;
    try {
      await cloudApi('GET', `${firestoreBase}/${ratePath}`);
      throw new SmokeFailure('temporary_counter_collision');
    } catch (error) {
      if (statusOf(error) !== 404) throw error;
    }
    ownedDocs.add(ratePath);
    await saveState();
    await step('ensureArea:inside_snapshot', async () => {
      const response = await callable('ensureArea', { geohash: tile, withNeighbors: false });
      requireCondition(
        response.status === 200 &&
          response.data?.result?.started?.length === 0 &&
          response.data.result.skipped?.includes(tile),
        'snapshot_inside_failed',
      );
    });
    await step('ensureArea:outside_snapshot', async () =>
      expectDenied(
        await callable('ensureArea', { geohash: outside, withNeighbors: false }),
        400,
        'beta_area_unavailable',
      ),
    );

    const privateId = `planned_${randomUUID().replaceAll('-', '')}`;
    const privatePath = `users/${uid}/sessions/${privateId.slice('planned_'.length)}`;
    await step('create_private_route_fixture', () =>
      putOwned(privatePath, {
        id: privateId,
        kind: 'planned',
        source: 'planned',
        template: 'planned',
        placeId,
        expiresAt: Date.now() + 600_000,
        stops: [{ poiId: `smoke-only-${uid}` }],
        smokeFixture: runId,
      }),
    );
    const requests = [{ tourId: privateId, mode: 'planned' }, ...(tourId ? [{ tourId, mode: 'tour' }] : [])];
    const entitlementPath = `users/${uid}/entitlements/smoke`;
    for (const request of requests) {
      for (const source of ['free', 'reward', 'invite']) {
        await step(`download:${request.mode}:${source}_denied`, async () => {
          await putOwned(entitlementPath, {
            type: 'tour',
            tourId: request.tourId,
            source,
            placeId,
            grantedAt: Date.now(),
            expiresAt: null,
            smokeFixture: runId,
          });
          expectDenied(await callable('prepareTourDownload', request), 403, 'download_requires_purchase');
        });
      }
      await step(`download:${request.mode}:seeded_premium_allowed`, async () => {
        await putOwned(entitlementPath, {
          type: 'subscription',
          active: true,
          productId: 'smoke-seeded-not-store-purchase',
          expiresAt: Date.now() + 600_000,
          updatedAt: Date.now(),
          smokeFixture: runId,
        });
        const response = await callable('prepareTourDownload', request);
        const receipt = response.data?.result;
        requireCondition(
          response.status === 200 &&
            receipt?.tourId === request.tourId &&
            receipt.mode === request.mode &&
            receipt.expiresAt === null &&
            typeof receipt.grantedAt === 'number',
          'seeded_premium_download_failed',
        );
      });
      await step(`download:${request.mode}:expired_premium_denied`, async () => {
        await putOwned(entitlementPath, {
          type: 'subscription',
          active: true,
          productId: 'smoke-seeded-not-store-purchase',
          expiresAt: Date.now() - 60_000,
          updatedAt: Date.now(),
          smokeFixture: runId,
        });
        expectDenied(await callable('prepareTourDownload', request), 403, 'download_requires_purchase');
      });
    }
    if (content) {
      // Real reusable beta tours/audio remain; only this test user's grants and counters are removed.
      for (const prefix of ['tours_user_', 'narr_user_', 'narr_dl_']) {
        const path = `rateLimits/${prefix}${uid}`;
        try {
          await cloudApi('GET', `${firestoreBase}/${path}`);
          throw new SmokeFailure('temporary_counter_collision');
        } catch (error) {
          if (statusOf(error) !== 404) throw error;
        }
        ownedDocs.add(path);
      }
      await putOwned(entitlementPath, {
        type: 'subscription',
        active: true,
        productId: 'smoke-seeded-not-store-purchase',
        expiresAt: Date.now() + 1_800_000,
        updatedAt: Date.now(),
        smokeFixture: runId,
      });
      let generated;
      await step('content:real_osm_routes', async () => {
        const response = await callable('generateAutoTours', { tile, lang: 'de' });
        generated = response.data?.result;
        requireCondition(
          response.status === 200 && generated?.status === 'ready' && generated.tours?.length > 0,
          `real_routes_failed_${response.data?.error?.status ?? generated?.status ?? response.status}`,
        );
        report.content = { tourCount: generated.tours.length, placeId: generated.placeId };
      });
      const realTourId = generated.tours[0].id;
      const realTour = await cloudApi('GET', `${firestoreBase}/tours/${realTourId}`);
      const poiId = value(realTour.fields?.stops?.arrayValue?.values?.[0]?.mapValue?.fields?.poiId);
      requireCondition(typeof poiId === 'string', 'generated_route_has_no_stop');
      report.content.routingSource = value(realTour.fields?.routingSource);
      await step('content:real_gemini_audio_and_signed_url', async () => {
        const response = await callable('getNarration', {
          poiId,
          lang: 'de',
          lengthTier: 'short',
          download: true,
          access: { tourId: realTourId, mode: 'tour' },
        });
        const narration = response.data?.result;
        requireCondition(
          response.status === 200 && narration?.audioUrl && narration.text?.length > 30,
          `real_audio_failed_${response.data?.error?.status ?? response.status}`,
        );
        const audio = await fetchApi(narration.audioUrl, { signal: AbortSignal.timeout(30_000) });
        requireCondition(
          audio.ok && audio.headers.get('content-type')?.includes('audio/'),
          'signed_audio_unavailable',
        );
        const bytes = await audio.arrayBuffer();
        requireCondition(bytes.byteLength > 1000 && narration.audioDurationMs > 0, 'generated_audio_empty');
        Object.assign(report.content, {
          audioBytes: bytes.byteLength,
          audioDurationMs: narration.audioDurationMs,
          narrationKey: narration.key,
        });
      });
      await step('content:real_tour_premium_download', async () => {
        const response = await callable('prepareTourDownload', { tourId: realTourId, mode: 'tour' });
        requireCondition(
          response.status === 200 && response.data?.result?.tourId === realTourId,
          'real_download_failed',
        );
      });
      await step('content:real_tour_seeded_single_purchase_download', async () => {
        await putOwned(entitlementPath, {
          type: 'tour',
          tourId: realTourId,
          source: 'credit',
          placeId,
          grantedAt: Date.now(),
          expiresAt: null,
          smokeFixture: runId,
        });
        const response = await callable('prepareTourDownload', { tourId: realTourId, mode: 'tour' });
        requireCondition(
          response.status === 200 && response.data?.result?.tourId === realTourId,
          'real_single_purchase_download_failed',
        );
      });
      await step('content:verified_street_routing', async () => {
        requireCondition(report.content.routingSource === 'ors', 'route_source_not_live');
      });
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    // Never serialize arbitrary provider messages/bodies: these may echo credentials or request data.
    report.failure = {
      stage,
      code: error instanceof SmokeFailure ? error.code : 'request_failed',
      ...(statusOf(error) ? { httpStatus: statusOf(error) } : {}),
    };
  } finally {
    const cleanup = async (name, action) => {
      try {
        await action();
        report.cleanup.push({ name, passed: true });
      } catch (error) {
        report.status = 'failed';
        report.cleanup.push({
          name,
          passed: false,
          ...(statusOf(error) ? { httpStatus: statusOf(error) } : {}),
        });
      }
    };
    for (const path of [...ownedDocs].reverse()) {
      await cleanup(`document:${path}`, async () => {
        requireCondition(
          path.startsWith(`users/${uid}/`) ||
            ['ensureArea_', 'tours_user_', 'narr_user_', 'narr_dl_'].some(
              (prefix) => path === `rateLimits/${prefix}${uid}`,
            ),
          'cleanup_path_outside_test_user',
        );
        try {
          const document = await cloudApi('GET', `${firestoreBase}/${path}`);
          if (path.startsWith(`users/${uid}/`))
            requireCondition(
              value(document.fields?.smokeFixture) === runId,
              'cleanup_document_owner_mismatch',
            );
          requireCondition(typeof document.updateTime === 'string', 'cleanup_document_version_missing');
          await cloudApi(
            'DELETE',
            `${firestoreBase}/${path}?currentDocument.updateTime=${encodeURIComponent(document.updateTime)}`,
          );
        } catch (error) {
          if (statusOf(error) !== 404) throw error;
        }
      });
    }
    if (authAttempted)
      await cleanup('auth_user', async () => {
        const lookup = await cloudApi('POST', `${authBase}/accounts:lookup`, { localId: [uid] });
        if (!lookup.users?.length) return;
        requireCondition(
          lookup.users.length === 1 &&
            lookup.users[0].localId === uid &&
            lookup.users[0].email === email &&
            lookup.users[0].displayName === runId,
          'cleanup_auth_owner_mismatch',
        );
        await cloudApi('POST', `${authBase}/accounts:delete`, { localId: uid });
      });
    if (debugAttempted)
      await cleanup('app_check_debug_token', async () => {
        // A create response may have been lost: recover only this run's unique displayName, never other tokens.
        const list = await cloudApi('GET', `${appCheckBase}/debugTokens?pageSize=100`);
        requireCondition(!list.nextPageToken, 'cleanup_debug_list_incomplete');
        const owned = (list.debugTokens ?? []).filter((token) => token.displayName === runId);
        for (const token of owned) {
          requireCondition(
            token.name.startsWith(`${appName}/debugTokens/`) && (!debugName || token.name === debugName),
            'cleanup_debug_owner_mismatch',
          );
          await cloudApi('DELETE', `https://firebaseappcheck.googleapis.com/v1/${token.name}`);
        }
        requireCondition(!debugName || owned.length === 1, 'cleanup_debug_token_not_found');
      });
    await saveState();
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(
    args.every(
      (arg) => arg === '--run' || arg === '--plan' || arg === '--content' || arg.startsWith('--tour-id='),
    ),
    'unknown_argument',
  );
  if (!args.includes('--run')) {
    console.log(JSON.stringify(smokePlan, null, 2));
    return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const env = parseEnv(await readFile(resolve(root, 'apps/mobile/beta/.env.local'), 'utf8'));
  requireCondition(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID === projectId, 'mobile_env_is_not_beta');
  let interrupted = false;
  const stop = () => {
    interrupted = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const report = await runSmoke({
      apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
      content: args.includes('--content'),
      tourId: args.find((arg) => arg.startsWith('--tour-id='))?.slice('--tour-id='.length),
      interrupted: () => interrupted,
      onState: async (state) => {
        const path = resolve(root, '.firebase', `${state.runId}.json`);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
      },
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: 'failed',
        code: error instanceof SmokeFailure ? error.code : 'local_setup_failed',
      }),
    );
    process.exitCode = 1;
  });
