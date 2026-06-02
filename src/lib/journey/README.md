# Journey / Learning Path Contract

Issue #7 defines one progress model that every training surface (lessons, puzzles, drills, review, challenges, ratings) contributes to. This directory holds the contract, the pure reducer, the checkpoint ladder, durable persistence, and the one-time migration from the legacy per-surface stores.

## Files

| File | Purpose |
|---|---|
| `contract.ts` | All exported types + helpers + version constant. |
| `concepts.ts` | Content (lesson group / puzzle category / drill) → Concept mapping. |
| `reducer.ts` | Pure `(state, input) => state'`, idempotent. |
| `checkpoints.ts` | Shipped checkpoint ladder (data). |
| `store.ts` | Durable persistence + `submitProgress()` entry point. |
| `migrate.ts` | One-time `seedJourneyFromStores()` backfill. |
| `index.ts` | Public barrel — only import from here. |
| `README.md` | This file. |

## Schema versioning

`JOURNEY_SCHEMA_VERSION` is the integer that travels with every persisted `JourneyState`. The persistence layer (future `store.ts`) compares the value on disk against the runtime constant on load:

- Match → use the data as-is.
- Persisted < runtime → run a migration function to bring it up to current version.
- Persisted > runtime → the user has been on a newer client; refuse to overwrite, surface a "please reload" toast.

Bump rules:

1. **Additive change** (new optional field, new union variant): no bump required. Existing data is still readable.
2. **Field-meaning change or required-field rename**: bump version + write a migration.
3. **Concept enum addition**: `Concept` is a closed TypeScript string union — adding a new value is a source-code change to `contract.ts` (TS rejects unknown values at compile time). Persisted `JourneyState` data containing the old set is still readable, so no schema bump is required; the new value simply starts showing up in fresh inputs.

## The core types

```ts
JourneyState = {
  v: 1                                         // version stamp
  cleared: string[]                            // checkpoint ids
  mastery: Partial<Record<Concept, number>>    // per-concept 0..1
  evidence: {                                  // raw counters the
    completedLessons?:        LessonId[]       //   reducer needs to
    solvedPuzzles?:           PuzzleId[]       //   answer combined
    puzzleCountsByCategory?:  Record<string,n> //   requirements
    drillBestStars?:          Record<DrillId, 1|2|3>
    completedChallenges?:     ChallengeCode[]
    gamesPlayedRated?:        number
    gamesPlayedCasual?:       number
    recordedGameIds?:         string[]      //   dedupe ledger
    reviewContributionsByGameId?: Record<string, Partial<Record<Concept,number>>>
    rating?:                  number
  }
  updatedAt: number                            // ms epoch
}

ProgressInput =
  | { kind: 'lesson-completed',    lessonId, at, concepts? }
  | { kind: 'puzzle-solved',       puzzleId, category, at, optimal, concepts? }
  | { kind: 'drill-passed',        drillId,  at, stars, concepts? }
  | { kind: 'review-summary',      gameId,   at, motifTotals }
  | { kind: 'challenge-completed', code,     at, outcome }
  | { kind: 'game-recorded',       gameId,   at, mode, outcome }
  | { kind: 'rating-changed',                at, rating }
```

