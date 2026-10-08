// Warms OSM areas in the isolated beta so the first listener in a district does not wait for ingestion.
//   node scripts/prefill-beta-areas.mjs --preset=hakenfelde            plan only, no network
//   node scripts/prefill-beta-areas.mjs --preset=hakenfelde,spandau --run --limit=150
//   node scripts/prefill-beta-areas.mjs --preset=hakenfelde --snapshot --run --limit=5000
//       after the presets, continue with every imported tile that has places, nearest to Berlin first
//   node scripts/prefill-beta-areas.mjs --drain                          empty the queue, release its claims
// Presets are processed in the given order, nearest tile first. Uses the same claim rules as ensureArea.
// The ingest worker handles one tile at a time in arrival order, so a bulk run must never fill the queue:
// a listener's own request would wait behind it. Prefill therefore keeps at most MAX_QUEUE_DEPTH tasks
// queued and tops up as the worker progresses (about 26 s per tile), which makes a run last a while.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertBetaProject, cloud, firestoreBase, firestoreFields, projectId, region } from './lib/firebase-beta.mjs';

const root = resolve(import.meta.dirname, '..');
// Bulk work has its own daily counter: it must never use up the allowance listeners' ensureArea calls rely on.
const PREFILL_COUNTER = 'prefillTilesClaimed';
const DAILY_PREFILL_LIMIT = 6000;
const MAX_LIMIT = 5000;
const MAX_QUEUE_DEPTH = 3;
const POLL_MS = 15_000;

