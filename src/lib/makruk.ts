import Module from 'ffish-es6';
import type { FairyStockfish } from 'ffish-es6';

export const MAKRUK_START_FEN =
  'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSMKSNR w - - 0 1';

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

// Parse the position segment of a FEN string into a {square: piece} map.
// FEN ranks are listed from rank 8 (top) down to rank 1 (bottom).
// Each rank token uses piece letters (uppercase=white, lowercase=black)
// and digits to skip empty squares. Makruk uses K M S N R P.
export function fenToPieceMap(fen: string): PieceMap {
  const pieces: PieceMap = {};
  const position = fen.split(' ')[0];
  const ranks = position.split('/');
  for (let i = 0; i < ranks.length; i++) {
    const rank = 8 - i;
    let fileIdx = 0;
    for (const ch of ranks[i]) {
      if (ch >= '1' && ch <= '9') {
        fileIdx += Number(ch);
        continue;
      }
      // Skip Fairy-Stockfish promoted-piece prefix '+' if it appears
      if (ch === '+') continue;
      const file = String.fromCharCode(97 + fileIdx); // 'a' + fileIdx
      pieces[`${file}${rank}`] = ch;
      fileIdx++;
    }
  }
  return pieces;
}
