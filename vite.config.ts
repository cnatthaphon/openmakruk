import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `node:child_process` isn't in @types — we don't ship node typings to
// keep tsconfig.node.json small. Loose typing here is fine: the call
// runs at build time only.
// eslint-disable-next-line @typescript-eslint/no-require-imports
declare const require: (m: string) => { execSync: (cmd: string) => { toString(): string } };

/** Pull the current git SHA so the running build can show "you're on commit X".
 *  Falls back to 'dev' when git isn't available (e.g. a tarball install). */
function gitSha(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cp = require('node:child_process');
    return cp.execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    // These get string-substituted into the bundle, so the running app
    // can render "v0.1 · beta · abc1234 · 2026-05-27" without a runtime
    // fetch. Quoting matters — JSON.stringify produces "\"abc1234\"".
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['ffish-es6'],
  },
  worker: {
    format: 'es',
  },
});
