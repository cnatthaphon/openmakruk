-- Migration 0010 — client-side crash reports.
--
-- Rationale: the React ErrorBoundary shows a recovery fallback and the
-- client keeps an in-memory log ring buffer, but until now a crash
-- never left the browser. Post-launch that means we'd be blind to real
-- failures (a white-screened tab, a chunk that fails to parse, an
-- engine init that throws). This table is the sink for a narrow,
-- privacy-respecting crash-reporting channel (POST /api/errors).
--
-- Privacy (same discipline as 0008_feedback):
--   - `user_id` is set only if the reporter happened to be signed in
--     AND sent a bearer. The client sends crash reports ANONYMOUSLY by
--     design (crash telemetry needs no identity), so in practice this
--     is almost always null.
--   - We do NOT store IP or user-agent. The only environment fields are
--     the build SHA, the UI locale, and the route PATH (no query, no
--     hash params — those can carry ids).
--   - `stack` / `component_stack` are truncated client-side before send.
--
-- Rate limiting + payload caps are enforced at the route level — see
-- worker/src/routes/errors.ts.

CREATE TABLE IF NOT EXISTS client_errors (
  id              TEXT PRIMARY KEY,       -- UUID v4
  user_id         TEXT,                   -- nullable; null = anonymous
  scope           TEXT,                   -- ErrorBoundary scope or 'window' / 'promise'
  message         TEXT NOT NULL,
  stack           TEXT,                   -- truncated client-side
  component_stack TEXT,                   -- React component stack, truncated
  build_sha       TEXT,                   -- which build the user saw
  locale          TEXT,                   -- e.g. 'th-TH'
  url_path        TEXT,                   -- route path only; no query/hash
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created
  ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user
  ON client_errors (user_id, created_at DESC) WHERE user_id IS NOT NULL;
-- Group by message to spot the loudest crashes fast.
CREATE INDEX IF NOT EXISTS idx_client_errors_message
  ON client_errors (message, created_at DESC);
-- Server-side duplicate cap: same crash fingerprint in a short window.
CREATE INDEX IF NOT EXISTS idx_client_errors_fingerprint
  ON client_errors (message, scope, url_path, created_at DESC);
