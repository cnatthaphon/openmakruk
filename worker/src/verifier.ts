// Game-record verification — replay submitted moves against the
// pure-JS Makruk rules engine and decide whether to mark `verified=1`
// in the games table.
//
// Why this matters: without verification, a user can POST any
// {outcome: 'win', opponent: 'master'} and the worker happily updates
// rating. That's exactly the cheat the user called out. With this
// module, the leaderboard query filters `verified = 1` and only
// fully-replayed games count toward the global score.
//
// The verifier is intentionally STRICT — illegal move = whole game
// rejected. There is no partial credit. A user who submits 39 legal
// moves and 1 buggy one fails verification entirely. The client's
// chessground/ffish stack produces legal UCI by construction so this
// shouldn't trigger in practice; it's a security boundary, not a
// usability feature.

import {
  applyMove,
  classify,
  MAKRUK_START_FEN,
  parseFen,
  toFen,
  type Color,
  type Position,
} from './rules';

export type GameOutcome = 'win' | 'loss' | 'draw';

export type VerifyInput = {
  /** UCI moves in play order. */
  moves: string[];
  /** Claimed final FEN — used as a cross-check against our replay. */
  finalFen: string;
  /** Claimed outcome from the user's POV. */
  outcome: GameOutcome;
  /** Which side the user played. */
  userSide: Color;
};

export type VerifyResult =
  | { ok: true; finalPosition: Position }
  | { ok: false; reason: string; failedAtPly?: number };

/**
 * Replay the entire move list from the standard makruk starting
 * position. Each move must be legal. The terminal classification at
 * the end of the log must match the claimed outcome.
 *
 *   outcome = 'win'   → opponent must be checkmated
 *   outcome = 'loss'  → user must be checkmated
 *   outcome = 'draw'  → stalemate OR halfmove >= 100 (50-move analog)
 *
 * We do NOT require finalFen to match exactly because the client may
 * send a slightly different halfmove counter; we compare placement
 * + turn only.
 */
export function verifyGame(input: VerifyInput): VerifyResult {
  const start = parseFen(MAKRUK_START_FEN);
  if (!start) return { ok: false, reason: 'start_position_unparseable' };

  let pos: Position = start;
  for (let i = 0; i < input.moves.length; i++) {
    const move = input.moves[i];
    const result = applyMove(pos, move);
    if (!result.ok) {
      return {
        ok: false,
        reason: `illegal_move: ${result.reason} at "${move}"`,
        failedAtPly: i + 1,
      };
    }
    pos = result.position;
  }

  // Cross-check FEN placement (ignore halfmove/fullmove counters which
  // the client may compute slightly differently).
  if (input.finalFen) {
    const claimed = parseFen(input.finalFen);
    if (!claimed) return { ok: false, reason: 'final_fen_unparseable' };
    if (!samePlacement(pos, claimed)) {
      return { ok: false, reason: 'final_fen_mismatch' };
    }
  }

  // Outcome check.
  const terminal = classify(pos);
  const userColor: Color = input.userSide;
  const opponent: Color = userColor === 'white' ? 'black' : 'white';

  if (input.outcome === 'win') {
    if (terminal.state !== 'checkmate' || terminal.loser !== opponent) {
      return {
        ok: false,
        reason: `outcome_mismatch: claimed win but state=${terminal.state}` +
                (terminal.state === 'checkmate' ? `,loser=${terminal.loser}` : ''),
      };
    }
  } else if (input.outcome === 'loss') {
    if (terminal.state !== 'checkmate' || terminal.loser !== userColor) {
      return {
        ok: false,
        reason: `outcome_mismatch: claimed loss but state=${terminal.state}` +
                (terminal.state === 'checkmate' ? `,loser=${terminal.loser}` : ''),
      };
    }
  } else {
    // draw: stalemate or sufficient halfmove counter for the 50-move
    // analog. The makruk counting rules are more complex but for
    // anti-cheat we accept the simpler check.
    if (terminal.state !== 'stalemate' && pos.halfmove < 100) {
      return {
        ok: false,
        reason: `outcome_mismatch: claimed draw but state=${terminal.state}, halfmove=${pos.halfmove}`,
      };
    }
  }

  return { ok: true, finalPosition: pos };
}

function samePlacement(a: Position, b: Position): boolean {
  const aKeys = Object.keys(a.pieces).sort();
  const bKeys = Object.keys(b.pieces).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (a.pieces[aKeys[i]] !== b.pieces[bKeys[i]]) return false;
  }
  return a.turn === b.turn;
}

/** Helper to expose the canonical final FEN for telemetry / debugging. */
export function finalFenFromMoves(moves: string[]): string | null {
  const start = parseFen(MAKRUK_START_FEN);
  if (!start) return null;
  let pos = start;
  for (const m of moves) {
    const r = applyMove(pos, m);
    if (!r.ok) return null;
    pos = r.position;
  }
  return toFen(pos);
}
