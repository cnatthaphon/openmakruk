// PWA install-readiness — verify the manifest + service worker so
// "Add to home screen" remains available on real devices.
//
// We can't easily trigger the install prompt in headless Playwright
// (browser-specific UI), but we CAN assert the pieces that make the
// prompt appear: a valid manifest, reachable icons, and a service
// worker that registers without error. If any of these regress, the
// browser would silently disable installability.

import { test, expect } from '@playwright/test';

test.describe('PWA install-readiness', () => {
  test('manifest is reachable and well-formed', async ({ page, request }) => {
    await page.goto('/');
    const link = await page.locator('link[rel="manifest"]').first().getAttribute('href');
    expect(link).toBeTruthy();
    const res = await request.get(link!);
    expect(res.ok()).toBe(true);
    const body = await res.json() as {
      name?: string;
      short_name?: string;
      start_url?: string;
      icons?: Array<{ src: string }>;
      display?: string;
    };
    expect(body.name).toMatch(/OpenMakruk/);
    expect(body.short_name).toBeTruthy();
    expect(body.start_url).toBeTruthy();
    expect(body.display).toBeTruthy();
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons!.length).toBeGreaterThan(0);
  });

  test('every icon referenced by the manifest serves a 200', async ({ page, request }) => {
    await page.goto('/');
    const link = await page.locator('link[rel="manifest"]').first().getAttribute('href');
    const m = await (await request.get(link!)).json() as {
      icons: Array<{ src: string }>;
    };
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.ok(), `icon ${icon.src} should serve`).toBe(true);
    }
  });

  test('service worker registers without error', async ({ page }) => {
    // Capture console errors so a SW boot failure is visible.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
    });
    await page.goto('/');
    // Wait for SW registration to settle (it's deferred behind load
    // event in index.html).
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null
        || navigator.serviceWorker.getRegistration().then((r) => r !== undefined),
      undefined,
      { timeout: 10_000 },
    );
    expect(errors.filter((e) => /service worker|sw\.js/i.test(e))).toEqual([]);
  });
});
