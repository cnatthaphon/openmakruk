# OpenMakruk · Strategic Direction

> สรุปการคุยทบทวนทิศทาง · 25 พ.ค. 2026
> Scope: positioning, competitive strategy, bot character system, roadmap

---

## Core thesis

> **"Makruk Improvement Platform with a Character-Driven Competition World"**
>
> — ไม่ใช่ Lichess ของหมากรุกไทย ไม่ใช่ playok ใหม่ ไม่ใช่ chess.com clone
> — เป็น **Chessable + ChessTempo + chess.com Bots** ที่โฟกัส Makruk ทั้งหมด

ใจกลาง flywheel:

```
   ┌───────────┐
   │  TRAIN    │  puzzles · lessons · การนับ
   │           │  ↓ skill เพิ่ม
   └─────┬─────┘
         │
         ▼
   ┌───────────┐
   │  COMPETE  │  vs character bots · tournaments
   │           │  ↓ rating เคลื่อน
   └─────┬─────┘
         │
         ▼
   ┌───────────┐
   │  CLIMB    │  leaderboards · achievements · streak
   │           │  ↓ motivation วน loop
   └─────┬─────┘
         │
         └─────────► back to TRAIN
```

---

## ทำไมไม่ทำ Multiplayer PvP

ตัด PvP ออกจาก roadmap ทั้งหมด ด้วยเหตุผล:

1. **Cold start เป็นนรก** — Makruk concurrent global ~50-200 คน. lobby ว่าง = user ไม่กลับ
2. **Supply มีอยู่แม้แย่** — playok / pychess / LINE groups รับ demand PvP แล้ว
3. **PDPA scope ขยายทันที** — chat + report + moderation = compliance burden
4. **ลาก resource ออกจาก moat จริง** — vision คือ "อยากฝึก อยากเรียน" ไม่ใช่ "หาคู่"

PvP ไม่ใช่ทางที่หายไป — แต่เป็นทางที่ **ไม่จำเป็น** เพราะ flywheel ข้างบนทำงานโดยไม่ต้องมี

---

## ทำไม Bot Character Tournament ตอบโจทย์

โครงสร้างที่มีอยู่แล้วในโค้ด v0.1:

- 7 personality bots (⚔️ นักบุก · 🛡️ นักรับ · 🧭 ตามตำแหน่ง · 🦅 นักล่า · 🍃 นักเดิน · 💨 คล่องตัว · 🐢 ระวังตัว)
- Match Score / Gauntlet / Events / Tournaments
- Global Match Leaderboard (verified=1)
- Server-side anti-cheat (replay verify)
- Engine plugin contract

ที่ขาดคือ **ยกระดับบอตจาก "feature ใน Settings" → "characters ที่มีตัวตน"** ลงแข่งกับมนุษย์อย่างเปิดเผย

ข้อดี:

- ✅ ไม่ขัด trust — บอตเปิดตัวชัด มี badge, ทุกคนรู้
- ✅ ไม่มี cold start — บอตอยู่ตลอด 24/7
- ✅ ไม่มี PDPA expansion — ไม่มี chat ไม่มี user-generated content
- ✅ Education + Competition + Entertainment รวมในตัว
- ✅ Marketing asset เกิดเอง — characters share ได้บน social
- ✅ Pattern พิสูจน์แล้วโดย chess.com (Magnus/Beth Harmon/Levy bots)
- ✅ ไม่มีคู่แข่งใน Makruk space

---

## Bot Character System (design)

### Character profile

แต่ละบอตขยายจาก emoji + name → personality ครบ:

```
⚔️ นักบุก (Phra Nakkrub)
─────────────────────────────────
"ไม่บุกไม่ใช่หมากรุก"

🎭 พื้นเพ:    อดีตทหารหมากรุกแห่งกรุงศรี
🎯 สไตล์:    sacrifice quick · open lines · h-pawn rush
💪 จุดเด่น:   tactical complications, attacking the king
🦴 จุดอ่อน:   endgame, defensive positions
⭐ Rating:    1820 (live, dynamic)
🏆 Tournaments won:  3
📊 Record vs you:    L 7 - W 3 - D 1
🎨 Avatar:    [illustrated character art — commission]
```

