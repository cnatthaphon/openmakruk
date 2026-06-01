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
//
// Issue #8 — diagnostics: every spawned subprocess captures its
// stdout AND stderr. When a setup step fails, the error includes
// the tail of both streams so "wrangler migrations apply exited
// with code 1" is replaced by the actual error message wrangler
// printed (typically a schema syntax issue or a missing binding).

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const WRANGLER_PORT = 8788;        // distinct from manual `wrangler dev` (8787)
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;
const DIAG_TAIL_LINES = 40;

const WORKER_DIR = resolve(__dirname, '..');

let proc: ChildProcessWithoutNullStreams | null = null;
/** Rolling tail of wrangler-dev output so health-check timeouts can
 *  surface what wrangler printed instead of failing silently. */
const wranglerLog: string[] = [];

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
      // Pin the exhibition-runner admin token for tests. Mirrors the
      // Cloudflare-secret-binding shape so the /api/exhibition/submit
      // route can be exercised end-to-end in CI.
      '--var',
      'EXHIBITION_ADMIN_TOKEN:test-admin-token',
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

  // Buffer BOTH streams so the health-check error can surface them.
  // Cap to the most recent DIAG_TAIL_LINES so long-running runs don't
  // accumulate megabytes of output.
  const collect = (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (!line) continue;
      wranglerLog.push(line);
      if (wranglerLog.length > DIAG_TAIL_LINES * 4) {
        wranglerLog.splice(0, wranglerLog.length - DIAG_TAIL_LINES * 4);
      }
    }
  };
  proc.stdout.on('data', collect);
  proc.stderr.on('data', collect);

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
  throw new Error(
    `wrangler dev did not become healthy within ${HEALTH_TIMEOUT_MS}ms at ${baseUrl}.\n` +
    `Last ${DIAG_TAIL_LINES} lines of wrangler output:\n` +
    tail(wranglerLog, DIAG_TAIL_LINES).map((l) => `  | ${l}`).join('\n'),
  );
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

function tail(buf: string[], n: number): string[] {
  return buf.slice(Math.max(0, buf.length - n));
}

/** Run a wrangler subcommand to completion. Captures stdout + stderr
 *  so a non-zero exit yields a useful diagnostic instead of just an
 *  exit code. */
async function runWrangler(args: string[]): Promise<void> {
  return runCaptured(
    'node',
    [resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js'), ...args],
    `wrangler ${args.join(' ')}`,
  );
}

/** Run any node script with the worker as cwd and exit-code as success
 *  signal. Captures stdout + stderr like runWrangler. */
async function runNode(args: string[]): Promise<void> {
  return runCaptured('node', args, `node ${args.join(' ')}`);
}

function runCaptured(
  cmd: string,
  args: string[],
  label: string,
): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, {
      cwd: WORKER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b.toString()));
    child.stderr.on('data', (b: Buffer) => err.push(b.toString()));
    // 'close' (not 'exit'): exit fires the moment the child terminates,
    // before stdio buffers are flushed. On a fast failure the rejected
    // Error included a TRUNCATED tail because the last few hundred
    // bytes of stderr arrived after 'exit'. 'close' fires after stdio
    // is fully drained, so the captured `out` + `err` are complete by
    // the time we build the diagnostic.
    child.on('close', (code) => {
      if (code === 0) {
        resolveP();
        return;
      }
      const combined = (err.join('') + out.join('')).trim() || '(no output)';
      const truncated = combined.length > 4000
        ? combined.slice(combined.length - 4000)
        : combined;
      rejectP(
        new Error(
          `${label} exited with code ${code}.\n` +
          `--- subprocess output (last ${truncated.split('\n').length} lines) ---\n` +
          truncated,
        ),
      );
    });
    child.on('error', (e) => rejectP(new Error(`${label} failed to spawn: ${e.message}`)));
  });
}
