// Elo rating math — same K-factor and CPU rating table as the client
// (src/lib/stats.ts). Kept in sync by convention; if these drift the
// server-computed rating will not match what the client expects to see.
//
// Why duplicate the constants here instead of importing: the worker
// bundle must stay tiny and standalone. A 5-constant duplication is
// cheaper than reaching into the larger client module graph.

export type Difficulty = 'easy' | 'medium' | 'hard' | 'master';

const K_FACTOR = 32;

export const CPU_RATINGS: Record<Difficulty, number> = {
  easy: 800,
  medium: 1400,
  hard: 1900,
  master: 2500,
};

/** Personality bots' nominal Elo when they appear as `opponent =
 *  personality:<id>`. The client's PERSONALITIES catalog has a richer
 *  approxElo per personality; the server uses a single bucket because
 *  it does not (and should not) need to know every personality id.
 *  Override later if needed by parsing the suffix. */
const PERSONALITY_DEFAULT_ELO = 1000;

/** Resolve an opponent label to a numeric rating. */
export function opponentRating(opponent: string): number {
  if (opponent in CPU_RATINGS) {
    return CPU_RATINGS[opponent as Difficulty];
  }
  if (opponent.startsWith('personality:')) return PERSONALITY_DEFAULT_ELO;
  if (opponent === 'random-bot') return 600;
  if (opponent === 'greedy-bot') return 850;
  // Unknown opponent — pessimistic default so an exotic engine name
  // can't be used to inflate user rating against an unrated bot.
  return 1000;
}

export type Outcome = 'win' | 'loss' | 'draw';

const SCORE: Record<Outcome, number> = { win: 1, draw: 0.5, loss: 0 };

/** Vanilla Elo update. Returns the new rating + delta. */
export function applyElo(
  userRating: number,
  opponentRatingNum: number,
  outcome: Outcome,
): { newRating: number; delta: number } {
  const expected = 1 / (1 + Math.pow(10, (opponentRatingNum - userRating) / 400));
  const delta = Math.round(K_FACTOR * (SCORE[outcome] - expected));
  return { newRating: userRating + delta, delta };
}
