// ScoredBot — generic MakrukEngine driven by a Personality.
//
// One class powers ALL score-based bots. Differentiation is data (the
// Personality's `weights`). To add a new bot:
//   1. Append a Personality to PERSONALITIES.
//   2. registerPersonalityEngines() picks it up automatically (called
//      from this module's side-effect import).
//
// Strength tuning: the scorers themselves are simple heuristics, so
// these bots fill the 700–1100 Elo band. We deliberately do NOT call
// Fairy-Stockfish for evaluation — that would make every personality
// effectively the same strong engine. Cheap scorers = distinct play
// styles + cheap CPU per move (instant on any device).

import { fenToPieceMap, loadFfish, MAKRUK_START_FEN } from '../makruk';
import { letterToPiece, PIECE_VALUE } from '../chessAttacks';
import type { Color } from '../lessonRules';
import { registerEngine } from '../engines/registry';
import {
  DEFAULT_DIFFICULTY_PRESETS,
  type EngineCapabilities,
  type MakrukEngine,
  type SearchOpts,
  type SearchResult,
} from '../engines/types';
import { SCORERS, SCORER_KEYS, makeScorerCtx, type ScorerKey } from './scorers';
import { PERSONALITIES, type Personality } from './personalities';
import { loadChallengeTarget } from '../challenge';
import { rngFromSeed } from '../seededRng';

// Engine id namespace: 'personality:<id>'. Keeps the engine registry
// uncluttered and lets the UI distinguish personality bots from full
// engines (Fairy-Stockfish, NNUE) for capability decisions.
export const PERSONALITY_ENGINE_PREFIX = 'personality:';

export function personalityEngineId(personalityId: string): string {
  return PERSONALITY_ENGINE_PREFIX + personalityId;
}

const CAPS: EngineCapabilities = {
  multiPV: false,
  network: null,
  difficulty: DEFAULT_DIFFICULTY_PRESETS,
  // ScoredBot now does minimax + α-β lookahead at a depth driven by
  // the bot's tier (when a Challenge target sets it) or a sensible
  // default of 2 otherwise. depth=2 reflects "default play"; an
  // analysis caller wanting more nodes overrides via opts.
  analysisDefaults: { depth: 2 },
};

// ─── Static evaluation + minimax (mirrors worker/src/exhibition.ts) ─

// Pre-computed center-distance for every square — saves the per-leaf
// staticEval inner loop from recomputing it. 64 entries, tiny memory.
const CENTER_DIST = (() => {
  const out = new Map<string, number>();
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = String.fromCharCode(97 + f) + (r + 1);
      out.set(sq, Math.abs(3.5 - f) + Math.abs(3.5 - r));
    }
  }
  return out;
})();

/** Static board evaluation from white's perspective. Material values
 *  (Makruk-specific: Khon > Met) + small center-control bonus. */
function staticEval(fen: string): number {
  const pieces = fenToPieceMap(fen);
  let score = 0;
  for (const [sq, letter] of Object.entries(pieces)) {
    const piece = letterToPiece(letter);
    if (!piece) continue;
    const value = PIECE_VALUE[piece.role];
    const centerBonus = (7 - (CENTER_DIST.get(sq) ?? 7)) * 0.02;
    const contribution = value + centerBonus;
    score += piece.color === 'white' ? contribution : -contribution;
  }
  return score;
}

const MATE_SCORE = 100_000;

/** Minimax with α-β pruning on a ffish board. Returns white-POV
 *  score. Caller maximizes at white's turn, minimizes at black's. */
 