Every kind that mutates an evidence counter carries a stable id (`lessonId`, `puzzleId`, `drillId`, `gameId`, `code`). The reducer treats a re-emitted event whose id is already counted as a no-op — required for safe cloud-sync replay and startup backfill of `stats.history` (PR #14 review: Codex flagged that `game-recorded` was the only mutating event lacking an id, so duplicate emissions could unlock `games-played` checkpoints on games the user never actually played twice).

`review-summary` is the exception to "duplicate id = no-op": if a stored summary for the same `gameId` is replaced, the reducer compares against `evidence.reviewContributionsByGameId[gameId]`, removes/replaces the old per-concept contribution, then persists the new translated contribution. That makes startup/cloud replay idempotent without freezing legitimate review updates.

Each existing store emits the `ProgressInput` kind(s) listed below — the rest is the reducer's job. The reducer signature is `(state, input) → state` and must be pure.

The `evidence` field is what makes the reducer **purely** evaluable: every `CheckpointRequirement` clause has a corresponding evidence field, so the reducer can answer "is this checkpoint cleared?" by reading state alone — no event log replay, no store re-read.

## CheckpointRequirement ↔ JourneyState.evidence

| Requirement clause | Evidence read |
|---|---|
| `lesson-completed { lessonId }` | `evidence.completedLessons.includes(lessonId)` |
| `puzzle-solved { puzzleId }` | `evidence.solvedPuzzles.includes(puzzleId)` |
| `puzzle-category-solved { category, count }` | `evidence.puzzleCountsByCategory[category] ≥ count` |
| `drill-passed { drillId, minStars }` | `(evidence.drillBestStars[drillId] ?? 0) ≥ minStars` |
| `concept-mastered { concept, minScore }` | `state.mastery[concept] ≥ minScore` |
| `games-played { minCount, rated? }` | combination of `evidence.gamesPlayedRated` + `gamesPlayedCasual` |
| `rating-reached { minRating }` | `(evidence.rating ?? 0) ≥ minRating` |
| `challenge-completed { code? }` | `code` present → check inclusion; absent → array non-empty |

Note the drill clause uses `minStars` (1/2/3), NOT `minScore`. The drill-passed INPUT also reports `stars` — both ends of the contract share the unit so the reducer's comparison is unambiguous.

## Coach motifs → Concepts

`review-summary` events carry `motifTotals` keyed by the existing CoachMotif `kind` strings (`capture`, `check`, `mate`, `mateThreat`, `fork`, `hangingTarget`, `develop`, `promotion`). The reducer translates each through `COACH_MOTIF_TO_CONCEPT` from `contract.ts`:

| Coach motif | Concept |
|---|---|
| `capture` | `capture-trade` |
| `check` | `check-detection` |
| `mate` | `mate-recognition` |
| `mateThreat` | `mate-threat-awareness` |
| `fork` | `tactical-fork` |
| `hangingTarget` | `tactical-hanging-piece` |
| `develop` | `opening-development` |
| `promotion` | `endgame-promotion` |

Adding a new coach motif = one row in the table + (if needed) one Concept enum value. No schema bump unless persisted shapes change.

## Adding new content

Adding a new lesson / puzzle / drill should NOT require changes here:

- Lessons + puzzles already use content IDs that match the contract's `LessonId` / `PuzzleId` (string).
- The reducer reads the `concepts` field optionally passed alongside the input. If the new content tags a concept that the `Concept` enum doesn't list yet, add it to `contract.ts` — that's the only contract-side change.

## Adding new surfaces

A new training surface should:

1. Identify which `ProgressInput` kind matches its event. If none does, add a new variant to the union (additive — no schema bump).
2. Emit the event into the feed (future `feed.ts` API).
3. Tag relevant concepts so mastery flows through.

No new surface should fork its own progress store. The whole point of the contract is one source of truth.

## The reducer (`reducer.ts`)

`createJourneyReducer(checkpoints)` returns the pure `JourneyReducer`
the contract specifies. `store.ts` binds it to the shipped checkpoint
ladder; tests bind fixtures.

Guarantees the reducer holds:

- **Pure** — `(state, input) => state'`, no I/O, no `Date.now` (the
  caller stamps `at`). Runs under `node --test`.
- **Idempotent** — every mutating path is gated on an evidence id-set
  (`completedLessons`, `solvedPuzzles`, `recordedGameIds`,
  `completedChallenges`), a best-so-far comparison (`drillBestStars`),
  or a per-game delta-replacement (`reviewContributionsByGameId`). So
  re-emitting an event — cloud-sync replay, startup backfill — never
  double-counts. This is what makes the migration safe to re-run.
- **Order-independent** — folding the same inputs in any order yields
  the same evidence (covered by a test).
- **Monotonic clearing** — a checkpoint, once cleared, stays cleared.

### Mastery is derived, never mutated

```
mastery[c] = clamp01( practiceScore[c] + Σ reviewContributions[*][c] )
```

`practiceScore` (lessons/puzzles/drills) grows monotonically, gated by
the id-sets so re-doing content doesn't compound. `reviewContributions`
are stored per `gameId` and replaced on re-review. Deriving `mastery`
fresh after each input — rather than mutating it in place — is what
lets review replay be idempotent without a subtract-after-clamp hazard.

## Checkpoints (`checkpoints.ts`)

`JOURNEY_CHECKPOINTS` is a beginner→intermediate ladder expressed
purely as content ids + category counts + concept thresholds + activity
counters. Adding or retuning a checkpoint is a **data edit** — no
reducer or UI change. Never rename a shipped checkpoint id (cleared ids
persist in player state).

## Contributing progress (`store.ts`)

Every surface contributes by calling **`submitProgress(input)`**
(load → reduce → save). Wired emitters today:

| Surface | Call site | Emits |
|---|---|---|
| Lessons | `LearnPage.handleMarkComplete` | `lesson-completed` |
| Puzzles | `PuzzleView` solve | `puzzle-solved` |
| Drills | `CountingDrillPage` clear | `drill-passed` |
| Review | `App.handleStartReview` | `review-summary` |
| Games | `App` game-record effect | `game-recorded` + `rating-changed` |

The legacy per-surface stores keep working unchanged — the journey
reads **alongside** them. Storage is `'durable'` (IndexedDB) like
`stats.ts`, since the evidence grows with play.

## Migration (`migrate.ts`)

`seedJourneyFromStores()` runs once on boot (gated by a flag, but
idempotent regardless thanks to the reducer). It reads the legacy
stores — `learnProgress`, `puzzleProgress`, `countingDrill`,
`reviewMastery`, `stats.history` — loads the lesson/puzzle content maps
to attach category + concepts, and replays the equivalent
`ProgressInput` batch via `submitProgressBatch`. A returning player's
prior progress shows up in the journey **without a reset**.

`JOURNEY_SCHEMA_VERSION = 1` is the initial release; `store.ts`'s
`migrate` merges unknown/old payloads into the current shape additively.

## Not in this slice

- UI consumers (a dedicated Journey tab / checkpoint cards / mastery
  chart). `ProfilePage`'s existing JourneySection still reads the
  server `fetchJourney` view; surfacing the LOCAL journey state is a
  follow-up. The contract + reducer + migration + emitters here are
  what those consumers will read.
