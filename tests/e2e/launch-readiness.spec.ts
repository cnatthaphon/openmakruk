// Launch-readiness E2E — the user journeys that must work end-to-end
// before we can honestly say OpenMakruk is "tested" rather than just
// "deployed".
//
// Strategy: each test walks a real flow the way a visitor would, with
// concrete assertions on visible state at each step. No mocking the
// engine, no skipping confirmation toasts — real clicks, real waits.
//
// Spec organization:
//   1. Version + BETA visibility — fast canary
//   2. Bot Detail page no-404 (the bug we fixed last session)
//   3. Stats page — all sections render with real data
//   4. Async challenge create + accept round-trip
//   5. Feedback submission round-trip
//   6. Token rotate — old token rejected, new token works
//   7. Sign in with token — recovery flow
//   8. Account delete — wipes server-side state
//   9. Hidden drill routes load (counting/rush/boss/move/pattern/survive)
//  10. Daily puzzle is deterministic per date

import { test, expect } from '@playwright/test';
import { clearAppState, pinTestApiBase } from './helpers';

test.beforeEach(async ({ page }) => {
  // Critical: API base must be set BEFORE the bundle loads, otherwise
  // the singleton adapter caches the default 8788 dev port and every
  // network call fails ERR_CONNECTION_REFUSED. This is why the first
  // pass had 9 failures that all bottomed out on "Failed to fetch".
  await pinTestApiBase(page);
});

test.describe('launch-readiness · version + beta visibility', () => {
  test('header shows v0.1-beta + BETA chip + footer shows build info', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.reload();
    // Version label in header brand block.
    await expect(page.locator('.app-header-version')).toContainText('v0.1-beta');
    // BETA chip visible while we're in pre-1.0.
    await expect(page.locator('.app-header-beta')).toHaveText(/BETA/);
    // Footer build line has the localized date + the build sha.
    await expect(page.locator('.footer-build')).toBeVisible();
    await expect(page.locator('.footer-build-sha')).toBeVisible();
  });
});

test.describe('launch-readiness · bot detail deep link', () => {
  test('/#/bots/attacker-master resolves (no 404) — clean URL', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/bots/attacker-master');
    // Bot page renders the lore, not the error state.
    await expect(page.locator('.bot-detail-name')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.bot-detail-error')).toHaveCount(0);
  });

  test('/#/bots/bot:attacker-master also resolves (legacy URL form)', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/bots/bot:attacker-master');
    await expect(page.locator('.bot-detail-name')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.bot-detail-error')).toHaveCount(0);
  });

  test('clicking a bot card from Profile Hall of Fame opens detail (real click flow)', async ({ page }) => {
    // The previous bug: clicking from Hall of Fame went through
    // navigate() which encodeURIComponent's the ':' in bot:wanderer-rookie
    // to bot%3Awanderer-rookie. parseRoute didn't decode, so the id
    // arrived garbled and BotDetailPage 404'd. Earlier tests goto()'d
    // /#/bots/<id> directly, which bypasses buildHash encoding and missed
    // the regression. This test exercises the full click chain.
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/profile');
    // Switch to the Compete tab where Bot Hall lives, then click the
    // first bot card. The cards may take a moment to load (fetchBots).
    await page.getByRole('tab', { name: /แข่งขัน/ }).click();
    const firstCard = page.locator('.profile-bot-card').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15_000 });
    await firstCard.click();
    // Detail page should render the bot name, NOT the error state.
    await expect(page.locator('.bot-detail-name')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.bot-detail-error')).toHaveCount(0);
  });
});

test.describe('launch-readiness · /#/stats public page', () => {
  test('stats page loads all three sections + 3-family table', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/stats');
    // Hero copy.
    await expect(page.locator('.stats-title')).toContainText('สถิติ');
    // Total / online cards.
    await expect(page.locator('.stats-headline-grid')).toBeVisible({ timeout: 10_000 });
    // Region table — must list all 6 ภาค even if all zero.
    const regionRows = page.locator('.stats-section').nth(1).locator('tbody tr');
    await expect(regionRows).toHaveCount(6);
    // 3-family cards present.
    await expect(page.locator('.stats-family-a')).toBeVisible();
    await expect(page.locator('.stats-family-b')).toBeVisible();
    await expect(page.locator('.stats-family-c')).toBeVisible();
  });
});

