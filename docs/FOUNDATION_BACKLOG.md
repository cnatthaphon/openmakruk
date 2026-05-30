# Foundation Backlog

This backlog turns the current product goal into issue-sized work. Create GitHub issues from these entries before assigning them to Claude Code or another coding agent.

## P0 - Deterministic Bot Challenges

Problem:

Async challenge comparisons are only fair if the bot is deterministic for a given challenge context.

Acceptance criteria:

- Same challenge code, bot id, FEN, engine version, and rules version produce the same bot move.
- Personality bot book selection and tiebreaks use seeded RNG in competitive flows.
- Casual variety remains possible through explicit non-competitive seeds.
- Regression tests prove repeated runs are identical.

Likely files:

- `src/lib/personalities/scoredBot.ts`
- `src/lib/asyncChallenge.ts`
- `src/lib/engines/types.ts`
- `tests/e2e/`

## P0 - Shared Makruk Rules And Counting Core

Problem:

Client gameplay and worker verification currently do not fully share Makruk counting semantics.

Acceptance criteria:

- A shared pure TypeScript core defines FEN, replay, legal moves, promotion, terminal classification, and counting.
- Worker verification uses the shared semantics or has contract tests proving equivalence.
- Counting trainer and draw verification use the same counting model.
- Existing saved games and game submissions remain compatible.

Likely files:

- `src/lib/makruk.ts`
- `worker/src/rules.ts`
- `worker/src/verifier.ts`
- future `src/core/`

## P1 - Board Layout Consistency

Problem:

Board surfaces still use mixed layout strategies, which creates inconsistent sizing, scrolling, and control placement.

Acceptance criteria:

- Every board-centered page uses `BoardLayout` or a documented successor.
- Desktop and mobile visual tests cover representative board routes.
- Study and Exhibition replay no longer use one-off board wrappers.
- Play layout either adopts the shared shell or documents a compatible variant.

Likely files:

- `src/components/BoardLayout.tsx`
- `src/pages/StudyPage.tsx`
- `src/pages/ExhibitionPage.tsx`
- `src/App.tsx`
- `src/App.css`

## P1 - Split Play Orchestration From App

Problem:

`App.tsx` still owns too much gameplay, review, challenge, clock, audio, route, and sidebar orchestration.

Acceptance criteria:

- Route shell remains in `App.tsx`.
- Play behavior moves into focused hooks/controllers.
- Review, challenge result recording, clock, and engine move scheduling are testable separately.
- No behavior regression in e2e play, resume, review, cloud sync, and challenge flows.

Likely future modules:

- `src/features/play/useGameController.ts`
- `src/features/play/useClockController.ts`
- `src/features/review/useReviewController.ts`
- `src/features/challenge/useChallengeResult.ts`

## P1 - Engine Contract Expansion For MCTS / AlphaZero

Problem:

Current engine options are depth-oriented and need room for MCTS and model-backed engines.

Acceptance criteria:

- Engine options can represent simulations/nodes, temperature, seed, model id, rules version, and move encoding version.
- UI branches on capabilities, not concrete engine ids.
- Competitive result records can include engine/model metadata.
- Existing Fairy-Stockfish and personality engines continue to work.

Likely files:

- `src/lib/engines/types.ts`
- `src/lib/engines/registry.ts`
- `src/lib/engine.ts`
- worker game record route and schema when metadata becomes server-backed

## P1 - Journey And Learning Path Contract

Problem:

Lessons, puzzles, drills, and journey should guide the player as one coherent path.

Acceptance criteria:

- Journey checkpoints reference stable content IDs and skill concepts.
- Lessons, puzzles, drills, and review mastery contribute to progress through one schema.
- Adding content does not require page-specific logic.
- Existing user progress migrates without reset.

Likely files:

- `src/lib/learnProgress.ts`
- `src/lib/conceptMastery.ts`
- `src/lib/reviewMastery.ts`
- `worker/src/journey.ts`
- `public/content/`

## P2 - Worker Test Harness Stability

Problem:

Worker integration tests must run reliably in CI and locally because they guard anti-cheat and leaderboard behavior.

Acceptance criteria:

- `cd worker && npm run test` reliably collects and runs scenario tests.
- Setup errors print the underlying Wrangler stderr/stdout.
- Local D1 reset and migration are deterministic.
- CI remains green.

Likely files:

- `worker/tests/global-setup.ts`
- `worker/vitest.config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-worker.yml`

## P2 - Repo Governance

Problem:

Large AI-assisted changes need guardrails so main remains deployable.

Acceptance criteria:

- Main branch protection is enabled in GitHub settings.
- Issues use templates.
- PRs use the PR template.
- Agents follow `AGENTS.md` and `CLAUDE.md`.
- Release/deploy workflow is documented.

Likely files:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/REPO_WORKFLOW.md`
