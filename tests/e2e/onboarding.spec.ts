// Onboarding flow — first-time visitors see a welcome modal that they
// can complete (saving name + first opponent) or skip. Both paths
// must mark the user as onboarded so the modal doesn't re-appear.

import { test, expect } from '@playwright/test';
import { readStore } from './helpers';

// Override the global storageState so the modal actually shows for
// these tests. Without this, the playwright config has the onboarded
// flag pre-set.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('onboarding modal', () => {
  test('shows on first visit', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ยินดีต้อนรับสู่ OpenMakruk')).toBeVisible();
  });

  test('full flow: welcome → name → opponent → finish', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('ยินดีต้อนรับสู่ OpenMakruk')).toBeVisible();

    // Step 1: welcome → next
    await page.getByRole('button', { name: /ต่อไป/ }).click();

    // Step 2: name input → next
    const nameInput = page.locator('.onboarding-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('TestPlayer');
    await page.getByRole('button', { name: /ต่อไป/ }).click();

    // Step 3: opponent picker → finish
    await expect(page.getByText('เลือกคู่ต่อสู้คนแรก')).toBeVisible();
    // Pick the second option (wanderer) to exercise non-default path.
    await page.locator('.onboarding-opponent').nth(1).click();
    await page.getByRole('button', { name: /เริ่มเล่น/ }).click();

    // Modal closes, app lands on /#/play.
    await expect(page.locator('.onboarding-modal')).toHaveCount(0);
    expect(page.url()).toContain('#/play');

    // Verify name + engine persisted, and onboarded flag is set.
    const stats = await readStore<{ displayName: string }>(page, 'openmakruk_stats');
    expect(stats?.displayName).toBe('TestPlayer');
    const onboarded = await page.evaluate(() => localStorage.getItem('openmakruk_onboarded'));
    expect(onboarded).toBe('1');
    const settings = await readStore<{ engineId: string }>(page, 'openmakruk_settings');
    expect(settings?.engineId).toBe('personality:wanderer');
  });

  test('skip button dismisses without making changes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.onboarding-modal')).toBeVisible();
    await page.locator('.onboarding-skip').click();
    await expect(page.locator('.onboarding-modal')).toHaveCount(0);
    // Flag still gets set so the modal doesn't reappear on next visit.
    const onboarded = await page.evaluate(() => localStorage.getItem('openmakruk_onboarded'));
    expect(onboarded).toBe('1');
  });

  test('does not show on subsequent visits', async ({ page }) => {
    await page.goto('/');
    await page.locator('.onboarding-skip').click();
    await page.reload();
    await expect(page.locator('.onboarding-modal')).toHaveCount(0);
  });
});