ใส่ใน:

- Profile page เฉพาะของบอต (เปิดจาก leaderboard ได้)
- Pre-game splash เมื่อแมตช์เริ่ม ("คุณกำลังแข่งกับ ⚔️ นักบุก")
- Result screen + tournament page

### Tier system

แต่ละ character มี 3 tier ปลดล็อกตามลำดับ:

| Bot | Rookie | Veteran | Master |
|---|---|---|---|
| ⚔️ นักบุก | 1200 | 1600 | 2000 |
| 🛡️ นักรับ | 1200 | 1600 | 2000 |
| 🧭 ตามตำแหน่ง | 1200 | 1600 | 2000 |
| 🦅 นักล่า | 1200 | 1600 | 2000 |
| 🍃 นักเดิน | 1200 | 1600 | 2000 |
| 💨 คล่องตัว | 1200 | 1600 | 2000 |
| 🐢 ระวังตัว | 1200 | 1600 | 2000 |
| 🤖 Fairy-Stockfish | — | — | 2200 (boss) |

→ Total 21 boss fights + 1 final boss = หลายเดือนของ progression

### Dynamic rating

**บอต rating ไม่ fix** — ปรับ Elo เหมือน user ปกติ:

- ทุกตัวเริ่ม 1500
- K-factor = ของ user
- ลงแข่ง tournament/match → rating เคลื่อนจริง
- "⚔️ นักบุก ขึ้น 1867 จาก streak ชนะ 6 เกม" = ข่าวจริง

ผลที่ได้:

- Leaderboard เคลื่อนไหวต่อเนื่อง
- Rating ของบอตสะท้อนฝีมือจริง (ไม่ใช่ตัวเลขสุ่ม)
- Math ของ Elo ไม่เพี้ยน (ไม่มี rating ปลอม inflate ผู้เล่น)

---

## Tournament / Event format

### Weekly recurring

- 🌅 **Sunday Showdown** — Real users + บอตทุกตัวลงแข่ง Swiss 7 รอบ. Top 3 badge + rating boost
- 🌙 **Nightly Bot Exhibition** — บอต round-robin ทุกคืน 22:00. Replay + engine commentary
- ⚡ **Speed Gauntlet** — ผู้ใช้สู้บอต 7 ตัวติด blitz 5 นาที. กี่คนผ่านครบ?
- 🎭 **Personality Challenge of the Week** — สัปดาห์นี้ "ชนะ 🐢 ระวังตัว 3 จาก 5". ผ่าน → badge

### Seasonal majors

- 🏆 **ศึกชิงเจ้าหมากรุก** — quarterly. Knockout 64 → 1 (mixed bots + humans)
- 🎄 **ปีใหม่ Championship** — annual. บอต "Boosted" version unlock เป็นบอส
- 🌸 **สงกรานต์ Open** — ทุกคนเล่นได้ พิเศษ: 7 วันต่อเนื่อง

### Narrative layer (auto-generated)

```
📢 ข่าวเด่นวันนี้
──────────────────
⚔️ นักบุก ชนะ 6 เกมรวด หลังจากแพ้ทัวร์อาทิตย์ที่แล้ว
  "ฟอร์มกลับมาแล้ว" Rating +47 → 1867

🐢 ระวังตัว เก็บ draw 4 เกมแถว Sunday Showdown
  ครองอันดับ 1 ติดต่อกัน 3 สัปดาห์

🎯 ผู้เล่นมนุษย์ #1 ของอาทิตย์: somchai_77
  ชนะ 🦅 นักล่า 4-1 series — เก่งขึ้นชัด
```

Template-driven จาก stats — ไม่ต้องเขียนเอง

---

## Training pillars (วิ่งคู่ขนาน)

### 🥇 การนับ (counting) trainer — UNIQUE MOAT

**ไม่มีเว็บใดในโลกสอนการนับ Makruk อย่างเป็นระบบ**

