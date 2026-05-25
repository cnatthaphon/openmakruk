#!/usr/bin/env node
// Post-deploy smoke test — probes the deployed worker for sanity.
//
// Usage:
//   node scripts/smoke.mjs <base-url>
//
// Examples:
//   node scripts/smoke.mjs https://openmakruk-api.cnatthaphon.workers.dev
//   node scripts/smoke.mjs https://openmakruk-api-staging.cnatthaphon.workers.dev
//
// Each check is independent. Failure → non-zero exit code + structured
// log so CI can gate the deploy.

const BASE = process.argv[2];
if (!BASE) {
  console.error('Usage: node scripts/smoke.mjs <base-url>');
  process.exit(2);
}

const results = [];
async function check(label, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`✓ ${label} (${ms}ms)`);
    results.push({ label, ok: true, ms });
  } catch (err) {
    console.log(`✗ ${label} — ${String(err).slice(0, 200)}`);
    results.push({ label, ok: false, error: String(err) });
  }
}

await check('/api/health returns ok:true', async () => {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (body.ok !== true) throw new Error(`ok=${body.ok}`);
  if (body.name !== 'openmakruk-api') throw new Error(`name=${body.name}`);
});

await check('/api/db/ping reaches D1', async () => {
  const r = await fetch(`${BASE}/api/db/ping`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (body.ok !== true) throw new Error(`db ok=${body.ok}`);
});

await check('/api/puzzles serves curated content', async () => {
  const r = await fetch(`${BASE}/api/puzzles?category=mate-1`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (!Array.isArray(body.puzzles)) throw new Error('puzzles not array');
  if (body.puzzles.length === 0) throw new Error('zero curated mate-1');
  // Confirm shape: every entry must have id, fen, solution
  for (const p of body.puzzles) {
    if (!p.id || !p.fen || !Array.isArray(p.solution)) {
      throw new Error(`malformed puzzle: ${JSON.stringify(p).slice(0, 100)}`);
    }
  }
});

await check('/api/users/anon mints a fresh user', async () => {
  const r = await fetch(`${BASE}/api/users/anon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'SmokeTest' }),
  });
  if (!r.ok) throw new Error(`status ${r.status}`);
  const body = await r.json();
  if (!body.token || body.token.length < 32) throw new Error('bad token');
  if (!body.id || !/^[0-9a-f-]{36}$/.test(body.id)) throw new Error('bad id');
});

await check('CORS headers present', async () => {
  const r = await fetch(`${BASE}/api/health`, {
    headers: { Origin: 'https://openmakruk.com' },
  });
  const cors = r.headers.get('access-control-allow-origin');
  if (!cors) throw new Error('no access-control-allow-origin header');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} checks passed${failed ? `, ${failed} failed` : ''}`);
process.exit(failed > 0 ? 1 : 0);