export function parseArgs(args) {
  const options = { presets: ['berlin-inner'], limit: 40, run: false, drain: false, snapshot: false };
  for (const arg of args) {
    if (arg === '--run') options.run = true;
    else if (arg === '--snapshot') options.snapshot = true;
    else if (arg === '--drain') options.drain = true;
    else if (arg.startsWith('--preset='))
      options.presets = [...new Set(arg.slice('--preset='.length).split(',').filter(Boolean))];
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.presets.length) throw new Error('--preset needs at least one name');
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
        fieldTransforms: [{ fieldPath: PREFILL_COUNTER, increment: { integerValue: '1' } }],
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

const queueName = () => `projects/${projectId}/locations/${region}/queues/ingestArea`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function listTasks(view) {
  const tasks = [];
  let token = '';
  do {
    const page = await cloud(
      'GET',
      `https://cloudtasks.googleapis.com/v2/${queueName()}/tasks?pageSize=1000&responseView=${view}${token ? `&pageToken=${token}` : ''}`,
    );
    tasks.push(...(page.tasks ?? []));
    token = page.nextPageToken ?? '';
  } while (token);
  return tasks;
}

/** Deletes every queued ingest task and returns their claimed tiles to a claimable state. */
async function drain() {
  const tasks = await listTasks('FULL');
  const tiles = new Set();
  for (const task of tasks) {
    try {
      const body = JSON.parse(Buffer.from(task.httpRequest?.body ?? '', 'base64').toString('utf8'));
      if (typeof body?.data?.geohash === 'string') tiles.add(body.data.geohash);
    } catch {
      // A task without a readable body cannot be matched to a claim; it is still deleted below.
    }
    try {
      await cloud('DELETE', `https://cloudtasks.googleapis.com/v2/${task.name}`);
    } catch (error) {
      // The worker may have finished (and removed) the task since it was listed.
      if (error.status !== 404) throw error;
    }
  }
  let released = 0;
  for (const tile of tiles) {
    const existing = await readDoc(`areas/${tile}`);
    if (existing?.data.status !== 'ingesting') continue;
    await commit([
      {
        update: {
          name: `${documents}/areas/${tile}`,
          fields: firestoreFields({
            status: 'empty',
            ingestAttempts: Math.max(0, Number(existing.data.ingestAttempts ?? 1) - 1),
            updatedAt: Date.now(),
          }),
        },
        // ingestStartedAt is named without a value, which deletes it.
        updateMask: { fieldPaths: ['status', 'ingestAttempts', 'updatedAt', 'ingestStartedAt'] },
        currentDocument: { updateTime: existing.updateTime },
      },
    ]);
    released++;
  }
  console.log(JSON.stringify({ mode: 'drain', deletedTasks: tasks.length, releasedClaims: released }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { PREFILL_PRESETS, prefillTiles, canClaimForPrefill, snapshotPrefillOrder } = await loadPlanner();
  const unknown = options.presets.filter((name) => !PREFILL_PRESETS[name]);
  if (unknown.length)
    throw new Error(`Unknown preset ${unknown.join(', ')}. Available: ${Object.keys(PREFILL_PRESETS).join(', ')}`);
  // Presets keep their order; a tile that belongs to an earlier preset is not repeated.
  const seen = new Set();
  const plan = options.presets.map((name) => {
    const preset = PREFILL_PRESETS[name];
    const tiles = prefillTiles(preset.bounds, preset.center).filter((tile) => !seen.has(tile));
    tiles.forEach((tile) => seen.add(tile));
    return { name, tiles };
  });
  if (options.snapshot) {
    const imported = [];
    let token = '';
    do {
      const page = await cloud(
        'GET',
        `${firestoreBase}/osmTiles?pageSize=1000&mask.fieldPaths=sights${token ? `&pageToken=${token}` : ''}`,
      );
      for (const doc of page.documents ?? [])
        imported.push({ id: doc.name.split('/').pop(), sights: Number(doc.fields?.sights?.integerValue ?? 0) });
      token = page.nextPageToken ?? '';
    } while (token);
    const rest = snapshotPrefillOrder(imported, PREFILL_PRESETS['berlin-inner'].center).filter(
      (tile) => !seen.has(tile),
    );
    rest.forEach((tile) => seen.add(tile));
    plan.push({ name: 'snapshot', tiles: rest });
  }
  const tiles = plan.flatMap((entry) => entry.tiles);

  if (options.drain) {
    await assertBetaProject();
    await drain();
    return;
  }
  if (!options.run) {
    console.log(
      JSON.stringify(
        {
          mode: 'plan_only_no_network',
          presets: plan.map((entry) => ({ name: entry.name, tiles: entry.tiles.length, first: entry.tiles.slice(0, 3) })),
          totalTiles: tiles.length,
          limit: options.limit,
          estimatedMinutes: Math.round((Math.min(tiles.length, options.limit) * 26) / 60),
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
  const claimedToday = Number(counter?.data[PREFILL_COUNTER] ?? 0);
  if (claimedToday + options.limit > DAILY_PREFILL_LIMIT)
    throw new Error(`Daily prefill allowance too low (${claimedToday}/${DAILY_PREFILL_LIMIT} claimed today)`);

  const counts = { queued: 0, skipped: 0, failed: 0 };
  for (const tile of tiles) {
    if (counts.queued >= options.limit) break;
    const existing = await readDoc(`areas/${tile}`);
    if (!canClaimForPrefill(existing?.data, Date.now())) {
      counts.skipped++;
      continue;
    }
    // Leave room for listeners: their requests join the same first-in-first-out queue.
    while ((await listTasks('BASIC')).length >= MAX_QUEUE_DEPTH) await sleep(POLL_MS);
    const now = Date.now();
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
      await cloud('POST', `https://cloudtasks.googleapis.com/v2/${queueName()}/tasks`, {
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
      if (counts.queued % 10 === 0) console.error(`queued ${counts.queued}/${Math.min(options.limit, tiles.length)}`);
    } catch (error) {
      counts.failed++;
      await release(tile, `enqueue failed: ${error.message}`);
      // A permission or queue problem repeats for every tile: stop instead of failing the whole district.
      if (error.status === 403 || error.status === 404) throw error;
    }
  }
  console.log(JSON.stringify({ mode: 'run', presets: options.presets, totalTiles: tiles.length, ...counts }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
