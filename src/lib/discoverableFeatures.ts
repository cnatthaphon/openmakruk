// Discoverable-features registry for the "💡 รู้หรือไม่?" surface.
//
// Problem: the platform has 8 feature surfaces that don't appear in
// the top navigation (Counting Drill, Survive, Pattern Recognition,
// Move Trainer, Boss Rush, Async Challenge, Bot Exhibition, Stats).
// They're reachable from Profile sections or contextual CTAs, but a
// returning user who hasn't scrolled deep into Profile won't know
// they exist. Phase 35 feedback: "ผู้ใช้เห็นแค่ 1-2 อันที่บังเอิญเจอ".
//
// Design: a small "Did you know?" card on the Play tab rotates through
// this list, surfacing one feature at a time so it doesn't overwhelm.
// User can:
//   • [▶ ลอง]      → navigate to the feature
//   • [✕ พรุ่งนี้]  → dismiss for ~24h (next visit shows next feature)
//   • [⊘ ไม่ใช่ตอนนี้] → permanent dismiss (this id won't appear again)
//
// Order: items earlier in the array are "shown first" — sorted by
// estimated value to a typical new visitor. Counting Drill leads
// because it's the most uniquely-makruk feature (chess players
// haven't seen anything like it before) and our flagship endgame
// skill builder.

import type { Tab } from './router';

export type DiscoverableFeature = {
  /** Stable id used as the localStorage dismissal key. Renaming
   *  this would re-show the feature to users who'd already
   *  dismissed it, so treat it as a permanent label. */
  id: string;
  /** Emoji prefix shown before the title. */
  icon: string;
  /** One-line headline — what the feature IS. */
  title: string;
  /** Short body — what makes it interesting / who it's for. ≤ ~80 chars. */
  body: string;
  /** Route target. */
  tab: Tab;
  /** Optional sub-id under the tab, if the feature has a deep link
   *  that's better than the index (e.g. a default level). */
  id_segment?: string;
  /** Label for the primary action button. */
  ctaLabel: string;
};

export const DISCOVERABLE_FEATURES: readonly DiscoverableFeature[] = [
  {
    id: 'counting',
    icon: '🔢',
    title: 'Counting Drill — ฝึกการนับ endgame',
    body: 'กฎ counting ของหมากรุกไทยเฉพาะตัว เปิด drill ฝึก K+R vs K, K+B vs K ฯลฯ',
    tab: 'counting',
    ctaLabel: '▶ เริ่มฝึก',
  },
  {
    id: 'movetrainer',
    icon: '🎯',
    title: 'Move Trainer — เปิดเกมแบบมีโครงสร้าง',
    body: 'ฝึกเปิดเกมพร้อมไกด์เดินทีละช่อง · เลือก opening ที่ชอบ · มี hint ทุกตา',
    tab: 'movetrainer',
    ctaLabel: '▶ เลือก opening',
  },
  {
    id: 'pattern',
    icon: '🧩',
    title: 'Pattern Recognition — มอง pattern ได้เร็ว',
    body: 'ฝึกจำ tactical pattern (pin · fork · skewer) จากภาพ · เห็นเร็ว = ตัดสินใจเร็ว',
    tab: 'pattern',
    ctaLabel: '▶ ลอง drill',
  },
  {
    id: 'survive',
    icon: '🛡️',
    title: 'Survive the Attack — โหมดป้องกัน',
    body: 'ตำแหน่งที่กำลังโดนรุก · ฝึกหาทางเอาตัวรอด · เพิ่มสกิล defense',
    tab: 'survive',
    ctaLabel: '▶ ลองเอาตัวรอด',
  },
  {
    id: 'bossrush',
    icon: '👑',
    title: 'Boss Rush — ไต่ ladder เจอ boss',
    body: 'ชนะติดกัน → ผ่าน boss · แพ้ = เริ่มใหม่ · ปลดล็อก achievement เฉพาะ',
    tab: 'bossrush',
    ctaLabel: '▶ เริ่มไต่',
  },
  {
    id: 'challenge',
    icon: '⚔️',
    title: 'Async Challenge — ท้าดวลผ่านลิงก์',
    body: 'สร้าง challenge แล้วส่งลิงก์ให้เพื่อนทาง LINE · ทั้งคู่เล่น position เดียวกัน',
    tab: 'challenge',
    ctaLabel: '▶ สร้าง',
  },
  {
    id: 'exhibition',
    icon: '🎬',
    title: 'Bot Exhibition — ดูบอตเจอกัน',
    body: 'feed เกมที่บอตตี้กันเองมา · ดู replay ตาต่อตา · เก่ง endgame ได้จากการดู',
    tab: 'exhibition',
    ctaLabel: '▶ ดู feed',
  },
  {
    id: 'stats',
    icon: '📊',
    title: 'Public Stats — ตัวเลข community',
    body: 'จำนวนเกม · ผู้เล่นออนไลน์ · top bots · ดูภาพรวม OpenMakruk ทั้ง platform',
    tab: 'stats',
    ctaLabel: '▶ ดูสถิติ',
  },
];

// localStorage shape:
//   { [featureId]: epochMs of next-show-eligible }
// permanent dismiss stores `Number.MAX_SAFE_INTEGER`.
type DismissalMap = Record<string, number>;

const STORAGE_KEY = 'dyk:dismissed-v1';
const SOFT_DISMISS_MS = 24 * 60 * 60 * 1000; // "พรุ่งนี้" = 24h cooldown

function loadDismissals(): DismissalMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as DismissalMap;
  } catch {
    return {};
  }
}

function saveDismissals(map: DismissalMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota exceeded — ignore */ }
}

/** Pick the highest-priority feature whose dismissal cooldown (if any)
 *  has expired. Returns null when every feature is permanently
 *  dismissed or all soft-dismissals are still active. */
export function pickFeature(now: number = Date.now()): DiscoverableFeature | null {
  const dismissals = loadDismissals();
  for (const f of DISCOVERABLE_FEATURES) {
    const showAt = dismissals[f.id];
    if (showAt === undefined || showAt <= now) return f;
  }
  return null;
}

/** Soft-dismiss — 24h cooldown, then the same feature can appear again
 *  (unless something earlier in the list became eligible first). */
export function softDismissFeature(id: string, now: number = Date.now()): void {
  const dismissals = loadDismissals();
  dismissals[id] = now + SOFT_DISMISS_MS;
  saveDismissals(dismissals);
}

/** Hard-dismiss — this feature never shows again unless storage is
 *  cleared. Used for "ไม่ใช่ตอนนี้" — a stronger "not interested" signal. */
export function permanentDismissFeature(id: string): void {
  const dismissals = loadDismissals();
  dismissals[id] = Number.MAX_SAFE_INTEGER;
  saveDismissals(dismissals);
}

/** Marks a feature as visited (via the CTA) — equivalent to a permanent
 *  dismiss for discovery purposes (the user knows about it now). */
export function markFeatureVisited(id: string): void {
  permanentDismissFeature(id);
}
