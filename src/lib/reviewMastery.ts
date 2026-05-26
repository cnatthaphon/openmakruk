// Concept mastery aggregation — derived from every post-game review.
//
// Each time the user runs review on a finished game, lib/review.ts
// produces an AnnotatedMove[] with per-move classifications (best /
// good / inaccuracy / mistake / blunder). This module persists a
// SUMMARY of each review (counts only, no per-move data — keeps the
// store small) and exposes an aggregate over the last N reviews.
//
// The aggregate powers two surfaces:
//   • Profile "Skill Mastery" tile — accuracy trend line + blunder
//     count per N games
//   • Future per-concept dashboard (fork / pin / capture detected vs
//     missed) once we wire a motif detector
//
// Storage shape (versioned defineStore) — append-only ring buffer of
// the last MAX_REVIEWS summaries. Each ~50 bytes, so 100 reviews fits
// in 5 KB localStorage with room to spare.

import { defineStore } from './stores';
import {
  accuracyFor,
  classCountFor,
  type AnnotatedMove,
  type Classification,
} from './review';
import { motifTotalsForUser, type MotifTotals } from './conceptMastery';
import type { MotifKind } from './coach/types';

const MASTERY_VERSION = 1;
const MAX_REVIEWS = 100;

export type ReviewSummary = {
  /** Local game id from stats history. */
  gameId: string;
  /** Unix ms when the review ran. */
  reviewedAt: number;
  /** User's side in the game — 'white' / 'black'. */
  userSide: 'white' | 'black';
  /** 0-100 accuracy on the user's side. */
  accuracy: number;
  /** Per-classification counts on the user's side. */
  counts: Record<Classification, number>;
  /** Total moves played on the user's side. */
  totalUserMoves: number;
  /** Per-motif counts of what the user PLAYED — fork / capture /
   *  check / mate / hanging / develop / promotion / mateThreat. */
  motifs: MotifTotals;
};

type MasteryState = {
  /** Most-recent N summaries, newest last. Older entries dropped
   *  when length exceeds MAX_REVIEWS. */
  summaries: ReviewSummary[];
};

const store = defineStore<MasteryState>({
  key: 'openmakruk_review_mastery',
  version: MASTERY_VERSION,
  default: () => ({ summaries: [] }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<MasteryState>;
    return {
      summaries: Array.isArray(obj.summaries)
        ? (obj.summaries as ReviewSummary[]).slice(-MAX_REVIEWS)
        : [],
    };
  },
});

export function loadReviewMastery(): MasteryState {
  return store.load();
}

/** Build a ReviewSummary from the per-move annotated list + record
 *  it. Idempotent on (gameId, reviewedAt) — calling with the same
 *  gameId replaces the prior entry so a re-review doesn't double-
 *  count. */
export function recordReviewSummary(
  gameId: string,
  userSide: 'white' | 'black',
  moves: AnnotatedMove[],
): MasteryState {
  const counts = classCountFor(moves, userSide);
  const totalUserMoves = moves.filter((m) => m.side === userSide).length;
  const accuracy = accuracyFor(moves, userSide);
  const motifs = motifTotalsForUser(moves, userSide);
  const summary: ReviewSummary = {
    gameId,
    reviewedAt: Date.now(),
    userSide,
    accuracy,
    counts,
    totalUserMoves,
    motifs,
  };
  const state = store.load();
  // Drop any prior summary for this game so re-reviewing replaces.
  const filtered = state.summaries.filter((s) => s.gameId !== gameId);
  filtered.push(summary);
  const trimmed = filtered.slice(-MAX_REVIEWS);
  const next: MasteryState = { summaries: trimmed };
  store.save(next);
  return next;
}

export type MasteryAggregate = {
  reviewCount: number;
  totalMoves: number;
  totals: Record<Classification, number>;
  /** Average accuracy across all reviewed games. */
  averageAccuracy: number;
  /** Average accuracy of the last 10 games (or fewer). */
  recentAccuracy: number;
  /** Trend = recent − overall. Positive = improving. */
  trend: number;
  /** Aggregate motifs across all reviewed games (sum). */
  motifs: Partial<Record<MotifKind, number>>;
};

/** Aggregate mastery across all stored summaries. Returns zero-state
 *  when there are no reviews yet. */
export function aggregateMastery(): MasteryAggregate {
  const { summaries } = store.load();
  if (summaries.length === 0) {
    return {
      reviewCount: 0,
      totalMoves: 0,
      totals: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      averageAccuracy: 0,
      recentAccuracy: 0,
      trend: 0,
      motifs: {},
    };
  }
  const totals: Record<Classification, number> = {
    best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
  };
  const motifs: Partial<Record<MotifKind, number>> = {};
  let totalMoves = 0;
  let accSum = 0;
  for (const s of summaries) {
    for (const k of Object.keys(totals) as Classification[]) {
      totals[k] += s.counts[k] ?? 0;
    }
    if (s.motifs) {
      for (const [kind, n] of Object.entries(s.motifs)) {
        const k = kind as MotifKind;
        motifs[k] = (motifs[k] ?? 0) + (n ?? 0);
      }
    }
    totalMoves += s.totalUserMoves;
    accSum += s.accuracy;
  }
  const averageAccuracy = Math.round(accSum / summaries.length);
  const recent = summaries.slice(-10);
  const recentAcc =
    recent.length > 0
      ? Math.round(recent.reduce((s, r) => s + r.accuracy, 0) / recent.length)
      : 0;
  return {
    reviewCount: summaries.length,
    totalMoves,
    totals,
    averageAccuracy,
    recentAccuracy: recentAcc,
    trend: recentAcc - averageAccuracy,
    motifs,
  };
}
