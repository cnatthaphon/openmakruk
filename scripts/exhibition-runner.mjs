// External Bot Exhibition runner.
//
// Replaces the Cloudflare-cron-based bot game generator (worker/src/
// exhibition.ts::runExhibitionTick). The old approach hit two ceilings:
//
//   1. Cloudflare Worker CPU/memory budget. We ported a SUBSET of the
//      personality scorers because the full Fairy-Stockfish + NNUE
//      could not run inside a Worker request. Games were demonstrably
//      weaker than the same bots playing in the browser.
//   2. Cron timing is "best effort" — the 30-minute interval drifted
//      by 5-15 minutes and occasionally skipped a tick entirely.
//
// New design: this script runs OUTSIDE the worker (your laptop, a
// GitHub Actions schedule, a free Fly.io machine — anywhere with
// Node 18+ and outbound HTTPS). It:
//
//   1. Pulls the bot roster from /api/bots
//   2. Picks two bots at random
//   3. Plays them to completion using ffish-es6 rules + a local
//      1-ply greedy evaluator with per-tier randomness (full Fairy-
//      Stockfish via the .wasm package is Web-Worker-only, doesn't
//      load in Node — moving to a child-process binary is an
//      upgrade path, see comments by `playGame` below).
//   4. POSTs the result to /api/exhibition/submit with the admin token
//
// Run locally:
//   API_BASE=https://openmakruk-api.cnatthaphon.workers.dev \
//   EXHIBITION_ADMIN_TOKEN=<secret> \
//   node scripts/exhibition-runner.mjs
//
// Run from GitHub Actions: see .github/workflows/exhibition-tick.yml
// (cron: every 30 minutes; secrets stored in repo settings).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.API_BASE
  ?? 'https://openmakruk-api.cnatthaphon.workers.dev';
const ADMIN_TOKEN = process.env.EXHIBITION_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('EXHIBITION_ADMIN_TOKEN env var is required');
  process.exit(1);
}

// Hard cap on game length. Mirrors the previous worker logic. After
// 200 plies we declare 'truncated' so the feed doesn't fill up with
// stuck-loop games from weak personalities like wanderer.
const MAX_PLY = 200;

// Per-tier "noise" — how often the bot picks a non-best move instead
// of the greedy best. ffish-es6 is a rules engine only (no built-in
// search), so this runner uses a 1-ply greedy material evaluator plus
// a tier-dependent epsilon for the personality differential. The
// fairy-stockfish-nnue.wasm package is Web-Worker-only and doesn't
// run cleanly in Node, so we stay with the deterministic local
// evaluator — same code path the worker's old `runExhibitionTick`
// used, just outside the CPU/memory cap.
const TIER_EPSILON = {
  rookie:  0.45, // half the time, pick a random legal move
  veteran: 0.25,
  master:  0.10,
  boss:    0.03,
};

/** Standard Makruk material values. K is excluded — losing the king
 *  ends the game, the legality check catches that. */
const PIECE_VALUE = {
  p: 1,
  s: 2,
  m: 2,
  n: 3,
  r: 5,
};

async function loadFfish() {
  // ffish-es6 is built for browser ESM: it constructs a fetchable URL
  // from `import.meta.url + './ffish.wasm'`. In Node that becomes a
  // file:// URL passed to fetch(), which then throws 'Failed to parse
  // URL from ffish.wasm'. Workaround: read the binary off disk
  // ourselves and pass it via `wasmBinary` so Emscripten skips the
  // network fetch path entirely.
  const wasmPath = resolve(__dirname, '..', 'node_modules', 'ffish-es6', 'ffish.wasm');
  const wasmBinary = readFileSync(wasmPath);
  const mod = await import('ffish-es6');
  const Ffish = mod.default ?? mod;
  const init = typeof Ffish === 'function' ? Ffish : Ffish.default;
  const ffish = await init({ wasmBinary });
  return ffish;
}

async function fetchBots() {
  const res = await fetch(`${API_BASE}/api/bots`);
  if (!res.ok) throw new Error(`fetch bots failed: ${res.status}`);
  const body = await res.json();
  return body.bots ?? [];
}

function pickTwoDistinct(arr) {
  const a = Math.floor(Math.random() * arr.length);
  let b = Math.floor(Math.random() * arr.length);
  if (b === a) b = (b + 1) % arr.length;
  return [arr[a], arr[b]];
}