- มือใหม่งงที่สุด, มือเก่ายังนับพลาด, หาเรียนที่ไหนไม่ได้
- Drill format เหมาะมาก: เริ่มที่ 1, แก้ตำแหน่งให้นับชนะ/ห้ามแพ้
- Engine verify ความถูกต้อง 100%
- **ต้องเป็นฟีเจอร์ flagship ของ v0.2**

### Puzzle library 54 → 5,000+

- `puzzleMiner.ts` + auto factory มีในโค้ดแล้ว
- Self-play bot tournament รัน 24 ชม. หลายวัน + engine verify → puzzles เกิดเอง
- ScreenTempo มี 200k+ puzzles เพราะ mine — ทำได้

### Opening repertoire trainer (Chessable-style)

- Spaced repetition (มี SM-2 แล้วใน puzzle)
- Makruk opening lines มีจริงๆ ~5-10 → ครอบคลุมหมดได้
- Output: ผู้ใช้จำ opening ได้เป๊ะใน 2 อาทิตย์

### Weakness detector (Aimchess-style)

- หลังเล่น 10 เกม → "พลาด fork 23% / hanging piece 18% / counting 14%"
- → แนะนำ puzzles เฉพาะกลุ่ม
- ใช้ classification ที่มีใน review.ts อยู่แล้ว

---

## Engagement signals (ไม่โกหก)

ปัญหา "เว็บดูเงียบ" แก้โดยไม่ต้องเซ็ดบอตซ่อน:

- 🟢 **Online users count** (จาก Cloudflare Analytics — จริง)
- 📊 **เกมเล่นวันนี้: 234** (รวม vs bot — จริง)
- 🕐 **ปริศนาแก้สำเร็จล่าสุด: 2 นาทีก่อน** (จริง)
- 📺 **Live ticker** ของ recent activity (ชื่อ anonymize)
- 🌙 **Nightly bot exhibition** (บอตเล่นกันจริงๆ ตลอดคืน)
- 🎯 **Narrow leaderboards** — แทน global เดียว ใช้ multiple:
  - Top puzzle ของอาทิตย์
  - Gauntlet สูงสุดของเดือน
  - Counting trainer fastest
  - Beginner ladder (rating < 1200)
  - Veteran ladder (rating > 1600)

→ leaderboard แคบ ๆ แน่นได้ด้วย user 5-10 คน · motivation ขึ้น top 3 ง่าย

---

## ❌ NOT to do

- ❌ **Bot accounts ซ่อนตัวบน leaderboard** — เสีย trust, open source ปกปิดไม่ได้
- ❌ **Multiplayer PvP** — cold start, infra, PDPA
- ❌ **แข่งกับ Lichess/chess.com ในหมากรุกสากล** — เสียเวลา
- ❌ **Closed-source ส่วนใด** — "open" ในชื่อโดเมน, MIT, ห้ามถอย
- ❌ **Ads / paywall / signup-required** — สัญญาในหน้า About

---

## Decisions ที่ต้องตัดสินใจก่อนลงโค้ด

### 1. Leaderboard structure

- (a) **Single leaderboard** — บอต + คน rating เดียวกัน ดู mix แน่น
- (b) **Multiple views** — Human-only / All (incl. bots) / Bot Hall of Fame · toggle ได้
- ✅ **แนะนำ (b)** — default ดู mix, กดเปลี่ยน view ได้

### 2. Bot-vs-bot นับเข้า rating?

- **นับ** → leaderboard เคลื่อน 24/7 แม้ไม่มีคน · แต่บอต rating drift เร็ว
- **ไม่นับ** → rating สะอาดกว่า · แต่ static ช่วงไม่มี user
- ✅ **แนะนำ hybrid**: เฉพาะ Sunday Showdown + Major tournament นับ · Nightly exhibition แค่ entertainment

### 3. Unlock characters หรือเปิดหมด?

- เปิดหมด = friction น้อย แต่ progression แบน
- Unlock = onboarding journey ชัด · achievement ทำงาน
- ✅ **แนะนำ unlock** แต่ pace เร็ว: Rookie tier เปิดทุกตัวตั้งแต่ start · Veteran ปลดล็อก rating ≥ 1400 · Master ที่ ≥ 1700

