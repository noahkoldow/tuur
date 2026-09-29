// Bundles the functions (inlining workspace packages) into functions/deploy, which is the Firebase source dir.
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const runtimeDeps = Object.fromEntries(
  Object.entries(pkg.dependencies).filter(([k]) => !k.startsWith('@tuur/')),
);
const options = {
  entryPoints: ['src/index.ts'],
  outfile: 'deploy/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: Object.keys(runtimeDeps).flatMap((d) => [d, `${d}/*`]),
  logLevel: 'info',
};

mkdirSync('deploy', { recursive: true });
writeFileSync(
  'deploy/package.json',
  JSON.stringify(
    {
      name: 'tuur-functions',
      private: true,
      main: 'index.js',
      engines: pkg.engines,
      dependencies: runtimeDeps,
    },
    null,
    2,
  ) + '\n',
);

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
