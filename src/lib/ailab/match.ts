// AI Lab match runner — pit any two registered engines against each
// other and tally the result. The visible payoff of the contract
// work: random / minimax / MCTS / Fairy-Stockfish all implement
// MakrukEngine, so any pairing "just works" here.
//
// Uses getEngineById (adhoc engine instances) rather than
// setActiveEngine, so running a Lab match NEVER disturbs the engine
// the user picked for play. ffish drives legal moves + terminal
// detection. Colors alternate each game for fairness; a per-game seed
// derived from the base seed keeps the whole match reproducible.

import { getEngineById } from '../engine';
import { loadFfish } from '../makruk';
import type { SearchOpts } from '../engines/types';

export type Outcome = 'a-win' | 'b-win' | 'draw';

export type MatchGame = {
  index: number;
  /** Which engine id played white this game. */
  white: string;
  result: string; // ffish '1-0' / '0-1' / '1/2-1/2' / '*' (ply cap)
  outcome: Outcome;
  plies: number;
};

export type Tally = { wins: number; losses: number; draws: number };

export type MatchResult = {
  aId: string;
  bId: string;
  a: Tally;
  b: Tally;
  games: MatchGame[];
  /** A's score as a fraction in [0,1]: (wins + 0.5·draws) / games. */
  aScore: number;
};

export type MatchProgress = {
  game: number;
  totalGames: number;
  ply: number;
};

export type MatchOpts = {
  aId: string;
  bId: string;
  games: number;
  /** Per-move search budget handed to BOTH engines (each ignores what
   *  doesn't apply — alpha-beta reads `depth`, MCTS reads `nodes`). */
  search?: SearchOpts;
  /** Hard ply cap per game; reached without a result → scored a draw. */
  plyCap?: number;
  /** Base seed; game g uses `${seed}:g:${g}` so the match is
   *  reproducible end to end. */
  seed?: string;
  onProgress?: (p: MatchProgress) => void;
  /** Cooperative cancel — checked between moves. */
  shouldStop?: () => boolean;
};

const DEFAULT_PLY_CAP = 120;

type FfishBoard = {
  legalMoves: () => string;
  push: (uci: string) => boolean;
  fen: () => string;
  isGameOver: (countRules?: boolean) => boolean;
  result: (countRules?: boolean) => string;
  delete: () => void;
};

/**
 * Play `games` games between engine `aId` and `bId`. A plays white on
 * even-indexed games, black on odd, so material/first-move advantage
 * is shared. Returns the tally from A's perspective + per-game records.
 */
export async function playMatch(opts: MatchOpts): Promise<MatchResult> {
  const {
    aId,
    bId,
    games,
    search = {},
    plyCap = DEFAULT_PLY_CAP,
    seed,
    onProgress,
    shouldStop,
  } = opts;

  const ffish = await loadFfish();
  // Adhoc instances — does NOT change the active play engine.
  const [engineA, engineB] = await Promise.all([getEngineById(aId), getEngineById(bId)]);

  const a: Tally = { wins: 0, losses: 0, draws: 0 };
  const b: Tally = { wins: 0, losses: 0, draws: 0 };
  const gameRecords: MatchGame[] = [];

  for (let g = 0; g < games; g++) {
    if (shouldStop?.()) break;
    // A is white on even games; swap each game.
    const aIsWhite = g % 2 === 0;
    const whiteEngine = aIsWhite ? engineA : engineB;
    const blackEngine = aIsWhite ? engineB : engineA;
    const whiteId = aIsWhite ? aId : bId;

    const board = new ffish.Board('makruk') as unknown as FfishBoard;
    let plies = 0;
    let resultStr = '*';
    try {
      for (; plies < plyCap; plies++) {
        if (shouldStop?.()) break;
        if (board.isGameOver(true)) {
          resultStr = board.result(true);
          break;
        }
        onProgress?.({ game: g + 1, totalGames: games, ply: plies });
        const whiteToMove = plies % 2 === 0;
        const engine = whiteToMove ? whiteEngine : blackEngine;
        // Per-(game,ply) seed keeps stochastic engines reproducible.
        const moveSeed = seed ? `${seed}:g${g}:p${plies}` : undefined;
        const res = await engine.search(board.fen(), { ...search, seed: moveSeed });
        const mv = res.bestMove;
        if (!mv || mv === '(none)' || mv === '0000') break;
        if (!board.legalMoves().split(' ').includes(mv)) break; // engine bug → stop game
        board.push(mv);
      }
      // Ply cap reached with no terminal → call it a draw (long game).
      if (resultStr === '*' && board.isGameOver(true)) resultStr = board.result(true);
    } finally {
      board.delete();
    }

    // Translate white-POV result → outcome for A.
    let outcome: Outcome;
    if (resultStr === '1-0') outcome = aIsWhite ? 'a-win' : 'b-win';
    else if (resultStr === '0-1') outcome = aIsWhite ? 'b-win' : 'a-win';
    else outcome = 'draw'; // '1/2-1/2' or '*' (ply cap)

    if (outcome === 'a-win') { a.wins++; b.losses++; }
    else if (outcome === 'b-win') { a.losses++; b.wins++; }
    else { a.draws++; b.draws++; }

    gameRecords.push({ index: g, white: whiteId, result: resultStr, outcome, plies });
  }

  const played = gameRecords.length;
  const aScore = played > 0 ? (a.wins + 0.5 * a.draws) / played : 0;
  return { aId, bId, a, b, games: gameRecords, aScore };
}
