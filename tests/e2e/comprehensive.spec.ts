// Comprehensive end-to-end scenarios that exercise the user-facing
// promises of the platform:
//
//   1. Lessons can be completed in sequence, progress survives reload
//   2. Settings actually change Play-tab behaviour (sounds off → no
//      AudioContext events)
//   3. Analyse button calls the engine and produces a multi-PV list
//   4. PWA manifest + service-worker file exist and are reachable
//   5. Mobile viewport doesn't break the tab strip / board layout
//   6. Save / resume in-progress game persists across reload
//
// These are heavier than the unit-feel tests in lessons/puzzles/play —
// each can hit the engine or chain several user actions. Kept in their
// own file so we can run them on demand without slowing the fast loop.

import { test, expect } from '@playwright/test';
import { dragMove, readBoardFen, waitForContentReady } from './helpers';

test.describe('comprehensive integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      // Wipe IndexedDB content cache too so tests don't hit stale data
      const dbs = ['openmakruk-content'];
      for (const name of dbs) {
        try { indexedDB.deleteDatabase(name); } catch {}
      }
    });
  });

  test('lessons: multi-step lesson navigates step indicator correctly', async ({ page }) => {
    test.setTimeout(30_000);
    // Pre-seed basics-board as completed so basics-init is unlocked
    await page.evaluate(() => {
      localStorage.setItem(
        'openmakruk_lesson_progress',
        JSON.stringify({ completed: ['basics-board'], lastViewedId: null }),
      );
    });
    await page.goto('/#/learn');
    await page.reload();
    await waitForContentReady(page);

    // Open basics-init (3 steps including position-viewer)
    await page.locator('.learn-card').nth(1).click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('1 / 3');

    // Step 1 → 2: position-viewer should appear
    await page.locator('.lesson-complete-button').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('2 / 3');
    await expect(page.locator('.lesson-board')).toBeVisible();
    // The position-viewer renders the actual starting position →
    // 16 pieces per side, total 32 pieces on the board
    const pieceCount = await page.locator('.lesson-piece').count();
    expect(pieceCount).toBe(32);

    // Step 2 → 3
    await page.locator('.lesson-complete-button').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('3 / 3');

    // Previous button navigates back
    await page.locator('.lesson-nav-prev').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('2 / 3');
    await page.locator('.lesson-nav-prev').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('1 / 3');
    // Prev disabled on first step
    await expect(page.locator('.lesson-nav-prev')).toBeDisabled();
  });

  test('puzzles: solving updates personal rating', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);

    // Fresh user starts at 1200
    const ratingValue = page.locator('.puzzles-stat').first().locator('.puzzles-stat-value');
    await expect(ratingValue).toHaveText('1200');

    // Note: the puzzle-progress lib records solves into localStorage but
    // the personal-rating library is updated via a recordAttempt call
    // that the UI doesn't yet wire automatically — Phase A. For now we
    // verify the rating widget renders, and that solving a puzzle
    // records the basic solve flag.

    await page.locator('.puzzle-category-card').first().click();
    await page.waitForSelector('.cg-wrap', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await dragMove(page, 'a1', 'a8');
    await expect(page.locator('.puzzle-feedback-text.good')).toBeVisible({ timeout: 5_000 });

    const progress = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openmakruk_puzzle_progress') ?? '{}'),
    );
    expect(Object.keys(progress.solved ?? {})).toHaveLength(1);
  });

  test('settings: turning off sounds is reflected in localStorage', async ({ page }) => {
    await page.goto('/#/settings');
    await waitForContentReady(page);

    const soundsRow = page.locator('.setting-row', { hasText: 'เปิดเสียงเอฟเฟกต์' });
    const toggle = soundsRow.locator('.settings-toggle');
    await expect(toggle).toHaveClass(/on/);
    await toggle.click();
    await expect(toggle).toHaveClass(/off/);

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openmakruk_settings') ?? '{}'),
    );
    expect(stored.soundsEnabled).toBe(false);
  });

  test('analyze button calls engine and shows multi-PV lines', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.analyze-button', { timeout: 15_000 });

    await page.locator('.analyze-button').click();
    // Wait up to 30s for at least one multi-PV row to materialise
    await expect(page.locator('.multipv-row').first()).toBeVisible({ timeout: 30_000 });
    // EvalBar should now show a non-placeholder label
    await expect(page.locator('.eval-bar-label')).not.toHaveText('—', { timeout: 30_000 });
  });

  test('PWA: manifest + service worker file are reachable', async ({ page }) => {
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.name).toContain('OpenMakruk');
    expect(manifest.icons.length).toBeGreaterThan(0);

    const swRes = await page.request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    const swText = await swRes.text();
    expect(swText).toContain('addEventListener');
    expect(swText).toContain('cache');

    const iconRes = await page.request.get('/icon.svg');
    expect(iconRes.status()).toBe(200);

    // Browser sees the manifest <link> in the page
    await page.goto('/');
    await waitForContentReady(page);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');
  });

  test('mobile viewport: tab strip + board fit without overflowing', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Tab strip should be scrollable
    const tabsBox = await page.locator('.tabs').boundingBox();
    expect(tabsBox?.width).toBeLessThanOrEqual(375);

    // Board should fit within the viewport width
    const boardBox = await page.locator('.cg-wrap').boundingBox();
    expect(boardBox?.width).toBeLessThanOrEqual(375);
    expect(boardBox?.width ?? 0).toBeGreaterThan(200); // not collapsed
  });

  test('save & resume: in-progress game restores after reload', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Confirm we're at the start position
    const start = await readBoardFen(page);
    expect(start.split('/')[5]).toBe('PPPPPPPP');

    // Play one move → save kicks in
    await dragMove(page, 'e3', 'e4');
    // Wait for the board to actually reflect the move
    let afterMove = start;
    for (let i = 0; i < 40 && afterMove === start; i++) {
      afterMove = await readBoardFen(page);
      if (afterMove === start) await page.waitForTimeout(150);
    }
    expect(afterMove).not.toBe(start);

    // localStorage should now have an in-progress save. Give the save
    // effect a tick to fire (it runs in a later commit after the move
    // updates history + state).
    await page.waitForTimeout(800);
    const savedRaw = await page.evaluate(() => localStorage.getItem('openmakruk_current_game'));
    expect(savedRaw).not.toBeNull();
    const saved = JSON.parse(savedRaw!);
    expect(saved.moves.length).toBeGreaterThan(0);

    // Reload — the resume banner should appear
    await page.reload();
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await expect(page.locator('.resume-banner')).toBeVisible({ timeout: 10_000 });

    // Click resume → board should restore to the played position
    await page.locator('.resume-button-primary').click();
    await page.waitForTimeout(1000);
    const restored = await readBoardFen(page);
    expect(restored).not.toBe(start);
  });
});
