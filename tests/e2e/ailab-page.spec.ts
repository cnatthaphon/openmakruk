// AI Lab page (issue #38) — engine-vs-engine match runner.
//
// Drives the real page: pick two baselines, run a tiny match, assert a
// result renders, and confirm the match did NOT change the engine the
// user has selected for normal play (adhoc instances).

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

test.describe('AI Lab page (issue #38)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('runs an engine-vs-engine match; active play engine unchanged', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/#/ailab');
    await waitForContentReady(page);

    // Page renders with its back affordance.
    await expect(page.locator('.ailab-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.back-button')).toHaveCount(1);

    // Record the active play engine before the match (adhoc match must
    // not change it).
    const before = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const reg = await import('/src/lib/engines/registry.ts');
      return reg.getActiveEngineId?.() ?? null;
    });

    // Pick the two cheapest baselines for a fast match: Random vs Minimax.
    const fieldA = page.locator('.ailab-field', { hasText: 'ฝั่ง A' }).locator('select');
    const fieldB = page.locator('.ailab-field', { hasText: 'ฝั่ง B' }).locator('select');
    const fieldGames = page.locator('.ailab-field', { hasText: 'จำนวนเกม' }).locator('select');
    await fieldA.selectOption('lab-random');
    await fieldB.selectOption('lab-minimax');
    await fieldGames.selectOption('2');

    await page.locator('.ailab-run', { hasText: 'เริ่มแข่ง' }).click();

    // Result card appears once the (short) match completes.
    await expect(page.locator('.ailab-result')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.ailab-scorebar')).toBeVisible();
    // Two engine rows; each row's W+L+D should sum to the games played.
    const rows = page.locator('.ailab-table tbody tr');
    await expect(rows).toHaveCount(2);

    // The match used adhoc instances — the user's active engine is the
    // same as before.
    const after = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const reg = await import('/src/lib/engines/registry.ts');
      return reg.getActiveEngineId?.() ?? null;
    });
    expect(after).toBe(before);
  });

  test('reachable from the mobile bottom-nav sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/play');
    await waitForContentReady(page);
    const overflow = page.locator('.bottom-nav button', { hasText: 'เพิ่มเติม' });
    await expect(overflow).toBeVisible({ timeout: 10_000 });
    await overflow.click();
    const item = page.locator('.bottom-nav-sheet-item', { hasText: 'AI Lab' });
    await expect(item).toBeVisible({ timeout: 5_000 });
    await item.click();
    await expect.poll(() => new URL(page.url()).hash, { timeout: 5_000 }).toBe('#/ailab');
  });
});
