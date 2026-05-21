# OpenMakruk

> เว็บฝึก / เล่น / วิเคราะห์ **หมากรุกไทย** — เปิด source · 100% client-side · ไม่มี server, ไม่มี cookies, ไม่มี analytics

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![E2E: Playwright](https://img.shields.io/badge/tests-42_passing-brightgreen)](tests/e2e)
[![Built with: Vite + React + TS](https://img.shields.io/badge/stack-vite_react_ts-blue)](#stack)

---

## วิสัยทัศน์

นานมาแล้ว มีเด็กคนหนึ่งในไทยที่อยากเล่นหมากรุกไทยกับคอม อยากฝึก อยากเรียน — แต่หาในเน็ตเจอแต่เวอร์ชั่นโบราณ ไม่มี hint ไม่มี analyze ไม่มี puzzle ไม่มี learning path. 30 ปีต่อมายังไม่มีใครทำ.

โปรเจกต์นี้คือเครื่องมือที่เด็กคนนั้นอยากได้ — สร้างโดยเด็กคนนั้นเอง · เปิด source ฟรีให้คนไทยและทั่วโลกใช้.

**ช่องว่างที่เติม:**
- `pychess.org` รองรับหมากรุกไทยแต่เป็น variant-generalist (Makruk = 1 ใน 30+ variants), UI ภาษาอังกฤษ
- เว็บไทย Makruk = multiplayer-only, ไม่มี training / analysis tools
- ไม่มีที่ไหนรวม: hint + post-game analysis + puzzles ที่คัด + lesson curriculum + Thai UI

OpenMakruk = lichess-style training platform สำหรับหมากรุกไทยโดยเฉพาะ, Thai-first, MIT open-source.

---

## ฟีเจอร์

8 tabs · ทุกอย่างทำงาน 100% บน browser (PWA install-able)

### ♔ เล่น
- 4 ระดับ engine (easy / medium / hard / master) ผ่าน **Fairy-Stockfish** WASM
- **NNUE network** เพิ่ม +248 Elo (optional one-time 46MB download)
- Modes: play-white / play-black / self-play / manual
- **Rated vs Casual** — Rated update Elo (K=32), Casual เปิด hint/undo
- 💡 **Hint** + **Chess Coach** explanation (rule-based motif detector — capture/fork/check/hangingTarget/promotion/mate/develop)
- 🔍 **Analyze position** — top-3 candidate moves + eval bar (Multi-PV)
- 💾 **Save & resume** in-progress game across page reload
- 🔊 Sound effects (move / capture / check / win / loss / draw)
- 📜 Move log — click any past ply to inspect that position
- 🤝 Draw offer + 🏳 Resign with confirmation

### 🎓 ฝึก
- **29 บทเรียน** ใน 6 กลุ่ม (basics → pieces → rules → counting → strategy → endgame)
- Multi-step lessons พร้อม **5 demo kinds**: piece-movement / position-viewer / position-quiz / try-move / replay / counting-demo
- Progress + auto-next-lesson + resume-from-last-viewed
- ก้าวหน้าเรียงตามลำดับ (lesson N ปลดล็อกเมื่อ N-1 จบ)

### 🧩 ปริศนา
- **11 puzzles** ใน 4 categories (mate-1 / mate-2 / tactic / counting) — ทุก FEN verified by hand
- 🎯 Drag-to-solve + ✗ wrong-move feedback + 💡 hint after retries
- **⭐ Daily puzzle** — deterministic จากวันที่ (everyone same day)
- 📈 **Personal puzzle rating** (Glicko-lite, K=24, start 1200)
- 🔁 **Spaced repetition** (SM-2 algorithm) — ปริศนาที่ทำผิดกลับมาให้ทบทวน

### 🎨 ออกแบบ → hub
- Graphical position editor (HTML grid, click-to-place)
- ▶ เล่นจาก position นี้
- 🔍 วิเคราะห์ตำแหน่ง (auto-analyze on Play page)
- 💾 บันทึกในคลัง (with title + note + tags)
- 📋 คัดลอก FEN

### 📚 คลัง
- ตำแหน่งที่บันทึก (custom / play / puzzle / analysis sources)
- Mini-board thumbnail + title + note + hashtags
- Search + load → Play
- Cap 200 entries · localStorage only

### 👤 โปรไฟล์
- Username editable
- Rating + per-difficulty win/loss/draw
- Last 50 games history
- 📥 **Export PGN** (per-game or bulk download) — opens in lichess analysis board / chess.com / ChessTempo
- 📤 Export/Import profile JSON (data portability)

### ⚙️ ตั้งค่า
- 🎨 Piece set: Fulmene (3D gradient) ↔ Yevrowl (flat silhouette)
- Board theme: wood / green / blue
- Show coordinates · Highlight last move · Show legal dots · Animation speed (0-500ms)
- 🔊 Sounds on/off + volume + test tone
- 📊 Eval bar toggle during games
- ภาษา: ไทย (พร้อม) / English (coming)

### ℹ️ เกี่ยวกับ
- Origin story · privacy · full credits · MIT license

### 📊 Game Report (post-game review)
- **Accuracy %** ฝ่ายเรา vs ฝ่ายตรงข้าม (tier colors: gold ≥90, green ≥80, amber ≥60, red <60)
- **ACPL** (Average Centipawn Loss)
- Per-classification chip row (★ best · · good · ?! inaccuracy · ? mistake · ?? blunder)
- **🎯 Key moments** — top 3 highest-delta moves with mini-board + best alternative
- Verdict line — "เกมนี้พลาดมากที่สุดในตา X"
- Full filterable move list (by side / by severity)

---

## Architecture

**Static-first, content-driven, no backend.**

```
public/
├── content/
│   ├── manifest.json            ← version + URL of each content type
│   ├── lessons/all.json         ← 29 lessons (multi-step + demos)
│   ├── puzzles/all.json         ← 11 puzzles (verified)
│   ├── openings/all.json        ← schema ready, content TBD
│   ├── endgames/all.json
│   ├── tactics-themes/all.json
│   └── annotations/all.json
├── pieces/                       ← Fulmene + Yevrowl piece SVGs
├── manifest.webmanifest          ← PWA manifest
├── sw.js                         ← Service Worker (cache-first shell, network-first content)
└── icon.svg                      ← PWA icon

src/
├── App.tsx                       ← tab router + Play page (1900 LOC)
├── components/
│   ├── Board.tsx                 ← chessground wrapper
│   ├── EvalBar.tsx               ← vertical eval bar
│   ├── MultiPV.tsx               ← top-N candidate moves list
│   ├── Clock.tsx                 ← time control display
│   ├── DailyPuzzleCard.tsx
│   └── GameReport.tsx            ← post-game accuracy + key moments
├── pages/
│   ├── LearnPage / LessonView    ← multi-step lessons
│   ├── PuzzlesPage / PuzzleView  ← drag-to-solve
│   ├── CustomPage                ← position editor + hub
│   ├── LibraryPage               ← saved positions
│   ├── ProfilePage               ← stats + history + PGN export
│   ├── SettingsPage              ← user preferences
│   └── AboutPage                 ← credits + privacy + license
└── lib/                          ← 22 focused modules
    ├── makruk.ts                 ← ffish loader + FEN parsing
    ├── engine.ts                 ← Fairy-Stockfish UCI wrapper
    ├── chessAttacks.ts           ← per-piece attack calc
    ├── chessCoach.ts             ← rule-based motif explainer (Thai)
    ├── review.ts                 ← post-game analysis + accuracy/ACPL/key moments
    ├── content.ts                ← manifest-based loader (3-tier cache)
    ├── contentCache.ts           ← IndexedDB content persistence
    ├── settings.ts / audio.ts / clock.ts
    ├── stats.ts / library.ts / gameState.ts
    ├── puzzleRating.ts (Elo)
    ├── spacedRepetition.ts (SM-2)
    └── dailyPuzzle.ts (deterministic by date)
```

**Three-tier content fetch:** memory cache → IndexedDB → network (manifest version-keyed). Adding new lessons / puzzles / openings = JSON-only PR, no rebuild.

**No backend.** All user state — Elo rating, game history, lesson progress, puzzle progress, library, settings — lives in `localStorage`. The NNUE network blob caches in IndexedDB after one-time download.

---

## Stack

| Layer | Choice | License |
|-------|--------|---------|
| Framework | React 18 + TypeScript 5 | MIT / Apache 2.0 |
| Build | Vite 5 | MIT |
| Rules + Engine | `ffish-es6` 0.7 (Fairy-Stockfish WASM bindings) | **GPL-3.0** |
| Engine search | `fairy-stockfish-nnue.wasm` 1.1 | **GPL-3.0** |
| Board UI | `chessground` 9 (Lichess) | **GPL-3.0** |
| Piece artwork (default) | Fulmene's turned-wood SVGs | **CC BY-SA 4.0** |
| Piece artwork (alt) | Yevrowl's silhouettes | **CC BY-SA 4.0** |
| NNUE network | belzedar_'s makruk-a8c621e24a8c | **CC BY-SA 4.0** |
| E2E test runner | Playwright | Apache 2.0 (devDep — not shipped) |

All GPL-3.0 deps are used **unmodified** (loaded from npm at build, served as static assets at runtime). OpenMakruk's own code therefore remains MIT-licensed without GPL-contamination.

CC BY-SA 4.0 assets require **attribution visible to end users** — provided on the [About page](src/pages/AboutPage.tsx) at `/#/about` in the running app.

---

## Local development

```bash
npm install --no-bin-links   # --no-bin-links for WSL on a Windows-mounted drive
npm run dev                  # http://localhost:5173
npm run build                # production bundle in dist/
npm run typecheck            # tsc --noEmit
npm run test:e2e             # Playwright suite (auto-starts dev server)
```

A `postinstall` hook copies `ffish.wasm` from `node_modules/ffish-es6` into `public/`. If it goes missing, run `node scripts/copy-wasm.mjs`.

The dev server requires Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy headers (set in `vite.config.ts`) so the WASM engine can use `SharedArrayBuffer`. The production host (Cloudflare Pages) needs the same — configured via `_headers`.

---

## Testing

**42 Playwright E2E tests · ~50s wall-clock** · single-browser (Chromium) with `--host 0.0.0.0` so it runs in WSL.

```bash
npm run test:e2e
```

Test files:

| Spec | Tests | What it proves |
|------|-------|----------------|
| `smoke.spec.ts` | 10 | every tab loads + about page has all attributions + manifest fetch |
| `lessons.spec.ts` | 4 | list, multi-step nav, counting-demo, position-viewer renders 32 pieces |
| `puzzles.spec.ts` | 4 | drag-to-solve, wrong-move feedback, localStorage record, ratings + SR update |
| `play.spec.ts` | 1 | Fairy-Stockfish WASM loads + Makruk start FEN rendered correctly |
| `bot-game.spec.ts` | 1 | scripted user-bot plays 6 plies against the engine, no JS errors |
| `comprehensive.spec.ts` | 9 | lessons multi-step, settings → Board CSS, analyze button, PWA reachable, mobile 375px viewport, save & resume, move log inspect |
| `skeletons.spec.ts` | 5 | settings persistence, daily puzzle card, PGN buttons, library populated/empty |
| `critical-gaps.spec.ts` | 8 | hint Coach output, mate→game-over, promotion bia→met, rated toggle, NNUE loading state, all 4 levels, Custom palette click, PGN download Blob trigger |

The dragMove helper is smart: synthesised mouse drag for multi-square moves, click-then-click fallback for adjacent moves (chessground's drag threshold mis-detects short gestures otherwise).

---

## Privacy

100% client-side. No server contacts. No third-party trackers. No cookies.

User state in `localStorage`:
- `openmakruk_stats` — rating, history, displayName
- `openmakruk_settings` — UI preferences
- `openmakruk_lesson_progress` — per-lesson completion
- `openmakruk_puzzle_progress` — per-puzzle solves
- `openmakruk_puzzle_rating` — personal puzzle Elo
- `openmakruk_puzzle_schedule` — SM-2 spaced repetition state
- `openmakruk_current_game` — in-progress game (cleared on game end)
- `openmakruk_library` — saved positions
- `openmakruk_daily_puzzle` — today's puzzle solved-marker

IndexedDB (browser-controlled):
- `openmakruk-content` — cached `/content/*.json` keyed by manifest version
- `openmakruk` (engine namespace) — NNUE network blob

The user can wipe all of this any time via Profile → "🗑 ลบ profile ทั้งหมด" or by clearing browser storage. Export/Import JSON in Profile provides data portability.

---

## Roadmap

- **v0.1 (current)** — 8 tabs functional, 42 E2E tests, content-driven, PWA-ready, Chess Coach, Game Report
- **v0.2** — Deploy to `openmakruk.com` via Cloudflare Pages · Touch-drag polish · 50+ puzzles · 15+ lessons with interactive demos
- **v0.3** — Clock + time controls wired (lib already exists) · Live eval bar during engine thinking · Multi-PV row → animate on board
- **v0.4** — Curated learning path with quizzes · Opening explorer (content/openings/*.json)
- **v0.5** — Chess Coach motifs: pin · skewer · discovered attack · phase-based accuracy
- **v0.9+** — Optional backend: leaderboards · user-submitted puzzles · cloud sync · tournaments (Cloudflare Worker + D1)

---

## License

OpenMakruk's source code is **MIT** — see [`LICENSE`](LICENSE).

Bundled third-party components keep their own licenses — full list in [`NOTICE.md`](NOTICE.md). The user-facing About page at `/#/about` shows the same attribution in the running app, as required by CC BY-SA 4.0.

---

## Credits

Author: **Natthaphon Chaiyaphat** — PhD Physics, self-taught dev, building this as both a portfolio piece and a tool for the Thai chess community.

Built standing on the shoulders of:
- **Fairy-Stockfish** team (Fabian Fichter and contributors) — the chess-variant engine that handles Makruk rules + search.
- **Lichess** — for `chessground`, the production board library + the lichess.org analysis pattern this project echoes.
- **Fulmene** + **Yevrowl** — for the Makruk piece artwork.
- **belzedar_** — for the Makruk NNUE network (+248 Elo).
- **pychess.org** — proving Makruk online is solvable, used as a reference for variant handling.

See `/#/about` in the app or [`NOTICE.md`](NOTICE.md) for the full license-by-license attribution. PRs, issues, feature requests welcome.
