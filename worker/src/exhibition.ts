// Bot Exhibition game generation.
//
// Runs inside the worker's scheduled handler every 30 minutes (see
// wrangler.toml [triggers]). Picks 2 random bots from the users table,
// plays them against each other using ported personality scorers from
// the client-side scoredBot, and stores the result in
// bot_exhibition_games for the frontend to display.
//
// Why we ported the scorers vs sharing them: the client scorers depend
// on ffish-es6 (WASM-only) for some scorers (mobility, attack via
// push/pop). The worker only has the pure-JS rules engine in
// `./rules`. We re-implement a subset (material/attack/defense/center/
// aggression/randomness — skipping mobility) here as pure functions
// over PieceMap + UCI strings. The personality weights are copied from
// `src/lib/personalities/personalities.ts` — keep them in sync if you
// edit either.
//
// Opening book — a small static catalog mirrors public/content/openings/
// all.json so bot-vs-bot games don't always start with the same Khun-
// pawn moves. White's personality picks the opening (its preference
// weights below); both sides follow the prescribed 4 plies, then the
// minimax engine takes over from move 5. Without this, every exhibition
// game would look identical for the first 8 ply, which makes the
// public showcase feel mechanical.
//
// Game cap: 200 plies. After that, mark as 'truncated' (draw-equivalent
// for the display layer). In practice attacker-vs-defender games tend
// to finish in 60-100 plies; the cap mostly protects against pathologic
// loops in low-Elo personalities like wanderer.

type OpeningLine = { id: string; moves: string[] };

const OPENING_BOOK: OpeningLine[] = [
  { id: 'op-khun-pawn',       moves: ['d3d4', 'd6d5', 'e3e4', 'e6e5'] },
  { id: 'op-met-shuffle',     moves: ['e3e4', 'e6e5', 'e1f2', 'd6d5'] },
  { id: 'op-khon-fianchetto', moves: ['f3f4', 'f6f5', 'c3c4', 'c6c5'] },
  { id: 'op-khon-line',       moves: ['d3d4', 'd6d5', 'f1e2', 'f8e7'] },
  { id: 'op-rua-line',        moves: ['a3a4', 'a6a5', 'h3h4', 'h6h5'] },
];

// Per-personality opening weights. Higher = picked more often. Personality
// shapes the *vibe* of the opening: attacker reaches for flank-attack
// Rua line, defender clings to the balanced classical Khun-pawn, etc.
const OPENING_PREFERENCES: Record<string, Record<string, number>> = {
  attacker:   { 'op-rua-line': 3, 'op-met-shuffle': 2, 'op-khun-pawn': 1 },
  defender:   { 'op-khun-pawn': 3, 'op-khon-fianchetto': 2, 'op-khon-line': 1 },
  positional: { 'op-khon-fianchetto': 3, 'op-khon-line': 2.5, 'op-khun-pawn': 1.5 },
  hunter:     { 'op-rua-line': 3, 'op-met-shuffle': 2, 'op-khun-pawn': 1 },
  wanderer:   { 'op-khun-pawn': 1, 'op-met-shuffle': 1, 'op-khon-fianchetto': 1, 'op-khon-line': 1, 'op-rua-line': 1 },
  mobile:     { 'op-khon-fianchetto': 2, 'op-khon-line': 2, 'op-khun-pawn': 1 },
  cautious:   { 'op-khun-pawn': 3, 'op-khon-fianchetto': 1.5, 'op-khon-line': 1 },
  // Boss — uniform across all openings, plays everything strongly.
  'fairy-stockfish': {
    'op-khun-pawn': 1, 'op-met-shuffle': 1, 'op-khon-fianchetto': 1,
    'op-khon-line': 1, 'op-rua-line': 1,
  },
};

/** Pick an opening line by weighted random over the personality's
 *  preferences. Returns the chosen line; never null (falls back to
 *  Khun-pawn for unknown personalities). */
function pickOpening(personalityId: string): OpeningLine {
  const prefs = OPENING_PREFERENCES[personalityId] ?? OPENING_PREFERENCES['fairy-stockfish'];
  const total = Object.values(prefs).reduce((s, w) => s + w, 0);
  if (total <= 0) return OPENING_BOOK[0];
  let pick = Math.random() * total;
  for (const opening of OPENING_BOOK) {
    const w = prefs[opening.id] ?? 0;
    pick -= w;
    if (pick <= 0) return opening;
  }
  return OPENING_BOOK[0];
}

