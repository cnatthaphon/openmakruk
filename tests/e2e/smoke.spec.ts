// Smoke tests — every tab must load without crashing.
// We exercise the hash routes directly (not just the tab buttons),
// since real users land on /#/play, /#/learn, etc. from bookmarks.

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

const TABS = [
  { hash: 'play',     label: /เล่น/ },
  { hash: 'learn',    label: /ฝึก/ },
  { hash: 'study',    label: /ศึกษา/ },
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

test('share previews: OG + Twitter meta tags + og.svg reachable', async ({ page }) => {
  await page.goto('/');
  // Required OG fields — the crawler-readable share preview
  for (const property of [
    'og:type', 'og:site_name', 'og:title', 'og:description',
    'og:url', 'og:image', 'og:image:width', 'og:image:height',
  ]) {
    const tag = page.locator(`meta[property="${property}"]`);
    await expect(tag).toHaveCount(1);
    const content = await tag.getAttribute('content');
    expect(content && content.length > 0).toBeTruthy();
  }
  // Twitter card fields
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  // The referenced image must actually be served
  const ogRes = await page.request.get('/og.svg');
  expect(ogRes.status()).toBe(200);
  const ogText = await ogRes.text();
  expect(ogText).toContain('1200');
  expect(ogText).toContain('OpenMakruk');
});

test('content manifest loads', async ({ page }) => {
  // Stable across re-runs: drop the IndexedDB cache + the in-page
  // module memoryCache by doing a hard reload. Without this the
  // 3-tier cache hits in memory and no network requests fire.
  await page.goto('/');
  await page.evaluate(async () => {
    try { indexedDB.deleteDatabase('openmakruk-content'); } catch {}
    localStorage.clear();
    localStorage.setItem('openmakruk_onboarded', '1');
  });
  const responses: Array<{ url: string; status: number }> = [];
  page.on('response', (r) => {
    if (r.url().includes('/content/')) {
      responses.push({ url: r.url(), status: r.status() });
    }
  });
  await page.goto('/#/learn');
  await page.reload();  // discard in-memory module caches from prior nav
  await waitForContentReady(page);
  // Lesson catalog may take a moment after waitForContentReady to
  // resolve through the manifest → fetch chain. Poll briefly.
  await page.waitForFunction(
    () => performance.getEntriesByType('resource').some((e) => e.name.includes('lessons/all.json')),
    null,
    { timeout: 10_000 },
  );
  const manifest = responses.find((r) => r.url.endsWith('/manifest.json'));
  expect(manifest?.status).toBe(200);
  const lessons = responses.find((r) => r.url.includes('lessons/all.json'));
  expect(lessons?.status).toBe(200);
});