/** Sum material from a Makruk FEN string. Positive = white surplus. */
function materialEval(fen) {
  const placement = fen.split(' ')[0];
  let score = 0;
  for (const ch of placement) {
    if (ch === '/' || (ch >= '0' && ch <= '9')) continue;
    const lower = ch.toLowerCase();
    if (lower === 'k') continue;
    const v = PIECE_VALUE[lower] ?? 0;
    score += ch === lower ? -v : v; // uppercase = white
  }
  return score;
}

/** Pick a move via 1-ply greedy: try every legal move, score by
 *  material delta from the mover's POV, pick the highest. Tier-
 *  dependent epsilon: rookie tiers occasionally pick a random move
 *  to keep games varied + "personality"-like. */
function pickMove(board, tier) {
  const legalRaw = board.legalMoves().trim();
  if (!legalRaw) return null;
  const legal = legalRaw.split(/\s+/);
  if (legal.length === 0) return null;

  const eps = TIER_EPSILON[tier] ?? TIER_EPSILON.master;
  if (Math.random() < eps) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  // White's turn?
  const whiteToMove = board.turn(); // ffish: true = white
  let best = legal[0];
  let bestScore = -Infinity;
  for (const mv of legal) {
    board.push(mv);
    const after = materialEval(board.fen());
    const fromMover = whiteToMove ? after : -after;
    board.pop();
    // Tiny random tiebreak so two equally-good moves don't always
    // pick the same one (would make games near-deterministic).
    const score = fromMover + Math.random() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return best;
}

/**
 * Play one full game between two bots. Returns { moves, outcome,
 * finalFen, plyCount }. Stronger tier = lower epsilon = more greedy.
 * Boss tier still uses local greedy here — running full Fairy-
 * Stockfish in Node is non-trivial (the .wasm package is Web-Worker-
 * only), so this is a watchable proxy, not a strength benchmark.
 */
async function playGame(ffish, white, black) {
  const board = new ffish.Board('makruk');
  const moves = [];
  let outcome = 'truncated';
  try {
    for (let ply = 0; ply < MAX_PLY; ply++) {
      const sideToMove = ply % 2 === 0 ? 'white' : 'black';
      const bot = sideToMove === 'white' ? white : black;
      const mv = pickMove(board, bot.tier);
      if (!mv) break;
      board.push(mv);
      moves.push(mv);
      if (board.isGameOver()) {
        const result = board.result(); // '1-0' | '0-1' | '1/2-1/2' | '*'
        if (result === '1-0') outcome = 'white-wins';
        else if (result === '0-1') outcome = 'black-wins';
        else if (result === '1/2-1/2') outcome = 'draw';
        break;
      }
    }
    return {
      moves,
      outcome,
      finalFen: board.fen(),
      plyCount: moves.length,
    };
  } finally {
    board.delete();
  }
}

async function submitGame(white, black, game) {
  const res = await fetch(`${API_BASE}/api/exhibition/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      whiteBotId: white.id,
      blackBotId: black.id,
      outcome: game.outcome,
      plyCount: game.plyCount,
      moves: game.moves,
      finalFen: game.finalFen,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`submit failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log(`[exhibition-runner] API_BASE = ${API_BASE}`);
  const bots = await fetchBots();
  if (bots.length < 2) {
    console.error('not enough bots to play (need >= 2)');
    process.exit(1);
  }
  console.log(`[exhibition-runner] loaded ${bots.length} bots`);

  const [white, black] = pickTwoDistinct(bots);
  console.log(
    `[exhibition-runner] match: ${white.id} (${white.tier}) vs ${black.id} (${black.tier})`,
  );

  const ffish = await loadFfish();
  const startedAt = Date.now();
  const game = await playGame(ffish, white, black);
  const elapsed = Date.now() - startedAt;
  console.log(
    `[exhibition-runner] game over in ${elapsed}ms · ${game.plyCount} plies · ${game.outcome}`,
  );

  const submitted = await submitGame(white, black, game);
  console.log(`[exhibition-runner] submitted id=${submitted.id}`);
}

main().catch((err) => {
  console.error('[exhibition-runner] failed:', err);
  process.exit(1);
});
