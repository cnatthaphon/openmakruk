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
  // A single timestamp for all backfilled events — they're historical;
  // we don't have per-event times for every store, and the reducer
  // only uses `at` for updatedAt ordering.
  const at = 0;

  // ── lessons ──────────────────────────────────────────────────────
  try {
    const lessons = await loadLessons();
    const groupById = new Map(lessons.map((l) => [l.id, l.group]));
    const completed = loadLessonProgress().completed;
    for (const lessonId of completed) {
      inputs.push({
        kind: 'lesson-completed',
        lessonId,
        at,
        concepts: conceptsForLessonGroup(groupById.get(lessonId) ?? ''),
      });
    }
  } catch {
    // Content load failed (offline first boot) — skip lessons; the
    // live emitter will populate them going forward.
  }

  // ── puzzles ──────────────────────────────────────────────────────
  try {
    const puzzles = await loadPuzzles();
    const catById = new Map(puzzles.map((p) => [p.id, p.category]));
    const solved = loadPuzzleProgress().solved;
    for (const [puzzleId, attempt] of Object.entries(solved)) {
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
    // skip puzzles
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

  if (inputs.length > 0) submitProgressBatch(inputs);
  flag.save({ done: true });
  return true;
}
