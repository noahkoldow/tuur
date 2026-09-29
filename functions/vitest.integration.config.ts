import { defineConfig } from 'vitest/config';
// Run through `pnpm test:integration` (wraps the Firebase emulators).
export default defineConfig({
  test: { include: ['test/**/*.itest.ts'], testTimeout: 30_000, fileParallelism: false },
});
