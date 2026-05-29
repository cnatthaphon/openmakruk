// Did-you-know discoverability card — verifies the card appears on
// Play (lobby state), surfaces hidden features one at a time, and
// honors both dismissal flows.
//
// Why this matters: 8 of OpenMakruk's most differentiating features
// (Counting Drill, Survive, Pattern, Move Trainer, Boss Rush, Async
// Challenge, Bot Exhibition, public Stats) sit at hash routes that
// aren't in the nav. Without this card a first-time visitor never
// learns those features exist. A regression here would silently
// re-hide them.

import { test, expect } from '@playwright/test';
import { dragMove } from './helpers';

test.describe('Did-you-know card', () => {
  test('appears on Play landing with first (Counting) tip', async ({ page }) => {
    await page.goto('/#/play');
    // Card uses aria-labelledby on the <aside>.
    const card = page.locator('.dyk-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('รู้หรือไม่?');
    // Top of the priority list — Counting Drill leads.
    await expect(card).toContainText('Counting Drill');
  });

  test('"พรุ่งนี้" (soft dismiss) rotates to next feature', async ({ page }) => {
    await page.goto('/#/play');
    await page.waitForSelector('.dyk-card');
    await page.locator('.dyk-action-secondary').click();
    // Next feature in priority order is Move Trainer.
    await expect(page.locator('.dyk-card')).toContainText('Move Trainer');
  });

  test('"ไม่สนใจ" (hard dismiss) also rotates', async ({ page }) => {
    await page.goto('/#/play');
    await page.waitForSelector('.dyk-card');
    await page.locator('.dyk-action-tertiary').click();
    await expect(page.locator('.dyk-card')).toContainText('Move Trainer');
  });

  test('primary CTA navigates to the feature route', async ({ page }) => {
    await page.goto('/#/play');
    await page.waitForSelector('.dyk-card');
    await page.locator('.dyk-action-primary').click();
    await expect(page).toHaveURL(/#\/counting/);
  });

  test('is hidden once a game is in progress', async ({ page }) => {
    await page.goto('/#/play');
    await page.waitForSelector('.dyk-card');
    // Bia e3 → e4 (white's most natural opening move). Uses the shared
    // drag helper since chessground squares aren't directly queryable.
    await dragMove(page, 'e3', 'e4', false);
    // After the move, the card should be gone (lobby state ended).
    await expect(page.locator('.dyk-card')).toHaveCount(0, { timeout: 5_000 });
  });
});
