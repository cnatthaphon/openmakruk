-- Migration 0004 — bot characters as first-class users.
--
-- Design: bots ARE users. Same table, same rating column, same Elo
-- math — so they appear on the leaderboard naturally without a
-- second pipeline. What's different is they have null token_hash
-- (no one logs in as them), and a few bot-specific columns describe
-- their lore.
--
-- Why this over a separate bot_characters table:
--   * The leaderboard query (Phase 9A) already joins users; adding
--     bots to that join is zero code change.
--   * Match leaderboard filter "is_bot = 0" / "is_bot = 1" / mixed
--     becomes a one-line WHERE addition.
--   * Recording a game against a bot uses the bot's user_id as the
--     opponent — same string column the existing schema already has.
--
-- Privacy: NOT NULL token_hash on the original schema; we relax via
-- a unique partial index so bot rows can have token_hash = NULL.

-- The users.token_hash column was UNIQUE NOT NULL in 0001. SQLite
-- doesn't support ALTER COLUMN to remove NOT NULL; we have to rebuild
-- the table. Do it via a 4-step rename dance so the column is
-- nullable for bot rows going forward.

CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  token_hash    TEXT UNIQUE,                  -- now nullable; null = bot row
  rating        INTEGER NOT NULL DEFAULT 1000,
  province      TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0,   -- 0 = human, 1 = bot character
  bot_personality TEXT,                       -- e.g. 'attacker' (links to PERSONALITIES catalog)
  bot_tier      TEXT,                         -- 'rookie' | 'veteran' | 'master'
  bot_lore_th   TEXT,                         -- shown on bot profile + splash
  bot_avatar    TEXT,                         -- relative path (e.g. /pieces/bots/nakkrub.svg) or emoji
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

INSERT INTO users_new (id, display_name, token_hash, rating, province, created_at, last_seen_at)
SELECT id, display_name, token_hash, rating, province, created_at, last_seen_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Re-create the indexes that 0001 + 0003 added.
CREATE INDEX IF NOT EXISTS idx_users_rating
  ON users (rating DESC);

CREATE INDEX IF NOT EXISTS idx_users_province
  ON users (province) WHERE province IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_bots
  ON users (is_bot) WHERE is_bot = 1;

