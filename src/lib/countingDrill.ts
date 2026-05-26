// 🔢 Counting Trainer drill — level-based practice for the Makruk-
// specific endgame counting rule. Each level loads a known endgame
// material configuration (K+RR vs K, K+R vs K, etc.); the user plays
// the strong side and must deliver checkmate within the count limit.
//
// Why a dedicated mode (vs the existing counting puzzles):
//   - Puzzles ask "find the move"; a drill asks "execute the
//     technique". Different muscle.
//   - The count-limit number is the educational core. Surfacing it
//     as a live countdown ("คุณเหลือ 12 ตา") tightens the feedback
//     loop in a way single-move puzzles can't.
//   - This is Makruk-specific knowledge — no other chess platform has
//     it, so it's the strongest moat for an Open-Makruk learner.
//
// Count limits below come from the standard Makruk honor-count rules:
//   K + RR    vs K      → 8 moves
//   K + R     vs K      → 16 moves
//   K + R + M vs K      → 22 moves
//   K + R + M vs K + M  → 22 moves (handicap)
//   K + R + M vs K + S  → 22 moves (handicap)
//
// These are *full moves* — one user move = 1 count. The drill checks
// user's halfmove count (each user move advances the counter by 1).

import { defineStore } from './stores';
import type { Difficulty } from './engine';

export type DrillLevel = {
  /** Stable id used in URL + storage. */
  id: string;
  /** Display label, Thai. */
  title: string;
  /** One-line description shown on the picker card. */
  description: string;
  /** Starting FEN. The user always plays White (the strong side); the
   *  engine plays Black (the bare-king or near-bare side). */
  fen: string;
  /** Count limit — # of user moves allowed to deliver mate. */
  countLimit: number;
  /** Difficulty preset for the engine playing the defense. Lower tier
   *  for early levels so the user can focus on technique without
   *  fighting a master-level escape; higher tier later. */
  engineDifficulty: Difficulty;
  /** Single-line strategic hint, shown if the user requests it (or
   *  auto after first failure). Plain text, no engine analysis. */
  hint: string;
};

export const DRILL_LEVELS: DrillLevel[] = [
  {
    id: 'l1-k-rr-vs-k',
    title: 'L1 · K + RR vs K',
    description: 'Ruea สองตัวกับขุน — ขั้นพื้นฐานที่สุด · 8 ตา',
    fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1',
    countLimit: 8,
    engineDifficulty: 'easy',
    hint: 'ใช้ Ruea สองตัวต้อนขุนเข้ามุม · ตัวหนึ่งคุมแนว ตัวหนึ่งบีบเข้ามา',
  },
  {
    id: 'l2-k-r-vs-k',
    title: 'L2 · K + R vs K',
    description: 'Ruea เดียวกับขุน — เทคนิคคลาสสิก · 16 ตา',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    countLimit: 16,
    engineDifficulty: 'medium',
    hint: 'บีบขุนคู่แข่งให้ติดขอบ · ใช้ขุนของคุณคุมระยะ opposition',
  },
  {
    id: 'l3-k-r-m-vs-k',
    title: 'L3 · K + R + M vs K',
    description: 'Ruea กับ Met ปลายเกม · 22 ตา · ระดับฝึกฝน',
    fen: '8/8/8/4k3/8/8/8/R2MK3 w - - 0 1',
    countLimit: 22,
    engineDifficulty: 'medium',
    hint: 'ใช้ Met เปิดทาง · Ruea ปิดแนว · ขุนของคุณเดินตามไปช่วย',
  },
  {
    id: 'l4-k-r-m-vs-k-m',
    title: 'L4 · K + R + M vs K + M',
    description: 'Met handicap — คู่แข่งมี Met ป้องกัน · 22 ตา',
    fen: '3mk3/8/8/8/8/8/8/R2MK3 w - - 0 1',
    countLimit: 22,
    engineDifficulty: 'hard',
    hint: 'แลก Met กับ Met ถ้ามีโอกาส · ใช้ Ruea ที่เหลือต่อสู้กับขุนเดี่ยว',
  },
  {
    id: 'l5-k-r-m-vs-k-s',
    title: 'L5 · K + R + M vs K + S',
    description: 'Khon handicap — Khon ป้องกันดีกว่า Met · ระดับยากสุด',
    fen: '4ks2/8/8/8/8/8/8/R2MK3 w - - 0 1',
    countLimit: 22,
    engineDifficulty: 'hard',
    hint: 'Khon เคลื่อนไหวเฉียง 1 ตา + ตรง 1 ตา · บล็อกได้ดี ระวังให้ Ruea คุมแนวเสมอ',
  },
];

export function findDrillLevel(id: string): DrillLevel | null {
  return DRILL_LEVELS.find((l) => l.id === id) ?? null;
}

// ─── Per-user drill progress (local — no server roundtrip) ─────────

const DRILL_PROGRESS_VERSION = 1;

export type LevelResult = {
  /** # of user moves used to deliver mate. Lower = better. */
  movesUsed: number;
  /** Unix ms — when this best was set. */
  setAt: number;
};

export type DrillProgress = {
  /** Map of level id → best result so far. Missing = level not
   *  cleared yet. */
  bestByLevel: Record<string, LevelResult>;
};

const store = defineStore<DrillProgress>({
  key: 'openmakruk_counting_drill',
  version: DRILL_PROGRESS_VERSION,
  default: () => ({ bestByLevel: {} }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<DrillProgress>;
    return {
      bestByLevel:
        obj.bestByLevel && typeof obj.bestByLevel === 'object'
          ? (obj.bestByLevel as Record<string, LevelResult>)
          : {},
    };
  },
});

export function loadDrillProgress(): DrillProgress {
  return store.load();
}

/** Record a clear. Saves only if it's a new best (or first time). */
export function recordDrillClear(levelId: string, movesUsed: number): DrillProgress {
  const current = store.load();
  const existing = current.bestByLevel[levelId];
  if (existing && existing.movesUsed <= movesUsed) {
    // Not a new best — keep the better record.
    return current;
  }
  const next: DrillProgress = {
    bestByLevel: {
      ...current.bestByLevel,
      [levelId]: { movesUsed, setAt: Date.now() },
    },
  };
  store.save(next);
  return next;
}

/** Compute a 0-100 score for a clear. 100 = used exactly countLimit
 *  moves. Stars: ⭐⭐⭐ if ≤ 50% of limit, ⭐⭐ if ≤ 75%, ⭐ otherwise. */
export function drillScore(movesUsed: number, countLimit: number): {
  pct: number;
  stars: 1 | 2 | 3;
} {
  const ratio = movesUsed / countLimit;
  const pct = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100 + 50)));
  const stars: 1 | 2 | 3 = ratio <= 0.5 ? 3 : ratio <= 0.75 ? 2 : 1;
  return { pct, stars };
}
