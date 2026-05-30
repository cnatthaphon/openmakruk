# Architecture Guardrails

OpenMakruk must support years of growth: more players, more puzzles, more lessons, more bot challenges, and future engines such as AlphaZero. The architecture should make growth additive instead of forcing rewrites.

## Target Shape

```text
src/core/
  Pure Makruk domain logic:
  - FEN parsing and serialization
  - legal move generation
  - move application and replay
  - promotion
  - counting rules
  - terminal classification
  - move encoding for ML engines

src/lib/engines/
  Engine contract and adapters:
  - FairyStockfishEngine
  - PersonalityBotEngine
  - future AlphaZeroEngine

src/features/
  Feature orchestration:
  - play
  - review
  - puzzle solving
  - challenge
  - lessons
  - library

src/components/
  Shared presentation:
  - Board
  - BoardLayout
  - controls
  - panels
  - report views

src/pages/
  Route-level composition only.

worker/src/
  Server API, D1 access, verification, ratings, badges, leaderboards.

public/content/
  Versioned schema-driven learning and puzzle content.
```

This is a direction, not a one-shot rename. Move code toward this shape when an issue touches that area.

## Durable Rules

### Shared Makruk Core

The same conceptual rules must drive:

- browser gameplay
- puzzle validation
- lesson demos
- position editor validation
- post-game replay
- worker anti-cheat verification
- future AlphaZero move generation and move encoding

Do not create new rules logic inside a page component. Add it to the shared core and call it from the page.

### Board Consistency

All board-centered flows should use one board geometry model:

- Play
- Lessons
- Study
- Puzzles
- Custom
- Counting
- Rush
- Move trainer
- Pattern drill
- Survive
- Review
- Exhibition

`BoardLayout` is the current shared primitive. If it is insufficient, improve the primitive rather than forking layout logic per page.

### Engine Adapters

The UI talks to engines through `MakrukEngine`.

An engine adapter owns:

- initialization
- resource cleanup
- search options
- capability flags
- model or network loading
- deterministic behavior for competitive modes

The UI should not know whether an engine is Fairy-Stockfish, a personality bot, or AlphaZero.

### Determinism

Competitive async surfaces must be reproducible:

- same challenge code
- same bot id
- same engine version
- same rules version
- same starting FEN
- same time-control relevant settings

These should produce the same bot behavior. Casual variety is allowed only when it does not affect shared leaderboard comparisons.

### Versioned Data

Data that can outlive a session needs a version:

- local stores
- saved games
- puzzles
- lessons
- challenge URLs
- D1 tables
- engine model metadata
- move encoding

Prefer additive changes. If a destructive migration seems necessary, write a migration issue first.

## AlphaZero Readiness

AlphaZero should be a new engine adapter, not a parallel application.

Before a real AlphaZero engine affects users, the repo needs:

- shared legal move generator
- stable move encoding version
- state tensor encoder
- seeded MCTS options
- model id and model hash metadata
- benchmark harness
- deterministic challenge mode behavior

The UI should continue to render the same board and controls.

## Anti-Patterns

Avoid:

- hardcoding engine ids in UI
- adding a new board layout for one page
- duplicating Makruk rules in a page or script
- silently changing persisted schemas
- making leaderboard-affecting behavior random
- fixing mobile layout with route-specific pixel hacks
- adding content that requires code changes for each new item
- weakening worker verification to accept client claims

## Definition Of Done For Foundation Work

A foundation PR is done only when:

- the new contract is documented
- affected callers are migrated or a follow-up issue is linked
- tests cover the contract
- old data/content still loads
- CI passes
- reviewers can understand the migration path without reading every file