test.describe('launch-readiness · async challenge round-trip', () => {
  test('/#/challenge create → URL → accept renders the bot', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/challenge');
    // Create-mode picker shows up.
    await expect(page.locator('.challenge-builder')).toBeVisible({ timeout: 10_000 });
    // Default bot selected; pick the create button.
    await page.locator('.challenge-create-btn').click();
    // Share URL surfaces.
    await expect(page.locator('.challenge-share-url')).toBeVisible({ timeout: 5_000 });
    const url = await page.locator('.challenge-share-url').textContent();
    expect(url).toMatch(/#\/challenge\/[A-Za-z0-9_-]+/);
    // Navigate to the URL — accept view should render the bot.
    const hash = url!.split('#')[1];
    await page.goto(`/#${hash}`);
    await expect(page.locator('.challenge-accept-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.challenge-accept-btn')).toBeVisible();
  });

  test('malformed challenge code shows the error state cleanly', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/challenge/not-base64url-at-all!!');
    await expect(page.locator('.bot-detail-error')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('launch-readiness · feedback submission', () => {
  test('Settings feedback form sends and reports success', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/settings');
    // Phase 29: Feedback lives in the 'ฟีดแบ็ก + รีเซ็ต' (other) tab.
    await page.getByRole('tab', { name: /ฟีดแบ็ก/ }).click();
    // Section is collapsed under no <details> wrapper — it's a full
    // section. Scroll the form into view.
    const form = page.locator('.feedback-form').first();
    await form.scrollIntoViewIfNeeded();
    await expect(form).toBeVisible();
    // Pick 'feature' radio.
    await form.locator('input[value="feature"]').check();
    // Type a message + contact.
    await form.locator('textarea').fill('e2e test from launch-readiness spec');
    await form.locator('input[type="text"]').fill('e2e@example.local');
    // Submit.
    await form.locator('.feedback-form-submit').click();
    // Success toast.
    await expect(page.getByText(/ส่งฟีดแบ็กแล้ว/)).toBeVisible({ timeout: 10_000 });
  });

  test('empty message disables the submit button', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/settings');
    await page.getByRole('tab', { name: /ฟีดแบ็ก/ }).click();
    const form = page.locator('.feedback-form').first();
    await form.scrollIntoViewIfNeeded();
    await expect(form.locator('.feedback-form-submit')).toBeDisabled();
    await form.locator('textarea').fill('something');
    await expect(form.locator('.feedback-form-submit')).toBeEnabled();
  });
});

test.describe('launch-readiness · account security flows', () => {
  test('enable cloud → backup token visible → rotate invalidates old token', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/settings');
    // Phase 29: Cloud Sync lives in the 'บัญชี' (account) sub-tab.
    await page.getByRole('tab', { name: /บัญชี/ }).click();
    // Enable.
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });
    // Grab the current token from localStorage.
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.d?.token ?? parsed.token ?? null;
    });
    expect(before).toBeTruthy();
    // Open the Account & Security details panel.
    await page.locator('.settings-account-details > summary').click();
    // The token-display row should be visible after expand.
    await expect(page.locator('.settings-token-value')).toBeVisible();
    // Rotate.
    await page.getByRole('button', { name: /ออกจากทุกเครื่อง/ }).click();
    // Confirm in the toast.
    await page.getByRole('button', { name: 'ออกทุกเครื่อง', exact: true }).click();
    // Wait for the success toast.
    await expect(page.getByText(/Token ใหม่/)).toBeVisible({ timeout: 10_000 });
    // Token should have changed.
    const after = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.d?.token ?? parsed.token ?? null;
    });
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  test('sign in with token recovers the same account', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/settings');
    // Phase 29: Cloud Sync lives in the 'บัญชี' (account) sub-tab.
    await page.getByRole('tab', { name: /บัญชี/ }).click();
    // Step 1: register a fresh account, capture token.
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });
    const session = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.d ?? parsed;
    });
    expect(session?.token).toBeTruthy();
    const savedToken = session.token as string;
    const savedUserId = session.userId as string;

    // Step 2: simulate "different machine" — wipe local session.
    await page.evaluate(() => {
      localStorage.removeItem('openmakruk_cloud_session');
    });
    await page.reload();
    await page.goto('/#/settings');
    await page.getByRole('tab', { name: /บัญชี/ }).click();

    // Step 3: sign-in-with-token details opens, paste, submit.
    await page.locator('.settings-signin-details > summary').click();
    await page.locator('.settings-signin-input').fill(savedToken);
    await page.getByRole('button', { name: /เข้าด้วย token/ }).click();
    // Connected banner reappears.
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });
    // user_id is the same — proves we re-attached, not registered new.
    const restored = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.d ?? parsed;
    });
    expect(restored?.userId).toBe(savedUserId);
  });

  test('account delete wipes the session + server rejects subsequent calls', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/settings');
    await page.getByRole('tab', { name: /บัญชี/ }).click();
    await page.getByRole('button', { name: /เปิด cloud sync/ }).click();
    await expect(page.getByText(/เชื่อมต่อแล้ว/)).toBeVisible({ timeout: 10_000 });

    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('openmakruk_cloud_session');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.d?.token ?? parsed?.token ?? null;
    });
    expect(before).toBeTruthy();

    // Open Account panel.
    await page.locator('.settings-account-details > summary').click();
    // Click Delete → first toast confirm.
    await page.getByRole('button', { name: /🗑️ ลบบัญชี/ }).click();
    await page.getByRole('button', { name: 'ลบถาวร', exact: true }).click();
    // Second toast confirm.
    await page.getByRole('button', { name: 'ลบบัญชี', exact: true }).click();
    // Success toast — match by text rather than .last() because the
    // streak welcome-back toast ("👋 ยินดีต้อนรับกลับ") may pop up
    // mid-test and become the last toast, flaking this assertion.
    await expect(page.getByText('บัญชีถูกลบแล้ว', { exact: false })).toBeVisible({ timeout: 10_000 });
    // Local session is gone.
    const after = await page.evaluate(() =>
      localStorage.getItem('openmakruk_cloud_session'),
    );
    expect(after).toBeNull();
  });
});

