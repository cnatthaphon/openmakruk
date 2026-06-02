// v2 async-challenge flow — verifies the result-baked link renders
// the sender's target stats on AcceptView. The 'compareChallengeResults'
// helper is exercised indirectly by the post-game comparison toast,
// which fires only after a full game; we keep this suite focused on
// the deterministic URL → render path that has the most viral
// impact (someone got a v2 link from LINE — what do they see?).

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase } from './helpers';

test.beforeEach(async ({ page }) => {
  // Pin the test API base BEFORE first bundle load. Without this the
  // backend singleton caches 8788 and the fetchBot call hits a closed
  // port, so AcceptView never finishes loading the bot row.
  await pinTestApiBase(page);
});

// Encode a v2 challenge payload to base64url using the same logic as
// lib/asyncChallenge.ts. Mirroring it here lets the test fabricate
// arbitrary v2 codes without booting the production app first.
function encodeV2(payload: object): string {
  const json = JSON.stringify(payload);
  // btoa runs in Node18+ via global; Playwright workers have it.
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test.describe('async challenge · v2 result-baked link', () => {
  test('AcceptView shows challenger\'s result and "ทำให้ดีกว่าสิ" framing', async ({ page }) => {
    const code = encodeV2({
      v: 2,
      b: 'attacker-rookie',
      c: 'speed',
      tc: 'blitz5',
      by: 'Somchai',
      r: { o: 'w', m: 28, q: 87 },
    });
    await page.goto('/');
    await clearAppState(page);
    await page.goto(`/#/challenge/${code}`);

    // The accept card mounts after fetchBot resolves.
    await expect(page.locator('.challenge-accept-card')).toBeVisible({ timeout: 10_000 });

    // Tagline switches to the "เขาเล่นแล้ว · ทำให้ดีกว่าสิ" framing
    // when payload.r is present — distinguishes v1 (generic) from
    // v2 (head-to-head) cards visually.
    await expect(page.locator('.challenge-accept-tagline')).toContainText('ทำให้ดีกว่า');

    // Target block surfaces sender's outcome + moves + accuracy.
    const target = page.locator('.challenge-accept-target');
    await expect(target).toBeVisible();
    await expect(target).toContainText('ชนะ');
    await expect(target).toContainText('28 ตา');
    await expect(target).toContainText('accuracy 87%');
    await expect(target).toContainText('Somchai');
  });

  test('v1 link still works (no target block when result is absent)', async ({ page }) => {
    const code = encodeV2({
      v: 1,
      b: 'attacker-rookie',
      c: 'speed',
      tc: 'blitz5',
      by: 'Somchai',
    });
    await page.goto('/');
    await clearAppState(page);
    await page.goto(`/#/challenge/${code}`);
    await expect(page.locator('.challenge-accept-card')).toBeVisible({ timeout: 10_000 });
    // No target block — v1 has no result to show.
    await expect(page.locator('.challenge-accept-target')).toHaveCount(0);
    // Generic tagline used.
    await expect(page.locator('.challenge-accept-tagline')).toContainText('เพื่อน');
  });

  test('malformed v2 result block is rejected (decode returns null)', async ({ page }) => {
    // r.o not in {w,d,l} — decoder should refuse, page falls into error state.
    const code = encodeV2({
      v: 2,
      b: 'attacker-rookie',
      c: 'speed',
      tc: 'blitz5',
      by: 'Somchai',
      r: { o: 'invalid', m: 28 },
    });
    await page.goto('/');
    await clearAppState(page);
    await page.goto(`/#/challenge/${code}`);
    // Page-owned error class (issue #9 — was the leaked .bot-detail-error).
    await expect(page.locator('.challenge-error')).toBeVisible({ timeout: 5_000 });
  });
});