function minimax(board: any, depth: number, alpha: number, beta: number): number {
  if (board.isGameOver(true)) {
    const result = board.result(true) as string;
    if (result === '1-0') return MATE_SCORE - (10 - depth);
    if (result === '0-1') return -MATE_SCORE + (10 - depth);
    return 0; // draw / stalemate / counting
  }
  if (depth <= 0) return staticEval(board.fen());

  const legal = (board.legalMoves() as string).split(' ').filter(Boolean);
  if (legal.length === 0) return staticEval(board.fen());

  // ffish board.turn() returns boolean — true means white-to-move
  // (matches "side to move = 0 (white) / 1 (black)" inverted; we
  // verify against the FEN's side-to-move field for safety).
  const sideToMoveWhite = board.fen().split(' ')[1] === 'w';

  if (sideToMoveWhite) {
    let best = -Infinity;
    for (const mv of legal) {
      board.push(mv);
      const val = minimax(board, depth - 1, alpha, beta);
      board.pop();
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of legal) {
      board.push(mv);
      const val = minimax(board, depth - 1, alpha, beta);
      board.pop();
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

const TIER_DEPTH: Record<string, number> = {
  rookie: 1,
  veteran: 2,
  master: 3,
  boss: 3,
};

/** Pick the search depth for a personality. If a Challenge target is
 *  active AND matches this personality, use the target's tier depth
 *  so a "Master" challenge actually plays at Master strength. Without
 *  a challenge (e.g. user just picked the engine in Settings), use a
 *  reasonable default of 2 — much stronger than the previous 1-ply
 *  pick. */
function depthForPersonality(personalityId: string): number {
  const challenge = loadChallengeTarget();
  if (challenge && challenge.personality === personalityId) {
    return TIER_DEPTH[challenge.tier] ?? 2;
  }
  return 2;
}

// ─── Opening book (mirrors worker/src/exhibition.ts) ──────────────

const OPENING_BOOK: { id: string; moves: string[] }[] = [
  { id: 'op-khun-pawn',       moves: ['d3d4', 'd6d5', 'e3e4', 'e6e5'] },
  { id: 'op-met-shuffle',     moves: ['e3e4', 'e6e5', 'e1f2', 'd6d5'] },
  { id: 'op-khon-fianchetto', moves: ['f3f4', 'f6f5', 'c3c4', 'c6c5'] },
  { id: 'op-khon-line',       moves: ['d3d4', 'd6d5', 'f1e2', 'f8e7'] },
  { id: 'op-rua-line',        moves: ['a3a4', 'a6a5', 'h3h4', 'h6h5'] },
];

const OPENING_PREFERENCES: Record<string, Record<string, number>> = {
  attacker:   { 'op-rua-line': 3, 'op-met-shuffle': 2, 'op-khun-pawn': 1 },
  defender:   { 'op-khun-pawn': 3, 'op-khon-fianchetto': 2, 'op-khon-line': 1 },
  positional: { 'op-khon-fianchetto': 3, 'op-khon-line': 2.5, 'op-khun-pawn': 1.5 },
  hunter:     { 'op-rua-line': 3, 'op-met-shuffle': 2, 'op-khun-pawn': 1 },
  wanderer:   { 'op-khun-pawn': 1, 'op-met-shuffle': 1, 'op-khon-fianchetto': 1, 'op-khon-line': 1, 'op-rua-line': 1 },
  mobile:     { 'op-khon-fianchetto': 2, 'op-khon-line': 2, 'op-khun-pawn': 1 },
  cautious:   { 'op-khun-pawn': 3, 'op-khon-fianchetto': 1.5, 'op-khon-line': 1 },
};

// Probability of using a book move when one is available (vs falling
// through to minimax). 1.0 = always book; 0.0 = never book. 0.9 keeps
// the bot mostly on-book in opening but lets it surprise occasionally.
const BOOK_PROBABILITY = 0.9;

// Lazy-computed map from book position FEN to the candidate book moves
// available at that position (each tagged with its opening id for
// personality-weighted selection). Computed once on first search().
let BOOK_FEN_TO_MOVES: Map<string, { openingId: string; move: string }[]> | null = null;

async function ensureBookComputed(): Promise<void> {
  if (BOOK_FEN_TO_MOVES) return;
  const ffish = await loadFfish();
  const map = new Map<string, { openingId: string; move: string }[]>();
  for (const opening of OPENING_BOOK) {
     
    const board = new (ffish as any).Board('makruk', MAKRUK_START_FEN);
    try {
      for (const move of opening.moves) {
        const fen = board.fen();
        if (!map.has(fen)) map.set(fen, []);
        const list = map.get(fen)!;
        // Multiple openings can share a position prefix (e.g. Khun-pawn
        // and Khon-line both play d3d4 first). Dedupe by move.
        if (!list.some((e) => e.move === move)) {
          list.push({ openingId: opening.id, move });
        }
        board.push(move);
      }
    } finally {
      board.delete();
    }
  }
  BOOK_FEN_TO_MOVES = map;
}

/** Look up a book move for the current position, weighted by the
 *  bot's personality preferences over openings. Returns null when
 *  the position is out of book or the bot rolled the "deviate" check.
 *
 *  `rng` injected — typically a seeded generator built from
 *  challenge/fen/ply when reproducibility matters (challenge replays,
 *  leaderboard). Falls back to Math.random for casual vs-CPU games. */
function bookMoveFor(
  fen: string,
  personalityId: string,
  rng: () => number,
): string | null {
  if (!BOOK_FEN_TO_MOVES) return null;
  const candidates = BOOK_FEN_TO_MOVES.get(fen);
  if (!candidates || candidates.length === 0) return null;
  if (rng() >= BOOK_PROBABILITY) return null;
  const prefs = OPENING_PREFERENCES[personalityId];
  if (!prefs) {
    // Unknown personality — pick any book continuation at random.
    return candidates[Math.floor(rng() * candidates.length)].move;
  }
  let total = 0;
  for (const c of candidates) total += prefs[c.openingId] ?? 0;
  if (total <= 0) {
    return candidates[Math.floor(rng() * candidates.length)].move;
  }
  let pick = rng() * total;
  for (const c of candidates) {
    const w = prefs[c.openingId] ?? 0;
    pick -= w;
    if (pick <= 0) return c.move;
  }
  return candidates[0].move;
}

class ScoredBot implements MakrukEngine {
  readonly id: string;
  readonly name: string;
  readonly capabilities = CAPS;

  constructor(private readonly personality: Personality) {
    this.id = personalityEngineId(personality.id);
    this.name = `${personality.emoji} ${personality.name}`;
  }

  async init(): Promise<void> {
    await loadFfish();
  }

  async destroy(): Promise<void> {
    // nothing to release
  }

  async search(fen: string, opts: SearchOpts = {}): Promise<SearchResult> {
    // Phase 38 — every randomized choice routes through a single RNG.
    // When opts.seed is set (challenge / exhibition / leaderboard),
    // the RNG is deterministic: same seed + same position → same
    // move, every replay. When unset (casual vs-CPU), fall back to
    // Math.random for the game-to-game variety casual users expect.
    const rng = opts.seed ? rngFromSeed(opts.seed) : Math.random;

    // Opening book — if the current position is in a known opening
    // line AND the personality preference roll picks one, return it
    // immediately without running minimax. Saves CPU + gives game-
    // to-game variety (first 4 plies look distinct per personality).
    await ensureBookComputed();
    const book = bookMoveFor(fen, this.personality.id, rng);
    if (book) return { bestMove: book };

    const ffish = await loadFfish();
    const board = new ffish.Board('makruk', fen);
    try {
      const legal = board.legalMoves().split(' ').filter(Boolean);
      if (legal.length === 0) return { bestMove: '0000' };

      // Tier-aware depth from the active challenge, or the opts.depth
      // override the analysis caller passed in, or a sensible default.
      const depth =
        typeof opts.depth === 'number'
          ? opts.depth
          : depthForPersonality(this.personality.id);

      const ctx = makeScorerCtx(fen, board);
      const sideToMoveWhite = fen.split(' ')[1] === 'w';
      const sideSign = sideToMoveWhite ? 1 : -1;
      // Personality flavor magnitude — same calibration as the
      // worker's exhibition engine. ~0.4 pawn-units of preference
      // for "this move looks like an attacker's move" on top of the
      // minimax score. Keeps the personality recognizable without
      // letting it sac a piece for a vibe.
      const FLAVOR = 0.4;

      // Score each legal move = depth-1 minimax lookahead + per-move
      // personality bonus. Tiny random tiebreak so identical positions
      // don't always produce the same move.
      const scored: { move: string; total: number }[] = legal.map((mv) => {
        board.push(mv);
        const childScore = sideSign * minimax(
          board,
          depth - 1,
          -Infinity,
          Infinity,
        );
        board.pop();

        let flavor = 0;
        for (const key of SCORER_KEYS) {
          const weight = this.personality.weights[key as ScorerKey];
          if (!weight) continue;
          const component = SCORERS[key](ctx, mv);
          flavor += weight * component;
        }
        const total = childScore + flavor * FLAVOR + rng() * 0.005;
        return { move: mv, total };
      });

      scored.sort((a, b) => b.total - a.total);
      return { bestMove: scored[0].move };
    } finally {
      board.delete();
    }
  }
}

/** Build a one-shot bot for a specific personality. Used by the
 *  registry factory and by ad-hoc callers (auto-mine, gauntlet) that
 *  want to instantiate a bot without going through the registry. */
export function makeScoredBot(personality: Personality): MakrukEngine {
  return new ScoredBot(personality);
}

// ─── Side-effect registration ──────────────────────────────────────
//
// Importing this module registers EVERY personality in the catalog as
// an engine. Done once at module evaluation. The catalog is small
// (<20) so the cost is negligible.

let registered = false;
function registerPersonalityEngines(): void {
  if (registered) return;
  registered = true;
  for (const p of PERSONALITIES) {
    registerEngine({
      id: personalityEngineId(p.id),
      name: `${p.emoji} ${p.name}`,
      factory: () => makeScoredBot(p),
    });
  }
}

registerPersonalityEngines();

// Helper for downstream code that wants to know if an engine id refers
// to a personality bot (vs Fairy-Stockfish etc).
export function isPersonalityEngineId(id: string): boolean {
  return id.startsWith(PERSONALITY_ENGINE_PREFIX);
}

// re-export Color so callers don't reach into makruk for it
export type { Color };
