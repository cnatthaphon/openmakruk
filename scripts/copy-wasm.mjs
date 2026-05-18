// Copy Fairy-Stockfish WASM binary from node_modules into public/ so Vite
// serves it at /ffish.wasm. Runs automatically after `npm install`.
//
// Why not commit the .wasm: ~920KB binary; reproducible from npm install.
// Why not let Vite resolve it: ffish-es6 uses Emscripten's fetch loader that
// expects an absolute URL at runtime; placing the file at site root is the
// simplest reliable approach.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'node_modules', 'ffish-es6', 'ffish.wasm');
const destDir = join(root, 'public');
const dest = join(destDir, 'ffish.wasm');

if (!existsSync(src)) {
  console.warn(`[copy-wasm] source not found, skipping: ${src}`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-wasm] ${src} → ${dest}`);
