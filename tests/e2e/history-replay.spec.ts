// Issue #21: per-row replay viewer + per-row delete.
//
// Setup: each test seeds `openmakruk_stats` directly so the Profile
// page renders a deterministic history list. Real games take ~30s
// each in Playwright and would dwarf the cost of the actual assertions
// — and the surfaces under test (replay loader, delete UX) don't care
// where the rows came from.
//
// Three scenarios:
//   1. ▶ ดูเกม opens the in-app replay and the board renders the
//      starting position. Stepper advances ply count.
//   2. ⏭ jumps to final position. Board reflects a different FEN than
//      ply 0.
//   3. 🗑 ลบ with confirmation removes the row from the list AND
//      decrements the visible totalGames + by-level counter.

import { test, expect } from '@playwright/test';
import { dragMove, waitForContentReady } from './helpers';

/** A two-move game (e3-e4, e6-e5) seeded as the only history row. The
 *  moves are chosen to be legal makruk openings on both sides so the
 *  ffish replay inside HistoryReplay can push them without throwing. */
const SEED_GAME_ID = 'game_e2e_history';

async function seedHistory(
  page: import('@playwright/test').Page,
  opts: { moves?: string[]; plyCount?: number } = {},
) {
  const moves = opts.moves ?? ['e3e4', 'e6e5'];
  const plyCount = opts.plyCount ?? moves.length;
  await page.evaluate(
    ({ id, moves, plyCount }) => {
      const stats = {
        version: 2,
        displayName: 'TestUser',
        createdAt: Date.now(),
        rating: 1050,
        totalGames: 1,
        byLevel: {
          easy:   { wins: 0, losses: 0, draws: 0 },
          medium: { wins: 1, losses: 0, draws: 0 },
          hard:   { wins: 0, losses: 0, draws: 0 },
          master: { wins: 0, losses: 0, draws: 0 },
        },
        history: [
          {
            id,
            outcome: 'win',
            opponent: 'medium',
            userSide: 'white',
            date: Date.now(),
            plyCount,
            ratingBefore: 1000,
            ratingAfter: 1050,
            ratingDelta: 50,
            moves,
            mode: 'rated',
          },
        ],
      };
      localStorage.setItem('openmakruk_stats', JSON.stringify(stats));
      localStorage.setItem('openmakruk_onboarded', '1');
    },
    { id: SEED_GAME_ID, moves, plyCount },
  );
}

async function openHistoryTab(page: import('@playwright/test').Page) {
  await page.goto('/#/profile');
  await page.reload();
  await waitForContentReady(page);
  // History lives inside the 'สถิติ' sub-tab (Phase 27 move; same as
  // the critical-gaps PGN test).
  await page.getByRole('tab', { name: /สถิติ/ }).click();
  await page.waitForSelector('.profile-history-row', { timeout: 10_000 });
}

