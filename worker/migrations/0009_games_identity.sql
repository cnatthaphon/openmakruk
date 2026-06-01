-- PR #22 review (issue #21 follow-up): canonical game identity.
--
-- Previously the server minted its own UUID per game; the client also
-- minted its own local id. After cloud sync the two diverged — the
-- same finished game appeared as 2 history rows, and the delete
-- tombstone targeted the wrong id (so the server row stayed and the
-- next sync resurrected it).
--
-- Fix: client supplies `clientGameId` on POST, server uses it as the
-- primary key. Same id → idempotent (existing row's rating result is
-- returned without re-applying Elo).
--
-- Two new columns lift opponent identity onto the server:
--   rating_bucket  — explicit Elo bucket for bot/personality games
--                    so cloud→local sync can populate
--                    GameRecord.ratingBucket without guessing.
--   opponent_label — human-readable display string ('ผู้พิชิต Master');
--                    echoed back so a second device can render the bot
--                    nickname without round-tripping the bot registry.
--
-- Both are nullable for back-compat with rows written before this
-- migration — those rows came from the difficulty-only contract, so
-- the client lifts opponent → ratingBucket when receiving them.

ALTER TABLE games ADD COLUMN rating_bucket TEXT;
ALTER TABLE games ADD COLUMN opponent_label TEXT;
