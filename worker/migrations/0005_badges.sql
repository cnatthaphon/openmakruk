-- Migration 0005 — server-side badges + shareable cert pages.
--
-- Badge catalog itself lives in code (worker/src/badges.ts) so adding
-- a new badge = drop a line in TS, not a DB migration. This table
-- only tracks WHO unlocked WHAT and WHEN.
--
-- shareable_slug is a public, unguessable URL fragment. Format:
-- `<base36-random>-<badge-id>` e.g. `a8x3z-rating-1500`. The cert
-- page at /#/cert/<slug> is public (no auth) and shows badge tier +
-- the user's display name + unlock timestamp.

CREATE TABLE IF NOT EXISTS user_badges (
  user_id        TEXT NOT NULL,
  badge_id       TEXT NOT NULL,
  unlocked_at    INTEGER NOT NULL,
  shareable_slug TEXT NOT NULL UNIQUE,
  PRIMARY KEY (user_id, badge_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON user_badges (user_id, unlocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_badges_recent
  ON user_badges (unlocked_at DESC);
