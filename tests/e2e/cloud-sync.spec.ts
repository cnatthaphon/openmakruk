// End-to-end cloud sync — frontend → worker → leaderboard.
//
// Pre-conditions (playwright.config.ts handles both):
//   - vite dev on localhost:5174
//   - wrangler dev on localhost:8789 (separate from manual :8787 and
//     the worker's own integration suite on :8788)
//
// These tests pin `openmakruk_api_base` to the worker URL via an
// init script so the singleton CloudflareBackend instance picks it up
// at module load (before the user's first interaction).
//
// What we verify:
//   1. Settings exposes a "Cloud Sync" section that registers an
//      anonymous user on first enable.
//   2. After enable, the bearer token is persisted and re-attached on
//      reload (no second registration call).
//   3. recordGame round-trips against the live worker — we call into
//      the page bundle directly because driving a full Makruk game to
//      completion in Playwright is overkill for an integration check.
//   4. The match leaderboard query returns our user once a rated win
//      has been recorded.

import { test, expect } from '@playwright/test';
import fixtures from '../../worker/tests/game-fixtures.json' with { type: 'json' };

const API_BASE = 'http://localhost:8789';

// Reuse the worker's pre-computed verified game so cloud-sync e2e
// writes pass server-side verification. The fixture's "winner" tells
// us which side the user must claim to play in order to claim a win.
const MATE = fixtures.mate;
const WINNER_SIDE = MATE.winner as 'white' | 'black';

test.use({
  // Reset stored state so cloud-sync starts unauthenticated, and point
  // the adapter at the test worker port.
  storageState: { cookies: [], origins: [] },
});

