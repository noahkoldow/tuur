import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { assertBetaProject, projectId } from './lib/firebase-beta.mjs';

// Deliberately separate from consumer deployment: this scheduler irreversibly deletes
// only expired feedback (365 days), usage logs (90 days), and admin audit (730 days).
// Default invocation prepares the exact single-endpoint manifest; --apply deploys it.
const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const env = parseEnv(readFileSync(resolve(root, `functions/deploy/.env.${projectId}`), 'utf8'));
if (Object.keys(env).some((key) => /(?:SECRET|API_KEY|TOKEN)$/.test(key)))
  throw new Error('Secrets must not be supplied through a deployment env file');
if (!env.TUUR_CORE_SERVICE_ACCOUNT) throw new Error('The dedicated beta runtime identity is required');
Object.assign(process.env, env, { GCLOUD_PROJECT: projectId, FUNCTIONS_EMULATOR: 'false', DEBUG: '' });
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
const endpoint = stack.endpoints.retentionPurge;
if (!endpoint?.scheduleTrigger || endpoint.secretEnvironmentVariables?.length)
  throw new Error('Expected only the secret-free retention scheduler');
const manifest = {
  specVersion: stack.specVersion,
  endpoints: { retentionPurge: endpoint },
  params: stack.params.filter((parameter) => parameter.type !== 'secret'),
  requiredAPIs: [{ api: 'cloudscheduler.googleapis.com', reason: 'Daily privacy retention purge' }],
};
writeFileSync(
  resolve(root, '.firebase/beta-retention-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log('Prepared retentionPurge only: feedback 365 days, usage logs 90 days, admin audit 730 days.');
if (!process.argv.includes('--apply')) {
  console.log(
    'No deployment. Review the manifest; --apply deploys this irreversible scheduled deletion policy.',
  );
} else {
  await assertBetaProject();
  const path = resolve(root, 'functions/deploy/functions.yaml');
  if (existsSync(path)) throw new Error('Refusing to overwrite an existing functions.yaml');
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  try {
    run([
      'node_modules/firebase-tools/lib/bin/firebase.js',
      'deploy',
      '--project',
      projectId,
      '--only',
      'functions:retentionPurge',
      '--non-interactive',
    ]);
  } finally {
    unlinkSync(path);
  }
}