import {
  applyMove,
  classify,
  letterToPiece,
  listLegalMoves,
  MAKRUK_START_FEN,
  parseFen,
  toFen,
  type Color,
  type PieceMap,
  type Position,
  type Role,
} from './rules';

// ─── Personality registry (mirrors src/lib/personalities/personalities.ts) ─

type ScorerKey =
  | 'material'
  | 'attack'
  | 'defense'
  | 'center'
  | 'aggression'
  | 'randomness';

type PersonalityWeights = Partial<Record<ScorerKey, number>>;

const PERSONALITY_WEIGHTS: Record<string, PersonalityWeights> = {
  attacker:   { material: 0.6, attack: 0.4, aggression: 0.3, randomness: 0.1 },
  defender:   { material: 0.4, defense: 0.5, randomness: 0.1 },
  positional: { material: 0.4, center: 0.5, randomness: 0.1 },
  hunter:     { material: 0.8, attack: 0.3, randomness: 0.1 },
  wanderer:   { material: 0.2, randomness: 0.8 },
  mobile:     { material: 0.4, center: 0.3, randomness: 0.1 },
  cautious:   { material: 0.5, defense: 0.4, center: 0.2, randomness: 0.05 },
  // Fairy-Stockfish boss — no flavor, just play strong. Material-
  // heavy + balanced attack/defense; relies on the deeper search to
  // produce strong play rather than a personality quirk.
  'fairy-stockfish': { material: 0.7, attack: 0.3, defense: 0.3, center: 0.3, aggression: 0.2 },
};

// Search depth by tier. Each level deeper roughly doubles the strength
// at the cost of branching² CPU. With ~30 legal moves mid-game:
//   depth 1 = 30 evals       — basically heuristic move (Rookie)
//   depth 2 = 900 evals       — sees one opponent reply (Veteran)
//   depth 3 = 27,000 evals    — sees own follow-up (Master / Boss)
// Worker scheduled handlers have 30s CPU — even depth 3 across a
// 100-ply game stays well under budget (each eval is microseconds).
const TIER_DEPTH: Record<string, number> = {
  rookie: 1,
  veteran: 2,
  master: 3,
};
function depthFor(tier: string | null | undefined): number {
  return (tier && TIER_DEPTH[tier]) || 1;
}

// Piece values for Makruk — match client PIECE_VALUE.
const PIECE_VALUE: Record<Role, number> = {
  king:   1000,
  met:    1.5,
  khon:   2.5,
  knight: 2.5,
  rook:   5.0,
  bia:    1.0,
};

// ─── Scorers (pure over PieceMap + UCI) ────────────────────────────

function parseSquare(sq: string): { file: number; rank: number } | null {
  if (sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

function isEnemy(letter: string, side: Color): boolean {
  const upper = letter === letter.toUpperCase();
  return side === 'white' ? !upper : upper;
}

function isOwn(letter: string, side: Color): boolean {
  const upper = letter === letter.toUpperCase();
  return side === 'white' ? upper : !upper;
}

function materialScore(pieces: PieceMap, side: Color, move: string): number {
  const to = move.slice(2, 4);
  const target = pieces[to];
  if (!target || !isEnemy(target, side)) return 0;
  const piece = letterToPiece(target);
  if (!piece) return 0;
  const value = PIECE_VALUE[piece.role] ?? 1;
  return Math.min(value / 5, 1);
}

function attackScore(pieces: PieceMap, side: Color, move: string): number {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  let enemyNeighbors = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = sq.file + df;
      const r = sq.rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const neighbor = String.fromCharCode(97 + f) + (r + 1);
      const occ = pieces[neighbor];
      if (occ && isEnemy(occ, side)) enemyNeighbors++;
    }
  }
  return Math.min(enemyNeighbors / 4, 1);
}

function defenseScore(pieces: PieceMap, side: Color, move: string): number {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  let friendNeighbors = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const f = sq.file + df;
      const r = sq.rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const neighbor = String.fromCharCode(97 + f) + (r + 1);
      const occ = pieces[neighbor];
      if (occ && isOwn(occ, side)) friendNeighbors++;
    }
  }
  return Math.min(friendNeighbors / 4, 1);
}

function centerScore(move: string): number {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  const distFile = Math.abs(3.5 - sq.file);
  const distRank = Math.abs(3.5 - sq.rank);
  return 1 - (distFile + distRank) / 7;
}

function aggressionScore(side: Color, move: string): number {
  const sq = parseSquare(move.slice(2, 4));
  if (!sq) return 0;
  return side === 'white' ? sq.rank / 7 : (7 - sq.rank) / 7;
}

