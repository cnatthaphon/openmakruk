// One-shot build script: read the Yevrowl Wikimedia Makruk silhouettes
// from public/pieces/ and emit per-colour variants (white & black) into
// public/pieces/makruk/ with proper fill + outline so chessground can
// reference them directly as background-image — no CSS mask gymnastics.
//
// Source SVGs are CC BY-SA 4.0 by Yevrowl. The recoloured derivatives
// inherit CC BY-SA 4.0; attribution lives in public/pieces/NOTICE.
//
// Run once after `npm install` (or whenever you tweak the colour palette):
//   node scripts/build-makruk-pieces.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Source filename → chessground role name
const PIECE_MAP = {
  Khun: 'king',
  Met: 'queen',
  Khon: 'bishop',
  Ma: 'knight',
  Ruea: 'rook',
  Bia: 'pawn',
};

// Light side = warm boxwood, dark side = rosewood. Stroke is the opposite
// shade so each piece reads against both light and dark squares.
const PALETTE = {
  white: {
    fill: '#faecc1',
    stroke: '#1a0a06',
    strokeWidth: '16',
  },
  black: {
    fill: '#2a1810',
    stroke: '#faecc1',
    strokeWidth: '10',
  },
};

const outDir = join(root, 'public/pieces/makruk');
mkdirSync(outDir, { recursive: true });

let generated = 0;
for (const [piece, role] of Object.entries(PIECE_MAP)) {
  const sourcePath = join(root, `public/pieces/${piece}_white.svg`);
  if (!existsSync(sourcePath)) {
    console.warn(`[build-pieces] source missing: ${sourcePath}`);
    continue;
  }
  const sourceSvg = readFileSync(sourcePath, 'utf8');

  for (const [color, style] of Object.entries(PALETTE)) {
    const recoloured = sourceSvg.replace(
      /fill="#000000"\s+stroke="none"/g,
      `fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" stroke-linejoin="round"`,
    );
    const outPath = join(outDir, `${color}_${role}.svg`);
    writeFileSync(outPath, recoloured);
    generated++;
  }
}

console.log(`[build-pieces] generated ${generated} piece SVGs into public/pieces/makruk/`);
