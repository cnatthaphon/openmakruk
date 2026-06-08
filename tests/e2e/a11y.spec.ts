// Accessibility audit — runs axe-core on every key public surface
// and fails on any 'serious' or 'critical' violation. 'minor' /
// 'moderate' findings are surfaced as console output but not asserted
// because:
//   - Some are unavoidable in our domain (chessground sets non-
//     semantic <square> elements that axe flags as unknown roles)
//   - Some are font-rendering edge cases that pass on real browsers
//     but trip axe's static contrast checks (we've manually verified
//     the contrast in DevTools)
// If a 'moderate' regression becomes load-bearing for a user we'll
// move it to the assertion list — for now, keeping the gate at
// serious+ catches the bugs that actually block users without
// drowning CI in false positives.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { clearAppState, pinTestApiBase } from './helpers';

const SURFACES = [
  { hash: 'play', label: 'Play tab' },
  { hash: 'profile', label: 'Profile' },
  { hash: 'settings', label: 'Settings' },
  { hash: 'about', label: 'About' },
  { hash: 'stats', label: 'Stats' },
  { hash: 'puzzles', label: 'Puzzles' },
  // Issue #42 — surfaces that were missing from the scan, so a
  // serious/critical regression on them now gets caught too.
  { hash: 'ailab', label: 'AI Lab' },
  { hash: 'learn', label: 'Learn' },
  { hash: 'library', label: 'Library' },
  { hash: 'custom', label: 'Custom' },
  { hash: 'challenge', label: 'Challenge' },
  { hash: 'exhibition', label: 'Exhibition' },
];

test.describe('a11y · axe-core scan', () => {
  for (const s of SURFACES) {
    test(`/#/${s.hash} has no serious or critical a11y violations`, async ({ page }) => {
      await pinTestApiBase(page);
      await page.goto('/');
      await clearAppState(page);
      await page.goto(`/#/${s.hash}`);
      // Give the page a moment to finish hydrating + lazy-load its
      // chunk so axe sees the real DOM, not a Suspense fallback.
      await page.waitForTimeout(1500);

      const results = await new AxeBuilder({ page })
        // Limit to WCAG 2.1 AA + best-practice rules; that's the
        // standard most teams + browsers target.
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        // Skip rules that don't apply to a SPA (e.g. region-landmark
        // checks expect a static page; our App.tsx is one big root).
        .disableRules(['region'])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      if (serious.length > 0) {
        // Detailed report for debugging — Playwright surfaces the
        // failure with this attached.

        console.log(
          `axe.violations[${s.label}]:`,
          JSON.stringify(
            serious.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.length,
              firstTarget: v.nodes[0]?.target,
            })),
            null,
            2,
          ),
        );
      }
      expect(serious, `serious/critical violations on ${s.label}`).toEqual([]);
    });
  }
});

test.describe('a11y · keyboard flow (issue #42)', () => {
  test.beforeEach(async ({ page }) => {
    await pinTestApiBase(page);
    await page.goto('/');
    await clearAppState(page);
  });

  test('skip-link is the first tab stop and moves focus to content', async ({ page }) => {
    await page.goto('/#/play');
    await page.waitForTimeout(800);

    // The skip link is visually hidden until focused. One Tab from the
    // top of the document should land on it.
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();

    // Activating it moves focus to the main-content anchor, bypassing
    // the whole header nav.
    await skip.press('Enter');
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('main-content');
    expect(new URL(page.url()).hash).toBe('#/play');
  });

  test('bottom-nav sheet: Escape closes and focus returns to the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/play');
    await page.waitForTimeout(800);

    const trigger = page.locator('.bottom-nav button', { hasText: 'เพิ่มเติม' });
    await trigger.click();

    const sheet = page.locator('.bottom-nav-sheet');
    await expect(sheet).toBeVisible();
    // Focus moved into the sheet (first item).
    await expect(page.locator('.bottom-nav-sheet-item').first()).toBeFocused();

    // Escape closes it and restores focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
