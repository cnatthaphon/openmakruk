// Boss Rush — sequential gauntlet through all 7 personalities of a
// chosen tier (Rookie / Veteran / Master). User picks a tier and
// plays 7 bots back-to-back; lose once and the run ends. Local-best
// score = how many bots beaten before the loss (or 7/7 = full clear).
//
// Why a "tier rush" and not "all 22 bots in one session": 22 sequential
// games is hours of play time and produces save-game pressure that
// works against the arcade feel. 7 bots is one focused 30-60 min
// session — actually finishable.

import { defineStore } from './stores';
import { PERSONALITIES } from './personalities/personalities';

export type RushTier = 'rookie' | 'veteran' | 'master';

export const TIER_LABELS: Record<RushTier, string> = {
  rookie: '🥉 Rookie Rush',
  veteran: '🥈 Veteran Rush',
  master: '🥇 Master Rush',
};

export const TIER_DESCRIPTIONS: Record<RushTier, string> = {
  rookie: '7 บอต Rookie · เหมาะกับ rating 1000-1300',
  veteran: '7 บอต Veteran · เหมาะกับ rating 1300-1600',
  master: '7 บอต Master · เหมาะกับ rating 1600+',
};

/** Map a tier to the sequence of bot ids the user faces. Order is the
 *  canonical PERSONALITIES catalog order so the rush is deterministic
 *  across sessions. */
export function rushSequence(tier: RushTier): string[] {
  return PERSONALITIES.map((p) => `bot:${p.id}-${tier}`);
}

// ─── Local best record ─────────────────────────────────────────

const RUSH_VERSION = 1;

export type RushBest = {
  /** Number of bots beaten in the run. 7 = full clear. */
  beatenCount: number;
  /** Unix ms when this best was set. */
  setAt: number;
};

type RushProgress = {
  bestByTier: Record<RushTier, RushBest | null>;
};

const store = defineStore<RushProgress>({
  key: 'openmakruk_boss_rush',
  version: RUSH_VERSION,
  default: () => ({ bestByTier: { rookie: null, veteran: null, master: null } }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<RushProgress>;
    const best = (obj.bestByTier ?? {}) as Partial<Record<RushTier, RushBest | null>>;
    return {
      bestByTier: {
        rookie: best.rookie ?? null,
        veteran: best.veteran ?? null,
        master: best.master ?? null,
      },
    };
  },
});

export function loadRushProgress(): RushProgress {
  return store.load();
}

/** Record completion of a rush run. Only updates the stored best if
 *  the new run beat more bots than the prior best. */
export function recordRushRun(tier: RushTier, beatenCount: number): RushProgress {
  const current = store.load();
  const prior = current.bestByTier[tier];
  if (prior && prior.beatenCount >= beatenCount) return current;
  const next: RushProgress = {
    bestByTier: {
      ...current.bestByTier,
      [tier]: { beatenCount, setAt: Date.now() },
    },
  };
  store.save(next);
  return next;
}

// ─── Active rush state ─────────────────────────────────────────
//
// Tracks the in-progress gauntlet so the user can leave + come back
// without losing position. Cleared by:
//   • Player losing or drawing a game → rush ends, score recorded
//   • Player explicitly cancelling from BossRushPage
//   • Reaching index === 7 (full clear)

export type ActiveRush = {
  tier: RushTier;
  /** Zero-based index into rushSequence(tier). Starts at 0 = bot 1. */
  index: number;
  /** Unix ms when run began. */
  startedAt: number;
};

const activeStore = defineStore<ActiveRush | null>({
  key: 'openmakruk_boss_rush_active',
  version: 1,
  default: () => null,
  migrate: (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Partial<ActiveRush>;
    if (!obj.tier || !(obj.tier in TIER_LABELS)) return null;
    return {
      tier: obj.tier as RushTier,
      index: typeof obj.index === 'number' ? obj.index : 0,
      startedAt: typeof obj.startedAt === 'number' ? obj.startedAt : Date.now(),
    };
  },
});

export function loadActiveRush(): ActiveRush | null {
  return activeStore.load();
}

export function startRush(tier: RushTier): ActiveRush {
  const run: ActiveRush = { tier, index: 0, startedAt: Date.now() };
  activeStore.save(run);
  return run;
}

export function advanceRush(): ActiveRush | null {
  const cur = activeStore.load();
  if (!cur) return null;
  const next: ActiveRush = { ...cur, index: cur.index + 1 };
  // 7 personalities means index 6 is the last bot. After advancing
  // from index 6 we hit 7 = full clear. Record + clear active.
  if (next.index >= PERSONALITIES.length) {
    recordRushRun(cur.tier, PERSONALITIES.length);
    activeStore.save(null);
    return null;
  }
  activeStore.save(next);
  return next;
}

export function abandonRush(reason: 'loss' | 'cancel'): void {
  const cur = activeStore.load();
  if (!cur) return;
  // index = number of bots beaten so far at the point of loss.
  recordRushRun(cur.tier, cur.index);
  activeStore.save(null);
  // reason intentionally only logged via the caller's log() — we
  // don't import log here to keep this file pure-data.
  void reason;
}

/** Get the bot id the rush is currently facing (or null if no active run). */
export function activeRushBotId(): string | null {
  const cur = activeStore.load();
  if (!cur) return null;
  const seq = rushSequence(cur.tier);
  return seq[cur.index] ?? null;
}
