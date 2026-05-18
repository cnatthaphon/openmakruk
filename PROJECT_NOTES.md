# OpenMakruk — Project Notes

## Decisions log (2026-05-18)

### Architecture
- **Pure-client v0**: no backend, no API subdomain, no DB
- **Cloudflare Pages** over GitHub Pages: needs COOP/COEP headers for Fairy-Stockfish multi-threaded WASM (`SharedArrayBuffer`)
- **Vite + React + TS** over Next.js: no SSR/routing needs that justify Next overhead
- **Single repo flat structure** (`src/`) over monorepo: solo project, no shared packages yet

### Libraries verified (2026-05-18, revised after user challenge)
- **`ffish-es6` v0.7.9** (npm published 2026-05-03) — high-perf WASM chess variant library based on Fairy-Stockfish, by gbtami (Fairy-Stockfish + pychess.org maintainer). Exposes both rule API (legalMoves, FEN, SAN, check/mate detection) AND engine API (bestMove, evaluate). Supports Makruk.
- Makruk NNUE network — separate `.nnue` asset, ships from Fairy-Stockfish-NNUE releases.

### Rejected libraries (with rationale)
- `@kaisukez/makruk-js` v4.0.2 — rejected. Independent reimplementation of Makruk rules. Risk: disagreement with Fairy-Stockfish on edge cases (counting endings, bare-king rule, draw conditions). Small maintainer base (3 stars). Using ffish-es6 means rules come from the SAME Fairy-Stockfish C++ codebase that the engine uses → impossible for rules and engine to disagree.
- Stockfish official (`stockfishchess.org`) — does NOT support Makruk. Only standard chess. Fairy-Stockfish is the de facto "official" engine for Makruk.

### Positioning
- **Honest framing:** "Makruk-focused training platform, Thai-first" — NOT "first Makruk site"
- `pychess.org` already supports Makruk play+analysis (Fairy-Stockfish based, same as us)
- Differentiation: Makruk-first product (vs variant-generalist pychess), Thai i18n, training/curriculum focus, AI Lab as research showcase

### Domain
- `openmakruk.com` — DNS does not resolve, almost certainly available
- Register via **Cloudflare Registrar** (no markup, integrates with Pages + DNS) or Porkbun
- Avoid GoDaddy (upsells, renewal markup)
- Cost: ~$10/year .com

### GitHub
- Recommendation: **public from day 1** + WIP badge in README
- Reason: "open" in name = brand contradiction if private; build-in-public is portfolio gold for self-taught dev
- User to create repo manually (Claude has GitHub tools but not repo-create scope here)

## Open questions / TODO before scaffolding code

- [ ] Register `openmakruk.com` (user action — Cloudflare Registrar or Porkbun)
- [ ] Create GitHub repo `openmakruk` public, MIT, add description + topics (user action)
- [ ] Verify Makruk NNUE network URL + license (separate `.nnue` file from Fairy-Stockfish-NNUE releases)
- [ ] Verify ffish-es6 API surface for Makruk variant (init code, variant("makruk"), worker integration pattern)
- [ ] Decide piece artwork: SVG hand-crafted vs existing CC-licensed set (e.g., chesscom Makruk set, pychess set with license check)
- [ ] Confirm Thai piece names mapping: ขุน/เม็ด/เรือ/ม้า/โคน/เบี้ย/เบี้ยหงาย vs FEN letters
- [ ] License audit of pychess.org code if we plan to study/reuse patterns (GPL-3.0 — copyleft, can study but copying code makes us GPL too)

## Things to NOT do (per scope discipline)

- multiplayer / accounts / **auth / leaderboard** / tournament / chat
- own RL/AlphaZero before v0.5 ships
- mobile app
- monorepo / packages split before v0.3
- backend before v0.4 (puzzle generation might need it)
- Google Analytics (use Cloudflare Web Analytics — cookieless, PDPA-friendly)

## Auth / user state decision (2026-05-18)

