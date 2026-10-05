import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (['production', 'testflight'].includes(process.env.EAS_BUILD_PROFILE)) {
  const script = fileURLToPath(new URL('./check-release.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  process.exitCode = result.status ?? 1;
}
