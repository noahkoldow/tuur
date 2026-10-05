import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cwd = resolve(root, 'functions');
for (const args of [[resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], ['build.mjs']]) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
