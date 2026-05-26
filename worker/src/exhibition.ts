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
// Game cap: 200 plies. After that, mark as 'truncated' (draw-equivalent
// for the display layer). In practice attacker-vs-defender games tend
// to finish in 60-100 plies; the cap mostly protects against pathologic
// loops in low-Elo personalities like wanderer.

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
};

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

// ─── Engine: pick the best-scored legal move for a personality ──────

function pickMove(pos: Position, personalityId: string): string | null {
  const weights = PERSONALITY_WEIGHTS[personalityId];
  // Unknown / boss personalities fall back to slight material focus +
  // random — keeps games playable even if a bot's personality id isn't
  // in our weights map.
  const w = weights ?? { material: 0.5, randomness: 0.5 };
  const moves = listLegalMoves(pos);
  if (moves.length === 0) return null;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const mv of moves) {
    const s = scoreMove(pos.pieces, pos.turn, mv, w);
    if (s > bestScore) {
      bestScore = s;
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
  whiteBot: { id: string; personality: string },
  blackBot: { id: string; personality: string },
): ExhibitionResult {
  let pos = parseFen(MAKRUK_START_FEN);
  if (!pos) {
    throw new Error('exhibition.simulate: failed to parse start FEN');
  }
  const moves: string[] = [];

  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const personality =
      pos.turn === 'white' ? whiteBot.personality : blackBot.personality;
    const move = pickMove(pos, personality);
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
    `SELECT id, bot_personality FROM users WHERE is_bot = 1 AND bot_personality IS NOT NULL`,
  ).all<{ id: string; bot_personality: string }>();

  const bots = result.results ?? [];
  if (bots.length < 2) return;

  // Two distinct random picks.
  const aIdx = Math.floor(Math.random() * bots.length);
  let bIdx = Math.floor(Math.random() * bots.length);
  if (bIdx === aIdx) bIdx = (bIdx + 1) % bots.length;
  const white = bots[aIdx];
  const black = bots[bIdx];

  const game = simulateExhibitionGame(
    { id: white.id, personality: white.bot_personality },
    { id: black.id, personality: black.bot_personality },
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
