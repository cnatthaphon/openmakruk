import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const route of ['/#/pattern', '/#/survive', '/#/bossrush', '/#/counting']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('https://www.openmakruk.com' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const modal = await page.locator('.onboarding-backdrop, [class*=onboarding-modal]').count();
  console.log(`  ${route} → onboarding modal: ${modal} ${modal === 0 ? '✅ skipped' : '🔴 BLOCKING'}`);
  await ctx.close();
}
await browser.close();