- v0-v0.5: **localStorage only** for all user state (puzzle progress, settings, recent games, bot record)
- Add **export/import JSON** button in Settings for data portability (5 LOC)
- Aggregate analytics: Cloudflare Web Analytics (1-click enable, no cookies, no consent banner)
- **PDPA benefit**: no personal data collected = near-zero compliance burden
- Auth trigger to revisit: real user request for cross-device sync, OR multiplayer/social feature decision
- When added: Supabase Auth + Postgres, or Cloudflare Workers + D1. Login via Google OAuth + LINE Login (popular in Thailand). Never roll own auth.

## Game data capture strategy (decided 2026-05-18)

**Per-game data captured locally (every game):**
```
GameRecord {
  id, started_at, ended_at, result,
  opponent_type, opponent_level, user_color,
  starting_fen, ending_fen,
  moves: [{ ply, uci, san, fen_after, time_taken_ms,
            eval_before?, eval_after?, classification?, hint_used? }],
  total_user_time_ms, hints_used, takebacks,
  pgn (generated on save)
}
```

- Stored in localStorage `openmakruk.recent_games` (last 100, ~50KB total)
- NOT sent to server by default — user owns their game history
- Powers: replay, post-game analysis, personal stats, PGN export, personal puzzle generation from own blunders (v0.4)

**Optional donation flow (v0.3+):**
- After each game: optional "Donate this game" button
- Endpoint: POST /api/donate → stores sanitized PGN to `openmakruk-public-games` KV namespace
- Stripped: sync_code, user_id, IP, any identifier
- Kept: PGN, opponent_level, result, duration_ms, move_count, donated_at
- Explicit consent via dialog before submission
- Builds open dataset for: AI training, puzzle mining, Makruk research

**Why no server collection by default:** preserves localStorage-only PDPA-free posture. Opt-in donation moves only sanitized data, with explicit consent (PDPA art. 19 lawful basis).

## Mobile strategy (decided 2026-05-18)

- v0.0–v0.1: responsive web only — mobile browser works
- **v0.2: add PWA** (`manifest.json` + service worker, ~1 day work) → "Add to Home Screen", offline play, splash screen, install prompt. Single codebase with web.
- v0.6+: consider TWA for Google Play Store (~$25 one-time, PWA updates auto-propagate)
- iOS native app: defer indefinitely (Apple $99/yr + review process not worth ROI at our scale)
- Capacitor wrap considered only if cross-store distribution is critical for user growth

## Sync strategy when user wants cross-device (v0.6+)

**Three-tier opt-in (NOT mutually exclusive):**

**Default — localStorage only**: zero server data, zero PDPA scope.

**Sync Code (opaque ID)** — only opt-in path for cross-device users (decided 2026-05-18)
- Server generates random 128-bit opaque code (e.g., `OMK-7K3F-2X9P-4Q8R-N5M2`)
- Code IS the credential, no password, no email, no account
- User saves via QR/image/file/cloud note
- Forgot code = data lost (explicitly documented, user accepts)
- Server stores: `{ code, game_state JSONB, created_at, last_sync_at }` — nothing else
- No IP logging on sync endpoint (configure Cloudflare to skip)
- PDPA scope: gray zone — pseudonymous but no mapping to person. Burden near-zero in practice.

### Sync Code implementation (v0.6 spec)

**Stack:** Cloudflare Worker (compute) + Cloudflare KV (key-value database). All free-tier.

**Storage model (clarification on terminology):**
- v0-v0.5: client-side storage only — browser `localStorage` (key-value DB, 5MB per origin)
- v0.6+: adds server-side storage — Cloudflare KV (managed key-value DB, free tier ~10k users)
- **NO SQL database needed** anywhere (no Postgres, no MySQL, no schema, no migrations)
- Both client and server are key-value stores because data model is trivial: `sync_code → game_state JSON`

**Endpoints (~200 LOC Worker total):**
- POST /api/sync/create → generate 128-bit code + empty state, return code
- POST /api/sync/regenerate → migrate state to new code, invalidate old
- GET /api/sync/:code → fetch game_state
- PUT /api/sync/:code → update game_state with timestamp guard
- DELETE /api/sync/:code → wipe row (disable sync / reset)

**Code lifecycle (decided 2026-05-18):**
- One active code per user at any time (no key history)
- Code is FIXED by default — generated once, used forever across all devices
- User actions: Regenerate (rotate code, keep data) / Reset (delete all, start fresh) / Disable (delete from server, keep local)
- No automatic rotation. No expiration. No audit log of past codes.

