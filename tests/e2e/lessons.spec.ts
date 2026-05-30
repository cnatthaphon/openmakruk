// Lesson tab E2E: list view counts, lesson detail navigation, multi-step
// flow, progress persistence.

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

test.describe('lessons', () => {
  test.beforeEach(async ({ page }) => {
    // Start each test from a clean slate so progress doesn't leak
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('openmakruk_lesson_progress');
    });
  });

  test('lists all 28 lessons grouped by section', async ({ page }) => {
    await page.goto('/#/learn');
    await waitForContentReady(page);
    const cards = page.locator('.learn-card');
    await expect(cards).toHaveCount(29);
    // Section headings exist
    await expect(page.locator('body')).toContainText('พื้นฐานกระดาน');
    await expect(page.locator('body')).toContainText('รู้จักตัวหมาก');
    await expect(page.locator('body')).toContainText('นับศักดิ์');
    await expect(page.locator('body')).toContainText('ปลายเกม');
  });

  test('opens first lesson, completes, auto-advances to next', async ({ page }) => {
    await page.goto('/#/learn');
    await waitForContentReady(page);

    // First lesson: basics-board (read-only body)
    await page.locator('.learn-card').first().click();
    await expect(page.locator('h2')).toContainText('รู้จักกระดาน');

    // Click "complete" — because the next lesson exists, onNextLesson
    // is set and the click should auto-advance to basics-init.
    await page.locator('.lesson-complete-button').click();
    await expect(page.locator('h2')).toContainText('ตำแหน่งเริ่มต้น');

    // Walk back to the list and verify lesson #1 now carries the ✓ status
    await page.locator('.lesson-back').click();
    await expect(page.locator('.learn-card').first()).toContainText('✓');
  });

  test('multi-step lesson (basics-init) shows position-viewer with starting position', async ({ page }) => {
    await page.goto('/#/learn');
    await waitForContentReady(page);
    // Complete lesson 0; the auto-next flow lands us on basics-init.
    await page.locator('.learn-card').first().click();
    await page.locator('.lesson-complete-button').click();

    // We should already be on basics-init now (auto-advance)
    await expect(page.locator('h2')).toContainText('ตำแหน่งเริ่มต้น');

    // Step indicator should show "ขั้นที่ 1 / 3"
    await expect(page.locator('.lesson-step-indicator')).toContainText('1 / 3');

    // Step 1: text. Phase 38 — text steps now show a contextual
    // board too (the lesson's first position-viewer fen, falling
    // back to MAKRUK_START_FEN). User feedback: "ไม่เจอกระดาน"
    // when the right column was blank on text steps.
    await expect(page.locator('.lesson-board')).toBeVisible();

    // Advance to step 2 — interactive position-viewer board
    await page.locator('.lesson-complete-button').click(); // "ถัดไป →"
    await expect(page.locator('.lesson-step-indicator')).toContainText('2 / 3');
    await expect(page.locator('.lesson-board')).toBeVisible();

    // Step 3: text again
    await page.locator('.lesson-complete-button').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('3 / 3');

    // Last step: "Previous" button works
    await page.locator('.lesson-nav-prev').click();
    await expect(page.locator('.lesson-step-indicator')).toContainText('2 / 3');
  });

  test('counting-demo animates the counter', async ({ page }) => {
    await page.goto('/#/learn');
    await waitForContentReady(page);
    // Navigate to the counting-demo lesson via direct localStorage seeding
    // (faster than completing all prerequisite lessons)
    await page.evaluate(() => {
      const lessons = [
        'basics-board', 'basics-init', 'basics-notation',
        'piece-king', 'piece-met', 'piece-khon', 'piece-knight',
        'piece-rook', 'piece-bia', 'piece-promo',
        'rule-capture', 'rule-check', 'rule-mate', 'rule-stale', 'rule-3fold',
      ];
      localStorage.setItem(
        'openmakruk_lesson_progress',
        JSON.stringify({ completed: lessons, lastViewedId: null }),
      );
    });
    await page.reload();
    await waitForContentReady(page);

    // Find the count-intro card and open it
    const countCard = page.locator('.learn-card', { hasText: 'นับศักดิ์คืออะไร' });
    await countCard.click();
    // Step 1 = text. Advance to step 2 (counting-demo).
    await page.locator('.lesson-complete-button').click();
    await expect(page.locator('.counting-panel')).toBeVisible();
    // Counter starts at 1
    await expect(page.locator('.counting-stat').nth(0)).toContainText('1');
    // Click "เริ่มนับ"
    await page.locator('button', { hasText: 'เริ่มนับ' }).click();
    // After ~2 seconds the counter should have advanced
    await page.waitForTimeout(1500);
    const currentText = await page.locator('.counting-stat').nth(0).textContent();
    const current = parseInt(currentText?.match(/\d+/)?.[0] ?? '1', 10);
    expect(current).toBeGreaterThan(1);
  });
});
