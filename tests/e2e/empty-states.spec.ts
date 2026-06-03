import { test, expect } from '@playwright/test';
import { TEST_API_BASE, waitForContentReady } from './helpers';

test.describe('empty-state polish', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((apiBase) => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
      localStorage.setItem('openmakruk_api_base', apiBase);
    }, TEST_API_BASE);
  });

  test('Exhibition empty feed still shows the next-match ETA', async ({ page }) => {
    await page.route('**/api/exhibition/recent', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [] }),
      });
    });

    await page.goto('/#/exhibition');
    await waitForContentReady(page);

    const exhibition = page.locator('.exhibition-page');
    await expect(exhibition).toContainText('ยังไม่มีเกม');
    await expect(exhibition).toContainText(/match ถัดไป (เร็วๆ นี้|น้อยกว่า 1 นาที|~\d+ นาที)/);
  });

  test('Library empty state clarifies that positions stay on this device', async ({ page }) => {
    await page.goto('/#/library');
    await waitForContentReady(page);

    await expect(page.locator('.library-empty')).toContainText('คลังของคุณยังว่าง');
    await expect(page.locator('.library-empty')).toContainText('อุปกรณ์นี้เท่านั้น');
  });
});
