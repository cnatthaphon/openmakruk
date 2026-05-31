# Journey / Learning Path Contract

Issue #7 defines one progress model that every training surface (lessons, puzzles, drills, review, challenges, ratings) contributes to. This directory holds the **contract** — the types + helpers + reducer signature future code depends on. It deliberately ships before the reducer, the persistence layer, and the UI so those parts can be reviewed independently.

## Files

| File | Purpose |
|---|---|
| `contract.ts` | All exported types + helpers + version constant. |
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
  | { kind: 'game-recorded',                 at, mode, outcome }
  | { kind: 'rating-changed',                at, rating }
```

Each existing store emits ONE of these `ProgressInput` kinds — the rest is the reducer's job. The reducer signature is `(state, input) → state` and must be pure.

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

## What this PR does NOT include

- `feed.ts` — the wiring layer that subscribes to existing stores.
- `reducer.ts` — the actual state transition logic.
- `store.ts` — versioned localStorage + cloud-sync persistence.
- Migration code that backfills `JourneyState` from existing per-surface stores on first run.
- UI consumers (a Journey tab, checkpoint cards, mastery chart).

Each is tracked as a follow-up to issue #7. Building them on the contract this PR establishes lets each land separately under review.

## Existing stores that the feed will subscribe to

| Store | Owns | What it emits |
|---|---|---|
| `src/lib/learnProgress.ts` | Completed lessons | `lesson-completed` |
| `src/lib/puzzleProgress.ts` | Solved puzzles | `puzzle-solved` |
| `src/lib/reviewMastery.ts` | Per-game review summary | `review-summary` |
| `src/lib/conceptMastery.ts` | Motif totals derived from games | (read-only consumer of review-summary) |
| `src/lib/asyncChallenge.ts` | Async challenge history | `challenge-completed` |
| `src/lib/stats.ts` | Rating + game history | `rating-changed` |
| `src/lib/countingDrill.ts` | Drill scores | `drill-passed` |

The wiring layer will be a thin adapter file per store — no store needs to change its public API. Backwards compatibility for existing localStorage payloads is preserved.

## Migration safety

`JOURNEY_SCHEMA_VERSION = 1` is the initial release. There is no prior version on disk for any user, so no migration code is needed yet. The future `store.ts` will install a migration registry pattern so version bumps can be added without touching existing read paths.
