// Skeleton features check — make sure each newly-added scaffold
// actually renders something usable, so we know the wiring works
// (or fails loudly) before any content fill-in.

import { test, expect } from '@playwright/test';
import { readStore, waitForContentReady } from './helpers';

test.describe('skeleton features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('Settings page shows every section + a working toggle', async ({ page }) => {
    await page.goto('/#/settings');
    await waitForContentReady(page);
    // Phase 29 split Settings into 4 sub-tabs. The five headings now
    // live across different tabs — open each tab and assert that its
    // expected heading appears. Visual tab is open by default.
    await expect(page.locator('body')).toContainText('🎨 หน้าตา');
    await expect(page.locator('body')).toContainText('🔊 เสียง');
    await page.getByRole('tab', { name: /การเล่น/ }).click();
    await expect(page.locator('body')).toContainText('📊 การวิเคราะห์');
    await expect(page.locator('body')).toContainText('🌐 ภาษาและความปลอดภัย');
    await page.getByRole('tab', { name: /รีเซ็ต/ }).click();
    await expect(page.locator('body')).toContainText('🔄 รีเซ็ต');

    // Toggle a setting — "เปิดเสียงเอฟเฟกต์" lives in the visual tab.
    await page.getByRole('tab', { name: /หน้าตา/ }).click();
    const soundsToggle = page
      .locator('.setting-row', { hasText: 'เปิดเสียงเอฟเฟกต์' })
      .locator('.settings-toggle');
    await expect(soundsToggle).toHaveClass(/on/);
    await soundsToggle.click();
    await expect(soundsToggle).toHaveClass(/off/);

    // Verify the change persisted to localStorage
    const stored = (await readStore<{ soundsEnabled: boolean }>(
      page,
      'openmakruk_settings',
    )) ?? { soundsEnabled: true };
    expect(stored.soundsEnabled).toBe(false);
  });

  test('Puzzles tab shows personal rating + daily puzzle card', async ({ page }) => {
    await page.goto('/#/puzzles');
    await waitForContentReady(page);

    // Personal rating widget — fresh user starts at 1200
    await expect(page.locator('.puzzles-stats-bar')).toBeVisible();
    await expect(page.locator('.puzzles-stat').first()).toContainText('1200');

    // Daily puzzle card present (deterministic, never empty given >=1 puzzle)
    await expect(page.locator('.daily-card')).toBeVisible();
    await expect(page.locator('.daily-card-tag')).toContainText('ประจำวัน');
    await expect(page.locator('.daily-card-button')).toBeVisible();
  });

  test('Library page shows empty state when no positions saved', async ({ page }) => {
    await page.goto('/#/library');
    await waitForContentReady(page);
    await expect(page.locator('body')).toContainText('คลังตำแหน่ง');
    await expect(page.locator('.library-empty')).toBeVisible();
    await expect(page.locator('body')).toContainText('คลังของคุณยังว่าง');
  });

  test('Library page renders saved positions from localStorage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'openmakruk_library',
        JSON.stringify([
          {
            id: 'pos_test',
            fen: 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1',
            title: 'Test position',
            note: 'A unit test position',
            tags: ['test', 'opening'],
            createdAt: Date.now(),
            source: 'custom',
          },
        ]),
      );
    });
    await page.goto('/#/library');
    await page.reload();
    await waitForContentReady(page);
    await expect(page.locator('.library-card')).toHaveCount(1);
    await expect(page.locator('.library-card-title')).toContainText('Test position');
    await expect(page.locator('.library-source-tag')).toContainText('ออกแบบ');
    await expect(page.locator('.library-tag').first()).toContainText('#test');
  });

  test('Profile history shows PGN export button when there is history', async ({ page }) => {
    // Seed one game record
    await page.evaluate(() => {
      const stats = {
        version: 1,
        displayName: 'TestUser',
        createdAt: Date.now(),
        rating: 1050,
        totalGames: 1,
        byLevel: {
          easy:   { wins: 1, losses: 0, draws: 0 },
          medium: { wins: 0, losses: 0, draws: 0 },
          hard:   { wins: 0, losses: 0, draws: 0 },
          master: { wins: 0, losses: 0, draws: 0 },
        },
        history: [
          {
            id: 'game_test_001',
            outcome: 'win',
            opponent: 'easy',
            userSide: 'white',
            date: Date.now() - 1000 * 60 * 60,
            plyCount: 22,
            ratingBefore: 1000,
            ratingAfter: 1050,
            ratingDelta: 50,
            moves: ['e3e4', 'e6e5', 'd3d4', 'd6d5'],
            mode: 'rated',
          },
        ],
      };
      localStorage.setItem('openmakruk_stats', JSON.stringify(stats));
    });

    // Reload after seeding so App.tsx re-reads the new localStorage on
    // mount — a hash-only nav wouldn't re-initialise the stats state.
    await page.goto('/#/profile');
    await page.reload();
    await waitForContentReady(page);
    // Phase 27 moved History into the 'สถิติ' (Stats) sub-tab.
    await page.getByRole('tab', { name: /สถิติ/ }).click();
    // Both bulk + per-row PGN buttons must render
    await expect(page.locator('.profile-history-actions button')).toContainText('Download');
    await expect(page.locator('.history-pgn-button')).toBeVisible();
  });
});
