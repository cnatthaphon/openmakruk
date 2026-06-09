// Client crash reporting (issue #46).
//
// Verifies the privacy + reliability contract of src/lib/errorReporter.ts
// end to end, by intercepting POST /api/errors:
//   - an uncaught error produces exactly one anonymous, PII-free report
//   - an identical error within the dedupe window is suppressed
//   - opting out (Settings toggle / flag) stops reports entirely

import { test, expect, type Request } from '@playwright/test';
import { clearAppState, pinTestApiBase } from './helpers';

type Captured = { headers: Record<string, string>; body: Record<string, unknown> };

/** Route-intercept /api/errors and collect every report POST. Fulfills
 *  locally so no real worker is needed. */
async function captureErrorReports(page: import('@playwright/test').Page): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route('**/api/errors', async (route, request: Request) => {
    if (request.method() === 'POST') {
      captured.push({
        headers: request.headers(),
        body: JSON.parse(request.postData() || '{}'),
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, id: 'test', receivedAt: 0 }),
    });
  });
  return captured;
}

test.describe('crash reporting (issue #46)', () => {
  test.beforeEach(async ({ page }) => {
    await pinTestApiBase(page);
  });

  test('an uncaught error sends one anonymous, PII-free report', async ({ page }) => {
    const reports = await captureErrorReports(page);
    await page.goto('/#/play');
    await clearAppState(page);
    // Reporting is on by default; make sure no stale opt-out lingers.
    await page.evaluate(() => localStorage.removeItem('openmakruk_errors'));

    // Fire a synthetic uncaught error the way the browser would.
    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'e2e-synthetic-crash',
          error: new Error('e2e-synthetic-crash'),
        }),
      );
    });

    await expect.poll(() => reports.length, { timeout: 5_000 }).toBe(1);
    const r = reports[0];

    // Anonymous: no bearer token attached.
    expect(r.headers['authorization']).toBeUndefined();
    // Carries the crash essentials...
    expect(r.body.message).toContain('e2e-synthetic-crash');
    expect(r.body.scope).toBe('window');
    expect(typeof r.body.buildSha).toBe('string');
    // ...but only a PAGE-LEVEL route — no id, no query, no hash.
    expect(r.body.urlPath).toBe('/play');
    expect(String(r.body.urlPath)).not.toContain('?');
    expect(String(r.body.urlPath)).not.toContain('#');
  });

  test('an identical error within the window is deduped', async ({ page }) => {
    const reports = await captureErrorReports(page);
    await page.goto('/#/play');
    await clearAppState(page);
    await page.evaluate(() => localStorage.removeItem('openmakruk_errors'));

    const fire = () =>
      page.evaluate(() => {
        window.dispatchEvent(
          new ErrorEvent('error', {
            message: 'dup-crash',
            error: new Error('dup-crash'),
          }),
        );
      });
    await fire();
    await fire();
    await fire();

    // Give any extra reports a chance to arrive, then assert only one did.
    await page.waitForTimeout(1_000);
    expect(reports.length).toBe(1);
  });

  test('opting out stops reports entirely', async ({ page }) => {
    const reports = await captureErrorReports(page);
    await page.goto('/#/play');
    await clearAppState(page);
    // Opt out, then reload so the flag is read fresh.
    await page.evaluate(() => localStorage.setItem('openmakruk_errors', 'off'));
    await page.goto('/#/play');

    await page.evaluate(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: 'should-not-send',
          error: new Error('should-not-send'),
        }),
      );
    });

    await page.waitForTimeout(1_000);
    expect(reports.length).toBe(0);
  });
});
