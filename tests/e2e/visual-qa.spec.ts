// Visual-QA pass — capture every public surface at desktop + mobile
// viewports and assert: no horizontal scroll, no ErrorBoundary
// fallback rendered, no JS exceptions thrown during render.
//
// What this catches that smoke tests don't:
//   - Page renders but layout overflows the viewport (mobile-killer)
//   - Page renders but ErrorBoundary caught a render-time exception
//   - Page renders but no meaningful content (empty .stats-section etc)
//   - Console pageerror events that smoke tests would miss because
//     they only check body text
//
// Run with:  npm run test:e2e -- --grep "visual-qa"

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase } from './helpers';

const ROUTES_TO_AUDIT: ReadonlyArray<{ hash: string; selector: string; allowEmpty?: boolean }> = [
  { hash: 'play', selector: 'main, .play-tab, .cg-wrap' },
  { hash: 'learn', selector: '.learn-page' },
  { hash: 'study', selector: '.study-page, main' },
  { hash: 'puzzles', selector: '.puzzles-page, main' },
  { hash: 'custom', selector: '.custom-page, main' },
  { hash: 'library', selector: '.library-page, main' },
  { hash: 'profile', selector: '.profile-page, main' },
  { hash: 'settings', selector: '.settings-page, main' },
  { hash: 'about', selector: '.about-page, main' },
  { hash: 'stats', selector: '.stats-page, .stats-hero', allowEmpty: true },
  { hash: 'challenge', selector: '.challenge-page, .challenge-hero' },
  { hash: 'counting', selector: 'main' },
  { hash: 'rush', selector: 'main' },
  { hash: 'bossrush', selector: 'main' },
  { hash: 'movetrainer', selector: 'main' },
  { hash: 'pattern', selector: 'main' },
  { hash: 'survive', selector: 'main' },
  { hash: 'exhibition', selector: '.exhibition-page, .exhibition-feed' },
  { hash: 'bots/attacker-master', selector: '.bot-detail-page' },
];

const VIEWPORTS: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile',  width: 375,  height: 667 },
];

test.describe('visual-qa · render integrity across viewports', () => {
  for (const vp of VIEWPORTS) {
    for (const r of ROUTES_TO_AUDIT) {
      test(`[${vp.name}] /#/${r.hash} renders cleanly, no overflow, no errors`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await pinTestApiBase(page);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('/');
        await clearAppState(page);
        await page.goto(`/#/${r.hash}`);

        // Wait for the page's primary content selector (any of the
        // comma-separated alternatives is fine).
        await page.locator(r.selector).first().waitFor({ state: 'visible', timeout: 10_000 });

        // No ErrorBoundary fallback rendered.
        await expect(page.locator('.error-boundary')).toHaveCount(0);

        // Verify horizontal scroll is not produced — a common mobile bug
        // is a min-width or fixed grid spilling off the right edge.
        // Allow a 2px tolerance for sub-pixel rounding.
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal scroll ${overflow}px at ${vp.name}`).toBeLessThanOrEqual(2);

        // Body must have actual content (not just blank). The shell
        // alone is < 50 chars; real content blows past that easily.
        const len = await page.evaluate(() => document.body.innerText.length);
        expect(len, 'body content length').toBeGreaterThan(50);

        // No JS pageerror events during the goto + wait.
        expect(errors, 'pageerror events').toEqual([]);
      });
    }
  }

  // Phase 33 regression: Phase 28 moved TodayStrip out of <main> into
  // a pre-main strip ABOVE main. main still used a fixed
  // `calc(100vh - 110px)` height that didn't account for the strip,
  // so the board overflowed the viewport at common desktop sizes
  // (user reported "scroll + board ดันลงมาไม่กลาง"). This test
  // asserts that at the typical desktop viewport, /#/play does NOT
  // produce vertical document scroll AND the board's bottom edge is
  // inside the viewport.
  test('play page fits desktop viewport without vertical scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await pinTestApiBase(page);
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/play');
    await page.locator('.cg-wrap').first().waitFor({ state: 'visible', timeout: 10_000 });

    // No vertical document scroll. Allow tolerance for sub-pixel.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow, `vertical scroll ${overflow}px at 1280x800`).toBeLessThanOrEqual(2);

    // Board's bottom edge must be inside the viewport.
    const boardBottom = await page.evaluate(() => {
      const cg = document.querySelector('.cg-wrap');
      if (!cg) return null;
      return cg.getBoundingClientRect().bottom;
    });
    expect(boardBottom, 'board bottom-edge px').not.toBeNull();
    expect(boardBottom).toBeLessThanOrEqual(800);
  });
});
