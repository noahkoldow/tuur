import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from './smoke-beta-backend.mjs';
import { firestoreFields, projectId } from './lib/firebase-beta.mjs';

const notFound = () => Object.assign(new Error('not found'), { status: 404 });
const forbidden = () =>
  Object.assign(new Error('provider echo: private-debug-token private-password'), { status: 403 });

function fixture(options = {}) {
  const users = new Map();
  const docs = new Map();
  const debug = new Map();
  const calls = [];
  const callableCalls = [];
  const states = [];
  let uid;
  let version = 0;
  const document = (data) => ({
    fields: firestoreFields(data),
    updateTime: `2026-10-05T12:00:00.${String(++version).padStart(9, '0')}Z`,
  });
  const cloudApi = async (method, rawUrl, body) => {
    const url = new URL(rawUrl);
    const path = url.pathname;
    calls.push({ method, path });
    if (path.endsWith('/config'))
      return { signIn: { email: { enabled: !options.providerDisabled, passwordRequired: true } } };
    if (path.endsWith('/functions'))
      return {
        functions: [
          'ensureArea',
          'prepareTourDownload',
          'getNarration',
          'getWalkingRoute',
          'generateAutoTours',
          'deleteAccount',
        ].map((name) => ({
          name: `projects/${projectId}/locations/europe-west1/functions/${name}`,
          state: 'ACTIVE',
          serviceConfig: {
            environmentVariables: {
              TUUR_DEPLOYMENT_ENV: options.wrongEnvironment ? 'production' : 'beta',
              TUUR_BETA_FIREBASE_PROJECT_ID: projectId,
              TUUR_BETA_SNAPSHOT_TILES: 'u33dbf',
            },
          },
        })),
      };
    if (path.endsWith('/debugTokens')) {
      if (method === 'GET') return { debugTokens: [...debug.values()] };
      assert.equal(method, 'POST');
      if (options.debugForbidden) throw forbidden();
      assert.match(body.token, /^[a-f0-9-]{36}$/);
      assert.ok(body.name.startsWith(`${path.slice(4)}/`));
      const created = { name: body.name, displayName: body.displayName };
      debug.set(created.name, created);
      if (options.lostDebugResponse) throw new Error('response lost with private-debug-token');
      return created;
    }
    if (method === 'DELETE' && path.includes('/debugTokens/')) {
      assert.equal(debug.delete(path.slice(4)), true);
      return {};
    }
    if (path.endsWith('/accounts:lookup'))
      return { users: body.localId.map((id) => users.get(id)).filter(Boolean) };
    if (path.endsWith('/accounts')) {
      assert.equal(method, 'POST');
      uid = body.localId;
      users.set(uid, { ...body });
      return { localId: uid };
    }
    if (path.endsWith('/accounts:delete')) {
      assert.equal(users.delete(body.localId), true);
      return {};
    }
    if (path.includes('/documents/')) {
      const docPath = path.split('/documents/')[1];
      if (docPath === 'areas/u33dbf') return document({ locked: true, status: 'ready', placeId: 'berlin' });
      if (docPath === 'tours/existing') return document({ source: 'auto', locked: false });
      if (docPath === 'pois/gate')
        return document({ id: 'gate', tile: 'u33dbf', hidden: false, accessible: true });
      if (docPath === 'tours/real-tour')
        return document({
          source: 'auto',
          locked: false,
          routingSource: 'ors',
          stops: [
            { poiId: 'gate', location: { lat: 52.5163, lng: 13.3777 } },
            { poiId: 'square', location: { lat: 52.5161, lng: 13.3769 } },
          ],
        });
      assert.ok(
        docPath.startsWith(`users/${uid}/`) ||
          (docPath.startsWith('rateLimits/') && docPath.endsWith(uid)) ||
          docPath === `narrations/personal__${'a'.repeat(64)}`,
      );
      if (method === 'GET') {
        if (!docs.has(docPath)) throw notFound();
        return docs.get(docPath);
      }
      if (method === 'PATCH') {
        if (options.fixtureCollision && docPath.endsWith('/entitlements/smoke')) {
          docs.set(docPath, document({ smokeFixture: 'different-owner', untouched: true }));
          throw Object.assign(new Error('precondition failed'), { status: 412 });
        }
        if (url.searchParams.get('currentDocument.exists') === 'false')
          assert.equal(docs.has(docPath), false);
        if (url.searchParams.get('currentDocument.exists') === 'true') assert.equal(docs.has(docPath), true);
        docs.set(docPath, { ...body, updateTime: document({}).updateTime });
        return docs.get(docPath);
      }
      if (method === 'DELETE') {
        if (options.cleanupDeleteFailure && docPath.endsWith('/entitlements/smoke')) throw forbidden();
        assert.equal(url.searchParams.get('currentDocument.updateTime'), docs.get(docPath).updateTime);
        assert.equal(docs.delete(docPath), true);
        return {};
      }
    }
    throw new Error(`Unexpected mock cloud operation: ${method} ${path}`);
  };
  const response = (status, data) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const fetchApi = async (rawUrl, init) => {
    const url = new URL(rawUrl);
    if (url.hostname === 'smoke-audio.example') {
      return new Response(new Uint8Array(2048), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
    const body = JSON.parse(init.body);
    assert.equal(init.redirect, 'error');
    if (url.pathname.endsWith(':exchangeDebugToken')) return response(200, { token: 'private-debug-token' });
    if (url.pathname.endsWith(':signInWithPassword')) {
      if (options.signInFailure) return response(403, { error: { message: 'private-password' } });
      assert.equal(users.get(uid).email, body.email);
      return response(200, {
        localId: uid,
        idToken: 'private-auth-token',
        refreshToken: 'private-refresh-token',
      });
    }
    assert.equal(url.hostname, `europe-west1-${projectId}.cloudfunctions.net`);
    if (
      init.headers.Authorization !== 'Bearer private-auth-token' ||
      init.headers['X-Firebase-AppCheck'] !== 'private-debug-token'
    )
      return response(401, { error: { status: 'UNAUTHENTICATED' } });
    const name = url.pathname.slice(1);
    callableCalls.push({ name, data: body.data });
    if (name === 'ensureArea') {
      docs.set(`rateLimits/ensureArea_${uid}`, document({ count: 1 }));
      if (body.data.geohash === 'u33dbf')
        return response(200, { result: { started: [], skipped: ['u33dbf'] } });
      return response(400, {
        error: { status: 'FAILED_PRECONDITION', details: { reason: 'beta_area_unavailable' } },
      });
    }
    if (name === 'generateAutoTours') {
      docs.set(`rateLimits/tours_user_${uid}`, document({ count: 1 }));
      return response(200, { result: { status: 'ready', tours: [{ id: 'real-tour' }], placeId: 'berlin' } });
    }
    if (name === 'getWalkingRoute') {
      docs.set(`rateLimits/navigation_minute_${uid}`, document({ count: 1 }));
      docs.set(`rateLimits/navigation_hour_${uid}`, document({ count: 1 }));
      if (options.routeFailure) return response(503, { error: { status: 'UNAVAILABLE' } });
      assert.deepEqual(body.data, {
        origin: { lat: 52.5161, lng: 13.3769 },
        poiId: 'gate',
        profile: 'foot-walking',
      });
      return response(200, {
        result: {
          poiId: 'gate',
          profile: 'foot-walking',
          routingSource: options.mockRoute ? 'mock' : 'ors',
          path: [
            [52.5161, 13.3769],
            [52.5163, 13.3769],
            [52.5163, 13.3777],
          ],
          distanceMeters: 80,
          durationSeconds: 62,
        },
      });
    }
    if (name === 'getNarration') {
      docs.set(`rateLimits/narr_dl_${uid}`, document({ count: 1 }));
      assert.equal(body.data.context.script.instanceId, uid);
      const key = `personal__${'a'.repeat(64)}`;
      const cached = docs.has(`narrations/${key}`);
      docs.set(`narrations/${key}`, document({ ownerUid: uid, scriptInstanceId: uid }));
      if (options.areaBudget)
        return response(503, { error: { status: 'UNAVAILABLE', details: { reason: 'area_budget' } } });
      if (options.privateError)
        return response(503, {
          error: { status: 'private-auth-token', details: { reason: 'private-password' } },
        });
      if (options.audioFailure) return response(503, { error: { status: 'UNAVAILABLE' } });
      return response(200, {
        result: {
          key,
          text: 'A verified personal narration with more than thirty characters.',
          audioUrl: 'https://smoke-audio.example/personal.mp3',
          audioDurationMs: 30000,
          cached: options.cacheMiss ? false : cached,
        },
      });
    }
    if (name === 'deleteAccount') {
      for (const path of docs.keys()) docs.delete(path);
      users.delete(uid);
      return response(200, { result: { deleted: true, summary: { personalNarrations: 1 } } });
    }
    assert.equal(name, 'prepareTourDownload');
    if (options.downloadFailure) return response(500, { error: { message: 'private-auth-token' } });
    const fields = docs.get(`users/${uid}/entitlements/smoke`)?.fields;
    if (fields?.type?.stringValue === 'subscription' && Number(fields.expiresAt.integerValue) > Date.now())
      return response(200, { result: { ...body.data, grantedAt: Date.now(), expiresAt: null } });
    if (fields?.type?.stringValue === 'tour' && fields.source?.stringValue === 'credit')
      return response(200, { result: { ...body.data, grantedAt: Date.now(), expiresAt: null } });
    return response(403, {
      error: { status: 'PERMISSION_DENIED', details: { reason: 'download_requires_purchase' } },
    });
  };
  return {
    users,
    docs,
    debug,
    calls,
    callableCalls,
    states,
    run: (extra = {}) =>
      runSmoke({
        apiKey: 'public-test-api-key',
        cloudApi,
        fetchApi,
        assertProject: async () => {},
        onState: async (state) => {
          states.push(structuredClone(state));
        },
        ...extra,
      }),
  };
}

test('runs both authorization gates and seeded download checks; removes only owned fixtures', async () => {
  const f = fixture();
  const result = await f.run({ tourId: 'existing' });
  assert.equal(result.status, 'passed');
  assert.ok(result.checks.some((check) => check.name === 'getNarration:missing_app_check'));
  for (const suffix of ['missing_auth', 'missing_app_check', 'invalid_auth', 'invalid_app_check'])
    assert.ok(result.checks.some((check) => check.name === `getWalkingRoute:${suffix}`));
  assert.equal(
    f.callableCalls.some((call) => call.name === 'getWalkingRoute' || call.name === 'getNarration'),
    false,
  );
  for (const mode of ['planned', 'tour'])
    for (const suffix of [
      'free_denied',
      'reward_denied',
      'invite_denied',
      'seeded_premium_allowed',
      'expired_premium_denied',
    ])
      assert.ok(result.checks.some((check) => check.name === `download:${mode}:${suffix}`));
  assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
  assert.ok(result.cleanup.every((entry) => entry.passed));
  assert.equal(
    f.calls.filter((call) => call.method !== 'GET' && call.path.endsWith('/tours/existing')).length,
    0,
  );
  const serialized = JSON.stringify([result, ...f.states]);
  for (const secret of [
    'private-debug-token',
    'private-auth-token',
    'private-refresh-token',
    'private-password',
    'public-test-api-key',
  ])
    assert.equal(serialized.includes(secret), false);
});

test('content checks real public walking geometry and one personal recording, verifies reuse and deletes private content', async () => {
  const f = fixture();
  const result = await f.run({ content: true });
  assert.equal(result.status, 'passed', JSON.stringify(result.failure));
  assert.equal(result.content.walkingRouteSource, 'ors');
  assert.equal(result.content.walkingRoutePoints, 3);
  assert.equal(result.content.personalRecording, true);
  assert.equal(result.content.personalRecordingReused, true);
  assert.equal(f.callableCalls.filter((call) => call.name === 'getWalkingRoute').length, 1);
  assert.equal(f.callableCalls.filter((call) => call.name === 'getNarration').length, 2);
  assert.deepEqual(
    f.callableCalls.filter((call) => call.name === 'getNarration')[0].data,
    f.callableCalls.filter((call) => call.name === 'getNarration')[1].data,
  );
  assert.ok(result.cleanup.some((entry) => entry.name === 'personal_recording_and_account' && entry.passed));
  assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
  assert.equal(JSON.stringify([result, ...f.states]).includes('private-auth-token'), false);
});

test('selects an explicitly requested canonical public POI without changing area budgets', async () => {
  const f = fixture();
  const result = await f.run({ content: true, contentPoiId: 'gate' });
  assert.equal(result.status, 'passed', JSON.stringify(result.failure));
  assert.equal(result.content.samplePoiId, 'gate');
  assert.equal(result.content.sampleTile, 'u33dbf');
  assert.equal(
    f.calls.some((call) => call.method !== 'GET' && call.path.endsWith('/config/ai')),
    false,
  );
  assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
});

test('rejects a sample outside the public tours before generating or calling providers', async () => {
  const f = fixture();
  const result = await f.run({ content: true, contentPoiId: 'missing-poi' });
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'content_poi_not_in_public_tour');
  assert.equal(
    f.callableCalls.some((call) => ['getWalkingRoute', 'getNarration'].includes(call.name)),
    false,
  );
  assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
});

for (const option of ['routeFailure', 'mockRoute', 'audioFailure', 'cacheMiss', 'areaBudget', 'privateError'])
  test(`content fails honestly and cleans private fixtures on ${option}`, async () => {
    const f = fixture({ [option]: true });
    const result = await f.run({ content: true });
    assert.equal(result.status, 'failed');
    assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
    assert.ok(result.cleanup.every((entry) => entry.passed));
    if (option === 'areaBudget') assert.equal(result.failure.code, 'real_audio_failed_area_budget');
    assert.equal(JSON.stringify(result).includes('private-password'), false);
    assert.equal(JSON.stringify(result).includes('private-auth-token'), false);
  });

for (const option of ['wrongEnvironment', 'providerDisabled', 'debugForbidden'])
  test(`stops safely without creating auth/doc fixtures on ${option}`, async () => {
    const f = fixture({ [option]: true });
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
    assert.equal(JSON.stringify(result).includes('private-password'), false);
  });

for (const option of ['lostDebugResponse', 'signInFailure', 'downloadFailure'])
  test(`cleans up partial resources after ${option}`, async () => {
    const f = fixture({ [option]: true });
    const result = await f.run();
    assert.equal(result.status, 'failed');
    assert.equal(f.users.size + f.docs.size + f.debug.size, 0);
    assert.ok(result.cleanup.every((entry) => entry.passed));
    assert.equal(JSON.stringify(result).includes('private-debug-token'), false);
  });

test('rejects path injection before doing any request', async () => {
  const f = fixture();
  await assert.rejects(() => f.run({ tourId: '../other-user' }), /invalid_standard_tour_id/);
  await assert.rejects(
    () => f.run({ content: true, contentPoiId: '../other-user' }),
    /invalid_content_poi_id/,
  );
  assert.equal(f.calls.length, 0);
});

test('does not delete a colliding fixture with another ownership marker', async () => {
  const f = fixture({ fixtureCollision: true });
  const result = await f.run();
  assert.equal(result.status, 'failed');
  assert.equal(f.users.size + f.debug.size, 0);
  assert.equal(f.docs.size, 1);
  assert.equal([...f.docs.values()][0].fields.smokeFixture.stringValue, 'different-owner');
  assert.ok(result.cleanup.some((entry) => entry.name.endsWith('/entitlements/smoke') && !entry.passed));
});

test('continues cleanup after one failed deletion and reports exact residual resource', async () => {
  const f = fixture({ cleanupDeleteFailure: true });
  const result = await f.run();
  assert.equal(result.status, 'failed');
  assert.equal(f.users.size + f.debug.size, 0);
  assert.equal(f.docs.size, 1);
  assert.ok(
    result.cleanup.some((entry) => entry.name.endsWith('/entitlements/smoke') && entry.httpStatus === 403),
  );
  assert.equal(JSON.stringify(result).includes('private-password'), false);
});
