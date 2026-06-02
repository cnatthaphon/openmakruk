// Pick the canonical source-game id for a reviewed game (PR #23
// review). Pure + unit-testable — no engine, no React.
//
// The bug this guards: blindly taking `stats.history[0].id` attributes
// the reviewed game to whatever was recorded MOST RECENTLY, which is a
// DIFFERENT game when the current one is manual/self-play (unrecorded)
// or otherwise not the latest history entry. We only trust the
// recorded id when the latest recorded game is demonstrably THIS game —
// same ply count, same final FEN, and an identical move list. Anything
// short of that falls back to a stable per-current-game `live-<startedAt>`
// id, so provenance never points at a stale game.

import type { GameRecord } from '../stats';

export type PickSourceGameIdArgs = {
  /** Most recent recorded game (stats.history[0]), if any. */
  latestRecorded: GameRecord | undefined;
  /** Move list of the game currently being reviewed. */
  moves: string[];
  /** Final FEN of the game currently being reviewed. */
  finalFen: string;
  /** Stable per-current-game timestamp (gameStartedAtRef). */
  gameStartedAt: number;
};

export function pickReviewSourceGameId(args: PickSourceGameIdArgs): string {
  const { latestRecorded: g, moves, finalFen, gameStartedAt } = args;
  const isThisGame =
    !!g &&
    g.plyCount === moves.length &&
    g.finalFen === finalFen &&
    Array.isArray(g.moves) &&
    g.moves.length === moves.length &&
    g.moves.every((m, i) => m === moves[i]);
  return isThisGame ? g.id : `live-${gameStartedAt}`;
}
