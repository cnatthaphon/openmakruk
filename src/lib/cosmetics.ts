// Cosmetic catalog — non-gameplay rewards unlocked by progression
// milestones. Each cosmetic is a small visual badge / decorative
// chip that can appear next to the user's name on the leaderboard
// + profile widget.
//
// v1 scope: pure-client. The cosmetic store is the existing local
// progress (rating, badges, puzzle solves, rush clears, drill
// clears). No new server schema. A full inventory + server-side
// unlock model is deferred to a later phase (Phase 18 alongside
// per-game review aggregation).
//
// Cosmetics are *declarative* — each item declares the condition
// under which it's unlocked. The runtime evaluates conditions
// against current progress and surfaces a list of unlocked cosmetics
// to the Profile / Settings UI.

import { loadStats } from './stats';
import { loadPuzzleProgress } from './puzzleProgress';
import { loadDrillProgress, DRILL_LEVELS } from './countingDrill';
import { loadTrainerProgress } from './moveTrainer';
import { loadRushProgress } from './bossRush';
import { loadStreak } from './streak';

export type Cosmetic = {
  id: string;
  /** Visual representation — either an emoji glyph or a CSS color
   *  accent token. Kept text-only for v1 so no asset pipeline. */
  glyph: string;
  /** Display name in Thai. */
  nameTh: string;
  /** One-line description shown in the picker. */
  descTh: string;
  /** Unlock condition — pure function over current local progress. */
  isUnlocked: () => boolean;
  /** Hint shown while locked — "rating 1500+", "เคลียร์ Boss Rush
   *  Master", etc. */
  unlockHint: string;
};

/** Live catalog. Adding a new cosmetic = append one entry. */
export const COSMETICS: Cosmetic[] = [
  {
    id: 'starter',
    glyph: '🌱',
    nameTh: 'ผู้เริ่มต้น',
    descTh: 'สำหรับทุกคนที่เริ่มเล่น',
    isUnlocked: () => true,
    unlockHint: 'ปลดล็อกอัตโนมัติ',
  },
  {
    id: 'rating-1200',
    glyph: '🥉',
    nameTh: 'ขุนทอง',
    descTh: 'rating ทะลุ 1200',
    isUnlocked: () => loadStats().rating >= 1200,
    unlockHint: 'rating ≥ 1200',
  },
  {
    id: 'rating-1500',
    glyph: '🥈',
    nameTh: 'ขุนเหล็ก',
    descTh: 'rating ทะลุ 1500',
    isUnlocked: () => loadStats().rating >= 1500,
    unlockHint: 'rating ≥ 1500',
  },
  {
    id: 'rating-1800',
    glyph: '🥇',
    nameTh: 'นักรบ',
    descTh: 'rating ทะลุ 1800',
    isUnlocked: () => loadStats().rating >= 1800,
    unlockHint: 'rating ≥ 1800',
  },
  {
    id: 'puzzle-50',
    glyph: '🧩',
    nameTh: 'นักล่าปริศนา',
    descTh: 'แก้ปริศนา 50 ข้อ',
    isUnlocked: () =>
      Object.keys(loadPuzzleProgress().solved ?? {}).length >= 50,
    unlockHint: 'แก้ปริศนาครบ 50 ข้อ',
  },
  {
    id: 'drill-clear',
    glyph: '🔢',
    nameTh: 'อาจารย์การนับ',
    descTh: 'เคลียร์ Counting Trainer ครบทุก level',
    isUnlocked: () =>
      Object.values(loadDrillProgress().bestByLevel).filter(Boolean).length ===
      DRILL_LEVELS.length,
    unlockHint: `เคลียร์ Counting Trainer ครบ ${DRILL_LEVELS.length}/${DRILL_LEVELS.length} level`,
  },
  {
    id: 'trainer-master',
    glyph: '📖',
    nameTh: 'นักจำเปิดเกม',
    descTh: 'จำ opening ครบทุก line · ไม่พลาดเลย',
    isUnlocked: () => {
      const t = loadTrainerProgress();
      const mastered = Object.values(t.bestByOpening).filter(
        (b) => b && b.perfectMoves === b.totalMoves,
      ).length;
      return mastered >= 5;
    },
    unlockHint: 'Move Trainer ครบ 5/5 opening · ไม่ผิดเลย',
  },
  {
    id: 'rush-full-master',
    glyph: '🏆',
    nameTh: 'ผู้พิชิต Master Rush',
    descTh: 'เคลียร์ Boss Rush ระดับ Master ครบ 7 บอต',
    isUnlocked: () => (loadRushProgress().bestByTier.master?.beatenCount ?? 0) >= 7,
    unlockHint: 'Boss Rush Master · 7/7',
  },
  {
    id: 'streak-30',
    glyph: '🔥',
    nameTh: 'นิสัยล้านปี',
    descTh: 'streak ติดต่อกัน 30 วัน',
    isUnlocked: () => loadStreak().longest >= 30,
    unlockHint: 'streak ≥ 30 วัน',
  },
];

/** Returns the catalog with each item's current unlock state. */
export function evaluateCosmetics(): Array<Cosmetic & { unlocked: boolean }> {
  return COSMETICS.map((c) => ({ ...c, unlocked: c.isUnlocked() }));
}

// ─── User cosmetic selection ───────────────────────────────────

const SELECTION_VERSION = 1;

type CosmeticSelection = {
  /** id of cosmetic the user has chosen to display next to their name.
   *  null = default (no decoration). */
  selectedId: string | null;
};

import { defineStore } from './stores';

const selectionStore = defineStore<CosmeticSelection>({
  key: 'openmakruk_cosmetic_selection',
  version: SELECTION_VERSION,
  default: () => ({ selectedId: null }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<CosmeticSelection>;
    return {
      selectedId: typeof obj.selectedId === 'string' ? obj.selectedId : null,
    };
  },
});

export function loadCosmeticSelection(): CosmeticSelection {
  return selectionStore.load();
}

export function saveCosmeticSelection(selectedId: string | null): void {
  selectionStore.save({ selectedId });
}

/** Resolve the currently-selected cosmetic, falling back to null if
 *  the user hasn't picked one or the one they picked has gone away. */
export function activeCosmetic(): Cosmetic | null {
  const sel = loadCosmeticSelection();
  if (!sel.selectedId) return null;
  const found = COSMETICS.find((c) => c.id === sel.selectedId);
  if (!found || !found.isUnlocked()) return null;
  return found;
}
