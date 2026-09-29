// Copies brand assets the web app serves (favicons + SVG logos) into apps/web/public/brand.
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(repo, 'apps', 'web', 'public', 'brand');
mkdirSync(dest, { recursive: true });
for (const dir of ['logo', 'mark', 'app'])
  cpSync(join(repo, 'assets', 'brand', dir), dest, { recursive: true });

// MapLibre's web worker is served as a static file (bundlers cannot resolve it reliably); see AreaMap.tsx.
import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(join(repo, 'apps', 'web', 'package.json'));
const mlDist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const mlDest = join(repo, 'apps', 'web', 'public', 'maplibre');
mkdirSync(mlDest, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
  if (existsSync(join(mlDist, f))) copyFileSync(join(mlDist, f), join(mlDest, f));
