// Shared Makruk core — barrel exports.
//
// Pure-TypeScript rules + FEN + counting. Imported by:
//   • src/lib/makruk.ts (the existing client API surface re-exports
//     from here so legacy callers keep working unchanged)
//   • future worker/src/rules.ts (parity-tested today; direct import
//     planned once the module-resolution path is set up)
//
// Issue #3 acceptance: this file is the stable surface. Anything
// not exported here is private. New callers should NOT reach into
// '../core/fen' etc. directly — go through this barrel so renames
// stay safe.

export * from './types.ts';
export * from './fen.ts';
export * from './counting.ts';
