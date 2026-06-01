# src/core/ — Shared Makruk Core

Pure-TypeScript Makruk rules + FEN parsing + counting helpers. **No** chessground, ffish, React, or platform-specific imports allowed here. The worker imports the same logic; pulling in browser-only deps would break the worker runtime.

## What lives here today

| File | Purpose |
|---|---|
| `types.ts` | Shared types: `Color`, `Role`, `Square`, `Piece`, `PieceMap`, `ParsedFen`, `CountInfo`, `UciMove`. |
| `fen.ts` | `MAKRUK_START_FEN`, `letterToRole`, `fenToPieceMap`, `parseFen`. |
| `counting.ts` | `parseCounting` (FS-encoding), `pieceCountingLimit`, `bareKingSide`, `HONOR_COUNT_LIMIT`. |
| `index.ts` | Barrel — the public surface. |

## What does NOT live here yet

Tracked under issue #3 but deferred to follow-up PRs to keep this PR reviewable:

- Legal-move generation (per-role attack tables exist in `src/lib/chessAttacks.ts` and `src/lib/lessonRules.ts` — convergence pending).
- Move application + replay (`apply(move, position) → newPosition`).
- Promotion (Bia → Met when reaching rank 6/3).
- Terminal classification (checkmate / stalemate / counting-expired).
- Counting state-transitions (when the count starts, what happens when material changes mid-count).

The worker has its own pure-TS implementation in `worker/src/rules.ts` for the move-verification it already needs. The medium-term plan is to delete that and have the worker import this barrel directly. Until that path is set up, the two implementations are kept in lockstep through parity tests (see `worker/tests/scenarios.test.ts`).

## The contract

Anything exported from `src/core/index.ts` must:

- Be a pure function or a plain data type. No side effects, no `Math.random()`, no `Date.now()`.
- Take inputs and produce outputs that are JSON-serialisable. No class instances, no functions returned as values.
- Run identically in browser, Node, and Cloudflare Worker runtimes.
- Have no dependency on `src/lib/`, `src/components/`, or any other higher layer.

If a function fails any of these, it doesn't belong here yet.

## Migration path

`src/lib/makruk.ts` re-exports from this barrel so existing call sites compile unchanged. New code should import from `'../core'` (or `'./core'` depending on depth) directly:

```ts
// Before
import { MAKRUK_START_FEN, parseCounting } from '../lib/makruk';

// After (new code)
import { MAKRUK_START_FEN, parseCounting } from '../core';
```

When migrating an existing caller, change the import path and verify the type at the call site still matches — the types haven't changed, only their home.
