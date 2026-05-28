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
//   3. Plays them to completion using the full Fairy-Stockfish via
//      ffish-es6 (same engine the browser uses)
//   4. POSTs the result to /api/exhibition/submit with the admin token
//
// Run locally:
//   API_BASE=https://openmakruk-api.cnatthaphon.workers.dev \
//   EXHIBITION_ADMIN_TOKEN=<secret> \
//   node scripts/exhibition-runner.mjs
//
// Run from GitHub Actions: see .github/workflows/exhibition-tick.yml
// (cron: every 30 minutes; secrets stored in repo settings).

import { Worker } from 'node:worker_threads';
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

// Depth budgets per tier — slower = stronger. Tuned so a game takes
// ~5-15 seconds total on a modern laptop. Adjust if running on a
// constrained CI runner.
const TIER_DEPTH = {
  rookie:  4,
  veteran: 7,
  master:  10,
  boss:    14,
};

async function loadFfish() {
  // ffish-es6 ships an ESM entry. Import dynamically because top-level
  // await + a bare `import` confuse Node's module graph in some envs.
  const mod = await import('ffish-es6');
  const Ffish = mod.default ?? mod;
  const ffish = typeof Ffish === 'function' ? await Ffish() : await Ffish.default();
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

function tierDepth(tier) {
  return TIER_DEPTH[tier] ?? TIER_DEPTH.master;
}

/**
 * Play one full game between two bots using Fairy-Stockfish via ffish.
 * Returns { moves, outcome, finalFen, plyCount }.
 *
 * The two bots get different search depths based on their tier — that
 * captures the strength difference WITHOUT needing the per-personality
 * scoring weights the old worker code maintained. The personality
 * "flavor" of moves is sacrificed for engine accuracy; if you want
 * personality back, port the scoredBot from src/lib/personalities/.
 */
async function playGame(ffish, white, black) {
  const board = new ffish.Board('makruk');
  const moves = [];
  let outcome = 'truncated';
  try {
    for (let ply = 0; ply < MAX_PLY; ply++) {
      const sideToMove = ply % 2 === 0 ? 'white' : 'black';
      const bot = sideToMove === 'white' ? white : black;
      const depth = tierDepth(bot.tier);
      // ffish's bestMove takes a `depth` parameter for fixed-depth search.
      const best = board.bestMove(depth);
      if (!best || best.length < 4) break;
      board.push(best);
      moves.push(best);
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
  // Silence the worker_threads dynamic-import warning Node sometimes
  // emits on a clean ffish-es6 load. Functional no-op.
  void Worker;
  void resolve;
  void __dirname;

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
