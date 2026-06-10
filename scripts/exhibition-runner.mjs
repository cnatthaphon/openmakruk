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
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.API_BASE
  ?? 'https://openmakruk-api.cnatthaphon.workers.dev';
const ADMIN_TOKEN = process.env.EXHIBITION_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('EXHIBITION_ADMIN_TOKEN env var is required');
  process.exit(1);
}

// Hard cap on game length. Lowered from the worker's 200-ply default
// because 1-2 ply minimax can't reliably force conversion in a tied
// material position — beyond ~120 plies the feed fills up with
// shuffling that looks dead. The eval below adds a stagnation
// penalty that grows with halfmove clock to push for decisive play
// inside the budget; what doesn't end naturally is marked
// 'truncated' (cleaner outcome label than "shuffled 200 plies").
const MAX_PLY = 120;

// Per-tier search depth + noise. ffish-es6 is a rules engine only
// (no built-in search), so this runner implements alpha-beta locally
// with a position eval that combines material + center control + king
// safety + mobility + promotion-zone pressure. Strength scales by
// depth: rookie 1-ply (greedy), veteran 2-ply, master 3-ply, boss
// 4-ply. Epsilon adds personality noise — rookie occasionally picks
// a random move so games stay watchable instead of converging on the
// same opening every time.
// Tuning notes (after observing first ten test games):
//   - 1-ply rookie + 2-ply veteran games all truncated at 200 plies
//     because neither side has the look-ahead to set up a decisive
//     attack. Bumped baseline to 2-ply for rookie, 3 for veteran.
//   - master/boss already produced decisive games; left those alone
//     (4-ply boss takes ~5-8 seconds per game; that's the ceiling
//     for "watchable per-tick generation" on a GitHub Actions runner).
//   - Epsilon halved for rookie/veteran — too much randomness was the
//     main reason their games drifted.
const TIER_DEPTH = {
  rookie:  2,
  veteran: 3,
  master:  3,
  boss:    4,
};
const TIER_EPSILON = {
  rookie:  0.18, // ~1 in 5 moves is random for personality flavor
  veteran: 0.05,
  master:  0.02,
  boss:    0.00,
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

/** Center-control bonus per piece occupying d4/d5/e4/e5. Stacked
 *  with material so a knight on e4 is worth 3 (material) + 0.3
 *  (center) = 3.3. Encourages contesting the middle instead of
 *  shuffling pieces in the back. */
const CENTER_SQUARES = new Set(['d4', 'd5', 'e4', 'e5']);
const CENTER_BONUS = 0.3;

/** Promotion-zone bonus for pawns approaching their 6th-rank
 *  promotion line. A white pawn on rank 5 is one tempo away from
 *  becoming a Met (worth 2 — almost 2× pawn value); the eval
 *  reflects that latent value so bots push pawns. */
const PROMO_BONUS_PER_RANK = 0.15;

/** Mobility bonus — each legal move the side-to-move can make adds
 *  this much to the eval. Encourages activity over passive shuffling. */
const MOBILITY_BONUS = 0.02;

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

/** Full position eval from a Makruk FEN string. Positive = white
 *  surplus. Combines: material + center occupation + promotion
 *  pressure + king safety (king-on-back-rank is "safer" than king
 *  walking up the board). Eval is intentionally cheap (one linear
 *  pass over 64 squares) so 4-ply minimax stays sub-second. */
function evalPosition(fen) {
  const placement = fen.split(' ')[0];
  let score = 0;
  // Walk rank 8 → rank 1 in FEN order so we can compute the square
  // (file letter + rank number) as we go — needed for center +
  // promotion bonuses.
  const rows = placement.split('/');
  for (let r = 0; r < 8; r++) {
    const row = rows[r] ?? '';
    const rankNumber = 8 - r; // rank 8 at index 0
    let fileIdx = 0;
    for (const ch of row) {
      if (ch >= '0' && ch <= '9') {
        fileIdx += parseInt(ch, 10);
        continue;
      }
      const isWhite = ch === ch.toUpperCase();
      const lower = ch.toLowerCase();
      const fileLetter = String.fromCharCode(97 + fileIdx); // 'a'..'h'
      const square = `${fileLetter}${rankNumber}`;

      // Material
      if (lower !== 'k') {
        const v = PIECE_VALUE[lower] ?? 0;
        score += isWhite ? v : -v;
      }

      // Center control — small bonus, applies to every piece.
      if (CENTER_SQUARES.has(square)) {
        score += isWhite ? CENTER_BONUS : -CENTER_BONUS;
      }

      // Promotion pressure — pawns gain value as they approach their
      // 6th-rank promotion line. White pawn on rank 5 = 1 step away.
      if (lower === 'p') {
        const advanced = isWhite ? rankNumber - 3 : 6 - rankNumber;
        if (advanced > 0) {
          score += (isWhite ? 1 : -1) * advanced * PROMO_BONUS_PER_RANK;
        }
      }

      // King safety — penalty for king OFF the back rank. A king on
      // rank 1 (white) / rank 8 (black) is "tucked". Walking forward
      // loses safety.
      if (lower === 'k') {
        const backRank = isWhite ? 1 : 8;
        if (rankNumber !== backRank) {
          // Linear penalty by distance from back rank, capped to
          // avoid swamping material.
          const dist = Math.abs(rankNumber - backRank);
          const penalty = Math.min(dist * 0.4, 1.5);
          score += (isWhite ? -1 : 1) * penalty;
        }
      }

      fileIdx++;
    }
  }
  return score;
}

/** Mobility term — number of legal moves for the side to move,
 *  scaled by MOBILITY_BONUS. Computed by ffish so the eval doesn't
 *  duplicate move-generation logic. */
function mobilityTerm(board) {
  const legal = board.legalMoves().trim();
  const n = legal ? legal.split(/\s+/).length : 0;
  // ffish: true = white-to-move. Mobility benefits whoever's turn it is.
  return (board.turn() ? 1 : -1) * n * MOBILITY_BONUS;
}

/** Stagnation penalty. FEN field 5 is the halfmove clock — moves
 *  since the last pawn push or capture. When it grows, the position
 *  is stalling. We penalize the side-to-move proportionally so the
 *  search prefers progressive moves (captures / pawn pushes) over
 *  shuffling pieces. Without this, exhibition games ended at the
 *  200-ply cap as both sides circled each other indefinitely. */
function stagnationPenalty(board) {
  const halfmove = parseInt(board.fen().split(' ')[4] ?? '0', 10);
  if (!Number.isFinite(halfmove) || halfmove < 6) return 0;
  // Quadratic ramp so the penalty crosses material value past ~halfmove 20:
  // 6: 0.0, 10: 0.6, 15: 2.7, 20: 5.6 (capped). This decisively forces
  // captures/pawn pushes once the position stalls, even at the cost of
  // a small material disadvantage — which is what produces decisive
  // exhibition games instead of 200-ply shuffles.
  const over = halfmove - 6;
  const raw = Math.min(over * over * 0.07, 6);
  return (board.turn() ? -1 : 1) * raw;
}

/** Total static evaluation = position + mobility - stagnation.
 *  White-positive. */
function staticEval(board) {
  return evalPosition(board.fen()) + mobilityTerm(board) + stagnationPenalty(board);
}

/** Alpha-beta minimax. Returns score from WHITE's POV. Depth 1 is
 *  the same as 1-ply greedy with this richer eval. Depth 0 falls
 *  through to staticEval directly. */
function negamax(board, depth, alpha, beta) {
  if (depth === 0 || board.isGameOver()) {
    return staticEval(board);
  }
  const legalRaw = board.legalMoves().trim();
  if (!legalRaw) return staticEval(board);
  const legal = legalRaw.split(/\s+/);
  const whiteToMove = board.turn();
  let best = -Infinity;
  for (const mv of legal) {
    board.push(mv);
    // negamax-style: flip sign so we always max from current mover's POV
    const childWhiteScore = negamax(board, depth - 1, alpha, beta);
    board.pop();
    const fromMover = whiteToMove ? childWhiteScore : -childWhiteScore;
    if (fromMover > best) best = fromMover;
    if (whiteToMove) {
      alpha = Math.max(alpha, fromMover);
    } else {
      beta = Math.min(beta, -fromMover);
    }
    if (alpha >= beta) break;
  }
  // Convert "best from mover's POV" back to "from white's POV"
  return whiteToMove ? best : -best;
}

/** Pick a move at tier-defined depth. Per-tier epsilon adds variance
 *  (rookie occasionally picks random; boss never does). */
function pickMove(board, tier) {
  const legalRaw = board.legalMoves().trim();
  if (!legalRaw) return null;
  const legal = legalRaw.split(/\s+/);
  if (legal.length === 0) return null;

  const eps = TIER_EPSILON[tier] ?? TIER_EPSILON.master;
  if (Math.random() < eps) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const depth = TIER_DEPTH[tier] ?? TIER_DEPTH.master;
  const whiteToMove = board.turn();
  let best = legal[0];
  let bestScore = -Infinity;
  for (const mv of legal) {
    board.push(mv);
    const childWhiteScore = negamax(board, depth - 1, -Infinity, Infinity);
    board.pop();
    const fromMover = whiteToMove ? childWhiteScore : -childWhiteScore;
    // Tiny random tiebreak so two equally-good moves don't always
    // pick the same one (would make games deterministic).
    const score = fromMover + Math.random() * 0.005;
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
  // Stable idempotency key for THIS game, reused across retries. D1 can
  // return a 500 "storage timeout after commit" — the row actually
  // landed, so a blind retry would double-insert. With clientGameId the
  // server collapses the retry onto the same row (deduped), making the
  // retry safe. Generated once, outside the loop, on purpose.
  const clientGameId = randomUUID();
  const payload = JSON.stringify({
    clientGameId,
    whiteBotId: white.id,
    blackBotId: black.id,
    outcome: game.outcome,
    plyCount: game.plyCount,
    moves: game.moves,
    finalFen: game.finalFen,
  });

  const MAX_ATTEMPTS = 4;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/api/exhibition/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
        body: payload,
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        if (body.deduped) {
          console.log(`[exhibition-runner] submit deduped (already stored) on attempt ${attempt}`);
        }
        return body;
      }
      // 4xx = our bug (bad payload / auth) — retrying won't help.
      if (res.status < 500) {
        throw new Error(`submit failed (${res.status}): ${JSON.stringify(body)}`);
      }
      // 5xx (incl. the D1 timeout-after-commit) — transient; retry.
      lastErr = new Error(`submit failed (${res.status}): ${JSON.stringify(body)}`);
    } catch (err) {
      // Network-level failure — also retryable.
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      const backoff = 1500 * attempt;
      console.log(`[exhibition-runner] submit attempt ${attempt} failed, retrying in ${backoff}ms…`);
      await sleep(backoff);
    }
  }
  throw lastErr;
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
