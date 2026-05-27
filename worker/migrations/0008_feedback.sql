-- Migration 0008 — user-submitted feedback during beta.
--
-- Rationale: while OpenMakruk is in BETA we want a low-friction way
-- for visitors to report bugs / suggest features without forcing them
-- to a GitHub account. Server stores the message + optional contact
-- channel + the authenticated user (if any) + a few diagnostic fields
-- to help triage (build SHA, locale).
--
-- Privacy:
--   - `user_id` is only set if the submitter was signed in. Otherwise
--     null = "anonymous submission, untracked".
--   - We do NOT log IP, user-agent, or any identifier beyond what the
--     user explicitly chose to enable (cloud sync).
--   - `contact` is opt-in text the user can type (email / LINE / etc).
--     Empty = "I don't want a reply, just file this".
--
-- Rate limiting is enforced at the route level (per-user / per-IP
-- equivalent) — see worker/src/routes/feedback.ts.

CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,           -- UUID v4
  user_id     TEXT,                       -- nullable; null = anonymous
  message     TEXT NOT NULL,
  contact     TEXT,                       -- opt-in reply channel
  kind        TEXT NOT NULL,              -- 'bug' | 'feature' | 'praise' | 'other'
  build_sha   TEXT,                       -- which build the user saw
  locale      TEXT,                       -- e.g. 'th-TH' from navigator.language
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user
  ON feedback (user_id, created_at DESC) WHERE user_id IS NOT NULL;
