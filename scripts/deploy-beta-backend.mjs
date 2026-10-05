import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { assertBetaProject, projectId } from './lib/firebase-beta.mjs';
import { releaseProblems } from './check-release.mjs';

// Explicitly excludes ingestion/tasks, schedulers, partner billing and admin endpoints.
export const endpoints = [
  'ensureArea',
  'getNarration',
  'getTransition',
  'reportNarration',
  'generateAutoTours',
  'composePlannedRoute',
  'getWalkingRoute',
  'getTeaser',
  'selectNearby',
  'spendCredit',
  'claimTourStart',
  'prepareTourDownload',
  'recordPurchaseConsent',
  'createInvite',
  'redeemInvite',
  'createRewardNonce',
  'invitePreview',
  'getOffers',
  'recordVisit',
  'recordPartnerEvent',
  'submitPartnerApplication',
  'createTourGroup',
  'joinTourGroup',
  'addTourGroupSeat',
  'leaveTourGroup',
  'deleteAccount',
  'exportMyData',
];
const root = resolve(import.meta.dirname, '..');
const requested =
  process.argv
    .find((arg) => arg.startsWith('--functions='))
    ?.slice('--functions='.length)
    .split(',') ?? endpoints;
if (!requested.length || requested.some((name) => !endpoints.includes(name)))
  throw new Error('Requested functions must belong to the reviewed consumer allowlist');
process.chdir(root);
const require = createRequire(import.meta.url);
const env = parseEnv(readFileSync(`functions/deploy/.env.${projectId}`, 'utf8'));
if (Object.keys(env).some((key) => /(?:SECRET|API_KEY|TOKEN)$/.test(key)))
  throw new Error('Provider secrets must be in Secret Manager, not the deployment env file');
const problems = releaseProblems(
  { ...env, GCLOUD_PROJECT: projectId },
  { target: 'server', channel: 'beta' },
);
if (problems.length) throw new Error(problems.join('\n'));
if (!env.TUUR_BETA_SNAPSHOT_TILES || !env.TUUR_CORE_SERVICE_ACCOUNT || !env.TUUR_AI_SERVICE_ACCOUNT)
  throw new Error('Bounded beta snapshot and explicit runtime identities are required');
Object.assign(process.env, env, { DEBUG: '', GCLOUD_PROJECT: projectId, FUNCTIONS_EMULATOR: 'false' });
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const run = (args, cwd = root) => {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) throw new Error(`Command failed (exit ${result.status})`);
};
run(['build.mjs'], resolve(root, 'functions'));
const { loadStack } = require(
  resolve(root, 'functions/node_modules/firebase-functions/lib/runtime/loader.js'),
);
const { stackToWire } = require(
  resolve(root, 'functions/node_modules/firebase-functions/lib/runtime/manifest.js'),
);
const stack = JSON.parse(JSON.stringify(stackToWire(await loadStack(resolve(root, 'functions/deploy')))));
const selected = Object.fromEntries(
  endpoints.map((name) => {
    if (!stack.endpoints[name]?.callableTrigger && !stack.endpoints[name]?.httpsTrigger)
      throw new Error(`Unexpected or missing endpoint: ${name}`);
    return [name, stack.endpoints[name]];
  }),
);
const secrets = new Set(
  Object.values(selected).flatMap((fn) => (fn.secretEnvironmentVariables ?? []).map((s) => s.key)),
);
if ([...secrets].some((key) => !['GEMINI_API_KEY', 'ORS_API_KEY'].includes(key)))
  throw new Error('Unexpected provider secret in beta consumer backend');
const manifest = {
  specVersion: stack.specVersion,
  endpoints: selected,
  params: stack.params.filter((p) => p.type !== 'secret' || secrets.has(p.name)),
  requiredAPIs: [],
};
const proof = resolve(root, '.firebase/beta-backend-manifest.json');
writeFileSync(proof, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Prepared ${endpoints.length} endpoints for ${projectId}; providers: ${[...secrets].join(', ')}. No ingestion or store upload.`,
);
if (!process.argv.includes('--apply')) {
  console.log('Local manifest prepared. Pass --apply to deploy this explicit beta subset.');
} else {
  await assertBetaProject();
  const manifestPath = resolve(root, 'functions/deploy/functions.yaml');
  if (existsSync(manifestPath)) throw new Error('Refusing to overwrite an existing functions.yaml');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  try {
    run([
      'node_modules/firebase-tools/lib/bin/firebase.js',
      'deploy',
      '--project',
      projectId,
      '--only',
      requested.map((name) => `functions:${name}`).join(','),
      '--non-interactive',
    ]);
  } finally {
    unlinkSync(manifestPath);
  }
}
