// Personality catalog — data, not classes.
//
// A Personality is a vector of weights over the SCORERS contract. The
// generic ScoredBot reads these weights, evaluates each legal move's
// component scores, takes a weighted sum, and plays the top-scoring
// move (with a tiny anti-loop tiebreak).
//
// Adding a new personality: append one entry below. No new file, no
// new class.
//
// Mixing: `mixPersonalities(a, b, ratio)` blends two by linear
// interpolation on weights. UX can expose a "70% defender, 30%
// attacker" mode without inventing new personalities for every blend.

import type { ScorerKey } from './scorers';
import { SCORER_KEYS } from './scorers';

export type PersonalityWeights = Partial<Record<ScorerKey, number>>;

export type Personality = {
  /** Unique id — also used as engine id when registered (prefix
   *  `personality:` is added at registration time). */
  id: string;
  /** Thai-facing name shown in dropdowns. */
  name: string;
  /** Emoji for quick visual identification in the engine selector. */
  emoji: string;
  /** Short Thai description. */
  description: string;
  /** Approximate Elo for matchmaking + leaderboard weighting. Will be
   *  re-calibrated once we have data, but rough estimates are useful
   *  for setting expectations. */
  approxElo: number;
  /** Weight per scorer. Omitted keys = 0. */
  weights: PersonalityWeights;
};

// ─── Catalog ───────────────────────────────────────────────────────
//
// Weights don't need to sum to 1; the bot uses raw sums. Negative
// weights flip a scorer's sign (e.g., a "shy" personality would have
// negative `aggression`).

export const PERSONALITIES: Personality[] = [
  {
    id: 'attacker',
    name: 'นักบุก',
    emoji: '⚔️',
    description: 'รุกหน้าทุกตา · ชอบจับและบุก',
    approxElo: 950,
    weights: { material: 0.6, attack: 0.4, aggression: 0.3, randomness: 0.1 },
  },
  {
    id: 'defender',
    name: 'นักรับ',
    emoji: '🛡️',
    description: 'รักษาตัวรวมหมู่ · ไม่ค่อยบุก',
    approxElo: 950,
    weights: { material: 0.4, defense: 0.5, mobility: 0.2, randomness: 0.1 },
  },
  {
    id: 'positional',
    name: 'ตามตำแหน่ง',
    emoji: '🧭',
    description: 'ครองตำแหน่งกลาง · เคลื่อนไหวเป็นรูปขบวน',
    approxElo: 1000,
    weights: { material: 0.4, center: 0.5, mobility: 0.3, randomness: 0.1 },
  },
  {
    id: 'hunter',
    name: 'นักล่า',
    emoji: '🦅',
    description: 'จับเหยื่อทุกชิ้น · ไล่ตัวที่ลอย',
    approxElo: 1000,
    weights: { material: 0.8, attack: 0.3, randomness: 0.1 },
  },
  {
    id: 'wanderer',
    name: 'นักเดิน',
    emoji: '🍃',
    description: 'เดินสับสน · แต่บางครั้งก็ดีอย่างน่าประหลาด',
    approxElo: 700,
    weights: { material: 0.2, mobility: 0.2, randomness: 0.8 },
  },
  {
    id: 'mobile',
    name: 'คล่องตัว',
    emoji: '💨',
    description: 'รักษาตัวเลือกเยอะ · ไม่ปิดตัวเอง',
    approxElo: 1000,
    weights: { material: 0.4, mobility: 0.6, randomness: 0.1 },
  },
  {
    id: 'cautious',
    name: 'ระวังตัว',
    emoji: '🐢',
    description: 'ป้องกันก่อน · ไม่เสี่ยง · เน้นกลาง',
    approxElo: 900,
    weights: { material: 0.5, defense: 0.4, center: 0.2, randomness: 0.05 },
  },
];

/** Find a personality by id. Returns null if not found — caller must
 *  handle (we never throw on lookup since data could come from URL/
 *  localStorage and shouldn't crash the page). */
export function findPersonality(id: string): Personality | null {
  return PERSONALITIES.find((p) => p.id === id) ?? null;
}

/** Linear-interp blend of two personalities by `ratio` ∈ [0, 1].
 *  ratio=0 → all of `a`, ratio=1 → all of `b`. Result is a synthetic
 *  Personality whose id includes both parents so the engine selector
 *  / event log can show it. */
export function mixPersonalities(
  a: Personality,
  b: Personality,
  ratio: number,
): Personality {
  const t = Math.max(0, Math.min(1, ratio));
  const weights: PersonalityWeights = {};
  for (const k of SCORER_KEYS) {
    const aw = a.weights[k] ?? 0;
    const bw = b.weights[k] ?? 0;
    const blend = aw * (1 - t) + bw * t;
    if (blend !== 0) weights[k] = blend;
  }
  return {
    id: `mix:${a.id}:${b.id}:${t.toFixed(2)}`,
    name: `${a.emoji}+${b.emoji} ${Math.round((1 - t) * 100)}/${Math.round(t * 100)}`,
    emoji: '🧪',
    description: `ผสม: ${a.name} ${Math.round((1 - t) * 100)}% + ${b.name} ${Math.round(t * 100)}%`,
    approxElo: Math.round(a.approxElo * (1 - t) + b.approxElo * t),
    weights,
  };
}

/** Get all personalities of approxElo within [min, max]. Used by
 *  events / gauntlet to pick opponents of appropriate strength. */
export function personalitiesInRange(minElo: number, maxElo: number): Personality[] {
  return PERSONALITIES.filter((p) => p.approxElo >= minElo && p.approxElo <= maxElo);
}
