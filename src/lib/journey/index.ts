// Journey / learning-path module — public barrel.
//
// Issue #7 deliverables, by file:
//   contract.ts  — schema (types), versioning, helpers. THIS module.
//   feed.ts      — (follow-up) subscribes to existing stores and
//                   emits ProgressInput events to the reducer.
//   reducer.ts   — (follow-up) pure (state, input) → state.
//   store.ts     — (follow-up) versioned localStorage persistence
//                   + cloud-sync.
//
// Today only the contract is shipped. Existing stores
// (learnProgress, puzzleProgress, reviewMastery, conceptMastery)
// keep working unchanged — they're not yet wired through the
// feed. The contract is what the wiring will depend on.

export * from './contract';
