import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { assertBetaProject, cloud, firestoreBase, firestoreFields } from './lib/firebase-beta.mjs';

process.chdir(resolve(import.meta.dirname, '..'));
const raw = readFileSync('.firebase/beta-osm/seed.json');
const hash = createHash('sha256').update(raw).digest('hex');
// Pin the reviewed data, including original OSM IDs, attribution and restricted beta coverage.
if (hash !== '1e976ef9e2a1d4f273d14ce431a57c03a3e922972d8ab2c0df63939f0c6e6ebd')
  throw new Error('Snapshot differs from the reviewed Berlin beta seed');
const seed = JSON.parse(raw);
if (seed.documents.length !== 28 || seed.coverage.placeId !== 'DE_berlin-beta-mitte')
  throw new Error('Unexpected snapshot scope');
console.log(
  `Reviewed snapshot: ${seed.documents.length} documents, ${seed.coverage.tiles.length} tiles; SHA256 ${hash}`,
);
if (!process.argv.includes('--apply')) {
  console.log('No Cloud changes. --apply creates the snapshot atomically without overwriting documents.');
} else {
  await assertBetaProject();
  const documents = [
    ...seed.documents,
    {
      path: 'config/betaSnapshot',
      data: {
        coverage: seed.coverage,
        provenance: seed.provenance,
        curation: seed.curation,
        seedSha256: hash,
      },
    },
  ];
  const nameBase = firestoreBase.replace('https://firestore.googleapis.com/v1/', '');
  await cloud('POST', `${firestoreBase}:commit`, {
    writes: documents.map((doc) => ({
      update: { name: `${nameBase}/${doc.path}`, fields: firestoreFields(doc.data) },
      currentDocument: { exists: false },
    })),
  });
  console.log(
    `Created ${documents.length} beta documents, including provenance. No existing data overwritten.`,
  );
}
