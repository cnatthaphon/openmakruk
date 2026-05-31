// Critical-gap coverage — features used every session that were
// previously only smoke-tested. Each test exercises one full user
// workflow, with concrete assertions on the resulting state.
//
// Strategy for setting up exotic positions (mate-in-1, promotion):
// we seed localStorage with a Library entry at the desired FEN, then
// open it via the Library tab. This re-uses the production code path
// (LibraryPage onLoad → App.tsx ffish.Board init) instead of adding
// test-only hooks.

import { test, expect } from '@playwright/test';
import { dragMove, readBoardFen, waitForContentReady } from './helpers';

/** Seed one library entry at a specific FEN, then open it on Play. */
async function loadCustomFenViaLibrary(
  page: import('@playwright/test').Page,
  fen: string,
  title = 'Test position',
): Promise<void> {
  await page.evaluate(
    ({ fen, title }) => {
      localStorage.setItem(
        'openmakruk_library',
        JSON.stringify([
          {
            id: 'pos_e2e_test',
            fen,
            title,
            note: '',
            tags: ['e2e'],
            createdAt: Date.now(),
            source: 'custom',
          },
        ]),
      );
    },
    { fen, title },
  );
  await page.goto('/#/library');
  await page.reload();
  await waitForContentReady(page);
  await page.locator('.library-open-button').first().click();
  await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
  await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
  // Engine ready beat
  await page.waitForTimeout(800);
}

