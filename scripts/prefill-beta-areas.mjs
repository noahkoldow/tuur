// Warms OSM areas in the isolated beta so the first listener in a district does not wait for ingestion.
//   node scripts/prefill-beta-areas.mjs                      plan only, no network
//   node scripts/prefill-beta-areas.mjs --run --limit=40     claim and queue up to 40 tiles, nearest first
// Uses the same claim rules as ensureArea (shared decideClaim) and the deployed ingestArea queue.
// Re-running is safe: ready, locked and freshly queued tiles are skipped. Tiles are queued for the serial
// worker (one at a time), so --limit also bounds how long the queue stays busy (about 40 s per tile).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertBetaProject, cloud, firestoreBase, firestoreFields, projectId, region } from './lib/firebase-beta.mjs';

const root = resolve(import.meta.dirname, '..');
const DAILY_CLAIM_LIMIT = 1500;
const MAX_LIMIT = 200;

export function parseArgs(args) {
  const options = { preset: 'berlin-inner', limit: 40, run: false };
  for (const arg of args) {
    if (arg === '--run') options.run = true;
    else if (arg.startsWith('--preset=')) options.preset = arg.slice('--preset='.length);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT)
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`);
  return options;
}

/** Bundles the TypeScript planner with the workspace packages and loads it. */
async function loadPlanner() {
  const require = createRequire(resolve(root, 'functions/package.json'));
  const { build } = require('esbuild');
  const result = await build({
    entryPoints: [resolve(root, 'functions/src/area/prefill.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const decode = (value) => {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value)
    return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, decode(v)]));
  return undefined;
};
const decodeDoc = (doc) => Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)]));

async function readDoc(path) {
  try {
    const doc = await cloud('GET', `${firestoreBase}/${path}`);
    return { data: decodeDoc(doc), updateTime: doc.updateTime };
  } catch (error) {
    if (error.status === 404) return undefined;
    throw error;
  }
}

const documents = `projects/${projectId}/databases/(default)/documents`;
const commit = (writes) =>
  cloud('POST', `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    writes,
  });

async function claim(tile, existing, now, day) {
  const attempts = Number(existing?.data.ingestAttempts ?? 0) + 1;
  const fields = { status: 'ingesting', ingestStartedAt: now, ingestAttempts: attempts, updatedAt: now };
  const area = existing
    ? {
        update: { name: `${documents}/areas/${tile}`, fields: firestoreFields(fields) },
        // error and ingestRetryAt are named in the mask without a value, which deletes them.
        updateMask: { fieldPaths: [...Object.keys(fields), 'error', 'ingestRetryAt'] },
        currentDocument: { updateTime: existing.updateTime },
      }
    : {
        update: {
          name: `${documents}/areas/${tile}`,
          fields: firestoreFields({ geohash: tile, createdAt: now, ...fields }),
        },
        currentDocument: { exists: false },
      };
  await commit([
    area,
    {
      transform: {
        document: `${documents}/usageDaily/${day}`,
        fieldTransforms: [{ fieldPath: 'tilesClaimed', increment: { integerValue: '1' } }],
      },
    },
  ]);
}

async function release(tile, message) {
  await commit([
    {
      update: {
        name: `${documents}/areas/${tile}`,
        fields: firestoreFields({ status: 'failed', error: message.slice(0, 500), updatedAt: Date.now() }),
      },
      updateMask: { fieldPaths: ['status', 'error', 'updatedAt'] },
    },
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { PREFILL_PRESETS, prefillTiles, canClaimForPrefill } = await loadPlanner();
  const preset = PREFILL_PRESETS[options.preset];
  if (!preset) throw new Error(`Unknown preset. Available: ${Object.keys(PREFILL_PRESETS).join(', ')}`);
  const tiles = prefillTiles(preset.bounds, preset.center);
  if (!options.run) {
    console.log(
      JSON.stringify(
        {
          mode: 'plan_only_no_network',
          preset: preset.name,
          tiles: tiles.length,
          firstTiles: tiles.slice(0, 5),
          limitPerRun: options.limit,
          runsNeeded: Math.ceil(tiles.length / options.limit),
          note: 'Add --run to claim and queue tiles in the beta project.',
        },
        null,
        2,
      ),
    );
    return;
  }

  await assertBetaProject();
  const env = parseEnv(readFileSync(resolve(root, `functions/deploy/.env.${projectId}`), 'utf8'));
  const invoker = env.TUUR_CORE_SERVICE_ACCOUNT;
  if (!invoker?.endsWith(`@${projectId}.iam.gserviceaccount.com`))
    throw new Error('A beta core service account is required to authenticate queued tasks');
  const worker = await cloud(
    'GET',
    `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${region}/functions/ingestArea`,
  );
  const url = worker.serviceConfig?.uri;
  if (worker.state !== 'ACTIVE' || !url) throw new Error('The ingestArea worker is not active');

  const day = new Date().toISOString().slice(0, 10);
  const counter = await readDoc(`usageDaily/${day}`);
  const claimedToday = Number(counter?.data.tilesClaimed ?? 0);
  if (claimedToday + options.limit > DAILY_CLAIM_LIMIT)
    throw new Error(`Daily tile allowance too low (${claimedToday}/${DAILY_CLAIM_LIMIT} claimed today)`);

  const queue = `projects/${projectId}/locations/${region}/queues/ingestArea`;
  const counts = { queued: 0, skipped: 0, failed: 0 };
  for (const tile of tiles) {
    if (counts.queued >= options.limit) break;
    const existing = await readDoc(`areas/${tile}`);
    const now = Date.now();
    if (!canClaimForPrefill(existing?.data, now)) {
      counts.skipped++;
      continue;
    }
    try {
      await claim(tile, existing, now, day);
    } catch (error) {
      // Another writer (a listener's ensureArea) claimed it first: that tile is already being handled.
      if (error.status === 409 || error.status === 400) {
        counts.skipped++;
        continue;
      }
      throw error;
    }
    try {
      await cloud('POST', `https://cloudtasks.googleapis.com/v2/${queue}/tasks`, {
        task: {
          httpRequest: {
            httpMethod: 'POST',
            url,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ data: { geohash: tile } })).toString('base64'),
            oidcToken: { serviceAccountEmail: invoker, audience: url },
          },
          dispatchDeadline: '540s',
        },
      });
      counts.queued++;
    } catch (error) {
      counts.failed++;
      await release(tile, `enqueue failed: ${error.message}`);
      // A permission or queue problem repeats for every tile: stop instead of failing the whole district.
      if (error.status === 403 || error.status === 404) throw error;
    }
  }
  console.log(JSON.stringify({ mode: 'run', preset: preset.name, tilesInPreset: tiles.length, ...counts }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
