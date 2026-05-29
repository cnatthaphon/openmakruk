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
//
// Schema (v2 — Phase 35):
//   { v:2, b, c, tc, by, r:{ o:'w'|'d'|'l', m, q? } }
//
// v2 carries the SENDER's own result so the recipient sees "<by> ทำ
// 28 ตา · ชนะ" before deciding to accept. This closes the Strava-
// segment comparison loop (the whole point of the feature) without
// needing a server-side comparison table. v1 links remain valid and
// decode cleanly — `r` is just absent.

import { defineStore } from './stores';

export type ChallengeCriterion = 'outcome' | 'quality' | 'speed' | 'all';

/** Compact result encoding — single-letter keys keep the base64url
 *  payload short so LINE message previews don't truncate the URL.
 *  Letters: o(utcome), m(oves), q(uality). */
export type ChallengeResult = {
  /** Outcome from the result-owner's perspective. */
  o: 'w' | 'd' | 'l';
  /** Number of ply played (history.length at game end). */
  m: number;
  /** Quality / accuracy percent (0-100), optional. Filled only when
   *  the user ran the review pipeline post-game and we have a score. */
  q?: number;
};

export type ChallengePayload = {
  /** Schema version. 1 = no result. 2 = result present. */
  v: 1 | 2;
  /** Bot id slug — `attacker-master` (no `bot:` prefix; we add it
   *  when looking up via fetchBot). Smaller URLs that way. */
  b: string;
  /** Which family the challenge is measured on. */
  c: ChallengeCriterion;
  /** Time control identifier — matches what Play tab understands. */
  tc: 'blitz5' | 'rapid10' | 'untimed';
  /** Display name of the creator (for "you've been challenged by ..."). */
  by: string;
  /** Optional result from the sender. v1 links have this undefined;
   *  v2 share-with-result links carry it. */
  r?: ChallengeResult;
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
    if (obj.v !== 1 && obj.v !== 2) return null;
    if (typeof obj.b !== 'string' || !obj.b) return null;
    if (!['outcome', 'quality', 'speed', 'all'].includes(obj.c ?? '')) return null;
    if (!['blitz5', 'rapid10', 'untimed'].includes(obj.tc ?? '')) return null;
    if (typeof obj.by !== 'string') return null;
    // v2 result block — optional even on v2 (we tolerate the version
    // being bumped without the field; treat as v1 semantically).
    if (obj.v === 2 && obj.r !== undefined) {
      const r = obj.r as Partial<ChallengeResult>;
      if (!r || typeof r !== 'object') return null;
      if (r.o !== 'w' && r.o !== 'd' && r.o !== 'l') return null;
      if (typeof r.m !== 'number' || r.m < 0) return null;
      if (r.q !== undefined && (typeof r.q !== 'number' || r.q < 0 || r.q > 100)) return null;
    }
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

/** Build a v2 URL that bakes in the user's result. Used by the
 *  post-game share flow to emit "ส่งผลกลับ" links — the recipient
 *  lands and sees the sender's score before accepting. */
export function buildChallengeUrlWithResult(
  base: ChallengePayload,
  result: ChallengeResult,
  senderName: string,
): string {
  const payload: ChallengePayload = {
    ...base,
    v: 2,
    by: senderName,
    r: result,
  };
  return buildChallengeUrl(payload);
}

/** Compare the local user's just-finished result against the sender's
 *  result encoded in a v2 challenge link. Returns a short Thai verdict
 *  string suitable for a comparison toast.
 *
 *  Criterion semantics:
 *    outcome — Win > Draw > Loss
 *    speed   — fewer moves is better when both win; more moves is
 *              better when both lose (held on longer)
 *    quality — higher accuracy% wins (skipped if q absent on either side)
 *    all     — outcome first, then speed as the tiebreaker
 *
 *  Phrased so the loser sees "ดีกว่าเขา" / "เท่ากัน" / "สู้สูสี"
 *  framings rather than dry win/lose; the goal is to encourage another
 *  attempt, not to crow about defeat. */
export function compareChallengeResults(
  mine: { outcome: 'win' | 'loss' | 'draw'; moves: number; quality?: number },
  theirs: ChallengeResult,
  criterion: ChallengeCriterion,
): string {
  const myRank = mine.outcome === 'win' ? 2 : mine.outcome === 'draw' ? 1 : 0;
  const theirRank = theirs.o === 'w' ? 2 : theirs.o === 'd' ? 1 : 0;

  const meStr = `${mine.outcome === 'win' ? 'ชนะ' : mine.outcome === 'draw' ? 'เสมอ' : 'แพ้'} · ${mine.moves} ตา`;
  const themStr = `${theirs.o === 'w' ? 'ชนะ' : theirs.o === 'd' ? 'เสมอ' : 'แพ้'} · ${theirs.m} ตา`;
  const head = `คุณ ${meStr} · เขา ${themStr}`;

  if (criterion === 'outcome' || criterion === 'all') {
    if (myRank > theirRank) return `${head} · 🏆 คุณดีกว่า`;
    if (myRank < theirRank) return `${head} · 🔥 สู้ใหม่อีกครั้ง`;
    // Same outcome — fall through to speed tiebreaker for 'all'.
    if (criterion === 'outcome') return `${head} · 🤝 เท่ากัน`;
  }
  if (criterion === 'speed' || criterion === 'all') {
    if (myRank === 2 && theirRank === 2) {
      // Both won — fewer moves is the better win.
      if (mine.moves < theirs.m) return `${head} · ⚡ คุณเร็วกว่า`;
      if (mine.moves > theirs.m) return `${head} · 🐢 ใช้เวลามากกว่า`;
      return `${head} · 🤝 จำนวนตาเท่ากัน`;
    }
    if (myRank === 0 && theirRank === 0) {
      // Both lost — more moves means held on longer.
      if (mine.moves > theirs.m) return `${head} · 🛡 ต้านได้นานกว่า`;
      if (mine.moves < theirs.m) return `${head} · 🔥 สู้ใหม่อีกครั้ง`;
      return `${head} · 🤝 ต้านได้พอกัน`;
    }
    // Mixed (one won, one drew etc.) and we fell through outcome:
    // call it a wash.
    return `${head} · 🤝 สูสี`;
  }
  if (criterion === 'quality') {
    if (mine.quality === undefined || theirs.q === undefined) {
      return `${head} · ไม่มีข้อมูล accuracy ครบทั้งสองฝั่ง`;
    }
    if (mine.quality > theirs.q) return `${head} · ✨ accuracy ดีกว่า (${mine.quality}% vs ${theirs.q}%)`;
    if (mine.quality < theirs.q) return `${head} · 🔥 accuracy ${mine.quality}% vs ${theirs.q}%`;
    return `${head} · 🤝 accuracy เท่ากัน`;
  }
  return head;
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
