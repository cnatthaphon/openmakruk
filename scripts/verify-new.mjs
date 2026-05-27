import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const route of ['/#/stats', '/#/challenge']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('openmakruk_onboarded', '1'); } catch { /* storage may be blocked */ }
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('https://www.openmakruk.com' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const boundary = await page.locator('.error-boundary').count();
  const body = (await page.evaluate(() => document.body.innerText)).slice(0, 100).replace(/\n/g,' ');
  console.log(`  ${route} → crash:${boundary} errs:${errors.length} · "${body.slice(0,70)}…"`);
  await page.screenshot({ path: `/tmp/verify-${route.replace(/\W/g,'_')}.png` });
  await ctx.close();
}
await browser.close();
