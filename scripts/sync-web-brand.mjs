// Copies brand assets the web app serves (favicons + SVG logos) into apps/web/public/brand.
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(repo, 'apps', 'web', 'public', 'brand');
mkdirSync(dest, { recursive: true });
for (const dir of ['logo', 'mark', 'app'])
  cpSync(join(repo, 'assets', 'brand', dir), dest, { recursive: true });