test.describe('cloud sync — frontend ↔ worker', () => {
  test.beforeEach(async ({ page }) => {
    // The API base override must be applied BEFORE the bundle loads,
    // otherwise the singleton adapter caches the default port.
    await page.addInitScript((apiBase) => {
      localStorage.setItem('openmakruk_api_base', apiBase);
      // Skip the welcome modal so the Settings page is reachable in
      // one click without dismissing onboarding first.
      localStorage.setItem('openmakruk_onboarded', '1');
    }, API_BASE);
  });

  test('Settings exposes Cloud Sync section with an enable button', async ({ page }) => {
    await page.goto('/#/settings');
    // The section's <h3> is the unambiguous anchor — exact match
    // since "Cloud Sync" might appear elsewhere as substring.
    await expect(page.getByRole('heading', { name: /Cloud Sync/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /เปิด cloud sync/ })).toBeVisible();
  });

  test('enable → registers a fresh anonymous account against the live worker', async ({ page }) => {
    await page.goto('/#/settings');

    // Click the enable button and wait for the UI to flip to the
    // "connected" state. enableCloud() does ONE network round-trip
    // (registerAnon), which on a healthy worker resolves in ~50ms.
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    // Token should be persisted in localStorage under the cloud-session
    // key. We don't inspect the raw value (it's secret-ish) but we do
    // confirm the structure: wrapper { v, d: { token, userId, ... } }.
    const session = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed.d ?? parsed;
      } catch {
        return null;
      }
    });
    expect(session).not.toBeNull();
    expect(session.token.length).toBeGreaterThanOrEqual(32);
    expect(session.userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('reload re-attaches the same session (no double registration)', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      return raw ? JSON.parse(raw).d : null;
    });

    await page.reload();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      return raw ? JSON.parse(raw).d : null;
    });
    expect(after.userId).toBe(before.userId);
    expect(after.token).toBe(before.token);
  });

  test('recordGame round-trips: a win raises server-side rating', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    // Drive the adapter from inside the page bundle. Move list comes
    // from the verified-game fixture so the server-side verifier
    // accepts the write (illegal-move sequences would be 422'd).
    const result = await page.evaluate(async ({ mate, winnerSide }) => {
      // @ts-expect-error — dynamic ESM import resolved at runtime
      const backendMod = await import('/src/lib/backend/index.ts');
      // @ts-expect-error — dynamic
      const sessionMod = await import('/src/lib/backend/cloudSession.ts');
      const backend = backendMod.getBackend();
      const session = sessionMod.loadSession();
      if (!backend.recordGame) throw new Error('recordGame not supported');
      const res = await backend.recordGame(session.token, {
        opponent: 'medium',
        userSide: winnerSide,
        outcome: 'win',
        plyCount: mate.moves.length,
        moves: mate.moves,
        finalFen: mate.finalFen,
        timeControlId: null,
        mode: 'rated',
      });
      return res;
    }, { mate: MATE, winnerSide: WINNER_SIDE });
    expect(result.ratingBefore).toBe(1000);
    expect(result.ratingDelta).toBeGreaterThan(0);
    expect(result.ratingAfter).toBeGreaterThan(1000);
    expect(result.verified).toBe(true);
  });

  test('after a rated win, this user appears on the match leaderboard', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    const userId = await page.evaluate(async ({ mate, winnerSide }) => {
      // @ts-expect-error dynamic
      const backendMod = await import('/src/lib/backend/index.ts');
      // @ts-expect-error dynamic
      const sessionMod = await import('/src/lib/backend/cloudSession.ts');
      const backend = backendMod.getBackend();
      const session = sessionMod.loadSession();
      // Two wins vs hard (verified). Reusing the same fixture twice
      // is fine — server only checks each game in isolation, not
      // that the user has unique move sequences across games.
      for (let i = 0; i < 2; i++) {
        await backend.recordGame(session.token, {
          opponent: 'hard',
          userSide: winnerSide,
          outcome: 'win',
          plyCount: mate.moves.length,
          moves: mate.moves,
          finalFen: mate.finalFen,
          mode: 'rated',
        });
      }
      return session.userId;
    }, { mate: MATE, winnerSide: WINNER_SIDE });

    const lb = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const backendMod = await import('/src/lib/backend/index.ts');
      const backend = backendMod.getBackend();
      const entries = await backend.fetchMatchLeaderboard(200);
      return entries;
    });
    const me = (lb as { userId: string; score: number }[]).find(
      (e) => e.userId === userId,
    );
    expect(me).toBeDefined();
    expect(me!.score).toBeGreaterThan(0);
  });

  test('Profile shows the global match leaderboard once cloud sync is on', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    // Record a rated win against master so we have something to show
    // on the leaderboard when Profile mounts. recordGame from inside
    // the page bundle is the same path the real game-end effect uses.
    await page.evaluate(async ({ mate, winnerSide }) => {
      // @ts-expect-error dynamic ESM
      const backendMod = await import('/src/lib/backend/index.ts');
      // @ts-expect-error dynamic
      const sessionMod = await import('/src/lib/backend/cloudSession.ts');
      const backend = backendMod.getBackend();
      const session = sessionMod.loadSession();
      await backend.recordGame(session.token, {
        opponent: 'master',
        userSide: winnerSide,
        outcome: 'win',
        plyCount: mate.moves.length,
        moves: mate.moves,
        finalFen: mate.finalFen,
        mode: 'rated',
      });
    }, { mate: MATE, winnerSide: WINNER_SIDE });

    // Navigate to Profile. The Global section only renders when
    // backend.isOnline() (which we just enabled).
    await page.goto('/#/profile');
    await expect(page.getByRole('heading', { name: /Global Match Leaderboard/ })).toBeVisible({
      timeout: 10_000,
    });
    // Our row should be present and highlighted via .is-me.
    await expect(page.locator('.profile-global-lb-row.is-me')).toBeVisible({ timeout: 10_000 });
  });

  test('disable clears the session + reverts to offline', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    // Disable triggers a confirm toast — pick the destructive option.
    await page.getByRole('button', { name: /ปิด cloud sync/ }).click();
    // Toast's destructive OK is exactly "ปิด" (no extra text). The
    // section's own button reads "🔌 ปิด cloud sync" so we disambiguate
    // by exact name match.
    await page.getByRole('button', { name: 'ปิด', exact: true }).click();

    // Section flips back to the enable state.
    await expect(page.getByRole('button', { name: /เปิด cloud sync/ })).toBeVisible({
      timeout: 5_000,
    });
    const stored = await page.evaluate(() => localStorage.getItem('openmakruk_cloud_session'));
    expect(stored).toBeNull();
  });
});
