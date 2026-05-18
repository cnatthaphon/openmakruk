# OpenMakruk

> 🚧 **WIP** — open-source Thai chess (Makruk) training platform. v0 in progress.

**One-sentence vision:** เปิด `openmakruk.com` แล้วเล่นหมากรุกไทยกับคอมได้ทันที — ฝึกฝน, ขอ hint, แก้ puzzle, วิเคราะห์ตาเดิน, และทดลอง AI agents.

## Why this exists

นานมาแล้ว มีเด็กคนหนึ่งในไทยที่อยากเล่นหมากรุกไทยกับคอม อยากฝึก อยากเรียน — แต่หาในเน็ตเจอแต่เวอร์ชั่นโบราณ ไม่มี hint ไม่มี analyze ไม่มี puzzle ไม่มี learning path. 30 ปีต่อมายังไม่มีใครทำ. โปรเจกต์นี้คือเครื่องมือที่เด็กคนนั้นอยากได้ — สร้างโดยเด็กคนนั้นเอง.

**Concrete gap:**
- `pychess.org` รองรับ Makruk แต่เป็น variant-generalist (Makruk = 1 ใน 30+ variants), UI ภาษาอังกฤษ
- เว็บไทย Makruk = multiplayer-only, ไม่มี training/analysis tools
- ไม่มีที่ไหนมี: hint, post-game analysis, puzzles ที่ curate, learning curriculum สำหรับ Makruk โดยเฉพาะ
- ไม่มีในไทย ไม่มีในโลก จะซื้อก็หาไม่ได้

OpenMakruk = lichess-style training platform สำหรับ Makruk โดยเฉพาะ, Thai-first, MIT open-source.

## Stack (v0)

| Layer | Choice | Why |
|------|------|------|
| Framework | Vite + React + TypeScript | static-first, no SSR needed |
| Rules + Engine | `ffish-es6` v0.7.9 (Fairy-Stockfish WASM bindings) | single library, official, used by pychess.org — rules and engine from same source of truth |
| NNUE network | Makruk-dedicated NNUE (separate `.nnue` asset) | optional, improves engine strength |
| Worker | Web Worker | WASM runs off main thread |
| Hosting | Cloudflare Pages | COOP/COEP headers for SharedArrayBuffer |
| Domain | `openmakruk.com` | TBD — register before scaffolding more |

**No backend in v0.** Everything client-side static.

**Why one library instead of two:** Fairy-Stockfish C++ already implements Makruk rules correctly (battle-tested via pychess.org). `ffish-es6` exposes both rule API (legalMoves, isCheck, fen) and engine API (bestMove, evaluate). Using a separate hand-rolled rule engine (e.g. `makruk-js`) means duplicating logic and risking disagreement with Fairy-Stockfish on edge cases (bare king rule, counting endings, etc.).

## Roadmap

| Version | Scope |
|---------|-------|
| v0.0 | Board UI + pieces (SVG) + makruk-js wired + click-to-move + legal move highlight |
| v0.1 | Fairy-Stockfish WASM in worker + play vs computer + difficulty + undo/reset + deploy to openmakruk.com |
| v0.2 | Hint + post-move classify (best/good/inaccuracy/mistake/blunder) + **PWA** (Add to Home Screen, offline play) |
| v0.3 | 50 hand-curated puzzles + 3 modes (random/by-topic/by-difficulty) + anti-repeat + localStorage progress + export/import + **optional anonymous game donation** |
| v0.4 | Curated learning path (lessons) + spaced repetition (SM-2) for puzzles + opening explorer |
| v0.5 | **AI Lab**: random → greedy → minimax → MCTS → AlphaZero-style — research showcase |
| v0.6 | Self-play training visualizer + benchmark vs Fairy-Stockfish |

## What this is NOT (in v0–v0.5)

No multiplayer, no accounts, no auth, no leaderboard, no DB, no chat, no anti-cheat, no mobile app.
All of these only after v0.5 proves core value.

## User state strategy

**v0–v0.5: localStorage only.** Puzzle progress, settings, recent games, bot win/loss records — all stored in user's browser. Zero backend, zero PII collected, zero PDPA/GDPR cookie banner needed.

**Export/import JSON** button in Settings as data portability (5 LOC, lets users back up themselves).

**Aggregate analytics:** Cloudflare Web Analytics (cookieless, privacy-first, free, no consent banner needed).

**Auth comes only when:**
- Real cross-device sync request from users, OR
- Multiplayer / social features added (v0.6+ if at all)

When added: Supabase Auth + Postgres (or Cloudflare Workers + D1). Login via Google OAuth and LINE Login (popular in Thailand).

## Local development

```bash
npm install --no-bin-links   # --no-bin-links is needed when working from a Windows-mounted drive in WSL
npm run dev                  # http://localhost:5173
npm run build                # production bundle in dist/
npm run typecheck            # tsc --noEmit
```

A `postinstall` hook copies `ffish.wasm` from `node_modules/ffish-es6` into `public/`. If it goes missing, run `node scripts/copy-wasm.mjs`.

## Credits

Makruk piece SVG silhouettes in `public/pieces/` are by **Yevrowl** on
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Makruk_pieces),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See `public/pieces/NOTICE` for the full attribution and licensing details.

The Makruk variant rules engine is [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
loaded at runtime via two npm packages, both used unmodified:

- [`ffish-es6`](https://www.npmjs.com/package/ffish-es6) — board state, legal
  moves, FEN parsing (GPL-3.0).
- [`fairy-stockfish-nnue.wasm`](https://www.npmjs.com/package/fairy-stockfish-nnue.wasm)
  — full engine with UCI search and Skill Level (GPL-3.0). Optimized for
  WASM SIMD.

Board UI (drag-drop, animation, square highlighting, premoves) is provided
by [`chessground`](https://github.com/lichess-org/chessground), Lichess's
production-grade board library (GPL-3.0). Used unmodified; Makruk piece
artwork is applied via CSS background-image overrides.

All three packages are GPL-3.0 runtime dependencies; OpenMakruk does not
modify or statically link them, so the project itself remains MIT-licensed.

## License

The OpenMakruk source code is MIT. Bundled third-party assets keep their
own licenses (see `public/pieces/NOTICE` and `node_modules/ffish-es6/LICENSE`).

MIT
