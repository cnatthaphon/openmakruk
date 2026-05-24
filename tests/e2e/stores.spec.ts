// Schema versioning contract — verifies that the wrapped `{v, d}`
// envelope is what the app writes, and that legacy unwrapped data
// (the shape we used before stores.ts existed) is auto-migrated on
// first read without losing user state.
//
// This is the regression net for the foundation guarantee: bumping a
// schema version on a future release must NEVER require users to wipe
// their localStorage.

import { test, expect } from '@playwright/test';
import { readStore, waitForContentReady } from './helpers';

test.describe('schema versioning + migration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('new writes are wrapped as { v, d }', async ({ page }) => {
    // Toggle a Settings field so the app writes via the store.
    await page.goto('/#/settings');
    await waitForContentReady(page);
    await page
      .locator('.setting-row', { hasText: 'เปิดเสียงเอฟเฟกต์' })
      .locator('.settings-toggle')
      .click();

    const raw = await page.evaluate(() =>
      localStorage.getItem('openmakruk_settings'),
    );
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveProperty('v');
    expect(parsed).toHaveProperty('d');
    expect(typeof parsed.v).toBe('number');
    expect(parsed.v).toBeGreaterThanOrEqual(1);
    expect(parsed.d.soundsEnabled).toBe(false);
  });

  test('legacy unwrapped library data is auto-migrated on read', async ({ page }) => {
    // Seed pre-stores.ts shape — raw array, no envelope.
    await page.evaluate(() => {
      localStorage.setItem(
        'openmakruk_library',
        JSON.stringify([
          {
            id: 'pos_legacy',
            fen: 'rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w - - 0 1',
            title: 'Legacy entry',
            note: '',
            tags: [],
            createdAt: Date.now(),
            source: 'custom',
          },
        ]),
      );
    });
    await page.goto('/#/library');
    await page.reload();
    await waitForContentReady(page);
    // Entry survives the migration and renders.
    await expect(page.locator('.library-card')).toHaveCount(1);
    await expect(page.locator('.library-card-title')).toContainText('Legacy entry');
  });

  test('corrupt JSON falls back to default without crashing', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('openmakruk_settings', '{not valid json');
    });
    await page.goto('/#/settings');
    await waitForContentReady(page);
    // App rendered Settings page → did not crash on the corrupt blob.
    await expect(page.locator('body')).toContainText('🎨 หน้าตา');
  });

  test('legacy stats with embedded version field migrates cleanly', async ({ page }) => {
    // Pre-stores.ts shape carried its own `version: 1` field at the top
    // of the data. After migration through stores.ts the wrapper takes
    // over and the inner version is preserved as a back-compat hint.
    await page.evaluate(() => {
      const legacy = {
        version: 1,
        displayName: 'Migrant',
        createdAt: Date.now() - 1000 * 60 * 60 * 24,
        rating: 1234,
        totalGames: 5,
        byLevel: {
          easy:   { wins: 2, losses: 1, draws: 0 },
          medium: { wins: 1, losses: 1, draws: 0 },
          hard:   { wins: 0, losses: 0, draws: 0 },
          master: { wins: 0, losses: 0, draws: 0 },
        },
        history: [],
      };
      localStorage.setItem('openmakruk_stats', JSON.stringify(legacy));
    });
    await page.goto('/#/profile');
    await page.reload();
    await waitForContentReady(page);
    // Rating preserved from legacy blob.
    await expect(page.locator('body')).toContainText('1234');
    await expect(page.locator('body')).toContainText('Migrant');

    // Subsequent writes should now use the wrapper.
    const wrapped = (await readStore<{ rating: number }>(page, 'openmakruk_stats')) ?? { rating: 0 };
    expect(wrapped.rating).toBe(1234);
  });
});
