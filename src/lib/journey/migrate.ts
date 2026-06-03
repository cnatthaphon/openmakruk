// One-time migration: seed the journey from the existing per-surface
// stores so a returning player's prior progress isn't reset (issue #7
// acceptance: "existing local/cloud progress migrates without reset").
//
// Reads the legacy stores (lesson / puzzle / drill progress, review
// mastery, game history), loads the content maps needed to attach
// category + concepts, and replays the equivalent ProgressInput batch
// through submitProgressBatch.
//
// IDEMPOTENT by construction — the reducer dedups on evidence id-sets,
// so re-running the seed is a no-op. We still gate it behind a one-time
// flag to avoid the content fetch + replay cost on every boot.

import { defineStore } from '../stores';
import { loadLessons, loadPuzzles } from '../content';
import { loadLessonProgress } from '../learnProgress';
import { loadPuzzleProgress } from '../puzzleProgress';
import { loadDrillProgress, drillScore, findDrillLevel } from '../countingDrill';
import { loadReviewMastery } from '../reviewMastery';
import { loadStats } from '../stats';
import { loadChallengeHistory } from '../asyncChallenge';
import {
  conceptsForLessonGroup,
  conceptsForPuzzleCategory,
  conceptsForDrill,
} from './concepts.ts';
import { submitProgressBatch } from './store.ts';
import type { DrillStars, ProgressInput } from './contract';

const flag = defineStore<{ done: boolean }>({
  key: 'openmakruk_journey_seeded',
  version: 1,
  default: () => ({ done: false }),
  migrate: (raw) => ({ done: Boolean((raw as { done?: boolean })?.done) }),
});

/**
 * Seed the journey from legacy stores. Returns true if it ran, false
 * if it was already done. `force` re-runs regardless of the flag
 * (used by tests); it's safe because the reducer is idempotent.
 */
export async function seedJourneyFromStores(force = false): Promise<boolean> {
  if (!force && flag.load().done) return false;

  const inputs: ProgressInput[] = [];
  let complete = true;
  // A single timestamp for all backfilled events — they're historical;
  // we don't have per-event times for every store, and the reducer
  // only uses `at` for updatedAt ordering.
  const at = 0;

  // ── lessons ──────────────────────────────────────────────────────
  const completedLessons = loadLessonProgress().completed;
  if (completedLessons.size > 0) {
    try {
      const lessons = await loadLessons();
      const groupById = new Map(lessons.map((l) => [l.id, l.group]));
      for (const lessonId of completedLessons) {
        inputs.push({
          kind: 'lesson-completed',
          lessonId,
          at,
          concepts: conceptsForLessonGroup(groupById.get(lessonId) ?? ''),
        });
      }
    } catch {
      // Keep the seed pending. If we marked the flag done here, a
      // first offline boot could permanently skip old lesson progress.
      complete = false;
    }
  }

  // ── puzzles ──────────────────────────────────────────────────────
  const solvedPuzzles = loadPuzzleProgress().solved;
  const solvedEntries = Object.entries(solvedPuzzles);
  if (solvedEntries.length > 0) {
    try {
      const puzzles = await loadPuzzles();
      const catById = new Map(puzzles.map((p) => [p.id, p.category]));
      for (const [puzzleId, attempt] of solvedEntries) {
        const category = catById.get(puzzleId);
        if (!category) continue; // unknown puzzle id — skip
        inputs.push({
          kind: 'puzzle-solved',
          puzzleId,
          category,
          at,
          optimal: attempt.attempts <= 1 && !attempt.usedHint,
          concepts: conceptsForPuzzleCategory(category),
        });
      }
    } catch {
      // Keep the seed pending for the same reason as lessons: puzzle
      // concepts/category require content metadata.
      complete = false;
    }
  }

  // ── drills ───────────────────────────────────────────────────────
  const drills = loadDrillProgress().bestByLevel;
  for (const [drillId, result] of Object.entries(drills)) {
    const level = findDrillLevel(drillId);
    if (!level) continue;
    const stars = drillScore(result.movesUsed, level.countLimit).stars as DrillStars;
    inputs.push({
      kind: 'drill-passed',
      drillId,
      at,
      stars,
      concepts: conceptsForDrill(drillId),
    });
  }

  // ── review summaries ─────────────────────────────────────────────
  for (const summary of loadReviewMastery().summaries) {
    inputs.push({
      kind: 'review-summary',
      gameId: summary.gameId,
      at: summary.reviewedAt ?? at,
      motifTotals: summary.motifs,
    });
  }

  // ── game history + latest rating ─────────────────────────────────
  const stats = loadStats();
  for (const g of stats.history) {
    inputs.push({
      kind: 'game-recorded',
      gameId: g.id,
      at: g.date ?? at,
      mode: g.mode === 'casual' ? 'casual' : 'rated',
      outcome: g.outcome,
    });
  }
  if (typeof stats.rating === 'number') {
    inputs.push({ kind: 'rating-changed', at, rating: stats.rating });
  }

  // ── completed async challenges ───────────────────────────────────
  for (const rec of loadChallengeHistory()) {
    if (!rec.result) continue;
    inputs.push({
      kind: 'challenge-completed',
      code: rec.code,
      at: rec.result.finishedAt ?? rec.seenAt ?? at,
      outcome: rec.result.outcome,
    });
  }

  if (inputs.length > 0) submitProgressBatch(inputs);
  if (complete) flag.save({ done: true });
  return true;
}
