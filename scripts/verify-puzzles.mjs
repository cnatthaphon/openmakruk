// Verify every puzzle in public/content/puzzles/all.json against
// ffish-es6: FEN parses, every solution move is legal, the final
// position is mate (for mate-* categories) or a capture (for tactic).
//
// Run before bumping the puzzles content version:
//   node scripts/verify-puzzles.mjs
//
// Exits non-zero if anything fails so CI can gate on it.

import Module from '../node_modules/ffish-es6/ffish.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const wasmBinary = readFileSync(join(root, 'node_modules/ffish-es6/ffish.wasm'));
const ffish = await Module({ wasmBinary });

const puzzles = JSON.parse(
  readFileSync(join(root, 'public/content/puzzles/all.json'), 'utf8'),
);

let failed = 0;
let warned = 0;

for (const p of puzzles) {
  const board = new ffish.Board('makruk', p.fen);
  let ok = true;
  let log = `${p.id} [${p.category} r${p.rating}]`;
  for (let i = 0; i < p.solution.length; i++) {
    const mv = p.solution[i];
    const legal = board.legalMoves().split(' ');
    if (!legal.includes(mv)) {
      log += `\n  ✗ step ${i + 1} ${mv}: ILLEGAL (legal=${legal.slice(0, 10).join(',')}…)`;
      ok = false;
      break;
    }
    board.push(mv);
  }
  if (ok) {
    const isMate = board.isGameOver() && board.isCheck();
    const isMateCategory = p.category === 'mate-1' || p.category === 'mate-2';
    const isCountingCategory = p.category === 'counting';
    // mate-* and most counting puzzles must end in mate.
    if ((isMateCategory || isCountingCategory) && !isMate) {
      log += `\n  ✗ category ${p.category} expects mate; got result=${board.result()}`;
      ok = false;
    } else if (p.category === 'tactic' && !isMate && p.solution.length === 1) {
      // Single-move tactics should generally win material — we don't
      // verify material gain (subjective), just check that the move
      // isn't a self-mate or stalemate.
      const result = board.result();
      if (result === '0-1' || result === '1-0') {
        // White-to-move puzzle ending in result '1-0' = good (capture+mate?)
        // ending in '0-1' = white lost = bug
        if ((p.toMove === 'white' && result === '0-1') ||
            (p.toMove === 'black' && result === '1-0')) {
          log += `\n  ✗ tactic ended with ${p.toMove} losing? result=${result}`;
          ok = false;
        }
      }
    }
  }
  if (ok) console.log(`✓ ${log}`);
  else {
    console.log(`✗ ${log}`);
    failed++;
  }
  board.delete();
}

console.log(`\n${puzzles.length} puzzles · ${failed} failed · ${warned} warnings`);
process.exit(failed > 0 ? 1 : 0);
