// Puzzle E2E — actually solve a mate-in-1 by dragging the piece.

import { test, expect } from '@playwright/test';
import { dragMove, readBoardFen, waitForContentReady } from './helpers';

test.describe('puzzles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('openmakruk_puzzle_progress');
    });
  });

  test('lists 4 categories with correct counts', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);
    const cards = page.locator('.puzzle-category-card');
    await expect(cards).toHaveCount(4);
    // mate-in-1 has 6 puzzles
    await expect(cards.nth(0)).toContainText('0 / 6');
    // mate-in-2 has 1 puzzle
    await expect(cards.nth(1)).toContainText('0 / 1');
    // tactic has 4 puzzles
    await expect(cards.nth(2)).toContainText('0 / 4');
    // counting has 0 puzzles
    await expect(cards.nth(3)).toContainText('0 / 0');
  });

  test('solves a mate-in-1 by dragging a1→a8', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);

    // Open mate-in-1 category — auto-selects lowest-rated unsolved
    // puzzle (sort is ascending by rating). With a fresh localStorage
    // that's mate-003 (rating 750) whose solution is also a1a8.
    await page.locator('.puzzle-category-card').first().click();

    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    // ffish WASM init + initial position render takes a beat
    await page.waitForTimeout(1500);

    // All three lowest-rated mate-in-1s share the Ra1 → Ra8# motif.
    // Just verify a rook exists on a1 + black king is on the back rank.
    const initialFen = await readBoardFen(page);
    expect(initialFen).toMatch(/^[^/]*k[^/]*/); // some king on rank 8
    expect(initialFen.split('/').pop()).toMatch(/^R/); // rank 1 starts with R

    await dragMove(page, 'a1', 'a8');

    await expect(
      page.locator('.puzzle-feedback-text.good'),
    ).toBeVisible({ timeout: 5_000 });

    // After the solve the rook should be at a8
    const finalFen = await readBoardFen(page);
    expect(finalFen.split('/')[0]).toMatch(/^R/);
  });

  test('rejects wrong move + shows ผิดตา feedback', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);
    await page.locator('.puzzle-category-card').first().click();
    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    await page.waitForTimeout(800);

    // Wrong move: a1-a4 (legal but not the solution)
    await dragMove(page, 'a1', 'a4');

    // Must show "bad" feedback
    await expect(
      page.locator('.puzzle-feedback-text.bad'),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('localStorage records the solve', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);
    await page.locator('.puzzle-category-card').first().click();
    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await dragMove(page, 'a1', 'a8');
    await expect(
      page.locator('.puzzle-feedback-text.good'),
    ).toBeVisible({ timeout: 5_000 });

    const progress = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openmakruk_puzzle_progress') ?? '{}'),
    );
    // Whichever puzzle was first-unsolved should now be in `solved`.
    // (With fresh localStorage that's mate-003 — lowest rating in mate-1.)
    const solvedIds = Object.keys(progress.solved ?? {});
    expect(solvedIds.length).toBe(1);
    const solvedId = solvedIds[0];
    expect(progress.solved[solvedId].attempts).toBe(1);
    expect(progress.solved[solvedId].usedHint).toBe(false);
  });
});
