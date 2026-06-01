import Module from 'ffish-es6';
import type { FairyStockfish } from 'ffish-es6';

// Issue #3 — pure rules / FEN / counting live in src/core/. This
// module re-exports the surface that legacy callers already use so
// nothing breaks during migration. New code should import from
// '../core' directly. The ffish-wrapped helpers (loadFfish,
// parseLegalMoves, parseUci, CountInfo) stay here because they
// depend on the WASM engine and can't be pure-TS.
export { MAKRUK_START_FEN, fenToPieceMap } from '../core';
export { parseCounting } from '../core';
export type { CountInfo } from '../core';

export type Square = string; // 'a1'..'h8'
export type PieceMap = { [square: string]: string };

let instance: FairyStockfish | null = null;
let loading: Promise<FairyStockfish> | null = null;

export function loadFfish(): Promise<FairyStockfish> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;
  loading = Module({
    // Tell Emscripten to find ffish.wasm at the site root (we copy it to /public).
    locateFile: (file) => (file.endsWith('.wasm') ? `/${file}` : file),
  }).then((m) => {
    instance = m;
    return m;
  });
  return loading;
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4) : undefined,
  };
}

export function parseLegalMoves(movesStr: string): string[] {
  return movesStr.trim().split(/\s+/).filter(Boolean);
}

// Parse Makruk-specific counting fields from a FEN.
//
// Standard chess FEN: "pos side castling enPassant halfmove fullmove"
// `parseCounting`, `fenToPieceMap`, and `CountInfo` now live in
// src/core/ and are re-exported from the top of this file. The
// implementation here matched what core/counting.ts and core/fen.ts
// provide, byte-for-byte at the time of issue #3; if behaviour
// diverges in the future the source of truth is src/core/.
