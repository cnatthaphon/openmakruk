// Journey / learning-path module — public barrel.
//
// Issue #7 deliverables, by file:
//   contract.ts    — schema (types), versioning, helpers.
//   concepts.ts    — content → Concept mapping (lesson group / puzzle
//                     category / drill → concepts).
//   reducer.ts     — pure (state, input) → state, idempotent.
//   checkpoints.ts — the shipped checkpoint ladder (data).
//   store.ts       — durable persistence + submitProgress() entry point.
//   migrate.ts     — one-time seed from the legacy per-surface stores.
//
// Every training surface contributes by calling `submitProgress(input)`.
// The legacy stores (learnProgress, puzzleProgress, reviewMastery,
// countingDrill) keep working unchanged — the journey reads ALONGSIDE
// them, and `seedJourneyFromStores()` backfills prior progress on first
// boot so nothing resets.

export * from './contract';
export { createJourneyReducer } from './reducer';
export { JOURNEY_CHECKPOINTS } from './checkpoints';
export {
  loadJourney,
  saveJourney,
  clearJourney,
  submitProgress,
  submitProgressBatch,
} from './store';
export { seedJourneyFromStores } from './migrate';
export {
  conceptsForLessonGroup,
  conceptsForPuzzleCategory,
  conceptsForDrill,
} from './concepts';
