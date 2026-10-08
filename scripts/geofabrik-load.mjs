// Loads the places extracted by scripts/geofabrik-extract.py into the isolated beta (Firestore osmTiles).
//   node scripts/geofabrik-load.mjs --input=places.jsonl --poly=brandenburg.poly            plan, no network
//   node scripts/geofabrik-load.mjs --input=... --poly=... --run                           import
// One document per six-character tile holds the gzip-compressed Overpass-shaped elements; a `_meta` document,
// written last, declares the covered region. Until `_meta` exists the worker keeps using Overpass, so a partial
// or interrupted import never makes the app believe a tile is empty. Re-running replaces tiles and removes
// tiles that no longer have data. The deployed worker reads these documents (functions/src/providers/osmSnapshot.ts).
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertBetaProject, cloud, firestoreBase, projectId } from './lib/firebase-beta.mjs';

const DOCUMENT_LIMIT_BYTES = 900_000;
const BATCH_BYTES = 4_000_000;
const BATCH_WRITES = 40;
const documents = `projects/${projectId}/databases/(default)/documents`;

export function parseArgs(args) {
  const options = { run: false };
  for (const arg of args) {
    if (arg === '--run') options.run = true;
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length);
    else if (arg.startsWith('--poly=')) options.poly = arg.slice('--poly='.length);
    else if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length);
    else if (arg.startsWith('--extracted-at=')) options.extractedAt = arg.slice('--extracted-at='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input || !options.poly) throw new Error('--input=<places.jsonl> and --poly=<region.poly> are required');
  if (options.extractedAt && Number.isNaN(Date.parse(options.extractedAt)))
    throw new Error('--extracted-at must be an ISO date-time');
  return options;
}

/** Osmosis .poly: a name, then sections "name ... END"; a leading "!" marks a hole. Returns [lng, lat] rings. */
export function parsePoly(text) {
  const rings = [];
  let current;
  let named = false;
  for (const raw of text.split(/\r?\n/).map((line) => line.trim())) {
    if (!raw) continue;
    if (!named) named = true; // the first line is the file's own name
    else if (raw === 'END') {
      if (current) rings.push(current.points);
      current = undefined;
    } else if (!current && /^!?[A-Za-z0-9_]+$/.test(raw)) current = { points: [] };
    else if (current) {
      const [lng, lat] = raw.split(/\s+/).map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`Invalid polygon point: ${raw}`);
      current.points.push([lng, lat]);
    }
  }
  if (!rings.length || rings.some((ring) => ring.length < 3)) throw new Error('The polygon file has no usable ring');
  return rings;
}

export function ringsBounds(rings) {
  const points = rings.flat();
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return { south: Math.min(...lats), west: Math.min(...lngs), north: Math.max(...lats), east: Math.max(...lngs) };
}

/** Groups the JSON lines by their tile without parsing them again. */
export async function groupByTile(file) {
  const tiles = new Map();
  const sights = new Map();
  let lines = 0;
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const match = /"tile":"([0-9bcdefghjkmnpqrstuvwxyz]{6})"/.exec(line);
    if (!match) throw new Error('A line without a valid tile was found; run the current extractor');
    (tiles.get(match[1]) ?? tiles.set(match[1], []).get(match[1])).push(line);
    if (line.includes('"role":"sight"')) sights.set(match[1], (sights.get(match[1]) ?? 0) + 1);
    lines++;
  }
  return { tiles, sights, lines };
}

const encode = (lines) => gzipSync(Buffer.from(`[${lines.join(',')}]`, 'utf8'));

const commit = (writes) => cloud('POST', `https://firestore.googleapis.com/v1/${documents}:commit`, { writes });

async function existingTileIds() {
  const ids = [];
  let token = '';
  do {
    const page = await cloud(
      'GET',
      `${firestoreBase}/osmTiles?pageSize=1000&mask.fieldPaths=count${token ? `&pageToken=${token}` : ''}`,
    );
    for (const doc of page.documents ?? []) ids.push(doc.name.split('/').pop());
    token = page.nextPageToken ?? '';
  } while (token);
  return ids;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rings = parsePoly(readFileSync(options.poly, 'utf8'));
  const coverage = ringsBounds(rings);
  const extractedAt = options.extractedAt ?? statSync(options.input).mtime.toISOString();
  const source = options.source ?? 'geofabrik brandenburg-latest (incl. Berlin)';
  const { tiles, sights, lines } = await groupByTile(options.input);

  const payloads = new Map();
  let compressedBytes = 0;
  let largest = { tile: '', bytes: 0 };
  for (const [tile, tileLines] of tiles) {
    const data = encode(tileLines);
    if (data.length > DOCUMENT_LIMIT_BYTES) throw new Error(`Tile ${tile} is too large (${data.length} bytes compressed)`);
    payloads.set(tile, { data, count: tileLines.length, sights: sights.get(tile) ?? 0 });
    compressedBytes += data.length;
    if (data.length > largest.bytes) largest = { tile, bytes: data.length };
  }

  if (!options.run) {
    console.log(
      JSON.stringify(
        {
          mode: 'plan_only_no_network',
          elements: lines,
          tiles: tiles.size,
          tilesWithSights: sights.size,
          compressedMegabytes: Math.round(compressedBytes / 1e4) / 100,
          largestTile: largest,
          coverage,
          polygonRings: rings.length,
          extractedAt,
          note: 'Add --run to import into the beta project.',
        },
        null,
        2,
      ),
    );
    return;
  }

  await assertBetaProject();
  const wanted = new Set(payloads.keys());
  let batch = [];
  let batchBytes = 0;
  let written = 0;
  const flush = async () => {
    if (!batch.length) return;
    await commit(batch);
    written += batch.length;
    if (written % 400 < batch.length) console.error(`written ${written}/${payloads.size}`);
    batch = [];
    batchBytes = 0;
  };
  for (const [tile, { data, count, sights: sightCount }] of payloads) {
    batch.push({
      update: {
        name: `${documents}/osmTiles/${tile}`,
        fields: {
          data: { bytesValue: data.toString('base64') },
          count: { integerValue: String(count) },
          sights: { integerValue: String(sightCount) },
          extractedAt: { stringValue: extractedAt },
        },
      },
    });
    batchBytes += data.length * 1.4;
    if (batch.length >= BATCH_WRITES || batchBytes >= BATCH_BYTES) await flush();
  }
  await flush();

  // Tiles that lost all relevant data since the previous import must not keep serving old places.
  const stale = (await existingTileIds()).filter((id) => id !== '_meta' && !wanted.has(id));
  for (let i = 0; i < stale.length; i += 200)
    await commit(stale.slice(i, i + 200).map((id) => ({ delete: `${documents}/osmTiles/${id}` })));

  // Coverage is declared only now: until this write the worker keeps asking Overpass.
  await commit([
    {
      update: {
        name: `${documents}/osmTiles/_meta`,
        fields: {
          coverage: {
            mapValue: {
              fields: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, { doubleValue: v }])),
            },
          },
          polygon: {
            arrayValue: {
              values: rings.map((ring) => ({
                mapValue: {
                  fields: {
                    p: { arrayValue: { values: ring.flatMap(([lng, lat]) => [{ doubleValue: lng }, { doubleValue: lat }]) } },
                  },
                },
              })),
            },
          },
          extractedAt: { stringValue: extractedAt },
          source: { stringValue: source },
          tiles: { integerValue: String(payloads.size) },
        },
      },
    },
  ]);
  console.log(JSON.stringify({ mode: 'run', tilesWritten: payloads.size, staleTilesDeleted: stale.length, extractedAt }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
