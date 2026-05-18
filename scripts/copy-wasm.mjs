// Copy WASM/engine runtime files from node_modules into public/ so Vite
// serves them as static assets. Runs automatically after `npm install`.
//
// Why not commit these: they're large binaries that come from npm
// packages; we keep public/ source-clean and treat them as derived assets.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const copies = [
  // ffish-es6 rules engine (Fairy-Stockfish board state)
  ['node_modules/ffish-es6/ffish.wasm', 'public/ffish.wasm'],

  // fairy-stockfish-nnue.wasm — full engine (UCI, search, NNUE-ready)
  ['node_modules/fairy-stockfish-nnue.wasm/stockfish.js', 'public/engine/stockfish.js'],
  ['node_modules/fairy-stockfish-nnue.wasm/stockfish.wasm', 'public/engine/stockfish.wasm'],
  ['node_modules/fairy-stockfish-nnue.wasm/stockfish.worker.js', 'public/engine/stockfish.worker.js'],
];

let copied = 0;
for (const [src, dest] of copies) {
  const absSrc = join(root, src);
  const absDest = join(root, dest);
  if (!existsSync(absSrc)) {
    console.warn(`[copy-wasm] missing source, skipping: ${src}`);
    continue;
  }
  mkdirSync(dirname(absDest), { recursive: true });
  copyFileSync(absSrc, absDest);
  copied++;
}

console.log(`[copy-wasm] copied ${copied}/${copies.length} runtime files`);
