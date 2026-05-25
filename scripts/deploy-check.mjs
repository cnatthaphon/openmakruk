#!/usr/bin/env node
// Pre-deploy sanity check — runs locally before `wrangler deploy`.
//
// What it verifies (without touching production):
//   1. worker/wrangler.toml has a non-PLACEHOLDER database_id
//   2. The seed SQL is up-to-date with the JSON source
//   3. Frontend build succeeds with VITE_API_BASE injected
//   4. dist/index.html references the bundled worker URL (not localhost)
//
// Exits non-zero on any check failure so CI can gate on this.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const issues = [];

function check(label, ok, detail) {
  if (ok) console.log(`✓ ${label}`);
  else {
    console.log(`✗ ${label} — ${detail}`);
    issues.push(label);
  }
}

// 1. wrangler.toml database_id set
const wrangler = readFileSync(resolve(ROOT, 'worker/wrangler.toml'), 'utf8');
const dbIdMatch = wrangler.match(/database_id\s*=\s*"([^"]+)"/);
check(
  'worker/wrangler.toml database_id',
  Boolean(dbIdMatch && dbIdMatch[1] && dbIdMatch[1] !== 'PLACEHOLDER_FILL_AFTER_D1_CREATE'),
  dbIdMatch ? `value is "${dbIdMatch[1]}" (run \`npm run db:create\` to mint a real one)` : 'no database_id binding found',
);

// 2. seed SQL freshness
const sqlPath = resolve(ROOT, 'worker/seed-curated.sql');
const jsonPath = resolve(ROOT, 'public/content/puzzles/all.json');
if (!existsSync(sqlPath)) {
  check('worker/seed-curated.sql exists', false, 'run `cd worker && npm run seed:generate`');
} else {
  const sql = readFileSync(sqlPath, 'utf8');
  const insertCount = (sql.match(/INSERT OR REPLACE INTO puzzles/g) ?? []).length;
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  check(
    'seed SQL count matches all.json',
    insertCount === json.length,
    `seed has ${insertCount} INSERTs, all.json has ${json.length} puzzles — re-run seed:generate`,
  );
}

// 3. Production build with VITE_API_BASE injected
const apiBase = process.env.VITE_API_BASE ?? 'https://example-api.workers.dev';
try {
  execSync('npm run build', {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE: apiBase },
    stdio: 'pipe',
  });
  check('frontend build succeeds with VITE_API_BASE', true);
} catch (err) {
  check('frontend build succeeds', false, String(err).slice(0, 200));
}

// 4. Built JS embeds the configured API base (so production frontends
//    don't accidentally point at localhost).
const distAssets = resolve(ROOT, 'dist/assets');
if (existsSync(distAssets)) {
  const indexJs = execSync(`ls ${distAssets}/index-*.js | head -1`, { encoding: 'utf8' }).trim();
  if (indexJs) {
    const jsContents = readFileSync(indexJs, 'utf8');
    check(
      `built JS embeds VITE_API_BASE (${apiBase})`,
      jsContents.includes(apiBase),
      'the VITE_API_BASE env var did not propagate into the build — check vite.config + import.meta.env usage',
    );
    check(
      'built JS does NOT embed localhost API base',
      !jsContents.includes('http://localhost:8788') && !jsContents.includes('http://localhost:8789'),
      'a localhost URL leaked into the production bundle',
    );
  }
}

if (issues.length === 0) {
  console.log('\nAll deploy checks passed.');
  process.exit(0);
} else {
  console.log(`\n${issues.length} issue(s) — fix before \`wrangler deploy\``);
  process.exit(1);
}
