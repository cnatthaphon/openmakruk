import { defineConfig } from 'vitest/config';

// Integration tests run against a `wrangler dev` server that the
// suite spawns once and reuses across all test files. Sequential
// execution (singleFork + no parallel files) keeps the shared local
// D1 deterministic — each test resets state via tests/helpers.ts.

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: 'verbose',
  },
});
