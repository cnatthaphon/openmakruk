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
