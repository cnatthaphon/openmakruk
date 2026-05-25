-- Migration 0001 — initial schema (5 core tables).
--
-- Apply: `npm run db:migrate` (local) / `npm run db:migrate:remote` (prod)
-- Internally: `wrangler d1 migrations apply openmakruk-db [--remote]`
--
-- Conventions:
--   * Time columns store unix-ms integers (not TEXT/ISO) so range
--     queries are cheap and timezone-free.
--   * IDs are TEXT (UUID v4) generated client- or worker-side. Avoids
--     autoincrement scanning hot spots and lets clients reference
--     their own pending writes optimistically.
--   * JSON fields (themes, moves, solution) are stored as TEXT and
--     parsed in the worker. D1 has no JSON1 extension on every node,
--     so portable TEXT is safer than `json_extract`.
--   * No CASCADE deletes — we keep historical writes even if a user
--     row is removed, since deletion is rare and forensic value > cost.
--
-- Idempotent via `IF NOT EXISTS` — safe to re-run, and lets the
-- existing manually-applied production DB pass migration tracking
-- without erroring out.

------------------------------------------------------------------
-- users
------------------------------------------------------------------
-- Anonymous accounts. No email/password — identity is held in a
-- bearer token whose SHA-256 hash lives in token_hash. The raw token
-- is returned ONCE on user creation and never re-derivable from the
-- server, mirroring how API-key services work.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  rating        INTEGER NOT NULL DEFAULT 1000,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_rating
  ON users (rating DESC);

------------------------------------------------------------------
-- games — every completed game record
------------------------------------------------------------------
-- `verified = 1` only after the worker has replayed the move log
-- against Fairy-Stockfish and confirmed (a) all moves were legal,
-- (b) the claimed outcome matches the terminal position, (c) no
-- ply count anomalies (>500 = obvious abuse). Unverified rows are
-- accepted but excluded from leaderboard aggregation.

CREATE TABLE IF NOT EXISTS games (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  opponent        TEXT NOT NULL,   -- 'easy'..'master' or 'personality:<id>'
  user_side       TEXT NOT NULL,   -- 'white' | 'black'
  outcome         TEXT NOT NULL,   -- 'win' | 'loss' | 'draw'
  ply_count       INTEGER NOT NULL,
  moves_json      TEXT NOT NULL,   -- JSON array of UCI moves
  final_fen       TEXT NOT NULL,
  rating_before   INTEGER,
  rating_after    INTEGER,
  rating_delta    INTEGER,
  time_control_id TEXT,
  mode            TEXT,            -- 'rated' | 'casual'
  created_at      INTEGER NOT NULL,
  verified        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_games_user
  ON games (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_lb
  ON games (opponent, outcome, verified, created_at);

------------------------------------------------------------------
-- puzzles — single pool, curated + user-mined + auto-mined
------------------------------------------------------------------
-- `source` distinguishes provenance. UI surfaces curated by default;
-- user/auto sources are opt-in filters. `verified_by` is set to
-- 'engine' after the worker's Fairy-Stockfish verification pass.

CREATE TABLE IF NOT EXISTS puzzles (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,   -- 'mate-1'|'mate-2'|'tactic'|'counting'|'defense'
  fen           TEXT NOT NULL,
  solution_json TEXT NOT NULL,   -- JSON array of UCI moves
  to_move       TEXT NOT NULL,   -- 'white' | 'black'
  rating        INTEGER NOT NULL,
  prompt        TEXT,
  themes_json   TEXT,            -- JSON array
  source        TEXT NOT NULL,   -- 'curated' | 'user-mined' | 'auto-mined'
  author_id     TEXT,            -- null for curated
  verified_by   TEXT,            -- 'engine' | 'curator' | null
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_puzzles_cat_rating
  ON puzzles (category, rating);

CREATE INDEX IF NOT EXISTS idx_puzzles_source
  ON puzzles (source, created_at DESC);

------------------------------------------------------------------
-- puzzle_solves — per-user attempt log
------------------------------------------------------------------
-- One row per (user, puzzle, attempt_timestamp). Multiple attempts
-- on the same puzzle are kept so we can compute "best time" and
-- "attempts to solve" metrics. Caller dedupes UI-side if it wants
-- "latest only".

CREATE TABLE IF NOT EXISTS puzzle_solves (
  user_id     TEXT NOT NULL,
  puzzle_id   TEXT NOT NULL,
  outcome     TEXT NOT NULL,    -- 'solved' | 'partial' | 'failed'
  time_ms     INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 1,
  hints_used  INTEGER NOT NULL DEFAULT 0,
  solved_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, puzzle_id, solved_at),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id)
);

CREATE INDEX IF NOT EXISTS idx_solves_user
  ON puzzle_solves (user_id, solved_at DESC);

------------------------------------------------------------------
-- leaderboard_cache — computed snapshots
------------------------------------------------------------------
-- Materialized view replacement: re-computed by a periodic Worker job
-- (cron trigger, later) and read by GET /api/leaderboard. Cheaper than
-- recomputing top-N from games on every leaderboard fetch.

CREATE TABLE IF NOT EXISTS leaderboard_cache (
  category     TEXT NOT NULL,   -- 'match' | 'puzzles' | 'streak' | 'rating'
  user_id      TEXT NOT NULL,
  display_name TEXT NOT NULL,   -- denormalized so leaderboard reads
                                --  don't need to JOIN users
  score        INTEGER NOT NULL,
  rank         INTEGER NOT NULL,
  computed_at  INTEGER NOT NULL,
  PRIMARY KEY (category, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_rank
  ON leaderboard_cache (category, rank);
