# Review → Puzzle pipeline (`src/lib/reviewPipeline`)

Turns a reviewed game into verified puzzle candidates through swappable,
schema-driven boundaries. Implements issue #19.

```text
GameLog
  → ReviewRuntime.analyze(...)          impure — engine-backed
  → AnnotatedGame
  → extractPuzzleCandidates(..., spec)  PURE — policy only
  → PuzzleCandidate[]
  → PuzzleRepository.promote(...)       impure — verify + persist
  → saved puzzle (draft/private/public)
```

## Why it exists

The post-game Game Report already let a user "mine" a key moment into a
puzzle, but the UI imported the concrete miner (engine + verifier +
store) and the thresholds were hardcoded in React. That blocks the
long-term architecture goal: swap the browser Fairy-Stockfish runtime
for a Worker endpoint or a future AlphaZero engine **without rewriting
UI or extraction code**.

This module draws the boundaries:

| Concern | Boundary | Purity |
|---|---|---|
| Analysis | `ReviewRuntime` | impure (engine) |
| Which positions become puzzles + category/rating | `extractPuzzleCandidates` + `PuzzleQualitySpec` | **pure** |
| Verify + persist | `PuzzleRepository` | impure (engine + store) |

The UI imports **only** `src/lib/reviewPipeline` (the facade). It never
imports a concrete runtime, the engine, the verifier, or the puzzle
store.

## The pieces

- **`contracts.ts`** — versioned types. Every cross-module import is
  `import type`, so this file + the pure extractor/spec carry zero
  runtime deps and run under `node --test --experimental-strip-types`.
- **`spec.ts`** — `DEFAULT_PUZZLE_QUALITY_SPEC` (reproduces the legacy
  miner thresholds as data) + `validatePuzzleQualitySpec`. **Always
  validate before passing a spec to the extractor** — the extractor
  assumes a valid spec and does no defensive checking.
- **`extractor.ts`** — `extractPuzzleCandidates(game, spec)`. Pure. No
  engine, no ffish, no `Date.now`. Decides mate-vs-tactic, rating,
  quality score, copies provenance.
- **`clientReviewRuntime.ts`** — `ClientReviewRuntime implements
  ReviewRuntime`. Wraps `analyzeGame` + the coach motif detectors.
  `analyze()` runs the full review; `fromAnnotatedMoves()` lifts review
  output the Game Report already holds (no second engine pass — motif
  detection is rules-level only).
- **`localPuzzleRepository.ts`** — `LocalPuzzleRepository implements
  PuzzleRepository`. Deepens multi-move solutions (lazy, at promote
  time), verifies via the existing `verifyAndAnnotate`, saves via
  `saveUserPuzzle` (which keeps the existing server-publish mirror).
- **`index.ts`** — the facade. Re-exports contracts + default-wired
  singletons, plus `promoteReviewedPosition(move, opts)` running the
  whole vertical for one position.

## Where solutions get their length

To keep analysis cheap, the runtime seeds each ply's `bestLine` with
just `[bestMove]`. The pure extractor copies that seed into
`candidate.solution`. The **repository** deepens it to the category's
target length (mate-in-2 → 3 plies) via a bounded engine PV walk *only
when the user actually promotes* — same latency profile as the old
mine-on-click flow, but now behind the contract.

## Swapping the runtime

Implement `ReviewRuntime` (e.g. a `WorkerReviewRuntime` that POSTs to a
server analysis endpoint, or an `MctsReviewRuntime`). Produce an
`AnnotatedGame` with the same shape. The extractor, the spec, the
repository, and every UI consumer stay untouched — only the facade's
wiring (or a registry lookup) changes.

## Tests

- `__tests__/spec.test.ts` + `__tests__/extractor.test.ts` — pure,
  run via `npm run test:core`.
- e2e: `tests/e2e/review-to-puzzle.spec.ts` proves review → promote →
  puzzle appears in ปริศนา → ของฉัน end to end.

## Schema versioning

`REVIEW_PIPELINE_SCHEMA_VERSION` is stamped on every `AnnotatedGame` and
`PuzzleCandidate`. Bump it only when a persisted shape changes
incompatibly; additive optional fields do not require a bump.
