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
        functions: ['ensureArea', 'prepareTourDownload', 'getNarration'].map((name) => ({
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
      assert.ok(docPath.startsWith(`users/${uid}/`) || docPath === `rateLimits/ensureArea_${uid}`);
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
    if (name === 'ensureArea') {
      docs.set(`rateLimits/ensureArea_${uid}`, document({ count: 1 }));
      if (body.data.geohash === 'u33dbf')
        return response(200, { result: { started: [], skipped: ['u33dbf'] } });
      return response(400, {
        error: { status: 'FAILED_PRECONDITION', details: { reason: 'beta_area_unavailable' } },
      });
    }
    assert.equal(name, 'prepareTourDownload');
    if (options.downloadFailure) return response(500, { error: { message: 'private-auth-token' } });
    const fields = docs.get(`users/${uid}/entitlements/smoke`)?.fields;
    if (fields?.type?.stringValue === 'subscription' && Number(fields.expiresAt.integerValue) > Date.now())
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
