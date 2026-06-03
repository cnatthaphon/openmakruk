// Issue #7 — journey progress feed, end to end.
//
// Two angles:
//  1. LIVE EMITTER — solving a real puzzle through the UI feeds the
//     journey (proves the emitter wiring, not just the reducer).
//  2. MIGRATION — seedJourneyFromStores() backfills prior progress from
//     the legacy per-surface stores without a reset, and the reducer
//     clears the checkpoints those events satisfy.
//
// The journey store is durable (IndexedDB) but session-consistent —
// a save updates the in-memory cache synchronously, so reads in the
// same page session see writes (same pattern the history-replay specs
// rely on for loadStats).

import { test, expect } from '@playwright/test';
import { dragMove, waitForContentReady } from './helpers';

test.describe('journey progress feed (issue #7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('solving a puzzle feeds the journey (live emitter)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/puzzles');
    await waitForContentReady(page);

    // Open mate-in-1 (first category card) → lowest-rated unsolved
    // puzzle whose solution is Ra1→Ra8# on a fresh store.
    await page.locator('.puzzle-category-card').first().click();
    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await dragMove(page, 'a1', 'a8');
    await expect(page.locator('.puzzle-feedback-text.good')).toBeVisible({ timeout: 5_000 });

    // The journey must now record a solved puzzle in the mate-1 category.
    const journey = await page.evaluate(async () => {
      // @ts-expect-error dynamic ESM import resolved by Vite at runtime
      const j = await import('/src/lib/journey/index.ts');
      return j.loadJourney();
    });
    expect((journey.evidence.solvedPuzzles ?? []).length).toBeGreaterThanOrEqual(1);
    expect(journey.evidence.puzzleCountsByCategory?.['mate-1'] ?? 0).toBeGreaterThanOrEqual(1);
    // mate-recognition concept got a mastery bump.
    expect(journey.mastery['mate-recognition'] ?? 0).toBeGreaterThan(0);
  });

  test('seedJourneyFromStores backfills prior progress + clears checkpoints (no reset)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const result = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const stats = await import('/src/lib/stats.ts');
      // @ts-expect-error dynamic
      const journey = await import('/src/lib/journey/index.ts');

      // Seed legacy progress: three recorded rated games (the source
      // the migration reads for game-recorded + rating).
      let s = stats.loadStats();
      for (let i = 0; i < 3; i++) {
        s = stats.recordGame(s, {
          id: `seedgame_${i}`,
          opponentId: 'medium',
          ratingBucket: 'medium',
          userSide: 'white',
          result: '1-0',
          plyCount: 10,
          moves: ['e3e4', 'e6e5'],
          finalFen: 'final',
          mode: 'rated',
        });
      }
      stats.saveStats(s);

      // Run the one-time migration (force so the flag doesn't skip it).
      const ran = await journey.seedJourneyFromStores(true);
      const j = journey.loadJourney();
      return { ran, rated: j.evidence.gamesPlayedRated ?? 0, cleared: j.cleared, recorded: (j.evidence.recordedGameIds ?? []).length };
    });

    expect(result.ran).toBe(true);
    expect(result.rated).toBe(3);
    expect(result.recorded).toBe(3);
    // 3 games satisfies the cp-first-games checkpoint.
    expect(result.cleared).toContain('cp-first-games');
  });

  test('migration is idempotent — a second seed does not double-count', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const result = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const stats = await import('/src/lib/stats.ts');
      // @ts-expect-error dynamic
      const journey = await import('/src/lib/journey/index.ts');
      let s = stats.loadStats();
      s = stats.recordGame(s, {
        id: 'seedgame_only',
        opponentId: 'medium',
        ratingBucket: 'medium',
        userSide: 'white',
        result: '1-0',
        plyCount: 10,
        moves: ['e3e4', 'e6e5'],
        finalFen: 'final',
        mode: 'rated',
      });
      stats.saveStats(s);
      await journey.seedJourneyFromStores(true);
      await journey.seedJourneyFromStores(true); // run twice
      return journey.loadJourney().evidence.gamesPlayedRated ?? 0;
    });
    // Two seeds, one game → counted exactly once (dedup by gameId).
    expect(result).toBe(1);
  });

  test('migration backfills completed async challenges', async ({ page }) => {
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const result = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const asyncChallenge = await import('/src/lib/asyncChallenge.ts');
      // @ts-expect-error dynamic
      const journey = await import('/src/lib/journey/index.ts');

      journey.clearJourney();
      asyncChallenge.recordChallenge({
        code: 'journey_challenge_done',
        payload: {
          v: 1,
          b: 'attacker-rookie',
          c: 'all',
          tc: 'untimed',
          by: 'Tester',
        },
        role: 'accepted',
        result: {
          outcome: 'win',
          moves: 24,
          finishedAt: 1234,
        },
      });

      await journey.seedJourneyFromStores(true);
      const j = journey.loadJourney();
      return {
        completed: j.evidence.completedChallenges ?? [],
        cleared: j.cleared,
      };
    });

    expect(result.completed).toContain('journey_challenge_done');
    expect(result.cleared).toContain('cp-challenger');
  });
});