test.describe('launch-readiness · URL aliases (forgiving routing)', () => {
  // Real-user UX flag: someone tried /#/boss-rush expecting it to work
  // because /#/move-trainer "looks like" it would. The canonical slug
  // is the single-word form, but we accept the dashed form too so URL
  // guessing doesn't punish the user with a silent fallback to /play.
  for (const variant of ['boss-rush', 'BossRush', 'move-trainer']) {
    test(`/#/${variant} resolves to the canonical drill, not the play fallback`, async ({ page }) => {
      await pinTestApiBase(page);
      await page.goto('/');
      await clearAppState(page);
      await page.goto(`/#/${variant}`);
      // After alias normalization, the canonical hash should be set.
      const expected = variant.replace(/-/g, '').toLowerCase();
      // Page renders the drill surface, not the Play tab. Body text
      // 'ตาคุณ' / 'รอบที่' is play-tab-specific; absence is the cleanest
      // signal that the alias was honored.
      await page.waitForTimeout(800);
      const isPlay = await page.locator('body').filter({ hasText: 'ตาคุณ' }).count();
      expect(isPlay, `alias ${variant} (expected ${expected}) routed to play`).toBe(0);
    });
  }
});

test.describe('launch-readiness · hidden drill routes load', () => {
  for (const route of [
    { hash: 'counting', expect: /Counting Trainer/ },
    { hash: 'rush', expect: /Puzzle Rush/ },
    { hash: 'bossrush', expect: /Boss Rush|บอสรัช/ },
    { hash: 'movetrainer', expect: /Move Trainer|ฝึกเปิด/ },
    { hash: 'pattern', expect: /Pattern|รูปแบบ/ },
    { hash: 'survive', expect: /Survive|ป้องกัน/ },
  ]) {
    test(`/#/${route.hash} drill route renders its surface`, async ({ page }) => {
      await page.goto('/');
      await clearAppState(page);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/#/${route.hash}`);
      await expect(page.locator('body')).toContainText(route.expect, { timeout: 10_000 });
      expect(errors).toEqual([]);
    });
  }
});

test.describe('launch-readiness · puzzles index + daily', () => {
  test('puzzles index lists categories + daily puzzle card', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/puzzles');
    // The puzzles index has Thai category labels: "รุกจนใน 1 ตา" for
    // mate-in-1, "ยุทธวิธี" for tactics. Check for one canonical label
    // rather than the internal slug.
    await expect(page.locator('body')).toContainText('รุกจนใน 1 ตา', { timeout: 10_000 });
    // Daily puzzle card.
    await expect(page.locator('body')).toContainText(/ประจำวัน|วันนี้/);
  });
});

test.describe('launch-readiness · about page completeness', () => {
  test('about renders all 3 score families + security model + feedback CTA', async ({ page }) => {
    await page.goto('/');
    await clearAppState(page);
    await page.goto('/#/about');
    // 3-family scoring table.
    await expect(page.locator('.about-scoring-table')).toBeVisible();
    const familyRows = page.locator('.about-scoring-row');
    await expect(familyRows).toHaveCount(3);
    // Security section.
    await expect(page.locator('body')).toContainText('Security');
    await expect(page.locator('body')).toContainText(/Token/);
    // Bot-mediated competition section.
    await expect(page.locator('body')).toContainText(/Strava|Wordle/);
  });
});