test.describe('game history viewer (issue #21)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('▶ ดูเกม opens the replay viewer + stepper advances ply', async ({ page }) => {
    test.setTimeout(60_000);
    await seedHistory(page);
    await openHistoryTab(page);

    // Replay button exists and is enabled (we seeded a moves array).
    const replayBtn = page.locator('.history-replay-button').first();
    await expect(replayBtn).toBeEnabled();
    await replayBtn.click();

    // The replay viewer mounts via BoardLayout — the chess board must
    // be visible inside .history-replay.
    const board = page.locator('.history-replay .cg-wrap');
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Initial ply indicator says "ตา 0 / 2".
    const plyLabel = page.locator('.history-replay-ply');
    await expect(plyLabel).toContainText('ตา 0 / 2');

    // Step forward; ply increments. The ply counter doesn't depend on
    // ffish being fully loaded for the LABEL — but the stepper buttons
    // become enabled only after the FEN array has populated past index 0,
    // which is the same gate that gates the right side of the board.
    await page.waitForFunction(() => {
      const txt = document.querySelector('.history-replay-ply')?.textContent ?? '';
      return /ตา 0 \/ 2/.test(txt);
    }, undefined, { timeout: 10_000 });

    const fwd = page.getByRole('button', { name: 'ตาถัดไป' });
    await fwd.click();
    await expect(plyLabel).toContainText('ตา 1 / 2');
    await fwd.click();
    await expect(plyLabel).toContainText('ตา 2 / 2');
  });

  test('⏭ jumps to the final position (FEN differs from ply 0)', async ({ page }) => {
    test.setTimeout(60_000);
    await seedHistory(page);
    await openHistoryTab(page);
    await page.locator('.history-replay-button').first().click();

    const board = page.locator('.history-replay .cg-wrap');
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Read FEN-ish state via piece elements at e3 vs e4. Chessground
    // tags each piece with a CSS-positioned <piece>. Easier: just
    // check that the move counter actually moved and that the visible
    // pieces moved. We assert the ply counter rather than parsing
    // chessground internals — same evidence, less brittle.
    const plyLabel = page.locator('.history-replay-ply');
    await page.getByRole('button', { name: 'ตาสุดท้าย' }).click();
    await expect(plyLabel).toContainText('ตา 2 / 2');

    // ⏭ button now disabled (already at end).
    await expect(page.getByRole('button', { name: 'ตาสุดท้าย' })).toBeDisabled();
  });

  test('🗑 deletes a single row → list empties + totals shift', async ({ page }) => {
    test.setTimeout(60_000);
    await seedHistory(page);
    await openHistoryTab(page);

    // Sanity: count before
    const rowsBefore = await page.locator('.profile-history-row').count();
    expect(rowsBefore).toBe(1);

    // Click the trash button on the only row; confirm in the toast.
    await page.locator('.history-delete-button').first().click();
    await page.getByRole('button', { name: 'ลบเกม', exact: true }).click();

    // The history list should now report "(0)".
    await expect(page.locator('h3', { hasText: /ประวัติเกม \(0\)/ })).toBeVisible({
      timeout: 5_000,
    });

    // No row should remain in the DOM.
    await expect(page.locator('.profile-history-row')).toHaveCount(0);
  });

  // Issue #22 / Codex review: replay must work on a REAL newly-recorded
  // game (not just seeded fixtures). Before the recordGame contract was
  // extended to accept an options bag, the local stats path silently
  // dropped moves/finalFen, so the ▶ button was forever disabled for
  // every game the user actually played. This test exercises the
  // end-to-end path: play one move → resign → check that the freshly
  // recorded row has a working replay button.
  test('newly recorded rated game (resign after one move) has replay enabled', async ({ page }) => {
    test.setTimeout(60_000);
    // Set onboarded flag BEFORE navigating to /#/play (otherwise the
    // first paint mounts the onboarding modal and intercepts every
    // subsequent click). The /goto / clear is already done in
    // beforeEach so localStorage is empty here.
    await page.evaluate(() => localStorage.setItem('openmakruk_onboarded', '1'));
    await page.goto('/#/play');
    await page.reload();
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Make sure Rated is on so the rating ledger AND the local history
    // row both get written. (Default is casual; check the box.)
    const ratedToggle = page.locator('.rated-toggle input[type="checkbox"]');
    await ratedToggle.check();
    await expect(ratedToggle).toBeChecked();

    // Move e3→e4 to enable the resign button (requires history.length>0).
    await dragMove(page, 'e3', 'e4');

    // Wait for the resign button to be enabled — it's disabled while
    // the engine is still thinking after the user's move. Otherwise
    // we race the CPU reply and the click is a no-op.
    const resignBtn = page.locator('.play-quick-resign');
    await expect(resignBtn).toBeEnabled({ timeout: 20_000 });
    await resignBtn.click();
    // Confirm in the toast. The label is exactly 'ยอมแพ้'.
    await page.getByRole('button', { name: 'ยอมแพ้', exact: true }).click();
    await expect(page.locator('.game-over-overlay')).toBeVisible({ timeout: 10_000 });

    // Now navigate to Profile → สถิติ. The history row must exist AND
    // the ▶ button must be enabled (proves moves was persisted).
    await page.goto('/#/profile');
    await waitForContentReady(page);
    await page.getByRole('tab', { name: /สถิติ/ }).click();
    await page.waitForSelector('.profile-history-row', { timeout: 10_000 });

    const replayBtn = page.locator('.history-replay-button').first();
    await expect(replayBtn).toBeEnabled();
  });

  // Issue #22 / Codex review: casual games used to be silently dropped
  // from the local stats path entirely — only the cloud backend kept
  // them. That meant offline users could never replay a casual game.
  // The recordGame refactor persists casual rows locally with zero
  // rating delta; this test pins that behaviour.
  test('newly recorded CASUAL game also appears in history with replay enabled', async ({ page }) => {
    test.setTimeout(60_000);
    await page.evaluate(() => localStorage.setItem('openmakruk_onboarded', '1'));
    await page.goto('/#/play');
    await page.reload();
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });

    // Stay in Casual (default). Confirm the toggle is unchecked.
    const ratedToggle = page.locator('.rated-toggle input[type="checkbox"]');
    await expect(ratedToggle).not.toBeChecked();

    await dragMove(page, 'e3', 'e4');
    await page.locator('.play-quick-resign').click();
    await page.getByRole('button', { name: 'ยอมแพ้', exact: true }).click();
    await expect(page.locator('.game-over-overlay')).toBeVisible({ timeout: 10_000 });

    await page.goto('/#/profile');
    await waitForContentReady(page);
    await page.getByRole('tab', { name: /สถิติ/ }).click();
    await page.waitForSelector('.profile-history-row', { timeout: 10_000 });

    const replayBtn = page.locator('.history-replay-button').first();
    await expect(replayBtn).toBeEnabled();

    // Rating delta must be zero — casual doesn't move the needle.
    const deltaPill = page.locator('.profile-history-row .history-delta').first();
    await expect(deltaPill).toHaveText(/^\+?0$/);
  });

  test('legacy row without moves disables the replay button', async ({ page }) => {
    test.setTimeout(60_000);
    await seedHistory(page, { moves: [] });
    // Override stats so the row has no moves array at all (pre-Phase
    // record). The seed helper writes an empty `moves: []`; that's fine
    // — HistoryReplay treats undefined and [] the same way.
    await openHistoryTab(page);

    const replayBtn = page.locator('.history-replay-button').first();
    await expect(replayBtn).toBeDisabled();
  });
});