function scoreMove(
  pieces: PieceMap,
  side: Color,
  move: string,
  weights: PersonalityWeights,
): number {
  let total = 0;
  if (weights.material)   total += weights.material   * materialScore(pieces, side, move);
  if (weights.attack)     total += weights.attack     * attackScore(pieces, side, move);
  if (weights.defense)    total += weights.defense    * defenseScore(pieces, side, move);
  if (weights.center)     total += weights.center     * centerScore(move);
  if (weights.aggression) total += weights.aggression * aggressionScore(side, move);
  if (weights.randomness) total += weights.randomness * Math.random();
  return total;
}

// ─── Static evaluator + minimax search ────────────────────────────

const PIECE_SQUARES = (() => {
  // Precompute every (file, rank) → "centerDist" so the per-move
  // staticEval below doesn't recompute strings inside its inner loop.
  const out = new Map<string, number>();
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const sq = String.fromCharCode(97 + f) + (r + 1);
      const dist = Math.abs(3.5 - f) + Math.abs(3.5 - r);
      out.set(sq, dist);
    }
  }
  return out;
})();

/** Static board evaluation from white's perspective. Material values
 *  + small center-control bonus. Positive = white better, negative =
 *  black better. Used as the leaf evaluator at the bottom of the
 *  minimax tree. */
function staticEval(pos: Position): number {
  let score = 0;
  for (const [sq, letter] of Object.entries(pos.pieces)) {
    const piece = letterToPiece(letter);
    if (!piece) continue;
    const value = PIECE_VALUE[piece.role];
    const centerBonus = (7 - (PIECE_SQUARES.get(sq) ?? 7)) * 0.02;
    const contribution = value + centerBonus;
    score += piece.color === 'white' ? contribution : -contribution;
  }
  return score;
}

// Mate scores use distance-to-mate so the engine prefers mate-in-2
// over mate-in-5. Sign reflects who is mated (loser POV).
const MATE_SCORE = 100_000;

/** Minimax with alpha-beta pruning. Returns score from white POV.
 *  Caller maximizes when it's white's turn at the root, minimizes
 *  when black's turn. Caps depth to avoid pathological branching. */
