import { defineConfig } from '@playwright/test';

// E2E tests for OpenMakruk.
// Uses the dev server already running on :5174. Tests are headless by
// default; pass --headed to watch them.

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,           // serialise — they share localStorage / IDB state
  reporter: 'list',
  // Auto-start the Vite dev server if it's not already running. The
  // bot-game test imports ffish from /node_modules/... directly, so we
  // need the dev server (not a static preview) to serve those files.
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    viewport: { width: 1200, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: true,
    // Chessground squares aren't easy to target by selector; we use
    // pixel-coord drag. Setting a fixed viewport keeps coords stable.
    //
    // Seed localStorage with the onboarded flag so the first-time
    // welcome modal doesn't pop in front of every test. The modal is
    // tested explicitly in onboarding.spec.ts where this state is
    // overridden.
    storageState: './tests/e2e/.storage-state.json',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: undefined, // use bundled Chromium, not system Chrome
      },
    },
  ],
});
