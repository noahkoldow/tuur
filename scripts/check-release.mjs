// Release gate: fails while anything a store submission or production deploy needs is still missing or a test value.
// Usage: node scripts/check-release.mjs   (reads the current environment; load your .env.production first)
const env = process.env;
const problems = [];
const need = (name, why) => {
  if (!env[name] || !env[name].trim()) problems.push(`${name} is not set (${why})`);
};

// legal texts (shown in app and web; the texts print a marker for every missing value)
for (const n of ['NAME', 'ADDRESS', 'EMAIL', 'REPRESENTATIVE', 'PRIVACY_EMAIL', 'SUPERVISORY_AUTHORITY']) {
  need(`EXPO_PUBLIC_OPERATOR_${n}`, 'legal texts in the app');
  need(`OPERATOR_${n}`, 'legal texts on the website');
}

// backend / app
if (env.EXPO_PUBLIC_BACKEND === 'demo')
  problems.push('EXPO_PUBLIC_BACKEND=demo must not be used in a release');
if (env.EXPO_PUBLIC_USE_EMULATORS === 'true')
  problems.push('EXPO_PUBLIC_USE_EMULATORS=true must not be used in a release');
need('GOOGLE_SERVICES_JSON', 'Android Firebase config (path)');
need('GOOGLE_SERVICES_INFO_PLIST', 'iOS Firebase config (path)');
need('GOOGLE_IOS_URL_SCHEME', 'Google Sign-In on iOS');
need('EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'purchases');
need('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'purchases');
for (const n of [
  'ADMOB_ANDROID_APP_ID',
  'ADMOB_IOS_APP_ID',
  'EXPO_PUBLIC_ADMOB_REWARDED_UNIT',
  'EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT',
]) {
  need(n, 'ads');
  if ((env[n] ?? '').includes('3940256099942544')) problems.push(`${n} is a Google test id`);
}
need('EXPO_PUBLIC_MAP_STYLE_URL', 'map style (https://<web>/map-style.json)');
need('EXPO_PUBLIC_WEB_BASE_URL', 'links to legal pages and invites');

// web
need('NEXT_PUBLIC_FIREBASE_API_KEY', 'web Firebase config');
need('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'web Firebase config');
need('NEXT_PUBLIC_FIREBASE_APP_ID', 'web Firebase config');
need('MAPTILER_KEY', '/map-style.json');
need('FUNCTIONS_BASE_URL', 'invite landing page');
if (env.NEXT_PUBLIC_USE_EMULATORS === 'true')
  problems.push('NEXT_PUBLIC_USE_EMULATORS=true must not be used in a release');

if (problems.length) {
  console.error(`Release check failed (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Release check passed. Now walk through docs/RELEASE.md for the manual items.');