function minimax(
  pos: Position,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const status = classify(pos);
  if (status.state === 'checkmate') {
    // Loser perspective; closer mate is more valuable.
    return status.loser === 'white' ? -MATE_SCORE + (1 - depth) : MATE_SCORE - (1 - depth);
  }
  if (status.state === 'stalemate') return 0;
  if (depth <= 0) return staticEval(pos);

  const moves = listLegalMoves(pos);
  if (moves.length === 0) return staticEval(pos);

  if (pos.turn === 'white') {
    let best = -Infinity;
    for (const mv of moves) {
      const r = applyMove(pos, mv);
      if (!r.ok) continue;
      const val = minimax(r.position, depth - 1, alpha, beta);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const r = applyMove(pos, mv);
      if (!r.ok) continue;
      const val = minimax(r.position, depth - 1, alpha, beta);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ─── Engine: pick the best move using minimax + personality flavor ─

/** Pick a move using minimax at the tier-appropriate depth, blended
 *  with the bot's personality flavor. The minimax leg makes the bot
 *  play *sensibly* (no hanging pieces, sees one-move tactics at
 *  depth 2+); the personality leg makes it *recognizable* (attacker
 *  prefers captures + forward moves even when equal-scored). */
function pickMove(
  pos: Position,
  personalityId: string,
  tier: string,
): string | null {
  const moves = listLegalMoves(pos);
  if (moves.length === 0) return null;

  const weights = PERSONALITY_WEIGHTS[personalityId] ?? {
    material: 0.5,
    randomness: 0.2,
  };
  const depth = depthFor(tier);
  const sideSign = pos.turn === 'white' ? 1 : -1;
  // Personality flavor magnitude relative to material units. 0.4 of a
  // pawn worth of "personality preference" lets attacker prefer a
  // capture over a quiet developing move, but won't make any tier
  // sac a knight just because the move scores high on attack-count.
  const FLAVOR = 0.4;

  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const mv of moves) {
    const r = applyMove(pos, mv);
    if (!r.ok) continue;
    // staticEval is white-POV; minimax of children is white-POV; flip
    // to "side-to-move POV at the root" so larger = better for *us*.
    const childScore = sideSign * minimax(r.position, depth - 1, -Infinity, Infinity);
    const flavor = scoreMove(pos.pieces, pos.turn, mv, weights) * FLAVOR;
    const total = childScore + flavor;
    if (total > bestScore) {
      bestScore = total;
      bestMove = mv;
    }
  }
  return bestMove;
}

// ─── Simulate one full game ────────────────────────────────────────

const MAX_PLIES = 200;

export type ExhibitionResult = {
  whiteBotId: string;
  blackBotId: string;
  whitePersonality: string;
  blackPersonality: string;
  outcome: 'white-wins' | 'black-wins' | 'draw' | 'truncated';
  plyCount: number;
  moves: string[];
  finalFen: string;
};

export function simulateExhibitionGame(
  whiteBot: { id: string; personality: string; tier: string },
  blackBot: { id: string; personality: string; tier: string },
): ExhibitionResult {
  let pos = parseFen(MAKRUK_START_FEN);
  if (!pos) {
    throw new Error('exhibition.simulate: failed to parse start FEN');
  }
  const moves: string[] = [];

  // Opening book — white's personality picks the line; both sides
  // follow the 4 prescribed plies. Skips silently if any book move
  // is somehow illegal (data drift).
  const opening = pickOpening(whiteBot.personality);
  for (const bookMove of opening.moves) {
    const applied = applyMove(pos, bookMove);
    if (!applied.ok) break;
    pos = applied.position;
    moves.push(bookMove);
    const earlyStatus = classify(pos);
    if (earlyStatus.state !== 'ongoing') break;
  }

  for (let ply = moves.length; ply < MAX_PLIES; ply++) {
    const bot = pos.turn === 'white' ? whiteBot : blackBot;
    const move = pickMove(pos, bot.personality, bot.tier);
    if (move === null) break; // no legal moves — classify below

    const applied = applyMove(pos, move);
    if (!applied.ok) {
      // Pickmove already filtered to legal — if applyMove disagrees,
      // something is inconsistent. Stop the game and treat as draw.
      break;
    }
    pos = applied.position;
    moves.push(move);

    const status = classify(pos);
    if (status.state === 'checkmate') {
      return {
        whiteBotId: whiteBot.id,
        blackBotId: blackBot.id,
        whitePersonality: whiteBot.personality,
        blackPersonality: blackBot.personality,
        outcome: status.loser === 'white' ? 'black-wins' : 'white-wins',
        plyCount: moves.length,
        moves,
        finalFen: toFen(pos),
      };
    }
    if (status.state === 'stalemate') {
      return {
        whiteBotId: whiteBot.id,
        blackBotId: blackBot.id,
        whitePersonality: whiteBot.personality,
        blackPersonality: blackBot.personality,
        outcome: 'draw',
        plyCount: moves.length,
        moves,
        finalFen: toFen(pos),
      };
    }
  }

  return {
    whiteBotId: whiteBot.id,
    blackBotId: blackBot.id,
    whitePersonality: whiteBot.personality,
    blackPersonality: blackBot.personality,
    outcome: 'truncated',
    plyCount: moves.length,
    moves,
    finalFen: toFen(pos),
  };
}

// ─── Scheduled handler: pick 2 random bots + run + store ───────────

export async function runExhibitionTick(env: { DB: D1Database }): Promise<void> {
  // Pull all bots. Cheap query — 22 rows.
  const result = await env.DB.prepare(
    `SELECT id, bot_personality, bot_tier
       FROM users
      WHERE is_bot = 1 AND bot_personality IS NOT NULL`,
  ).all<{ id: string; bot_personality: string; bot_tier: string | null }>();

  const bots = result.results ?? [];
  if (bots.length < 2) return;

  // Two distinct random picks.
  const aIdx = Math.floor(Math.random() * bots.length);
  let bIdx = Math.floor(Math.random() * bots.length);
  if (bIdx === aIdx) bIdx = (bIdx + 1) % bots.length;
  const white = bots[aIdx];
  const black = bots[bIdx];

  const game = simulateExhibitionGame(
    {
      id: white.id,
      personality: white.bot_personality,
      tier: white.bot_tier ?? 'master',
    },
    {
      id: black.id,
      personality: black.bot_personality,
      tier: black.bot_tier ?? 'master',
    },
  );

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO bot_exhibition_games
      (id, white_bot_id, black_bot_id, outcome, ply_count, moves_json, final_fen, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      game.whiteBotId,
      game.blackBotId,
      game.outcome,
      game.plyCount,
      JSON.stringify(game.moves),
      game.finalFen,
      Date.now(),
    )
    .run();
}
