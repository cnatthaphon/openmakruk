# OpenMakruk

> เว็บฝึก / เล่น / วิเคราะห์ **หมากรุกไทย (Makruk)** — เปิด source · ทำงานออฟไลน์ครบทุกฟีเจอร์ · เปิด cloud sync เป็น opt-in เมื่ออยากเทียบกับคนอื่น

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![E2E: Playwright](https://img.shields.io/badge/tests-99_passing-brightgreen)](tests/e2e)
[![Worker: Vitest](https://img.shields.io/badge/worker-26_passing-brightgreen)](worker/tests)
[![Stack](https://img.shields.io/badge/stack-vite_react_ts_cloudflare-blue)](#stack)

---

## วิสัยทัศน์

มีเด็กคนหนึ่งในไทยอยากเล่นหมากรุกไทยกับคอม อยากฝึก อยากเรียน — แต่หาในเน็ตเจอแต่เวอร์ชั่นโบราณ ไม่มี hint ไม่มี analyze ไม่มี puzzle ไม่มี learning path. 30 ปีต่อมายังไม่มีใครทำ. โปรเจกต์นี้คือเครื่องมือที่เด็กคนนั้นอยากได้ — สร้างโดยเด็กคนนั้นเอง

**ช่องว่างที่เติม:**
- `pychess.org` รองรับหมากรุกไทยแต่เป็น variant-generalist (Makruk = 1 ใน 30+ variants), UI ภาษาอังกฤษ
- เว็บไทย Makruk = multiplayer-only ไม่มี training / analysis tools
- ไม่มีที่ไหนรวม: hint + post-game analysis + puzzles + lessons + opening/endgame study + personality bots + Thai UI

---

## คุณสมบัติหลัก (9 tabs)

### 🎮 เล่น
- เล่นกับ Fairy-Stockfish (full strength) หรือเลือก engine อื่นใน Settings → Engine:
  - **Random Bot** · **Greedy Bot** (baselines)
  - **7 personality bots** — ⚔️ นักบุก · 🛡️ นักรับ · 🧭 ตามตำแหน่ง · 🦅 นักล่า · 🍃 นักเดิน · 💨 คล่องตัว · 🐢 ระวังตัว
- Hint button · 💡 Chess Coach explanation · Eval bar · 🎯 Auto-analyze every move
- 4 ระดับ CPU: easy / medium / hard / master
- Time controls: unlimited / Blitz 5 / Blitz 5+3 / Rapid 10 / Rapid 15+10 / Classical 30
- Resume in-progress game across reloads · PGN export

### 🎓 ฝึก
29 lessons แบบ step-by-step + interactive board · piece-movement → tactics → endgame patterns

### 📖 ศึกษา
- **เปิดเกม** (5 verified openings · ขุนเบี้ย · เม็ดเดิน · โคน fianchetto · โคน line · เรือ line)
- **จบเกม** (5 with commentary · K+R vs K corner · K+RR vs K ladder · K+R+M vs K · etc.)
- **ธีมยุทธวิธี** (4 themes · hanging piece · fork · skewer · pawn capture)
- Board stepper · click ใดก็เห็น mini-position

### 🧩 ปริศนา
- **5 หมวด · 54 puzzles** seeded ใน server D1 และ static fallback
  - ⚔️ รุกจน 1 ตา (14)
  - ⚔️ รุกจน 2 ตา (5)
  - 🎯 tactic (17)
  - 🔢 counting (13)
  - 🛡️ ป้องกัน (5)
- Drag-to-solve · ✗ wrong-move feedback · 💡 hint after retries
- **⭐ Daily puzzle** — deterministic จากวันที่
- 📈 Personal puzzle rating (Glicko-lite) + 🔁 Spaced repetition (SM-2)
- **3 content pipelines (engine-verified):**
  - User puzzle authoring (Custom page)
  - Puzzle miner จาก Game Report (extract blunder)
  - Auto factory: bot-vs-bot mining (Profile page)

### 🎨 ออกแบบ → hub
- Graphical position editor · ▶ เล่นจาก position · 💾 บันทึกคลัง · 📋 copy FEN
- 🧩 บันทึกเป็น puzzle (engine-verified)

### 📚 คลัง
- ตำแหน่งที่บันทึก · custom / play / puzzle / analysis sources · search + load

### 👤 โปรไฟล์
- 🏆 Match Score · 🏰 Gauntlet · 🎯 Events/Tournaments
- 🔥 Streak + 🏆 achievements
- 🤖 Auto Content Factory (bot-vs-bot mining)
- 📊 **Insights** — color split · level split · ความยาวเกม · ฟอร์มล่าสุด · streak · day-of-week activity
- 🌍 **Global Match Leaderboard** (ปรากฏเมื่อเปิด cloud sync)
- 📥 Export PGN per-game / bulk · 📤 Export/Import profile JSON

### ⚙️ ตั้งค่า
- Piece set · board theme · coordinates · last-move highlight · legal dots · animation speed
- 🔊 Sounds · 📊 Eval bar toggle
- **Engine selector** — ทุก engine ที่ register ปรากฏใน dropdown อัตโนมัติ
- ☁️ **Cloud Sync** section (opt-in)

### ℹ️ เกี่ยวกับ
- Origin story · privacy · credits · MIT

---

## Architecture

โครงสร้าง 2 ชั้น · client-only mode + optional cloud:

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (React + Vite + TypeScript)                          │
│                                                                │
│  • UI · 8 tabs · onboarding · settings                         │
│  • Engine registry contract (MakrukEngine)                     │
│    - Fairy-Stockfish (WASM, full NNUE-ready)                   │
│    - Random / Greedy baselines                                 │
│    - 7 personality bots (score-based, mixable via weights)     │
│  • Backend adapter contract (BackendAdapter)                   │
│    - NoOpBackend by default → fully offline                    │
│    - CloudflareBackend when user enables cloud sync            │
│  • Versioned localStorage (defineStore wrapper {v, d})         │
│  • PWA: manifest.webmanifest + sw.js · install on mobile       │
└────────────────────────────┬──────────────────────────────────┘
                             │  HTTPS · bearer token
                             ▼
┌───────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (worker/) — optional                       │
│                                                                │
│  Hono routing · D1 (SQLite at edge) · 8 endpoints              │
│   /api/users · /api/games · /api/puzzles · /api/leaderboard    │
│                                                                │
│  • Anonymous bearer auth (SHA-256 hashed)                      │
│  • Server-side Elo math (cheat-proof)                          │
│  • Pure-JS Makruk rules engine (worker/src/rules.ts)           │
│    REPLAYS submitted moves — illegal seq → 422, no rating      │
│  • Leaderboard filters verified=1 only                         │
│  • Curated puzzle pool seeded from public/content/puzzles/     │
└────────────────────────────────────────────────────────────────┘
```

**ที่สำคัญ:** all client code works without the backend. Cloud sync is purely opt-in for global leaderboards + multi-device sync. Single user → no server needed.

---

## Quick start (dev)

```bash
# Frontend
npm install
npm run dev                       # http://localhost:5174

# Worker (optional, only for cloud sync development)
cd worker
npm install --no-bin-links
npm run db:apply                  # apply schema to local D1
npm run seed:local                # seed 54 curated puzzles
npm run dev                       # http://localhost:8788
```

In another browser tab, open Settings → Cloud Sync → "เปิด cloud sync" to connect to the local worker.

---

## Testing

```bash
# Frontend E2E (75 tests)
npm run test:e2e

# Worker integration (26 tests)
cd worker && npm run test

# Both — playwright auto-starts wrangler dev as a secondary webServer.
```

Test pyramids:
- **Unit-ish** — no separate pure-function test suite; logic is exercised by integration.
- **Worker integration (vitest)** — wrangler dev + local D1 + scenario tests:
  - infrastructure (health, DB ping, 404)
  - anonymous registration + auth
  - game record with server-side verification
  - rating progression over a session
  - global leaderboard ordering
  - input validation
  - curated puzzle catalog (server-side reads)
- **Frontend E2E (playwright)** — smoke, foundation, puzzles, mobile/touch, resume bug, schema versioning, personality system, onboarding modal, cloud sync, PWA install-readiness.

---

## Deployment (production)

### 1. Worker
```bash
cd worker
npm run db:create                 # creates D1 db, prints database_id
# edit wrangler.toml — paste database_id into [[d1_databases]].database_id
npm run db:apply:remote           # apply schema to production D1
npm run seed:remote               # seed curated puzzles
npm run deploy                    # push worker; prints workers.dev URL
```

### 2. Frontend
```bash
# Set the API base URL at build time (or omit for cloud-sync-disabled build)
VITE_API_BASE=https://openmakruk-api.<account>.workers.dev npm run build
# dist/ is ready to drop on Cloudflare Pages, GitHub Pages, or any static host.
```

For a custom domain:
- Cloudflare Pages: route openmakruk.com → frontend project; API on `api.openmakruk.com`
- DNS-only setup: ensure CORS allowlist in `worker/src/index.ts` includes your origin

---

## Anti-cheat

Match leaderboard rows require `verified=1`. Verification flow per game:

1. Client `POST /api/games` with `mode: 'rated'` and the full UCI move log
2. Worker replays every move against the pure-JS rules engine
3. Any illegal move → 422; the row is never inserted
4. Final position must classify as the claimed outcome:
   - `win`  → opponent checkmated
   - `loss` → user checkmated
   - `draw` → stalemate OR halfmove ≥ 100
5. On pass: row inserted with `verified=1`; user rating updated via server-computed Elo (K=32)

Editing browser localStorage doesn't help — the server is the source of truth for everything that affects the global leaderboard.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript |
| Board | chessground v9.x (Lichess board library) |
| Rules + engine (client) | ffish-es6 + fairy-stockfish-nnue.wasm |
| Engine plugins | MakrukEngine contract · personality bots |
| State | localStorage via versioned defineStore wrapper |
| Routing | Hash-based custom router |
| Worker | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite at the edge) |
| Worker rules | Pure-JS Makruk rules engine (own implementation) |
| Tests | Playwright (frontend) + Vitest (worker) |
| CI | GitHub Actions |

---

## Contributing

This is an open-source mission project (not portfolio-first). Issues + PRs welcome.

- Reproducible builds: `npm ci` at root and in worker/
- All PRs run typecheck + build + e2e + worker integration in CI
- New engine? Add a file to `src/lib/engines/`, implement `MakrukEngine`, side-effect register
- New personality bot? Append one entry to `src/lib/personalities/personalities.ts` — no class needed
- New puzzles? Edit `public/content/puzzles/all.json`, bump version in `manifest.json`, run `worker/scripts/seed-curated.mjs` if you want them on the server too

---

## License + Credits

MIT (code) · Piece SVGs CC BY-SA 4.0 (Yevrowl + Fulmene + belzedar_ via Wikimedia Commons; see `public/pieces/NOTICE`). Full credits on the About page.
