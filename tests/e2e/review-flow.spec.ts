// Post-game review flow (issue #5 net).
//
// The review controller (analyze a finished game → step through the
// annotated moves → key moments → exit) had NO e2e coverage — only
// single-position Analyze was tested. This pins the full flow so the
// upcoming useReviewController extraction (and any future change to
// the review orchestration) has a regression net.
//
// Flow: play one move → resign (forced result) → close the overlay →
// launch review → assert the analysis panel + sub-tabs render → exit.

import { test, expect } from '@playwright/test';
import { dragMove, waitForContentReady } from './helpers';

test.describe('post-game review flow (issue #5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('finish a game → launch review → step + exit', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // One move so history.length > 0 (review needs at least one ply).
    await dragMove(page, 'e3', 'e4');

    // Resign → forced result (the review-launch button only shows on a
    // finished game).
    const resignBtn = page.locator('.play-quick-resign');
    await expect(resignBtn).toBeEnabled({ timeout: 20_000 });
    await resignBtn.click();
    await page.getByRole('button', { name: 'ยอมแพ้', exact: true }).click();
    await expect(page.locator('.game-over-overlay')).toBeVisible({ timeout: 10_000 });

    // Close the overlay so the side-panel launch button is reachable.
    await page.locator('.game-over-close').click();

    // Launch the post-game review (runs analyzeGame over the move log).
    const launch = page.locator('.review-launch-button');
    await expect(launch).toBeVisible({ timeout: 10_000 });
    await launch.click();

    // Analysis done → the tabbed review panel mounts with its 3 sub-tabs.
    await expect(page.locator('.review-tabbed')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.review-subtab')).toHaveCount(3);

    // The details sub-tab shows the move-by-move panel.
    await page.locator('.review-subtab', { hasText: 'รายละเอียด' }).click();
    await expect(page.locator('.review-panel')).toBeVisible({ timeout: 10_000 });

    // Exit returns to the live board (panel gone).
    await page.locator('.review-exit').first().click();
    await expect(page.locator('.review-tabbed')).toHaveCount(0);
  });
});
