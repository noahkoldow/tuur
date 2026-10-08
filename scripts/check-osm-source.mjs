// Read-only, one-request source check. Default prints the plan without contacting any service.
// node scripts/check-osm-source.mjs --endpoint=https://overpass.private.coffee/api/interpreter
// Add --run to query; optionally --output=.firebase/osm-source-check.json to save the non-secret report.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const sample = Object.freeze({
  name: 'Paris, Louvre surroundings (public sample, not the device location)',
  bounds: Object.freeze({ south: 48.859, west: 2.333, north: 48.862, east: 2.338 }),
});

const limitations =
  'One public sample only. Accessibility uses OSM tags, not an on-site check. This does not verify Firebase ingestion, routing, narration or worldwide availability.';

export function validateEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Provide an explicit --endpoint=https://host/api/interpreter.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/api/interpreter', '/osm/tools/overpass/api/interpreter'].includes(url.pathname)
  )
    throw new Error('Use a public HTTPS interpreter endpoint without credentials, keys or query parameters.');
  return url.href;
}

export function parseArgs(args) {
  const options = { run: false };
  const seen = new Set();
  for (const arg of args) {
    const key = arg.split('=', 1)[0];
    if (seen.has(key)) throw new Error('Duplicate command option.');
    seen.add(key);
    if (arg === '--run') options.run = true;
    else if (arg.startsWith('--endpoint=')) options.endpoint = validateEndpoint(arg.slice(11));
    else if (arg.startsWith('--output=') && arg.slice(9).trim()) options.output = arg.slice(9);
    else
      throw new Error(
        'Supported options: --endpoint=https://host/api/interpreter, --run, --output=report.json.',
      );
  }
  if (!options.endpoint) throw new Error('An explicit --endpoint=https://host/api/interpreter is required.');
  return options;
}

export function sourceCheckPlan(endpoint) {
  return {
    status: 'planned',
    endpoint: validateEndpoint(endpoint),
    sample,
    requests: 1,
    method: 'POST',
    timeoutMs: 70_000,
    maximumResponseBytes: 4 * 1024 * 1024,
    retries: 0,
    check:
      'Real fetchOverpass adapter, then app POI merge/classification/access checks; at least one named accessible candidate must remain inside the sample bounds.',
    action: 'Add --run to make this single query after checking the endpoint usage policy.',
    limitations,
  };
}

let adapterPromise;
/** Compile the actual app code in memory; no Firebase initialization, credentials or generated files. */
export function loadAdapter() {
  adapterPromise ??= (async () => {
    const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
    const { build } = requireFunctions('esbuild');
    const built = await build({
      stdin: {
        contents: `
          export { fetchOverpass } from './functions/src/providers/overpass';
          export { buildPois, countQualityPois, PoiSchema, statusForIngest } from './packages/shared/src';
        `,
        resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        sourcefile: 'osm-source-smoke.ts',
        loader: 'ts',
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      // A known public identity, independent of shell secrets or deployment environment files.
      define: {
        'process.env.TUUR_USER_AGENT': JSON.stringify('tuur-osm-source-check/1.0 (+https://tuur.app)'),
      },
      logLevel: 'silent',
    });
    return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  })();
  return adapterPromise;
}

function safeFailure(error) {
  if (Number.isInteger(error?.status)) return { code: 'http_error', httpStatus: error.status };
  if (Number.isFinite(error?.retryAfterMs)) return { code: 'rate_limited', retryAfterMs: error.retryAfterMs };
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return { code: 'timeout' };
  if (error?.message === 'Overpass response exceeds the byte limit') return { code: 'response_too_large' };
  if (error?.message === 'Overpass returned invalid JSON') return { code: 'invalid_json' };
  if (error?.message === 'Overpass returned incomplete or invalid POI data')
    return { code: 'incomplete_or_invalid_response' };
  if (error?.name === 'ZodError') return { code: 'invalid_app_poi' };
  return { code: 'source_check_failed' };
}

export async function runSourceCheck({ endpoint, adapter, now = Date.now }) {
  const plan = sourceCheckPlan(endpoint);
  const started = now();
  const report = {
    endpoint: plan.endpoint,
    sample,
    startedAt: new Date(started).toISOString(),
    status: 'failed',
    limitations,
  };
  try {
    const runtime = adapter ?? (await loadAdapter());
    const raw = await runtime.fetchOverpass(plan.endpoint, sample.bounds);
    const b = sample.bounds;
    // Match ingestion: centers returned for intersecting ways can lie outside the requested tile.
    const inside = raw.filter(
      (poi) =>
        poi.location.lat >= b.south &&
        poi.location.lat < b.north &&
        poi.location.lng >= b.west &&
        poi.location.lng < b.east,
    );
    const { pois } = runtime.buildPois(inside, { now: now(), precision: 6 });
    const validated = pois.map((poi) => runtime.PoiSchema.parse(poi));
    const eligible = validated.filter(
      (poi) => poi.name.trim() && poi.accessible && !poi.hidden && poi.interests.length > 0,
    );
    report.rawPoiCount = raw.length;
    report.inBoundsPoiCount = inside.length;
    report.appPoiCount = validated.length;
    report.namedAccessiblePoiCount = eligible.length;
    report.qualityPoiCount = runtime.countQualityPois(validated);
    report.areaStatus = runtime.statusForIngest(validated);
    report.examples = eligible.slice(0, 8).map((poi) => ({
      id: poi.id,
      name: poi.name.replace(/\p{Cc}/gu, '').slice(0, 120),
      interests: poi.interests,
    }));
    if (eligible.length) report.status = 'passed';
    else report.failure = { code: raw.length ? 'no_eligible_app_pois' : 'no_named_source_pois' };
  } catch (error) {
    report.failure = safeFailure(error);
  }
  report.elapsedMs = Math.max(0, now() - started);
  return report;
}

async function saveReport(output, report) {
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true });
  // A report path must be new; accidentally naming a source file must not overwrite it.
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}

export async function main(args, { emit = console.log, save = saveReport, check = runSourceCheck } = {}) {
  const options = parseArgs(args);
  const report = options.run ? await check(options) : sourceCheckPlan(options.endpoint);
  if (options.output) await save(options.output, report);
  emit(JSON.stringify(report, null, 2));
  return report.status === 'failed' ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch {
    // Never echo arbitrary arguments, endpoint credentials or upstream response text.
    console.error(
      'OSM source check could not start or save its report. Use --endpoint=https://host/api/interpreter [--run] [--output=new-report.json].',
    );
    process.exitCode = 1;
  }
}
