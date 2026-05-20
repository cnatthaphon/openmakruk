// Smoke tests — every tab must load without crashing.
// We exercise the hash routes directly (not just the tab buttons),
// since real users land on /#/play, /#/learn, etc. from bookmarks.

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

const TABS = [
  { hash: 'play',     label: /เล่น/ },
  { hash: 'learn',    label: /ฝึก/ },
  { hash: 'puzzles',  label: /ปริศนา/ },
  { hash: 'custom',   label: /ออกแบบ/ },
  { hash: 'library',  label: /คลัง/ },
  { hash: 'profile',  label: /โปรไฟล์/ },
  { hash: 'settings', label: /ตั้งค่า/ },
  { hash: 'about',    label: /เกี่ยวกับ/ },
];

test.describe('smoke: all tabs load', () => {
  for (const tab of TABS) {
    test(`/#/${tab.hash} renders`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/#/${tab.hash}`);
      // Active tab button should have the matching label
      await expect(page.locator('button.tab.is-active').first()).toContainText(tab.label);
      await waitForContentReady(page);
      expect(errors).toEqual([]);
    });
  }
});

test('About page lists all required attributions', async ({ page }) => {
  await page.goto('/#/about');
  // CC BY-SA assets must be visible
  await expect(page.locator('body')).toContainText('Fulmene');
  await expect(page.locator('body')).toContainText('Yevrowl');
  await expect(page.locator('body')).toContainText('belzedar_');
  await expect(page.locator('body')).toContainText('CC BY-SA 4.0');
  // GPL runtime deps
  await expect(page.locator('body')).toContainText('Fairy-Stockfish');
  await expect(page.locator('body')).toContainText('chessground');
  await expect(page.locator('body')).toContainText('GPL-3.0');
  // Project's own MIT licence
  await expect(page.locator('body')).toContainText('MIT');
});

test('content manifest loads', async ({ page }) => {
  const responses: Array<{ url: string; status: number }> = [];
  page.on('response', (r) => {
    if (r.url().includes('/content/')) {
      responses.push({ url: r.url(), status: r.status() });
    }
  });
  await page.goto('/#/learn');
  await waitForContentReady(page);
  // Manifest must have been requested + 200'd
  const manifest = responses.find((r) => r.url.endsWith('/manifest.json'));
  expect(manifest?.status).toBe(200);
  const lessons = responses.find((r) => r.url.includes('lessons/all.json'));
  expect(lessons?.status).toBe(200);
});
