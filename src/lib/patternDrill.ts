// Pattern Recognition drill — flash a board position for a few
// seconds, hide it, then quiz the player on a single fact about that
// position (piece count, king location, capture-target presence).
// Reinforces visualization — chess.com / lichess have it for chess;
// nothing equivalent exists for Makruk.
//
// Questions are generated from existing puzzle FENs — no new
// content curation needed. The position pool is whatever
// /content/puzzles/all.json exposes (currently 74 positions covering
// mate-in-1 / mate-in-2 / tactic / counting / defense).

import { defineStore } from './stores';
import { fenToPieceMap } from './makruk';
import { letterToPiece } from './chessAttacks';
import type { Puzzle } from './puzzleSchema';

export type DrillQuestion = {
  /** Position the player saw (only for the answer-reveal phase). */
  fen: string;
  /** Human-readable Thai question. */
  prompt: string;
  /** The correct answer, as a string. */
  answer: string;
  /** Multiple-choice options including the answer; shuffled. */
  choices: string[];
};

/** Deterministic-ish pick from a pool. Math.random() is used because
 *  the drill is meant to be fresh every session, not reproducible. */
function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Count own-color pieces in a position. */
function countPieces(fen: string, color: 'white' | 'black'): number {
  const map = fenToPieceMap(fen);
  let n = 0;
  for (const letter of Object.values(map)) {
    const p = letterToPiece(letter);
    if (p && p.color === color) n++;
  }
  return n;
}

/** Find the square of a color's king. Every legal position has one. */
function findKing(fen: string, color: 'white' | 'black'): string | null {
  const map = fenToPieceMap(fen);
  for (const [sq, letter] of Object.entries(map)) {
    const p = letterToPiece(letter);
    if (p && p.color === color && p.role === 'king') return sq;
  }
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build one question from a random pool entry. Returns null if the
 *  position is somehow invalid (defensive — shouldn't happen with
 *  the curated puzzle pool). */
export function buildQuestion(pool: Puzzle[]): DrillQuestion | null {
  if (pool.length === 0) return null;
  const puzzle = pickRandom(pool);
  const fen = puzzle.fen;
  // Three question types — pick one at random per round so the
  // player can't game the drill by memorising one query shape.
  const type = pickRandom(['white-pieces', 'black-pieces', 'white-king', 'black-king'] as const);
  if (type === 'white-pieces' || type === 'black-pieces') {
    const color = type === 'white-pieces' ? 'white' : 'black';
    const actual = countPieces(fen, color);
    const distractors = new Set<number>();
    while (distractors.size < 3) {
      const cand = Math.max(1, actual + (Math.floor(Math.random() * 5) - 2));
      if (cand !== actual) distractors.add(cand);
    }
    const choices = shuffle([actual, ...distractors].map(String));
    return {
      fen,
      prompt: `${color === 'white' ? '♔ ขาว' : '♚ ดำ'} มีตัวหมากกี่ตัว (รวมขุน)?`,
      answer: String(actual),
      choices,
    };
  }
  // King-location questions
  const color = type === 'white-king' ? 'white' : 'black';
  const actual = findKing(fen, color);
  if (!actual) return null;
  // Distractors — pick 3 random squares that differ from the actual.
  const FILES = 'abcdefgh';
  const distractors = new Set<string>();
  while (distractors.size < 3) {
    const f = FILES[Math.floor(Math.random() * 8)];
    const r = Math.floor(Math.random() * 8) + 1;
    const sq = `${f}${r}`;
    if (sq !== actual) distractors.add(sq);
  }
  const choices = shuffle([actual, ...distractors]);
  return {
    fen,
    prompt: `${color === 'white' ? '♔ ขุนขาว' : '♚ ขุนดำ'} อยู่ช่องไหน?`,
    answer: actual,
    choices,
  };
}

// ─── Best score persistence ─────────────────────────────────────

const DRILL_VERSION = 1;

type PatternDrillState = {
  bestScore: number;
  bestSetAt: number;
};

const store = defineStore<PatternDrillState>({
  key: 'openmakruk_pattern_drill',
  version: DRILL_VERSION,
  default: () => ({ bestScore: 0, bestSetAt: 0 }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<PatternDrillState>;
    return {
      bestScore: typeof obj.bestScore === 'number' ? obj.bestScore : 0,
      bestSetAt: typeof obj.bestSetAt === 'number' ? obj.bestSetAt : 0,
    };
  },
});

export function loadPatternBest(): PatternDrillState {
  return store.load();
}

export function recordPatternRun(score: number): PatternDrillState {
  const cur = store.load();
  if (score <= cur.bestScore) return cur;
  const next: PatternDrillState = { bestScore: score, bestSetAt: Date.now() };
  store.save(next);
  return next;
}

export const PATTERN_DRILL_ROUNDS = 10;
export const PATTERN_FLASH_MS = 3000;
