// Global setup for the worker integration suite.
//
// Spawns `wrangler dev` once before any test runs, waits for it to
// answer /api/health, then exposes the base URL via env var so each
// test can reach it without spinning up its own server.
//
// Why we don't unstub wrangler with a custom fetch handler: this is
// a true integration test — we want to exercise the same boot path
// production hits, including miniflare's D1 emulation, CORS, and
// Hono's request lifecycle. Tests that bypass wrangler can let
// regressions through (e.g. CORS bugs only show up in the browser).
//
// State isolation: the suite resets the D1 file before starting so
// every full run begins from an empty schema. Within a run, tests
// create their own users/games so they don't collide — no per-test
// reset is needed.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const WRANGLER_PORT = 8788;        // distinct from manual `wrangler dev` (8787)
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;

const WORKER_DIR = resolve(__dirname, '..');

let proc: ChildProcessWithoutNullStreams | null = null;

export async function setup(): Promise<void> {
  // Wipe the local D1 sqlite + re-apply schema so each test run starts
  // from zero. Wrangler stores the local DB under .wrangler/state/v3/d1.
  await rm(resolve(WORKER_DIR, '.wrangler/state/v3/d1'), { recursive: true, force: true });

  // Apply schema synchronously via a one-shot wrangler invocation.
  await runWrangler(['d1', 'migrations', 'apply', 'openmakruk-db', '--local']);

  // Seed curated puzzles so scenario tests that probe /api/puzzles get
  // realistic data without each spec having to insert its own rows.
  // The seed file is regenerated on every test run from the JSON source
  // so we never test against a stale snapshot.
  await runNode([resolve(WORKER_DIR, 'scripts/seed-curated.mjs')]);
  await runWrangler(['d1', 'execute', 'openmakruk-db', '--local', '--file=./seed-curated.sql']);

  // Spawn the long-running dev server. Pin port via `--port` so the
  // test client knows where to connect without parsing wrangler's
  // stdout.
  proc = spawn(
    'node',
    [
      resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js'),
      'dev',
      `--port=${WRANGLER_PORT}`,
      '--ip=127.0.0.1',
    ],
    {
      cwd: WORKER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Silence the telemetry prompt that otherwise blocks stdin
        // during CI runs.
        WRANGLER_SEND_METRICS: 'false',
      },
    },
  );

  // Surface wrangler errors during boot so flakes don't look mysterious.
  proc.stderr.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    if (s.includes('error') || s.includes('Error')) {
       
      console.warn('[wrangler stderr]', s.trim());
    }
  });

  // Poll until /api/health responds 200 or we time out.
  const baseUrl = `http://127.0.0.1:${WRANGLER_PORT}`;
  process.env.WORKER_BASE_URL = baseUrl;

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // dev server not ready yet — retry
    }
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`wrangler dev did not become healthy within ${HEALTH_TIMEOUT_MS}ms`);
}

export async function teardown(): Promise<void> {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    // Give wrangler a moment to flush stdio; not strictly needed but
    // suppresses noisy "killed before listen" messages in CI logs.
    await sleep(200);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWrangler(args: string[]): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(
      'node',
      [resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js'), ...args],
      {
        cwd: WORKER_DIR,
        stdio: 'ignore',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`wrangler ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rejectP);
  });
}

/** Run any node script with the worker as cwd and exit-code as success
 *  signal. Used for the seed generator. */
async function runNode(args: string[]): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn('node', args, {
      cwd: WORKER_DIR,
      stdio: 'ignore',
    });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`node ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rejectP);
  });
}