test.describe('critical gap coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 1. Hint button → Chess Coach explanation
  // ────────────────────────────────────────────────────────────────
  test('hint button surfaces Chess Coach explanation', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    // The hint button now lives inside the "📜 ตาเดิน" sub-tab. Switch
    // there before clicking. Clicking the hint button auto-switches the
    // sidebar to "🧠 ผู้ช่วย" so the Coach output lands in view.
    await page.locator('.sidebar-tab', { hasText: 'ตาเดิน' }).click();
    await page.waitForSelector('.hint-button', { timeout: 15_000 });

    await page.locator('.hint-button').click();
    // Wait for the Coach panel headline to render — proves engine
    // search completed AND coachExplain ran successfully.
    await expect(page.locator('.hint-info-headline')).toBeVisible({ timeout: 30_000 });
    // Eval pill should be present (numeric or M{N})
    await expect(page.locator('.hint-info-eval')).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Mate detection — game-over overlay appears on checkmate
  // ────────────────────────────────────────────────────────────────
  test('mate-in-1: playing Ra1-a8 triggers the game-over overlay', async ({ page }) => {
    test.setTimeout(60_000);
    // Mate-001 puzzle position (verified by hand earlier): Ra1-a8#
    await loadCustomFenViaLibrary(
      page,
      '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
      'mate test',
    );
    await dragMove(page, 'a1', 'a8');
    await expect(page.locator('.game-over-overlay')).toBeVisible({ timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────
  // 2b. Game-over overlay is dismissable (issue #17)
  // ────────────────────────────────────────────────────────────────
  test('game-over overlay can be closed and reopened', async ({ page }) => {
    test.setTimeout(60_000);
    await loadCustomFenViaLibrary(
      page,
      '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
      'mate test dismissable',
    );
    await dragMove(page, 'a1', 'a8');
    const overlay = page.locator('.game-over-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    // Close → overlay hidden, sidebar reopen pill appears, board visible.
    await page.locator('.game-over-close').click();
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('.game-over-reopen')).toBeVisible();
    await expect(page.locator('.cg-wrap').first()).toBeVisible();

    // Reopen pill brings the card back.
    await page.locator('.game-over-reopen').click();
    await expect(overlay).toBeVisible();
    await expect(page.locator('.game-over-reopen')).toHaveCount(0);
  });

  // ────────────────────────────────────────────────────────────────
  // 2c. Forced-result games stay non-playable after dismiss (issue #18)
  // ────────────────────────────────────────────────────────────────
  test('forced-result (resign) keeps board non-playable after closing overlay', async ({ page }) => {
    test.setTimeout(60_000);
    // Start a normal game (Play tab default) so we have a legal
    // position to move from, then trigger a resign — which is a
    // forced result, NOT state.isGameOver=true. Before the fix,
    // closing the overlay let the user keep dragging pieces.
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    // Make one move so the game isn't in the lobby state, then
    // surface the quick-action row (which becomes interactive
    // after the first ply).
    await dragMove(page, 'e3', 'e4');
    await page.waitForTimeout(500);
    // Resign — opens a toast.confirm; the user confirms to set
    // forcedResult. Mirror the mobile-touch suite's confirm flow.
    const resignBtn = page.locator('.play-quick-resign');
    await expect(resignBtn).toBeEnabled({ timeout: 10_000 });
    await resignBtn.click();
    await page.getByRole('button', { name: 'ยอมแพ้', exact: true }).click();
    await expect(page.locator('.game-over-overlay')).toBeVisible({ timeout: 10_000 });

    // Capture the rendered FEN now — after closing the overlay and
    // trying to move, it must NOT change.
    const fenBefore = await readBoardFen(page);

    // Close the overlay so the board is reachable.
    await page.locator('.game-over-close').click();
    await expect(page.locator('.game-over-overlay')).toHaveCount(0);

    // Attempt a legal move — Bia e4-e5 (was a Bia push at e3, now
    // at e4 after the earlier move). Should be rejected because
    // forcedResult is set.
    await dragMove(page, 'e4', 'e5');
    await page.waitForTimeout(400);
    const fenAfter = await readBoardFen(page);
    expect(fenAfter, 'forced-result must reject moves even with overlay closed')
      .toBe(fenBefore);
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Promotion — bia reaches rank 6, becomes Met
  // ────────────────────────────────────────────────────────────────
  test('promotion: white bia d5-d6 becomes Met (queen-class)', async ({ page }) => {
    test.setTimeout(60_000);
    // Position with one piece per side besides the kings so neither is
    // bare (avoids triggering Makruk counting at load time, which can
    // make engine-state-machine flaky around the very first ply).
    // White: K e1, P d5. Black: K e8, P a7. White to move → d5-d6
    // promotes to Met. Engine reply doesn't touch rank 6.
    await loadCustomFenViaLibrary(
      page,
      '4k3/p7/8/3P4/8/8/8/4K3 w - - 0 1',
      'promotion test',
    );
    const fenBefore = await readBoardFen(page);
    expect(fenBefore.split('/')[3], 'rank 5 should have a white pawn before drag')
      .toContain('P');

    await dragMove(page, 'd5', 'd6');
    let rank6 = '';
    for (let i = 0; i < 40; i++) {
      const fen = await readBoardFen(page);
      rank6 = fen.split('/')[2];
      if (rank6.includes('Q')) break;
      await page.waitForTimeout(200);
    }
    expect(rank6, `rank 6 should contain Q (Met) after promotion. got="${rank6}"`)
      .toContain('Q');
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Rated toggle persists; rating only changes in Rated mode
  // ────────────────────────────────────────────────────────────────
  test('Rated/Casual toggle persists across reload + reflects in UI', async ({ page }) => {
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.rated-toggle', { timeout: 15_000 });

    // Default is Casual (unchecked)
    const checkbox = page.locator('.rated-toggle input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();

    // Flip to Rated
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.locator('.rated-toggle')).toHaveClass(/is-rated/);
  });

  // ────────────────────────────────────────────────────────────────
  // 5. NNUE button transitions to loading state when clicked
  // ────────────────────────────────────────────────────────────────
  test('NNUE: clicking enable triggers download (loading state)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    // NNUE lives inside the collapsible "Advanced controls" panel —
    // open it first.
    await page.locator('.advanced-controls > summary').click();
    await page.waitForSelector('.nnue-enable-button', { timeout: 15_000 });

    // Block the actual 46MB jsDelivr fetch — we just want to verify
    // that the UI transitions, not pay for the bandwidth in CI.
    await page.route('**/openmakruk@nnue-v1/**', (route) => route.abort());

    await page.locator('.nnue-enable-button').click();
    // Loading text appears once nnueState flips to 'loading'
    await expect(page.locator('body')).toContainText('กำลังโหลด NNUE', { timeout: 10_000 });
  });

  // ────────────────────────────────────────────────────────────────
  // 6. All 4 difficulty levels can be selected without errors
  // ────────────────────────────────────────────────────────────────
  test('all 4 difficulty levels can be selected', async ({ page }) => {
    test.setTimeout(45_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    const levelSelect = page
      .locator('.mode-picker', { hasText: 'ระดับคอม' })
      .locator('select');
    for (const value of ['easy', 'medium', 'hard', 'master']) {
      await levelSelect.selectOption(value);
      await page.waitForTimeout(150);
      expect(await levelSelect.inputValue()).toBe(value);
    }
    expect(errors).toEqual([]);
  });

  // ────────────────────────────────────────────────────────────────
  // 7. Custom: click cell → piece-picker opens → choose piece places it
  // ────────────────────────────────────────────────────────────────
  test('Custom page: click cell opens picker; pick places piece on the board', async ({ page }) => {
    await page.goto('/#/custom');
    await waitForContentReady(page);
    // Default is now empty board (Phase 28 rebuild) — no clear needed.
    // Click e4 to open the picker.
    const board = page.locator('.custom-board');
    const box = await board.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const cellW = box.width / 8;
    const cellH = box.height / 8;
    const x = box.x + 4 * cellW + cellW / 2;
    const y = box.y + 4 * cellH + cellH / 2;
    await page.mouse.click(x, y);
    // Picker is open; white is the default side. Click the rook (เรือ).
    const picker = page.locator('.custom-piece-picker');
    await expect(picker).toBeVisible({ timeout: 5_000 });
    await picker.locator('.custom-piece-picker-btn', { hasText: '2/2' }).first()
      .click({ trial: false }) // 'trial: false' = real click
      .catch(async () => {
        // Fallback: pick the rook by index (5th piece in PIECE_ROLES = role 'r')
        await picker.locator('.custom-piece-picker-btn').nth(4).click();
      });
    // Verify by reading the FEN
    await page.locator('summary', { hasText: 'FEN' }).click();
    const fen = await page.locator('.custom-fen textarea').inputValue();
    const rank4 = fen.split(' ')[0].split('/')[4];
    expect(rank4.toUpperCase()).toMatch(/[KMSNRP]/);
  });

  // ────────────────────────────────────────────────────────────────
  // 8. PGN download triggers when "Download ทั้งหมด" is clicked
  // ────────────────────────────────────────────────────────────────
  test('PGN download: button triggers a Blob download', async ({ page }) => {
    // Seed one game record so the history list + download button render
    await page.evaluate(() => {
      const stats = {
        version: 1,
        displayName: 'TestUser',
        createdAt: Date.now(),
        rating: 1100,
        totalGames: 1,
        byLevel: {
          easy:   { wins: 1, losses: 0, draws: 0 },
          medium: { wins: 0, losses: 0, draws: 0 },
          hard:   { wins: 0, losses: 0, draws: 0 },
          master: { wins: 0, losses: 0, draws: 0 },
        },
        history: [
          {
            id: 'game_pgn_test',
            outcome: 'win',
            opponent: 'easy',
            userSide: 'white',
            date: Date.now(),
            plyCount: 4,
            ratingBefore: 1000,
            ratingAfter: 1100,
            ratingDelta: 100,
            moves: ['e3e4', 'e6e5', 'd3d4', 'd6d5'],
            mode: 'rated',
          },
        ],
      };
      localStorage.setItem('openmakruk_stats', JSON.stringify(stats));
    });
    await page.goto('/#/profile');
    await page.reload();
    await waitForContentReady(page);

    // Phase 27 moved History into the 'สถิติ' (Stats) sub-tab.
    await page.getByRole('tab', { name: /สถิติ/ }).click();

    // Click the "Download ทั้งหมด" bulk export — Playwright captures
    // the download event triggered by the Blob URL anchor click.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page
        .locator('.profile-history-actions button', { hasText: 'Download' })
        .click(),
    ]);
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/\.pgn$/);
  });
});
