-- AUTO-GENERATED — do not edit by hand.
-- Source: public/content/puzzles/all.json
-- Regenerate: node worker/scripts/seed-curated.mjs
--
-- INSERT OR REPLACE so re-running is idempotent + lets us update
-- prompt/themes for existing curated puzzles without writing a
-- separate migration. The created_at column is set from a stable
-- per-puzzle hash of the id so the leaderboard sort order doesn't
-- shuffle on every reseed.


INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-001', 'mate-1', '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา', '["back-rank","rook-king-mate"]',
             'curated', NULL, 'curator', 1735986554729);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-002', 'mate-1', '7k/R7/8/8/8/8/8/1R3K2 w - - 0 1',
             '["b1b8"]', 'white', 900,
             'ขาวเดิน · รุกจน 1 ตา (สองเรือ ladder)', '["ladder-mate","two-rooks"]',
             'curated', NULL, 'curator', 1735986554730);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-003', 'mate-1', '7k/5ppp/8/8/8/8/8/R1K5 w - - 0 1',
             '["a1a8"]', 'white', 750,
             'ขาวเดิน · รุกจน 1 ตา (back-rank — เบี้ยปิดทางหนีให้ขุนตัวเอง)', '["back-rank","trapped-king"]',
             'curated', NULL, 'curator', 1735986554731);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-004', 'mate-1', '2k5/8/2K5/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 850,
             'ขาวเดิน · รุกจน 1 ตา (K+R ไล่ขุนเปลือย)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554732);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-005', 'mate-1', '3k4/3M4/3K4/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 1000,
             'ขาวเดิน · รุกจน 1 ตา (เม็ดช่วยปิด)', '["back-rank","met-support"]',
             'curated', NULL, 'curator', 1735986554733);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-006', 'mate-1', '7k/8/6K1/8/8/8/8/4R3 w - - 0 1',
             '["e1e8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (เรือเดินขึ้นแถว 8)', '["back-rank","rook-king-mate"]',
             'curated', NULL, 'curator', 1735986554734);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-001', 'mate-2', 'k7/8/1K6/7R/8/8/8/8 w - - 0 1',
             '["h5h7","a8b8","h7h8"]', 'white', 1100,
             'ขาวเดิน · รุกจนใน 2 ตา (K+R vs K ladder)', '["k-and-rook","ladder-mate","endgame-technique"]',
             'curated', NULL, 'curator', 1736309790257);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-001', 'tactic', '6k1/8/8/7r/8/6N1/8/6K1 w - - 0 1',
             '["g3h5"]', 'white', 700,
             'ขาวเดิน · ฟรี! จับตัวที่ไม่มีใครป้องกัน', '["hanging-piece","knight"]',
             'curated', NULL, 'curator', 1736825100260);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-002', 'tactic', '7k/8/8/4m3/8/8/8/4R1K1 w - - 0 1',
             '["e1e5"]', 'white', 600,
             'ขาวเดิน · เม็ดดำที่ e5 ไม่มีใครป้องกัน', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100259);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-003', 'tactic', '7k/8/8/2s1m3/3P4/8/8/6K1 w - - 0 1',
             '["d4c5"]', 'white', 900,
             'ขาวเดิน · เลือกจับให้ฉลาด — มี 2 ทาง แต่ตัวไหนค่ามากกว่า?', '["pawn-capture","best-capture","material-value"]',
             'curated', NULL, 'curator', 1736825100258);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-004', 'tactic', '7k/8/8/Rm6/8/8/8/6K1 w - - 0 1',
             '["a5b5"]', 'white', 550,
             'ขาวเดิน · เม็ดดำลอย ไม่มีใครป้องกัน', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100257);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-001', 'counting', '7R/8/8/8/8/1K6/8/k7 w - - 0 1',
             '["h8h1"]', 'white', 850,
             'ฝ่ายดำเหลือขุนเปลือย · นับ K+R = 16 ตา · รุกจน 1 ตา', '["counting","k-and-rook","corner-mate","back-rank"]',
             'curated', NULL, 'curator', 1737463869911);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-002', 'counting', '2k5/8/2K5/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 800,
             'นับ K+R vs K · เหลือ 16 ตา · จบให้ทัน 1 ตา', '["counting","k-and-rook","opposition"]',
             'curated', NULL, 'curator', 1737463869912);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-003', 'counting', '7k/R7/6K1/8/8/8/8/1R6 w - - 0 1',
             '["b1b8"]', 'white', 950,
             'นับ K+R+R vs K · เหลือ 8 ตา · จบให้ทัน 1 ตา', '["counting","two-rooks","ladder-mate"]',
             'curated', NULL, 'curator', 1737463869913);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-004', 'counting', 'R7/8/8/8/8/6K1/8/7k w - - 0 1',
             '["a8a1"]', 'white', 850,
             'นับ K+R vs K · ขุนดำติดมุม h1 · รุกจน 1 ตา', '["counting","k-and-rook","corner-mate","back-rank"]',
             'curated', NULL, 'curator', 1737463869914);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-005', 'counting', 'k7/8/K7/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 800,
             'นับ K+R vs K · เหลือ 16 ตา · จบ 1 ตา', '["counting","k-and-rook","opposition","corner-mate"]',
             'curated', NULL, 'curator', 1737463869915);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-006', 'counting', 'k7/7R/1K6/8/8/8/8/2R5 w - - 0 1',
             '["c1c8"]', 'white', 900,
             'นับ K+R+R vs K · เหลือ 8 ตา · จบ 1 ตา', '["counting","two-rooks","k-supports"]',
             'curated', NULL, 'curator', 1737463869916);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-007', 'counting', '4k3/R7/8/8/8/8/8/K6R w - - 0 1',
             '["h1h8"]', 'white', 950,
             'นับ K+R+R vs K · ขุนดำกลาง rank 8 · รุกจน 1 ตา', '["counting","two-rooks","ladder-mate"]',
             'curated', NULL, 'curator', 1737463869917);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-008', 'counting', '7k/8/6K1/R7/8/8/8/8 w - - 0 1',
             '["a5a7","h8g8","a7a8"]', 'white', 1150,
             'นับ K+R vs K · เหลือ 16 ตา · จบให้ทันใน 2 ตา', '["counting","k-and-rook","ladder-mate","mate-in-2"]',
             'curated', NULL, 'curator', 1737463869918);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-007', 'mate-1', '3k4/8/3K4/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (ขุน d8 + เรา d6)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554735);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-008', 'mate-1', '4k3/8/4K3/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (ขุน e8 + เรา e6)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554736);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-009', 'mate-1', '5k2/8/5K2/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (ขุน f8 + เรา f6)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554737);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-010', 'mate-1', '4k3/4M3/4K3/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 1050,
             'ขาวเดิน · รุกจน 1 ตา (เม็ดบล็อก e7)', '["back-rank","met-support","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554759);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-011', 'mate-1', '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1',
             '["a1a8"]', 'white', 750,
             'ขาวเดิน · back-rank mate (เบี้ยขาวปิดทางขุนดำ)', '["back-rank","trapped-king"]',
             'curated', NULL, 'curator', 1735986554760);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-012', 'mate-1', '7k/R7/8/4K3/8/8/8/1R6 w - - 0 1',
             '["b1b8"]', 'white', 950,
             'ขาวเดิน · 2 เรือ ladder mate · ขุนไกล', '["ladder-mate","two-rooks"]',
             'curated', NULL, 'curator', 1735986554761);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-013', 'mate-1', '1k6/8/1K6/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (ขุนดำ b8 + เรา b6)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554762);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate-014', 'mate-1', '6k1/8/6K1/8/8/8/8/R7 w - - 0 1',
             '["a1a8"]', 'white', 800,
             'ขาวเดิน · รุกจน 1 ตา (ขุนดำ g8 + เรา g6)', '["back-rank","k-and-rook"]',
             'curated', NULL, 'curator', 1735986554763);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-005', 'tactic', 'r3k3/8/3N4/8/8/8/8/4K3 w - - 0 1',
             '["d6e8"]', 'white', 850,
             'ขาวเดิน · ม้า fork ขุน + เรือ', '["fork","knight"]',
             'curated', NULL, 'curator', 1736825100256);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-006', 'tactic', 'k3r3/8/8/8/8/8/8/4R2K w - - 0 1',
             '["e1e8"]', 'white', 700,
             'ขาวเดิน · skewer ขุน-เรือ', '["skewer","rook"]',
             'curated', NULL, 'curator', 1736825100255);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-007', 'tactic', '7k/8/3m4/8/8/8/3R4/4K3 w - - 0 1',
             '["d2d6"]', 'white', 600,
             'ขาวเดิน · จับเม็ดดำที่ลอย', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100254);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-008', 'tactic', '7k/8/8/3p4/2P5/8/8/4K3 w - - 0 1',
             '["c4d5"]', 'white', 550,
             'ขาวเดิน · เบี้ยจับเบี้ย', '["pawn-capture"]',
             'curated', NULL, 'curator', 1736825100253);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-009', 'tactic', '4k3/8/4s3/8/4R3/8/8/4K3 w - - 0 1',
             '["e4e6"]', 'white', 650,
             'ขาวเดิน · จับโคนดำที่ลอย', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100252);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-010', 'tactic', '4k3/8/4n3/8/8/8/8/4R2K w - - 0 1',
             '["e1e6"]', 'white', 600,
             'ขาวเดิน · จับม้าดำที่ลอย', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100230);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-011', 'tactic', 'r3k3/8/8/8/3N4/8/8/4K3 w - - 0 1',
             '["d4c6"]', 'white', 750,
             'ขาวเดิน · ม้ากระโดดโจมตีเรือดำที่ลอย', '["knight","attack-rook"]',
             'curated', NULL, 'curator', 1736825100229);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-012', 'tactic', '4k3/8/8/2p5/3P4/8/8/4K3 w - - 0 1',
             '["d4c5"]', 'white', 550,
             'ขาวเดิน · เบี้ยจับเบี้ยซ้าย', '["pawn-capture"]',
             'curated', NULL, 'curator', 1736825100228);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-013', 'tactic', '4k3/8/8/8/8/2r5/8/2R1K3 w - - 0 1',
             '["c1c3"]', 'white', 600,
             'ขาวเดิน · จับเรือดำที่ลอยใน file เดียวกัน', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100227);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-014', 'tactic', '7k/8/8/8/3r4/8/3R4/4K3 w - - 0 1',
             '["d2d4"]', 'white', 600,
             'ขาวเดิน · จับเรือดำที่ลอย', '["hanging-piece","rook"]',
             'curated', NULL, 'curator', 1736825100226);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-015', 'tactic', '4k3/8/8/3p4/8/2N5/8/4K3 w - - 0 1',
             '["c3d5"]', 'white', 600,
             'ขาวเดิน · ม้ากระโดดจับเบี้ย', '["knight","pawn-capture"]',
             'curated', NULL, 'curator', 1736825100225);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-016', 'tactic', '4k3/8/2p5/3S4/8/8/8/4K3 w - - 0 1',
             '["d5c6"]', 'white', 600,
             'ขาวเดิน · โคนจับเบี้ยทแยง', '["khon","capture"]',
             'curated', NULL, 'curator', 1736825100224);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('tactic-017', 'tactic', '4k3/8/2p5/3M4/8/8/8/4K3 w - - 0 1',
             '["d5c6"]', 'white', 600,
             'ขาวเดิน · เม็ดจับเบี้ยทแยง', '["met","capture"]',
             'curated', NULL, 'curator', 1736825100223);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-009', 'counting', '3k4/8/3K4/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 850,
             'นับ K+R vs K · ขุนดำ d8 · เหลือ 16 ตา · จบ 1 ตา', '["counting","k-and-rook","opposition"]',
             'curated', NULL, 'curator', 1737463869919);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-010', 'counting', '5k2/8/5K2/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 850,
             'นับ K+R vs K · ขุนดำ f8 · จบ 1 ตา', '["counting","k-and-rook"]',
             'curated', NULL, 'curator', 1737463869941);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-011', 'counting', '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1',
             '["a1a8"]', 'white', 750,
             'นับใน back-rank mate (เบี้ยปิดทางตัวเอง) · 1 ตา', '["counting","back-rank","trapped-king"]',
             'curated', NULL, 'curator', 1737463869942);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-012', 'counting', '1k6/8/1K6/8/8/8/8/7R w - - 0 1',
             '["h1h8"]', 'white', 850,
             'นับ K+R vs K · ขุนดำ b8 · จบ 1 ตา', '["counting","k-and-rook"]',
             'curated', NULL, 'curator', 1737463869943);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('counting-013', 'counting', '7k/R7/8/8/8/4K3/8/1R6 w - - 0 1',
             '["b1b8"]', 'white', 900,
             'นับ K+2R vs K · ขุนเราไกล · 1 ตา (count 8)', '["counting","two-rooks","ladder-mate"]',
             'curated', NULL, 'curator', 1737463869944);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('defense-001', 'defense', '4k3/6S1/8/8/8/8/8/4R3 b - - 0 1',
             '["e8d8"]', 'black', 750,
             'ดำเดิน · กำลังถูกรุก · หาตาเดียวที่หนีรอด', '["only-move","king-escape","defense"]',
             'curated', NULL, 'curator', 1736196692260);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('defense-002', 'defense', '4k3/8/8/3r4/8/8/8/R3K3 b - - 0 1',
             '["d5d8"]', 'black', 800,
             'ดำเดิน · ขาวรุกแถว 8 · บล็อกให้ได้', '["interpose","rook-block","defense"]',
             'curated', NULL, 'curator', 1736196692261);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('defense-003', 'defense', '7k/8/5S2/8/8/4K3/8/R7 b - - 0 1',
             '["h8h7"]', 'black', 700,
             'ดำเดิน · กำลังถูกรุก · หนีลงล่าง', '["only-move","king-escape","defense"]',
             'curated', NULL, 'curator', 1736196692262);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('defense-004', 'defense', '4k3/4R3/8/4r3/8/8/8/4K3 b - - 0 1',
             '["e5e7"]', 'black', 700,
             'ดำเดิน · จับตัวที่รุก', '["capture-attacker","defense"]',
             'curated', NULL, 'curator', 1736196692263);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('defense-005', 'defense', 'R3k3/3s4/8/8/8/8/8/4K3 b - - 0 1',
             '["d7c8"]', 'black', 850,
             'ดำเดิน · ขาวรุกแถว 8 · โคนช่วยบล็อก', '["interpose","khon-block","defense"]',
             'curated', NULL, 'curator', 1736196692264);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-002', 'mate-2', '8/8/8/7R/8/1K6/8/k7 w - - 0 1',
             '["h5h2","a1b1","h2h1"]', 'white', 1100,
             'ขาวเดิน · รุกจน 2 ตา (a1 corner ladder)', '["k-and-rook","ladder-mate","corner-mate"]',
             'curated', NULL, 'curator', 1736309790258);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-003', 'mate-2', '8/8/8/R7/8/6K1/8/7k w - - 0 1',
             '["a5a2","h1g1","a2a1"]', 'white', 1100,
             'ขาวเดิน · รุกจน 2 ตา (h1 corner ladder)', '["k-and-rook","ladder-mate","corner-mate"]',
             'curated', NULL, 'curator', 1736309790259);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-004', 'mate-2', '7k/8/6K1/8/8/1R6/8/8 w - - 0 1',
             '["b3b7","h8g8","b7b8"]', 'white', 1150,
             'ขาวเดิน · รุกจน 2 ตา (h8 corner · เรือเริ่ม b3)', '["k-and-rook","ladder-mate","corner-mate"]',
             'curated', NULL, 'curator', 1736309790260);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-005', 'mate-2', 'k7/8/1K6/8/5R2/8/8/8 w - - 0 1',
             '["f4f7","a8b8","f7f8"]', 'white', 1150,
             'ขาวเดิน · รุกจน 2 ตา (a8 corner · เรือเริ่ม f4)', '["k-and-rook","ladder-mate","corner-mate"]',
             'curated', NULL, 'curator', 1736309790261);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-006', 'mate-2', '7k/8/6K1/8/8/R7/8/1R6 w - - 0 1',
             '["g6f7","h8h7","a3h3"]', 'white', 1226,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790262);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-007', 'mate-2', '6k1/8/5K2/8/8/R7/8/1R6 w - - 0 1',
             '["a3g3","g8f8","b1b8"]', 'white', 1265,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790263);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-008', 'mate-2', '5k2/8/4K3/8/8/R7/8/1R6 w - - 0 1',
             '["a3g3","f8e8","b1b8"]', 'white', 1180,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790264);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-009', 'mate-2', '4k3/8/3K4/8/8/R7/8/1R6 w - - 0 1',
             '["a3f3","e8d8","b1b8"]', 'white', 1284,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790265);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-010', 'mate-2', 'k7/8/1K6/8/8/8/8/R3R3 w - - 0 1',
             '["b6c6","a8b8","e1e8"]', 'white', 1276,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790287);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-011', 'mate-2', '1k6/8/2K5/8/8/8/8/R3R3 w - - 0 1',
             '["c6d7","b8b7","e1b1"]', 'white', 1181,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790288);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-012', 'mate-2', '7k/R7/6K1/8/8/8/8/3R4 w - - 0 1',
             '["a7b7","h8g8","d1d8"]', 'white', 1215,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790289);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-013', 'mate-2', '7k/8/R7/6K1/8/8/8/3R4 w - - 0 1',
             '["a6g6","h8h7","d1h1"]', 'white', 1176,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790290);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-014', 'mate-2', 'k7/R7/2K5/8/8/8/8/3R4 w - - 0 1',
             '["a7c7","a8b8","d1d8"]', 'white', 1124,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790291);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-015', 'mate-2', '1k6/R7/2K5/8/8/8/8/3R4 w - - 0 1',
             '["a7c7","b8a8","d1d8"]', 'white', 1160,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790292);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-016', 'mate-2', '7k/6KN/8/8/8/8/R7/8 w - - 0 1',
             '["g7f7","h8h7","a2h2"]', 'white', 1113,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790293);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-017', 'mate-2', '6k1/5K1N/8/8/8/8/R7/8 w - - 0 1',
             '["f7g6","g8h8","a2a8"]', 'white', 1119,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790294);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-018', 'mate-2', '7k/7N/5K2/8/8/8/8/R7 w - - 0 1',
             '["h7g5","h8g8","a1a8"]', 'white', 1208,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790295);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-019', 'mate-2', '7k/R7/5KM1/8/8/8/8/8 w - - 0 1',
             '["a7b7","h8g8","b7b8"]', 'white', 1192,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790296);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-020', 'mate-2', '7k/8/6K1/8/8/8/8/R3M3 w - - 0 1',
             '["a1b1","h8g8","b1b8"]', 'white', 1290,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790318);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-021', 'mate-2', '7k/8/8/8/8/6K1/R7/3R4 w - - 0 1',
             '["a2a7","h8g8","d1d8"]', 'white', 1170,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790319);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-022', 'mate-2', '6k1/8/8/8/8/5K2/R7/3R4 w - - 0 1',
             '["a2a7","g8f8","d1d8"]', 'white', 1126,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790320);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-023', 'mate-2', '7k/8/8/6K1/8/8/R7/R7 w - - 0 1',
             '["g5g6","h8g8","a2a8"]', 'white', 1103,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790321);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-024', 'mate-2', '7k/8/5K2/8/8/8/R7/R7 w - - 0 1',
             '["f6f7","h8h7","a2h2"]', 'white', 1177,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790322);
INSERT OR REPLACE INTO puzzles
       (id, category, fen, solution_json, to_move, rating, prompt,
        themes_json, source, author_id, verified_by, created_at)
     VALUES ('mate2-025', 'mate-2', '6k1/8/4K3/8/8/8/R7/R7 w - - 0 1',
             '["a2g2","g8f8","a1a8"]', 'white', 1139,
             'ขาวเดิน · รุกจน 2 ตา', '["mate-in-2","auto-generated"]',
             'curated', NULL, 'curator', 1736309790323);
