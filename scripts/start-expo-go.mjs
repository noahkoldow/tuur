import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Use Node to set preview flags so this works in Windows, macOS and Linux shells.
const mobileDir = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
const require = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const live = process.argv.includes('--live');
const args = process.argv.slice(2).filter((arg) => arg !== '--live');
const explicitHost = args.some(
  (arg) => ['--lan', '--localhost', '--tunnel', '--host', '-m'].includes(arg) || arg.startsWith('--host='),
);
const child = spawn(
  process.execPath,
  [
    require.resolve('expo/bin/cli'),
    'start',
    '--go',
    '--clear',
    ...(explicitHost ? [] : ['--tunnel']),
    ...args,
  ],
  {
    cwd: mobileDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_PUBLIC_EXPO_GO: '1',
      ...(live
        ? { EXPO_PUBLIC_BACKEND: 'firebase', EXPO_PUBLIC_USE_EMULATORS: 'true', EXPO_NO_DOTENV: '0' }
        : {
            EXPO_PUBLIC_BACKEND: 'demo',
            EXPO_PUBLIC_PAYWALL: 'on',
            EXPO_PUBLIC_PREVIEW_ROUTING: 'osm',
            EXPO_PUBLIC_USE_EMULATORS: 'false',
            EXPO_NO_DOTENV: '1',
          }),
    },
  },
);

child.on('error', (error) => {
  console.error(`Could not start the Expo Go preview: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
