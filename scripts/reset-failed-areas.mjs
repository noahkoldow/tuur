// Makes tiles that failed only because a provider quota was exhausted claimable again in the isolated beta.
//   node scripts/reset-failed-areas.mjs           plan: counts the affected tiles, changes nothing
//   node scripts/reset-failed-areas.mjs --run     status -> empty, retry deadline removed
// Use it after deploying a worker that no longer fails a tile on a geocoding quota (ingest.ts resolvePlace).
// The next listener request (ensureArea) or a prefill run then ingests them again.
import { assertBetaProject, cloud, firestoreBase, firestoreFields, projectId } from './lib/firebase-beta.mjs';

const run = process.argv.includes('--run');
const text = (value) => value?.stringValue;

await assertBetaProject();
const failed = [];
let token = '';
do {
  const page = await cloud(
    'GET',
    `${firestoreBase}/areas?pageSize=300&mask.fieldPaths=status&mask.fieldPaths=error${token ? `&pageToken=${token}` : ''}`,
  );
  for (const doc of page.documents ?? [])
    if (text(doc.fields?.status) === 'failed' && text(doc.fields?.error) === 'rate_limited')
      failed.push({ tile: doc.name.split('/').pop(), updateTime: doc.updateTime });
  token = page.nextPageToken ?? '';
} while (token);

let reset = 0;
if (run) {
  for (const { tile, updateTime } of failed) {
    await cloud('PATCH', `${firestoreBase}/areas/${tile}?currentDocument.updateTime=${encodeURIComponent(updateTime)}&updateMask.fieldPaths=status&updateMask.fieldPaths=ingestRetryAt&updateMask.fieldPaths=error&updateMask.fieldPaths=updatedAt`, {
      fields: firestoreFields({ status: 'empty', updatedAt: Date.now() }),
    });
    reset++;
  }
}
console.log(JSON.stringify({ project: projectId, mode: run ? 'run' : 'plan', rateLimitedTiles: failed.length, reset }, null, 2));
