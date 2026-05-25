#!/usr/bin/env node
// Pre-compute valid game sequences for the test fixtures.
//
// Worker game-record verification (Phase 9C) replays each UCI move
// against the worker's rules engine and rejects illegal moves. Tests
// that exercise leaderboard / rating need games that ACTUALLY verify
// — fake sequences like ['e2e4', ...] no longer pass.
//
// Rather than hand-crafting a mate sequence (tedious to get right
// without a board in front of you), this script uses the worker's
// own rules engine to:
//   1. Play random-but-capture-priority until checkmate (mate fixture)
//   2. Construct a deterministic 100-ply rook-shuffle that doesn't
//      capture or move bia → halfmove >= 100 → draw fixture
//
// The output is committed to worker/tests/game-fixtures.json so the
// test run never depends on random generation succeeding.
//
// Regenerate: node worker/scripts/generate-fixtures.mjs

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the rules engine. We import the .ts via a node-flag-less
// trick: copy the relevant functions inline so this script stays
// dependency-free. The duplication is small and tested transitively
// (if the rules diverge, the fixtures will fail verification when
// loaded by the integration tests).

import {
  MAKRUK_START_FEN,
  parseFen,
  applyMove,
  listLegalMoves,
  classify,
  toFen,
} from '../src/rules.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../tests/game-fixtures.json');

// ─── 1. Mate fixture ─────────────────────────────────────────────

/** Score a candidate move: captures get +piece value, others +0.
 *  Quick heuristic to terminate the game faster than pure random. */
function scoreMove(pos, uci) {
  const to = uci.slice(2, 4);
  const target = pos.pieces[to];
  if (!target) return 0;
  const v = { K: 1000, R: 5, M: 2, S: 3, N: 3, P: 1 };
  return v[target.toUpperCase()] ?? 1;
}

function playCaptureGreedyUntilTerminal(seedRandom) {
  let pos = parseFen(MAKRUK_START_FEN);
  if (!pos) throw new Error('start position unparseable');
  const moves = [];
  for (let ply = 0; ply < 400; ply++) {
    const legal = listLegalMoves(pos);
    if (legal.length === 0) {
      return { moves, finalFen: toFen(pos), terminal: classify(pos) };
    }
    legal.sort((a, b) => scoreMove(pos, b) - scoreMove(pos, a));
    // Top-N captures only — when tied, pick deterministically by
    // seeded random so the script is reproducible.
    const topScore = scoreMove(pos, legal[0]);
    const top = legal.filter((m) => scoreMove(pos, m) === topScore);
    const pick = top[Math.floor(seedRandom() * top.length)];
    const r = applyMove(pos, pick);
    if (!r.ok) throw new Error(`generator illegal: ${pick} (${r.reason})`);
    pos = r.position;
    moves.push(pick);
    if (classify(pos).state !== 'ongoing') {
      return { moves, finalFen: toFen(pos), terminal: classify(pos) };
    }
  }
  return { moves, finalFen: toFen(pos), terminal: classify(pos) };
}

/** Deterministic PRNG so re-running this script with the same seed
 *  produces the same fixture. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let mate = null;
for (let seed = 1; seed <= 200 && !mate; seed++) {
  const result = playCaptureGreedyUntilTerminal(mulberry32(seed));
  if (result.terminal.state === 'checkmate') {
    mate = { seed, ...result };
  }
}
if (!mate) {
  throw new Error('failed to find a checkmate in 200 seed attempts');
}
console.log(
  `mate: seed=${mate.seed}, plies=${mate.moves.length}, loser=${mate.terminal.loser}`,
);

// ─── 2. Draw fixture: rook-shuffle for 100 plies ─────────────────
//
// The simplest way to hit the 50-move analog (halfmove >= 100) is to
// move a non-pawn piece without capturing. Move the white rook between
// a2 ↔ b2 and black rook between a7 ↔ b7. Both squares are empty in
// the starting position; the rooks reach them on the first ply each.
//
// Plan:
//   1. White: Ra1-a2          (rook to empty a2)
//   2. Black: ra8-a7
//   3. White: Ra2-b2
//   4. Black: ra7-b7
//   5. White: Rb2-a2          (back)
//   6. Black: rb7-a7
//   7. White: Ra2-b2
//   ...
// Stop when halfmove >= 100. Each ply increments halfmove (no capture,
// no bia move), so plies 1..100 hit the target.

function shuffleDrawGame() {
  let pos = parseFen(MAKRUK_START_FEN);
  if (!pos) throw new Error('start position unparseable');
  const moves = [];
  // First two plies prime the rooks off their home squares.
  for (const m of ['a1a2', 'a8a7']) {
    const r = applyMove(pos, m);
    if (!r.ok) throw new Error(`shuffle setup illegal: ${m} (${r.reason})`);
    pos = r.position;
    moves.push(m);
  }
  // Now cycle a2-b2-a2 / a7-b7-a7. Each ply: side-to-move rook moves
  // one square sideways.
  while (pos.halfmove < 100) {
    const cycle = pos.turn === 'white'
      ? (moves[moves.length - 2] === 'a2b2' ? 'b2a2' : 'a2b2')
      : (moves[moves.length - 2] === 'a7b7' ? 'b7a7' : 'a7b7');
    const r = applyMove(pos, cycle);
    if (!r.ok) throw new Error(`shuffle cycle illegal: ${cycle} (${r.reason})`);
    pos = r.position;
    moves.push(cycle);
  }
  return { moves, finalFen: toFen(pos), terminal: classify(pos) };
}

const draw = shuffleDrawGame();
console.log(`draw: plies=${draw.moves.length}, halfmove=${parseFen(draw.finalFen).halfmove}`);

// ─── Write fixture file ──────────────────────────────────────────

const fixture = {
  generatedAt: new Date().toISOString(),
  mate: {
    moves: mate.moves,
    finalFen: mate.finalFen,
    loser: mate.terminal.loser,
    winner: mate.terminal.loser === 'white' ? 'black' : 'white',
  },
  draw: {
    moves: draw.moves,
    finalFen: draw.finalFen,
  },
};

writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
console.log(`wrote ${OUT}`);
