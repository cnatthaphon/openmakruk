-- Migration 0003 — opt-in user province for region-based leaderboards.
--
-- Why province first, region derived:
--   * Provinces are atomic (77 in Thailand, ISO 3166-2:TH codes).
--   * Region (ภาค) is a many-to-one rollup that may change classification
--     over time (some sources use 4 regions, some 6 — official Thai
--     government typically uses 6). Storing province + computing region
--     at read time lets the rollup change without rewriting user data.
--   * Inter-province "war" leaderboards (กทม. vs เชียงใหม่) need
--     province-level granularity anyway.
--
-- Privacy:
--   * Province is OPT-IN. Default NULL = user opted out of regional UI.
--   * Self-declared in onboarding/Settings, never auto-detected from IP.
--     Thai IP-to-region geolocation is unreliable + invasive.
--   * Display name + rating + province are the only fields shown on
--     public regional leaderboards.

ALTER TABLE users ADD COLUMN province TEXT;

-- Index for region/province leaderboard queries. NULL rows skipped
-- by `WHERE province = ?`, so users who didn't declare aren't surfaced.
CREATE INDEX IF NOT EXISTS idx_users_province
  ON users (province) WHERE province IS NOT NULL;
