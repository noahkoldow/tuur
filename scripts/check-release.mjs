import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Separate native beta requirements from production, web and server deployment. Never prints values. */
export function releaseProblems(env, { target = 'all', channel = 'production' } = {}) {
  const problems = [];
  if (!['ios', 'android', 'web', 'server', 'all'].includes(target)) return ['Unknown release target'];
  if (!['beta', 'production'].includes(channel)) return ['Unknown release channel'];
  const need = (key, reason) => {
    if (!env[key]?.trim()) problems.push(`${key} is required (${reason})`);
  };
  const https = (key) => {
    need(key, 'public HTTPS endpoint');
    if (!env[key]) return;
    try {
      // OVERPASS_ENDPOINT may list several interpreters for failover.
      for (const part of key === 'OVERPASS_ENDPOINT' ? env[key].split(',') : [env[key]]) {
        const url = new URL(part.trim());
        if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', 'example.com'].includes(url.hostname))
          problems.push(`${key} must be a public HTTPS URL`);
      }
    } catch {
      problems.push(`${key} is not a valid URL`);
    }
  };
  const legal = (prefix) => {
    for (const key of [
      'NAME',
      'ADDRESS',
      'EMAIL',
      'REPRESENTATIVE',
      'PRIVACY_EMAIL',
      'SUPERVISORY_AUTHORITY',
    ])
      need(`${prefix}OPERATOR_${key}`, 'operator/legal details');
  };
  if (['ios', 'android', 'all'].includes(target)) {
    legal('EXPO_PUBLIC_');
    if (env.EXPO_PUBLIC_BACKEND !== 'firebase') problems.push('EXPO_PUBLIC_BACKEND must be firebase');
    if (env.EXPO_PUBLIC_USE_EMULATORS !== 'false') problems.push('EXPO_PUBLIC_USE_EMULATORS must be false');
    if (env.EXPO_PUBLIC_EXPO_GO === '1') problems.push('EXPO_PUBLIC_EXPO_GO=1 enables preview stubs');
    if (env.EXPO_PUBLIC_PAYWALL === 'off') problems.push('EXPO_PUBLIC_PAYWALL=off must not ship');
    if (env.EXPO_PUBLIC_PREVIEW_ROUTING) problems.push('EXPO_PUBLIC_PREVIEW_ROUTING must be unset');
    need('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'Firebase identity');
    need('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'Google Sign-In');
    // Online maps default to OSM/OpenFreeMap without a key. Offline prefetching needs its own approved source.
    if (env.EXPO_PUBLIC_MAP_STYLE_URL) https('EXPO_PUBLIC_MAP_STYLE_URL');
    if (env.EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL) {
      https('EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL');
      try {
        const host = new URL(env.EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL).hostname;
        if (
          ['openfreemap.org', 'openstreetmap.org', 'maplibre.org'].some(
            (domain) => host === domain || host.endsWith(`.${domain}`),
          )
        )
          problems.push('EXPO_PUBLIC_OFFLINE_MAP_STYLE_URL needs a source authorized for offline downloads');
      } catch {
        // The HTTPS validator already reports malformed URLs.
      }
    }
    https('EXPO_PUBLIC_WEB_BASE_URL');
    if (env.EXPO_PUBLIC_LEGAL_BASE_URL !== undefined) https('EXPO_PUBLIC_LEGAL_BASE_URL');
    if (channel === 'beta') {
      need('EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID', 'isolated TestFlight backend');
      if (
        env.EXPO_PUBLIC_FIREBASE_PROJECT_ID === 'tuur-prod' ||
        env.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== env.EXPO_PUBLIC_BETA_FIREBASE_PROJECT_ID
      )
        problems.push('Beta Firebase project must match the explicit beta project and differ from tuur-prod');
    }
    for (const platform of target === 'all' ? ['ios', 'android'] : [target]) {
      const upper = platform.toUpperCase();
      need(
        platform === 'ios' ? 'GOOGLE_SERVICES_INFO_PLIST' : 'GOOGLE_SERVICES_JSON',
        'native Firebase file',
      );
      need(`EXPO_PUBLIC_REVENUECAT_${upper}_KEY`, 'store purchases');
      if (platform === 'ios') {
        need('GOOGLE_IOS_URL_SCHEME', 'Google Sign-In');
        if (env.GOOGLE_IOS_URL_SCHEME === 'com.googleusercontent.apps.tuur')
          problems.push('GOOGLE_IOS_URL_SCHEME is still the placeholder');
      }
      if (channel === 'production') {
        for (const key of [
          `ADMOB_${upper}_APP_ID`,
          'EXPO_PUBLIC_ADMOB_REWARDED_UNIT',
          'EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT',
        ]) {
          need(key, 'production ads');
          if (env[key]?.includes('3940256099942544')) problems.push(`${key} is a Google test ID`);
        }
      }
    }
  }
  if (['web', 'all'].includes(target)) {
    legal('');
    for (const key of [
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_APP_ID',
      'NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY',
    ])
      need(key, 'web configuration');
    https('FUNCTIONS_BASE_URL');
    if (env.NEXT_PUBLIC_USE_EMULATORS === 'true') problems.push('NEXT_PUBLIC_USE_EMULATORS must not be true');
  }
  if (['server', 'all'].includes(target)) {
    for (const [key, expected] of Object.entries({
      TUUR_LLM_PROVIDER: ['gemini'],
      TUUR_TTS_PROVIDER: ['gemini', 'live'],
      TUUR_POI_PROVIDER: ['live'],
      TUUR_ROUTING_PROVIDER: ['openrouteservice'],
      TUUR_GEOCODING_PROVIDER: ['nominatim', 'pelias'],
      ...(channel === 'production' ? { TUUR_PAYMENTS_PROVIDER: ['stripe'] } : {}),
    }))
      if (!expected.includes(env[key])) problems.push(`${key} must select a live provider`);
    need('TUUR_USER_AGENT', 'provider contact');
    if (env.TUUR_GEOCODING_PROVIDER === 'pelias') {
      // HeiGIT has a built-in HTTPS default; custom/self-hosted Pelias endpoints remain configurable.
      if (env.PELIAS_URL) https('PELIAS_URL');
    } else {
      https('NOMINATIM_URL');
      if (env.NOMINATIM_URL?.includes('nominatim.openstreetmap.org'))
        problems.push('Use a production Nominatim endpoint');
    }
    const snapshotTiles = env.TUUR_BETA_SNAPSHOT_TILES?.split(',');
    if (snapshotTiles) {
      if (
        channel !== 'beta' ||
        snapshotTiles.length > 64 ||
        snapshotTiles.some((tile) => !/^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/.test(tile))
      )
        problems.push('OSM snapshot areas must be a bounded beta-only list of six-character geohashes');
    } else https('OVERPASS_ENDPOINT');
    if (env.OVERPASS_ENDPOINT?.includes('overpass-api.de'))
      problems.push('Use a production Overpass endpoint');
    if (env.OVERPASS_ENDPOINT === 'https://api.overspan.dev/api/interpreter') {
      need('OVERPASS_API_KEY', 'server-only Overspan authentication');
      const key = env.OVERPASS_API_KEY?.trim();
      if (key && (key === 'unused' || key.length <= 10))
        problems.push('OVERPASS_API_KEY must be a configured server key');
    }
    if (channel === 'beta') {
      if (env.TUUR_DEPLOYMENT_ENV !== 'beta' || env.TUUR_ALLOW_SANDBOX !== 'true')
        problems.push('Beta billing requires TUUR_DEPLOYMENT_ENV=beta and TUUR_ALLOW_SANDBOX=true');
      need('TUUR_BETA_FIREBASE_PROJECT_ID', 'isolated sandbox backend');
      if (
        env.TUUR_BETA_FIREBASE_PROJECT_ID === 'tuur-prod' ||
        env.TUUR_BETA_FIREBASE_PROJECT_ID !== (env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT)
      )
        problems.push('GCLOUD_PROJECT must match an isolated beta project');
    } else if (env.TUUR_ALLOW_SANDBOX === 'true')
      problems.push('Sandbox billing must not be enabled in production');
  }
  return [...new Set(problems)];
}

export function nativeFirebaseProblems(env, target, read = readFileSync, exists = existsSync) {
  const problems = [];
  for (const platform of target === 'all' ? ['ios', 'android'] : [target]) {
    if (!['ios', 'android'].includes(platform)) continue;
    const key = platform === 'ios' ? 'GOOGLE_SERVICES_INFO_PLIST' : 'GOOGLE_SERVICES_JSON';
    const file = env[key];
    if (!file) continue;
    if (!exists(file)) {
      problems.push(`${key} file does not exist`);
      continue;
    }
    try {
      const content = read(file, 'utf8');
      const plistValue = (name) =>
        new RegExp(`<key>${name}</key>\\s*<string>([^<]+)</string>`).exec(content)?.[1];
      const nativeProject =
        platform === 'ios' ? plistValue('PROJECT_ID') : JSON.parse(content).project_info?.project_id;
      if (!env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || nativeProject !== env.EXPO_PUBLIC_FIREBASE_PROJECT_ID)
        problems.push(`${key} project does not match EXPO_PUBLIC_FIREBASE_PROJECT_ID`);
      if (platform === 'ios') {
        if (plistValue('BUNDLE_ID') !== 'com.tuurapp') problems.push(`${key} bundle ID must be com.tuurapp`);
        if (!plistValue('GOOGLE_APP_ID'))
          problems.push(`${key} is missing GOOGLE_APP_ID for phone verification`);
        const clientId = plistValue('CLIENT_ID');
        const reversedClientId = plistValue('REVERSED_CLIENT_ID');
        if (!clientId || !reversedClientId)
          problems.push(`${key} is missing Google Sign-In client IDs; refresh it after enabling Google Auth`);
        else if (
          reversedClientId !== clientId.split('.').reverse().join('.') ||
          reversedClientId !== env.GOOGLE_IOS_URL_SCHEME
        )
          problems.push(`${key} Google Sign-In client IDs must match GOOGLE_IOS_URL_SCHEME`);
      }
    } catch {
      problems.push(`${key} could not be validated`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name, fallback) =>
    process.argv
      .slice(2)
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')[1] ?? fallback;
  const target = option('target', process.env.EAS_BUILD_PLATFORM ?? 'all');
  const channel = option('channel', process.env.EAS_BUILD_PROFILE === 'testflight' ? 'beta' : 'production');
  const problems = [
    ...releaseProblems(process.env, { target, channel }),
    ...nativeFirebaseProblems(process.env, target),
  ];
  if (problems.length) {
    console.error(`Release check failed (${problems.length}):\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else
    console.log(
      `Release configuration passed (${target}/${channel}); device and service checks remain required.`,
    );
}
