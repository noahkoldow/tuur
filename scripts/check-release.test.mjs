import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeFirebaseProblems, releaseProblems } from './check-release.mjs';

function betaEnv() {
  const env = {
    EXPO_PUBLIC_BACKEND: 'firebase',
    EXPO_PUBLIC_USE_EMULATORS: 'false',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'tuur-beta',
    EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID: 'tuur-beta',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'configured-client',
    GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.client',
    GOOGLE_SERVICES_INFO_PLIST: '/secret/firebase.plist',
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'public-sdk-key',
    EXPO_PUBLIC_MAPTILER_KEY: 'public-map-key',
    EXPO_PUBLIC_WEB_BASE_URL: 'https://tuur.app',
  };
  for (const name of ['NAME', 'ADDRESS', 'EMAIL', 'REPRESENTATIVE', 'PRIVACY_EMAIL', 'SUPERVISORY_AUTHORITY'])
    env[`EXPO_PUBLIC_OPERATOR_${name}`] = 'configured';
  return env;
}
test('iOS beta accepts test ads and does not demand Android, web or server secrets', () => {
  assert.deepEqual(releaseProblems(betaEnv(), { target: 'ios', channel: 'beta' }), []);
});

test('a separate legal host is optional and must be a public HTTPS URL when supplied', () => {
  const options = { target: 'ios', channel: 'beta' };
  assert.deepEqual(
    releaseProblems({ ...betaEnv(), EXPO_PUBLIC_LEGAL_BASE_URL: 'https://tuur-beta.web.app' }, options),
    [],
  );
  for (const url of ['', 'http://tuur-beta.web.app', 'https://localhost/legal', 'not-a-url'])
    assert.ok(
      releaseProblems({ ...betaEnv(), EXPO_PUBLIC_LEGAL_BASE_URL: url }, options).some((problem) =>
        problem.includes('EXPO_PUBLIC_LEGAL_BASE_URL'),
      ),
    );
});