-- Seed the 22 bot character users. Stable ids prefixed `bot:` so:
--   * `games.opponent` already uses string ids → can store the bot's
--     user_id directly + JOIN naturally on the leaderboard
--   * grep finds bot rows fast in production debugging
--
-- Starting ratings calibrated to the tier ladder declared in STRATEGY:
--   rookie 1200 · veteran 1600 · master 2000 · boss (Fairy-Stockfish) 2200
--
-- INSERT OR REPLACE = idempotent; re-seeding updates lore without
-- destroying the rating column (because we don't touch it here).
-- Re-applying via wrangler migrations apply runs once per ID anyway,
-- but the safety belt is cheap.

INSERT INTO users (id, display_name, token_hash, rating, is_bot, bot_personality, bot_tier, bot_lore_th, bot_avatar, created_at, last_seen_at) VALUES
  ('bot:attacker-rookie',   '⚔️ นักบุก Rookie',    NULL, 1200, 1, 'attacker',   'rookie',  'อดีตทหารหมากรุกที่เพิ่งฝึก — บุกตลอด แต่ยังคำนวณตามไม่ทัน', '⚔️', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:attacker-veteran',  '⚔️ นักบุก Veteran',   NULL, 1600, 1, 'attacker',   'veteran', 'นักบุกประจำการ — sacrifice, open lines, h-pawn rush. จุดอ่อน: endgame', '⚔️', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:attacker-master',   '⚔️ นักบุก Master',    NULL, 2000, 1, 'attacker',   'master',  'จอมยุทธ์นักบุก — รุกตลอดทาง ปิดเกมเร็ว ไม่ปล่อยให้เข้า endgame', '⚔️', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:defender-rookie',   '🛡️ นักรับ Rookie',    NULL, 1200, 1, 'defender',   'rookie',  'มือใหม่หัดป้องกัน — ไม่บุก แต่ก็ยังไม่รู้จุดอ่อนตัวเอง', '🛡️', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:defender-veteran',  '🛡️ นักรับ Veteran',   NULL, 1600, 1, 'defender',   'veteran', 'กำแพงเหล็ก — ปิดทุกช่อง ไม่บุก รอผู้เล่นพลาดเอง', '🛡️', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:defender-master',   '🛡️ นักรับ Master',    NULL, 2000, 1, 'defender',   'master',  'ปราการสุดท้าย — ป้องกันได้ทุกท่า บุกผ่านยากมาก', '🛡️', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:positional-rookie', '🧭 ตามตำแหน่ง Rookie', NULL, 1200, 1, 'positional', 'rookie',  'เรียนรู้หลักการตำแหน่ง — คุมกลาง พัฒนา แต่ยังตัดสินใจช้า', '🧭', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:positional-veteran','🧭 ตามตำแหน่ง Veteran',NULL, 1600, 1, 'positional', 'veteran', 'อาจารย์หมาก — เน้นตำแหน่ง เคลื่อนไหวเป็นรูปขบวน', '🧭', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:positional-master', '🧭 ตามตำแหน่ง Master',NULL, 2000, 1, 'positional', 'master',  'เซียนตำแหน่ง — ทุกตาเดินมีเหตุผล วางหมากไม่พลาด', '🧭', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:hunter-rookie',     '🦅 นักล่า Rookie',    NULL, 1200, 1, 'hunter',     'rookie',  'นักล่าตัวเล็ก — จับฟรีทุกตัวที่ลอย เห็นไกลแต่บางครั้งโดนหลอก', '🦅', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:hunter-veteran',    '🦅 นักล่า Veteran',   NULL, 1600, 1, 'hunter',     'veteran', 'นักล่าหมากตา — ไม่ปล่อยหมากลอย คิดล่วงหน้า 2 ตา', '🦅', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:hunter-master',     '🦅 นักล่า Master',    NULL, 2000, 1, 'hunter',     'master',  'อินทรีย์หมาก — เห็นทุกจุดอ่อน เก็บฟรีตลอดเกม', '🦅', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:wanderer-rookie',   '🍃 นักเดิน Rookie',   NULL, 800,  1, 'wanderer',   'rookie',  'หมากเหนือควบคุม — เดินสุ่ม บางครั้งดีอย่างน่าประหลาด', '🍃', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:wanderer-veteran',  '🍃 นักเดิน Veteran',  NULL, 1000, 1, 'wanderer',   'veteran', 'นักเดินมีเป้าหมาย — สุ่มแต่หลีกเลี่ยงพลาดใหญ่', '🍃', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:wanderer-master',   '🍃 นักเดิน Master',   NULL, 1300, 1, 'wanderer',   'master',  'นักเดินมือใหม่ระดับสูง — สับสนกว่า แต่ตัดสินใจสุดท้ายดี', '🍃', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:mobile-rookie',     '💨 คล่องตัว Rookie',  NULL, 1200, 1, 'mobile',     'rookie',  'รักษาตัวเลือกเยอะ — ไม่ปิดตัวเอง แต่ยังลังเล', '💨', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:mobile-veteran',    '💨 คล่องตัว Veteran', NULL, 1600, 1, 'mobile',     'veteran', 'นักหมากคล่อง — เคลื่อนหมากได้เยอะ บีบ space ของฝ่ายตรงข้าม', '💨', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:mobile-master',     '💨 คล่องตัว Master',  NULL, 2000, 1, 'mobile',     'master',  'เซียนความคล่อง — ทุกหมากมีงานทำ ฝ่ายตรงข้ามไม่มีที่อยู่', '💨', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:cautious-rookie',   '🐢 ระวังตัว Rookie',  NULL, 900,  1, 'cautious',   'rookie',  'มือใหม่ระวังตัว — เน้นป้องกัน ไม่กล้าเสี่ยง', '🐢', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:cautious-veteran',  '🐢 ระวังตัว Veteran', NULL, 1400, 1, 'cautious',   'veteran', 'นักหมากใจเย็น — ป้องกันก่อน บุกทีหลัง เกมยาว', '🐢', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('bot:cautious-master',   '🐢 ระวังตัว Master',  NULL, 1800, 1, 'cautious',   'master',  'พระอาจารย์ระวังตัว — แทบจะไม่แพ้ ใครจะหา 1 ในหลายเกมต้องเก่งจริง', '🐢', strftime('%s','now')*1000, strftime('%s','now')*1000),

  ('bot:fairy-stockfish-boss', '👑 Fairy-Stockfish (Boss)', NULL, 2200, 1, 'fairy-stockfish', 'master', 'จอมพลหมาก — engine แข็งที่สุดที่สาธารณะมี ไม่มีจุดอ่อน · ใครชนะคือเก่งจริง', '👑', strftime('%s','now')*1000, strftime('%s','now')*1000);
