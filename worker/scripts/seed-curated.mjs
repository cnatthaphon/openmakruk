#!/usr/bin/env node
// Generate seed-curated.sql from the curated puzzle pool.
//
// Reads ../public/content/puzzles/all.json and emits a deterministic
// SQL file with one INSERT per puzzle. The IDs from the JSON are used
// verbatim so re-runs are idempotent — `INSERT OR REPLACE` handles
// the case where the same puzzle is re-seeded with updated metadata.
//
// Usage:
//   node scripts/seed-curated.mjs                  # write seed-curated.sql
//   npm run seed:local                              # also apply to local D1
//   npm run seed:remote                             # apply to production D1
//
// The generated file is committed so reviewers can see what's about
// to land in production without re-running the script. CI verifies
// it stays in sync with the JSON source.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUZZLES_JSON = resolve(__dirname, '../../public/content/puzzles/all.json');
const OUT_SQL = resolve(__dirname, '../seed-curated.sql');

const raw = readFileSync(PUZZLES_JSON, 'utf8');
const puzzles = JSON.parse(raw);
if (!Array.isArray(puzzles)) {
  console.error('Expected an array at the top level of all.json');
  process.exit(1);
}

const HEADER = `-- AUTO-GENERATED — do not edit by hand.
-- Source: public/content/puzzles/all.json
-- Regenerate: node worker/scripts/seed-curated.mjs
--
-- INSERT OR REPLACE so re-running is idempotent + lets us update
-- prompt/themes for existing curated puzzles without writing a
-- separate migration. The created_at column is set from a stable
-- per-puzzle hash of the id so the leaderboard sort order doesn't
-- shuffle on every reseed.

`;

// Stable timestamp per puzzle so reseeds don't churn created_at.
// Hash the id to ms-since-2025 (anything plausible — only relative
// ordering matters for the catalog cursor).
const EPOCH = Date.UTC(2025, 0, 1);
function stableTimestamp(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return EPOCH + Math.abs(h % (90 * 24 * 60 * 60 * 1000));
}

function sqlString(s) {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}
function sqlJson(v) {
  return sqlString(JSON.stringify(v ?? []));
}

const lines = [HEADER];
for (const p of puzzles) {
  if (!p.id || !p.fen || !p.category || !Array.isArray(p.solution)) {
    console.warn('skipping malformed entry:', p.id ?? '<no id>');
    continue;
  }
  lines.push(
    `INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES (${sqlString(p.id)}, ${sqlString(p.category)}, ${sqlString(p.fen)},
             ${sqlJson(p.solution)}, ${sqlString(p.toMove)}, ${Number(p.rating ?? 1200)},
             ${sqlString(p.prompt ?? '')}, ${sqlJson(p.themes)},
             'curated', NULL, 'curator', ${stableTimestamp(p.id)});`,
  );
}

writeFileSync(OUT_SQL, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${OUT_SQL} — ${puzzles.length} puzzles`);
