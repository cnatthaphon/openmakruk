// 🌐 Async Challenge — encode a "play this bot under this rule" payload
// into a URL so two players can compare results without playing live.
//
// Design rationale:
//   - Pattern: Strava-segment / Trackmania-ghost / Wordle — same
//     fixed challenge → many async attempts → compare. PvP fairness
//     concerns (matchmaking, anti-cheat, simultaneous availability)
//     evaporate because everybody plays the same deterministic opponent.
//   - Encoding-only (v1): the whole challenge is in the URL fragment.
//     No backend table needed. Trade-off: results aren't shared
//     automatically — the creator and acceptor each see their own
//     attempt. The compare happens by screenshot or "I beat them by
//     5 moves" type bragging in chat. v2 can introduce a thin
//     /api/challenges/:code table for server-mediated comparisons.
//   - Why base64url not query params: URLs need to be share-clean
//     ("openmakruk.com/c/Xy7Q") and copy-pasteable into LINE without
//     ?key=value confusion.
//
// Schema (v1):
//   { v:1, b:<bot-slug>, c:<criterion>, tc:<timeCtl>, by:<displayName> }

import { defineStore } from './stores';

export type ChallengeCriterion = 'outcome' | 'quality' | 'speed' | 'all';

export type ChallengePayload = {
  /** Schema version — bump if payload shape changes. */
  v: 1;
  /** Bot id slug — `attacker-master` (no `bot:` prefix; we add it
   *  when looking up via fetchBot). Smaller URLs that way. */
  b: string;
  /** Which family the challenge is measured on. */
  c: ChallengeCriterion;
  /** Time control identifier — matches what Play tab understands. */
  tc: 'blitz5' | 'rapid10' | 'untimed';
  /** Display name of the creator (for "you've been challenged by ..."). */
  by: string;
};

/** Browser-safe base64url — RFC 4648 §5. Avoids `+/=` so the encoded
 *  string survives URL hash without percent-escaping. */
function toBase64Url(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (s.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeChallenge(payload: ChallengePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeChallenge(code: string): ChallengePayload | null {
  try {
    const obj = JSON.parse(fromBase64Url(code)) as Partial<ChallengePayload>;
    if (obj.v !== 1) return null;
    if (typeof obj.b !== 'string' || !obj.b) return null;
    if (!['outcome', 'quality', 'speed', 'all'].includes(obj.c ?? '')) return null;
    if (!['blitz5', 'rapid10', 'untimed'].includes(obj.tc ?? '')) return null;
    if (typeof obj.by !== 'string') return null;
    return obj as ChallengePayload;
  } catch {
    return null;
  }
}

/** Build the full shareable URL — what we put on the clipboard / LINE. */
export function buildChallengeUrl(payload: ChallengePayload): string {
  const code = encodeChallenge(payload);
  return `${window.location.origin}/#/challenge/${code}`;
}

// ─── Local history of accepted/created challenges ────────────────────
//
// Stored client-side only for v1. Lets the user revisit "challenges I
// created" or "challenges I accepted" without re-pasting the URL.

export type ChallengeRecord = {
  /** The same code we put in the URL. Acts as the row key. */
  code: string;
  payload: ChallengePayload;
  /** 'created' = we made the link to share. 'accepted' = we landed on
   *  someone else's link. */
  role: 'created' | 'accepted';
  /** Unix ms when we first saw this challenge. */
  seenAt: number;
  /** Outcome from the local user's perspective — filled in when the
   *  user actually completes a game against the target bot. */
  result?: {
    outcome: 'win' | 'draw' | 'loss';
    moves: number;
    qualityPercent?: number;
    finishedAt: number;
  };
};

const HISTORY_VERSION = 1;
const HISTORY_KEY = 'openmakruk_challenge_history';
const MAX_HISTORY = 20;

const historyStore = defineStore<ChallengeRecord[]>({
  key: HISTORY_KEY,
  version: HISTORY_VERSION,
  default: () => [],
  migrate: (raw) => {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is ChallengeRecord =>
        !!r && typeof r === 'object' && typeof (r as ChallengeRecord).code === 'string',
      )
      .slice(0, MAX_HISTORY);
  },
});

export function loadChallengeHistory(): ChallengeRecord[] {
  return historyStore.load();
}

export function recordChallenge(rec: Omit<ChallengeRecord, 'seenAt'>): void {
  const list = historyStore.load();
  // Deduplicate by code — if the same challenge is seen twice, update
  // rather than append.
  const existing = list.findIndex((r) => r.code === rec.code);
  const next: ChallengeRecord = { ...rec, seenAt: Date.now() };
  if (existing >= 0) {
    list[existing] = { ...list[existing], ...next };
  } else {
    list.unshift(next);
  }
  historyStore.save(list.slice(0, MAX_HISTORY));
}

export const CRITERION_LABELS_TH: Record<ChallengeCriterion, string> = {
  outcome: '🏆 ผลแพ้ชนะ',
  quality: '✨ จำนวนตาดี (best+good %)',
  speed: '⚡ ความเร็ว (จำนวนตาที่ใช้ชนะ)',
  all: '🎯 ทุกมิติรวม',
};

export const TIME_CTL_LABELS_TH: Record<ChallengePayload['tc'], string> = {
  blitz5: 'Blitz 5 นาที',
  rapid10: 'Rapid 10 นาที',
  untimed: 'ไม่จับเวลา',
};
