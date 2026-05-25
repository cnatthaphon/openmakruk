-- Migration 0002 — code-golf table + schema version sentinel.
--
-- Adds the puzzle_golf table (introduced in Phase 9E) and a
-- schema_meta key/value table for runtime version sanity checks.

------------------------------------------------------------------
-- puzzle_golf — code-golf attempts on mate puzzles
------------------------------------------------------------------
-- Code-golf mode: solve a mate puzzle in the FEWEST plies, not just
-- the canonical solution length. Each attempt logs the move sequence
-- + ply count. Server verifies via the rules engine before insert,
-- so unverified attempts never persist. Leaderboard = MIN(ply_count)
-- per (puzzle_id, user_id) for the user's best, and MIN globally for
-- the puzzle's record.

CREATE TABLE IF NOT EXISTS puzzle_golf (
  puzzle_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  ply_count    INTEGER NOT NULL,
  moves_json   TEXT NOT NULL,
  attempted_at INTEGER NOT NULL,
  PRIMARY KEY (puzzle_id, user_id, attempted_at),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_golf_puzzle_best
  ON puzzle_golf (puzzle_id, ply_count);

CREATE INDEX IF NOT EXISTS idx_golf_user
  ON puzzle_golf (user_id, attempted_at DESC);

------------------------------------------------------------------
-- Schema version sentinel — bump when applying breaking migrations.
-- Worker startup reads this and refuses to serve writes if its
-- expected version doesn't match (prevents silent data corruption
-- against a half-migrated DB).
------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_meta (key, value)
VALUES ('version', '2');
