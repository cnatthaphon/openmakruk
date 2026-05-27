// Shared bot-id constants for the worker.
//
// These ids match rows seeded in migration 0004_bot_characters.sql.
// Single source of truth so badge logic, journey checkpoints, and
// future "did the user beat X" features don't drift via copy-pasted
// string literals. Adding a new "famous" bot id = add it here, not
// inline in route code.

/** The boss tier of Fairy-Stockfish — the strongest opponent in the
 *  public catalog. Winning against this bot unlocks the `beat-boss`
 *  journey checkpoint and the highest-tier bot-vs-human badge. */
export const BOSS_BOT_ID = 'bot:fairy-stockfish-boss';