test('native online maps work without a paid key, but public tiles are not an offline source', () => {
  const env = betaEnv();
  delete env.EXPO_PUBLIC_MAPTILER_KEY;
  assert.deepEqual(releaseProblems(env, { target: 'ios', channel: 'beta' }), []);
  for (const style of [
    'https://tiles.openfreemap.org/styles/liberty',
    'https://tile.openstreetmap.org/style.json',
    'https://demotiles.maplibre.org/style.json',
    'http://maps.example.net/style.json',
  ]) {
    assert.ok(
      releaseProblems(
        { ...env, EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL: style },
        {
          target: 'ios',
          channel: 'beta',
        },
      ).some((problem) => problem.includes('EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL')),
    );
  }
  assert.deepEqual(
    releaseProblems(
      {
        ...env,
        EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL: 'https://maps.example.net/approved-style.json',
      },
      { target: 'ios', channel: 'beta' },
    ),
    [],
  );
});
test('beta rejects preview stubs, disabled purchases and the production Firebase project', () => {
  const errors = releaseProblems(
    {
      ...betaEnv(),
      EXPO_PUBLIC_EXPO_GO: '1',
      EXPO_PUBLIC_PAYWALL: 'off',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'tuur-prod',
    },
    { target: 'ios', channel: 'beta' },
  );
  assert.equal(errors.length, 3);
});
test('production does not allow public Google test ad IDs', () => {
  const errors = releaseProblems(
    {
      ...betaEnv(),
      ADMOB_IOS_APP_ID: 'ca-app-pub-3940256099942544~1458002511',
      EXPO_PUBLIC_ADMOB_REWARDED_UNIT: 'configured',
      EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT: 'configured',
    },
    { target: 'ios', channel: 'production' },
  );
  assert.deepEqual(errors, ['ADMOB_IOS_APP_ID is a Google test ID']);
});
test('native Firebase file must identify the same isolated project as the client', () => {
  const env = betaEnv();
  const plist = (project = 'tuur-beta') => `<plist><dict>
    <key>PROJECT_ID</key><string>${project}</string>
    <key>BUNDLE_ID</key><string>com.tuurapp</string>
    <key>GOOGLE_APP_ID</key><string>1:123:ios:abc</string>
    <key>CLIENT_ID</key><string>client.apps.googleusercontent.com</string>
    <key>REVERSED_CLIENT_ID</key><string>com.googleusercontent.apps.client</string>
  </dict></plist>`;
  assert.deepEqual(
    nativeFirebaseProblems(
      env,
      'ios',
      () => plist(),
      () => true,
    ),
    [],
  );
  assert.equal(
    nativeFirebaseProblems(
      env,
      'ios',
      () => plist('tuur-prod'),
      () => true,
    ).length,
    1,
  );
  assert.equal(
    nativeFirebaseProblems(
      env,
      'ios',
      () => '',
      () => false,
    ).length,
    1,
  );
  assert.ok(
    nativeFirebaseProblems(
      env,
      'ios',
      () => plist().replace('<key>CLIENT_ID</key>', '<key>OLD_CLIENT_ID</key>'),
      () => true,
    ).some((problem) => problem.includes('missing Google Sign-In')),
  );
  assert.ok(
    nativeFirebaseProblems(
      { ...env, GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.other' },
      'ios',
      () => plist(),
      () => true,
    ).some((problem) => problem.includes('must match GOOGLE_IOS_URL_SCHEME')),
  );
  assert.ok(
    nativeFirebaseProblems(
      env,
      'ios',
      () => plist().replace('com.tuurapp', 'com.anotherapp'),
      () => true,
    ).some((problem) => problem.includes('bundle ID must be com.tuurapp')),
  );
  assert.ok(
    nativeFirebaseProblems(
      env,
      'ios',
      () => plist().replace('<key>GOOGLE_APP_ID</key>', '<key>OLD_APP_ID</key>'),
      () => true,
    ).some((problem) => problem.includes('missing GOOGLE_APP_ID')),
  );
});
test('server gate refuses implicit mock providers and public production data endpoints', () => {
  const errors = releaseProblems({}, { target: 'server' });
  assert.ok(errors.some((error) => error.includes('TUUR_TTS_PROVIDER')));
  assert.ok(errors.some((error) => error.includes('TUUR_LLM_PROVIDER')));
});
test('unknown target/channel cannot silently skip validation', () => {
  assert.ok(releaseProblems({}, { target: 'apple' }).length);
  assert.ok(releaseProblems({}, { channel: 'test' }).length);
});

test('bounded imported OSM snapshots replace ingestion only in an isolated beta', () => {
  const env = {
    TUUR_LLM_PROVIDER: 'gemini',
    TUUR_TTS_PROVIDER: 'gemini',
    TUUR_POI_PROVIDER: 'live',
    TUUR_ROUTING_PROVIDER: 'openrouteservice',
    TUUR_GEOCODING_PROVIDER: 'pelias',
    TUUR_USER_AGENT: 'tuur (support@example.net)',
    TUUR_BETA_SNAPSHOT_TILES: 'u33dbb,u33dbc',
    TUUR_DEPLOYMENT_ENV: 'beta',
    TUUR_ALLOW_SANDBOX: 'true',
    TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta',
    GCLOUD_PROJECT: 'tuur-beta',
  };
  assert.deepEqual(releaseProblems(env, { target: 'server', channel: 'beta' }), []);
  assert.ok(
    releaseProblems(env, { target: 'server', channel: 'production' }).some((p) => p.includes('beta-only')),
  );
  for (const overrides of [
    { TUUR_BETA_SNAPSHOT_TILES: 'invalid' },
    { TUUR_BETA_SNAPSHOT_TILES: Array(65).fill('u33dbb').join(',') },
    { GCLOUD_PROJECT: 'tuur-prod' },
  ])
    assert.ok(releaseProblems({ ...env, ...overrides }, { target: 'server', channel: 'beta' }).length);
});

test('Pelias replaces only geocoding requirements and retains the production POI endpoint gate', () => {
  const env = {
    TUUR_LLM_PROVIDER: 'gemini',
    TUUR_TTS_PROVIDER: 'gemini',
    TUUR_POI_PROVIDER: 'live',
    TUUR_ROUTING_PROVIDER: 'openrouteservice',
    TUUR_GEOCODING_PROVIDER: 'pelias',
    TUUR_PAYMENTS_PROVIDER: 'stripe',
    TUUR_USER_AGENT: 'tuur (support@example.net)',
    OVERPASS_ENDPOINT: 'https://osm.example.net/api/interpreter',
  };
  assert.deepEqual(releaseProblems(env, { target: 'server' }), []);
  assert.ok(
    releaseProblems({ ...env, PELIAS_URL: 'http://geo.example.net' }, { target: 'server' }).some((error) =>
      error.includes('PELIAS_URL'),
    ),
  );
  assert.ok(
    releaseProblems(
      { ...env, OVERPASS_ENDPOINT: 'https://overpass-api.de/api/interpreter' },
      { target: 'server' },
    ).some((error) => error.includes('Overpass')),
  );
  assert.ok(
    releaseProblems({ ...env, TUUR_GEOCODING_PROVIDER: 'nominatim' }, { target: 'server' }).some((error) =>
      error.includes('NOMINATIM_URL'),
    ),
  );
  assert.ok(
    releaseProblems({ ...env, TUUR_POI_PROVIDER: 'heigit' }, { target: 'server' }).some((error) =>
      error.includes('TUUR_POI_PROVIDER'),
    ),
  );
});

test('the canonical Overspan endpoint requires a real server key in beta and production', () => {
  const env = {
    TUUR_LLM_PROVIDER: 'gemini',
    TUUR_TTS_PROVIDER: 'gemini',
    TUUR_POI_PROVIDER: 'live',
    TUUR_ROUTING_PROVIDER: 'openrouteservice',
    TUUR_GEOCODING_PROVIDER: 'pelias',
    TUUR_PAYMENTS_PROVIDER: 'stripe',
    TUUR_USER_AGENT: 'tuur (support@example.net)',
    OVERPASS_ENDPOINT: 'https://api.overspan.dev/api/interpreter',
    // A public client variable must never satisfy the server credential requirement.
    EXPO_PUBLIC_OVERPASS_API_KEY: 'client-value-does-not-count',
  };
  for (const channel of ['beta', 'production']) {
    const configured =
      channel === 'beta'
        ? {
            ...env,
            TUUR_DEPLOYMENT_ENV: 'beta',
            TUUR_ALLOW_SANDBOX: 'true',
            TUUR_BETA_FIREBASE_PROJECT_ID: 'tuur-beta',
            GCLOUD_PROJECT: 'tuur-beta',
          }
        : env;
    for (const key of [undefined, '', '   ', 'unused', 'short']) {
      const problems = releaseProblems(
        { ...configured, OVERPASS_API_KEY: key },
        { target: 'server', channel },
      );
      assert.equal(problems.length, 1);
      assert.match(problems[0], /OVERPASS_API_KEY/);
    }
    assert.deepEqual(
      releaseProblems(
        { ...configured, OVERPASS_API_KEY: 'server-test-key-never-logged' },
        { target: 'server', channel },
      ),
      [],
    );
    assert.deepEqual(
      releaseProblems(
        { ...configured, OVERPASS_ENDPOINT: 'https://osm.example.net/api/interpreter' },
        { target: 'server', channel },
      ),
      [],
    );
  }
});

test('Overspan credentials are never required in the public native release configuration', () => {
  assert.deepEqual(
    releaseProblems(
      {
        ...betaEnv(),
        OVERPASS_ENDPOINT: 'https://api.overspan.dev/api/interpreter',
      },
      { target: 'ios', channel: 'beta' },
    ),
    [],
  );
});
