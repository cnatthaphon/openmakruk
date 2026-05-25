#!/usr/bin/env node
// Generate mate-2 puzzles by composition + verification.
//
// Strategy: enumerate small endgame positions (K vs K+R+pieces),
// run a 2-ply mate finder via the rules engine, keep positions
// where exactly one move sequence mates. Output is a JSON file
// that the user reviews + can append to public/content/puzzles/all.json.
//
// We deliberately do NOT auto-merge into the curated pool — every
// puzzle should be reviewed before going live (clarity, theme,
// aesthetics matter more than rule correctness alone).
//
// Usage:
//   node --experimental-strip-types --no-warnings scripts/generate-puzzles.mjs

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyMove,
  classify,
  listLegalMoves,
  parseFen,
  toFen,
} from '../src/rules.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../candidate-puzzles.json');

// Sample positions to search FROM. We bias toward K+RR-vs-K (ladder
// mate setups) and K+R+M-vs-K where forced 2-ply mates are common
// in Makruk. Most random K+R-vs-K positions are 3+ moves to mate,
// so they fail the strict mate-in-2 filter.
const SAMPLE_POSITIONS = [
  // K + RR vs K — ladder mate setups (8 corner / edge variants)
  '7k/8/6K1/8/8/R7/8/1R6 w - - 0 1',
  '6k1/8/5K2/8/8/R7/8/1R6 w - - 0 1',
  '5k2/8/4K3/8/8/R7/8/1R6 w - - 0 1',
  '4k3/8/3K4/8/8/R7/8/1R6 w - - 0 1',
  'k7/8/1K6/8/8/8/8/R3R3 w - - 0 1',
  '1k6/8/2K5/8/8/8/8/R3R3 w - - 0 1',
  '7k/R7/6K1/8/8/8/8/3R4 w - - 0 1',
  '7k/8/R7/6K1/8/8/8/3R4 w - - 0 1',
  'k7/R7/2K5/8/8/8/8/3R4 w - - 0 1',
  '1k6/R7/2K5/8/8/8/8/3R4 w - - 0 1',
  // K + R + N (knight) vs K — corner mate motifs
  '7k/6KN/8/8/8/8/R7/8 w - - 0 1',
  '6k1/5K1N/8/8/8/8/R7/8 w - - 0 1',
  '7k/7N/5K2/8/8/8/8/R7 w - - 0 1',
  // K + R + bia/met vs K — supported rook mate
  '7k/R7/5KM1/8/8/8/8/8 w - - 0 1',
  '7k/R7/4KM2/8/8/8/8/8 w - - 0 1',
  '7k/8/6K1/8/8/8/8/R3M3 w - - 0 1',
  // K + 2R + variant arrangements
  '7k/8/8/8/8/6K1/R7/3R4 w - - 0 1',
  '6k1/8/8/8/8/5K2/R7/3R4 w - - 0 1',
  '7k/8/8/6K1/8/8/R7/R7 w - - 0 1',
  '4k3/4K3/8/8/8/8/R7/R7 w - - 0 1',
  '4k3/3K4/8/8/8/8/R7/R7 w - - 0 1',
  '4k3/8/4K3/8/8/8/R7/R7 w - - 0 1',
  '7k/8/5K2/8/8/8/R7/R7 w - - 0 1',
  '6k1/8/4K3/8/8/8/R7/R7 w - - 0 1',
].map((fen) => ({ fen, cat: 'mate-2' }));

function isMateIn2(pos) {
  // White's turn: enumerate every white move, then for each black
  // reply, check that white can force mate next move. We return
  // the unique forcing move if exactly one works.
  const whiteMoves = listLegalMoves(pos);
  const candidates = [];
  for (const wm of whiteMoves) {
    const afterW = applyMove(pos, wm);
    if (!afterW.ok) continue;
    if (classify(afterW.position).state === 'checkmate') continue; // mate-1, skip
    const blackMoves = listLegalMoves(afterW.position);
    if (blackMoves.length === 0) continue; // stalemate, not what we want
    // Every black reply must allow white to mate next move.
    let allReplies2Mate = true;
    const sampleLine = [wm];
    let firstReply = null;
    for (const bm of blackMoves) {
      const afterB = applyMove(afterW.position, bm);
      if (!afterB.ok) continue;
      // White must have at least one move that mates immediately.
      const whiteMate = listLegalMoves(afterB.position).find((m) => {
        const after2 = applyMove(afterB.position, m);
        if (!after2.ok) return false;
        return classify(after2.position).state === 'checkmate';
      });
      if (!whiteMate) {
        allReplies2Mate = false;
        break;
      }
      if (firstReply === null) {
        firstReply = bm;
        sampleLine.push(bm, whiteMate);
      }
    }
    if (allReplies2Mate) candidates.push({ move: wm, line: sampleLine });
  }
  // Multiple forcing first moves are also valid puzzles — the user
  // just needs to find ONE. The standard solver accepts any of them.
  if (candidates.length >= 1) return candidates[0];
  return null;
}

const found = [];
for (const sp of SAMPLE_POSITIONS) {
  const pos = parseFen(sp.fen);
  if (!pos) continue;
  const mate = isMateIn2(pos);
  if (mate) {
    found.push({
      id: `gen-${found.length + 1}-${Date.now().toString(36)}`,
      fen: sp.fen,
      category: 'mate-2',
      rating: 1100 + Math.floor(Math.random() * 200),
      toMove: 'white',
      solution: mate.line,
      prompt: 'ขาวเดิน · รุกจน 2 ตา',
      hint: 'หาตาที่บังคับสีดำเข้าตำแหน่งโดนรุก',
      themes: ['mate-in-2', 'auto-generated'],
      source: 'OpenMakruk generator',
    });
  }
}

console.log(`Found ${found.length} mate-in-2 candidates from ${SAMPLE_POSITIONS.length} starting points`);
writeFileSync(OUT, JSON.stringify(found, null, 2) + '\n', 'utf8');
console.log(`wrote ${OUT}`);
