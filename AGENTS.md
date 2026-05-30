# OpenMakruk Agent Operating Contract

This repo is managed as a long-lived product, not as a demo. Agents must optimize for durable foundations: clear contracts, shared rules, repeatable tests, and PR-reviewed changes.

## Required Workflow

1. Start from a GitHub issue or a clearly stated task.
2. Never commit directly to `main`.
3. Create a scoped branch before editing:
   - `issue-<number>-short-slug` when an issue exists.
   - `chore/<short-slug>` only for repository maintenance.
4. Keep the issue acceptance criteria visible while working.
5. Make the smallest durable change that satisfies the issue. Do not add temporary page-specific hacks when a shared contract or component is the right fix.
6. Run the relevant gates before opening a PR.
7. Open a draft PR and link the issue.
8. Merge only after review and CI success. Production deploys happen from `main`, not from feature branches.

## Automation Model

- Pull requests to `main` run CI but do not deploy.
- Pushes to `main` run CI and deploy the frontend to Cloudflare Pages after all gates pass.
- Pushes to `main` that touch `worker/**` also run the worker deploy workflow after worker checks and D1 migrations.
- Bot exhibition ticks are scheduled through GitHub Actions and submit to the production Worker.

Do not bypass this model unless the user explicitly asks for an emergency hotfix.

## Product Direction

OpenMakruk aims to be the best async single-player Makruk platform:

- play and train against bot-mediated opponents
- learn through lessons, paths, and coach explanations
- solve and author puzzles
- analyze positions and games
- compete through deterministic shared bot challenges and leaderboards
- support future engines such as AlphaZero without rewriting UI

PvP is not the primary product direction. Do not introduce realtime multiplayer assumptions into core architecture.

## Architecture Rules

Use these layers:

```text
src/core/          pure Makruk rules, FEN, replay, counting, move encoding
src/lib/engines/   engine contracts and adapters
src/features/      feature orchestration: play, review, puzzles, challenge
src/components/    reusable presentational UI
src/pages/         route-level composition only
worker/src/        server API, verification, D1 access
public/content/    versioned content JSON
```

The current repo still has legacy placement under `src/lib` and large page files. Move toward the layered model incrementally; do not perform a broad rename unless the issue calls for it.

## Non-Negotiable Contracts

- Board rendering must be shared and consistent across Play, Lessons, Study, Puzzles, Custom, Review, Exhibition, and drills.
- Makruk rules, FEN parsing, replay, promotion, legal moves, and counting must converge toward a shared pure TypeScript core.
- Engine implementations must be adapters behind `MakrukEngine`; UI must not import concrete engines directly.
- Challenge bots must be deterministic when results are compared on leaderboards.
- Stored data must be versioned and migrated. No destructive localStorage/D1 resets for normal users.
- Public content must be schema-driven. Adding lessons, puzzles, openings, or studies should not require route-specific code changes.
- Worker verification is a security boundary. Do not weaken it for UI convenience.

## Quality Gates

Run the narrowest reliable set for the touched area:

- Always for frontend changes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- For board/game/route/UI changes:
  - `npm run test:e2e`
- For worker/API/D1/rules changes:
  - `cd worker && npm run typecheck`
  - `cd worker && npm run test`
- For content/schema changes:
  - relevant verifier scripts if present
  - at least one e2e route smoke that loads the affected content

If a gate cannot run locally, explain the exact failure and whether CI is expected to cover it.

## UI Rules

- Use `BoardLayout` for every board-centered surface unless the issue explicitly requires a new layout primitive.
- Keep controls beside the board on desktop and below/after the board on mobile.
- Avoid duplicate controls for the same action in the same viewport.
- Do not add feature-explainer text inside the app when a familiar control or label is enough.
- Keep board sizing responsive, stable, and consistent. Do not hardcode per-page board sizes.
- Avoid page-specific CSS width systems. Use shared page/container tokens.

## Engine Rules

- Treat `MakrukEngine` as the boundary between UI and search.
- New engines must declare capabilities instead of requiring `if engineId === ...` checks in UI code.
- MCTS/AlphaZero-style engines must fit the same adapter model and expose deterministic options where competitive results depend on them.
- Engine version, model id, rules version, and move encoding version must be recordable before engine results affect leaderboards.

## Data And Migration Rules

- Add fields with versioned migrations.
- Never change meaning of existing persisted fields without a migration plan.
- Prefer additive D1 migrations.
- Keep backwards compatibility for existing challenge URLs, content IDs, saved games, and cert URLs.
- If a schema cannot be made backwards compatible, write an issue and migration plan first.

## Review Stance

Review for:

- user-visible regressions
- hidden rule mismatches between client and worker
- nondeterminism in competitive flows
- page-specific UI hacks
- missing migration paths
- missing or weak acceptance tests
- bundle/performance regressions that affect mobile

Summaries are secondary. Findings come first.