**Code format:** `OMK-XXXX-XXXX-XXXX-XXXX` (base32, 128-bit entropy)

**UX:** Warning + confirmation BEFORE generating code ("lose this = lose data"). Show code 3 ways: QR, copy-text, download .txt.

**Sync trigger:** end of game, puzzle solve, settings change, app open, background every 30s if pending changes. Move-by-move NOT synced (localStorage only).

**Conflict resolution:** last-write-wins via `local_last_modified` timestamp. Server returns 409 + its state if it has newer; client prompts user "use local vs use server."

**Free-tier capacity:** ~500 active sync users/day before hitting KV write quota. Upgrade $5/mo for 10M writes if needed.

**Option B — Google/LINE OAuth** — REJECTED (2026-05-18)
- Reason: full PDPA compliance burden (privacy policy, DSAR, deletion endpoint, breach notice) not worth the convenience for a free hobby/portfolio project
- User explicitly chose Sync Code as the only sync path

**Rejected: username + password without email**
- Forgot password = no recovery = "right to access" violation under PDPA
- DIY auth security risks (bcrypt, rate limit, captcha) not worth solo-dev burden
- Username can still be PII if user types real name
- Sync Code achieves same "no email" goal with better UX and lower legal risk

## PDPA + Google SSO clarification (2026-05-18)

**Common misconception**: "store only Google `sub` ID, no email/name, so not personal data" — WRONG.

**Reality under PDPA mat.6 + GDPR:**
- Pseudonymous data (ID-only) is STILL personal data because indirectly identifiable
- Storing `google_sub` triggers full PDPA obligations: privacy policy, DSAR endpoints, deletion endpoint, lawful basis, retention policy, security measures
- Data minimization (only ID, not email) REDUCES breach severity but does NOT eliminate obligations

**Smart hybrid design when SSO eventually added (v0.6+):**
- Default: localStorage only — 95% of users — PDPA scope = 0
- Opt-in: Google/LINE SSO only for cross-device sync — 5% who explicitly request
- SSO opt-in must NEVER be required; "skip/use without account" must be prominent
- Minimal Google OAuth scope: `openid` only (NO email, NO profile)
- DB stores: `google_sub`, timestamps, encrypted game_state JSONB. Nothing else.

**Compliance scope shrinks to opted-in subset** — easier to audit, document, maintain.

**Endpoints required when SSO enabled:**
- GET /api/sync (read game_state)
- POST /api/sync (write game_state)
- DELETE /api/account (DSAR right to delete + revoke Google token)
- GET /api/export (DSAR right to access — JSON download)

**Stack when added:** Cloudflare Workers + D1 (all-Cloudflare, free at scale) or Supabase (faster setup, Postgres familiar).

## Puzzle/learning UX strategy (decided 2026-05-18)

**3 access modes, NOT either-or:**
- Random ("สุ่ม") — for casual practice / puzzle rush
- By topic — filter by opening/mid/end/tactic for targeted practice
- By difficulty — filter by rating bands (800/1200/1600)

**Curated learning path = v0.4**, not v0.3. Content-heavy work, defer until validated user demand exists via v0.3 puzzles.

**Anti-repeat (v0.3):** simple `seen: Set<id>` in localStorage. When all seen, fall back to oldest-reviewed-first (review mode).

**Anti-repeat (v0.4):** SM-2 spaced repetition. Failed puzzles return sooner, mastered ones rarely. Like Anki.

**Score persistence:** auto-save localStorage. NEVER ask user to remember code/password. Export/Import JSON buttons in Settings for portability.

**Landing principles:** 0 modals, no signup prompt, 3 clicks max to gameplay, progress shown as encouragement (not paywall), "เริ่มเล่นได้เลย" framing.

## Related prior art

- `pychess.org` — variant chess platform, supports Makruk play+analysis (GPL-3.0)
- `lichess.org` — chess platform, training/puzzle UX pattern reference (AGPL-3.0)
- `makrukonline.com`, `playok.com` — old-style Makruk play, multiplayer-focused
- `Fairy-Stockfish` ecosystem — engine + WASM port + NNUE networks for variants