### 4. Avatar art

- ใช้ emoji ต่อ = ฟรี เร็ว แต่แบนสำหรับ marketing
- Commission illustrated avatar 7-10 ตัว = ลงทุนครั้งเดียว ใช้ตลอด · สำคัญสำหรับ social share
- ✅ **แนะนำ commission** — Thai illustrator บน Behance/Fastwork ราว 5-15k บาท ทั้งชุด

---

## Roadmap (proposed)

### Phase 0 — เร่งด่วน (สัปดาห์นี้, ≤ 1 วัน)

แก้ตาม `REVIEW.md`:

- [ ] `svgo` piece SVGs ลด 1MB → 20KB
- [ ] `public/robots.txt` + `public/sitemap.xml`
- [ ] `_headers` ตั้ง `immutable` cache + HSTS + Permissions-Policy
- [ ] PNG fallback ของ `og.svg`

### Phase 1 — Bot Characters foundation (2-3 อาทิตย์)

- [ ] Character profile data structure + lore content
- [ ] Bot profile page route (`/#/bots/nakkrub`)
- [ ] Dynamic bot rating (เลิก fix)
- [ ] Pre-game splash + result screen integrate character
- [ ] Personal record vs each bot
- [ ] Commission avatar art (parallel)

### Phase 2 — การนับ Trainer (2-3 อาทิตย์)

- [ ] Counting trainer UI (drill mode)
- [ ] Curated 50+ counting positions
- [ ] Engine verify answer
- [ ] Spaced repetition integrate
- [ ] Achievement / tracking

### Phase 3 — Tournament Infrastructure (3-4 อาทิตย์)

- [ ] Recurring tournament scheduler (Sunday Showdown, Nightly)
- [ ] Tournament page + standings
- [ ] Bracket / Swiss generator
- [ ] Auto-generate news/narrative
- [ ] Personality Challenge ระบบหมุนรายสัปดาห์

### Phase 4 — Scale (ต่อเนื่อง)

- [ ] Auto-puzzle-miner running 24/7
- [ ] Opening trainer (Chessable-style)
- [ ] Weakness detector
- [ ] Multiple narrow leaderboards
- [ ] Online users / activity ticker
- [ ] Marketing: LINE OA, Pantip game forum, FB groups

---

## Marketing assets ที่จะเกิดเอง

ถ้า bot character system โต — เกิดของแชร์ได้เอง:

- 🎨 Character poster ของแต่ละบอต
- 📺 "Best game of the week" video clip
- 🐦 Tweet ของ rating milestone ("⚔️ นักบุก hit 1900!")
- 📱 LINE sticker pack (long shot แต่ thai market love it)
- 📰 Pantip post: "ใครพอจะเอาชนะ 🐢 ระวังตัวได้บ้าง?"
- 🎮 Twitch / YouTube content (ดู bot vs bot, ดู human vs bot)

vs. PvP brand ที่ marketing ต้อง "หาเพื่อนมาเล่น" ทุกครั้ง — character brand market ตัวเองได้

---

## สรุปสั้น

- ❌ ไม่แข่งกับ Lichess/chess.com
- ❌ ไม่ทำ PvP multiplayer
- ❌ ไม่เซ็ดบอตซ่อนบน leaderboard
- ✅ **โฟกัส 2 layer: Training depth + Bot character world**
- ✅ บอตที่มีอยู่แล้ว → ยกระดับเป็น character ชัดเจน · ใส่ lore + dynamic rating + เข้าแข่ง tournament อย่างเปิดเผย
- ✅ **การนับ trainer** = unique moat ที่ต้องทำเป็น flagship ของ v0.2
- ✅ Training + Compete + Climb flywheel ทำงานโดยไม่ต้องการ critical mass

> **Tagline ใหม่ที่อาจใช้ได้:**
> "เรียนรู้หมากรุกไทย · ลองวัดฝีมือกับ 7 จอมยุทธ์ · ปีนสู่จุดสูงสุด"
