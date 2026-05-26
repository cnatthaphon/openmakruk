-- 0007 — Seasonal ladder.
--
-- Quarterly snapshots of the top of each leaderboard. At the end of
-- each calendar quarter the worker cron walks the users table and
-- writes the top N (per scope: global / region / province) into
-- season_winners. These rows are write-once — once a season closes
-- its winners are permanent.
--
-- The "active" season is computed each call to /api/seasons/active
-- from the current calendar quarter; no row in `seasons` represents
-- the active one until rollover. This avoids the chicken-and-egg
-- problem of needing to create a row before any data exists.
--
-- Schema is additive — no destructive change to existing tables.

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,           -- e.g. "2026-Q1"
  label TEXT NOT NULL,           -- "Q1 2026"
  starts_at INTEGER NOT NULL,    -- unix ms (start of quarter)
  ends_at INTEGER NOT NULL,      -- unix ms (end of quarter, inclusive)
  closed_at INTEGER,             -- unix ms when winners were recorded; NULL = active
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS season_winners (
  season_id TEXT NOT NULL,
  scope TEXT NOT NULL,           -- 'global' | 'region:<id>' | 'province:<code>'
  rank INTEGER NOT NULL,         -- 1, 2, 3
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,    -- snapshot at close-time (in case user renames later)
  rating INTEGER NOT NULL,       -- snapshot rating at close-time
  PRIMARY KEY (season_id, scope, rank),
  FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX IF NOT EXISTS idx_season_winners_user
  ON season_winners(user_id);
