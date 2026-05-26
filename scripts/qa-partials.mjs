// Retest partials with COLD deep link (no root visit first)
import { chromium } from '@playwright/test';
const BASE = 'https://www.openmakruk.com';
const browser = await chromium.launch();

async function coldTest(label, url, clickSelector, postWait = 3000) {
  console.log(`\n── ${label} (${url}) ──`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Direct cold-start to deep link
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const onboardingShown = await page.locator('.onboarding-modal, [class*=onboarding-modal]').count();
  console.log(`  Onboarding showing: ${onboardingShown}`);

  // Look for content
  const cardCount = await page.locator(clickSelector).count();
  console.log(`  Cards matching selector: ${cardCount}`);

  if (cardCount > 0) {
    await page.locator(clickSelector).first().click().catch((e) => console.log(`  Click error: ${e.message}`));
    await page.waitForTimeout(postWait);
    const board = await page.locator('.cg-wrap').count();
    const pieces = await page.locator('.cg-wrap piece').count();
    console.log(`  After click: board=${board}, pieces=${pieces}`);
    const url2 = page.url();
    console.log(`  Current URL: ${url2}`);
  }

  console.log(`  Console errors: ${errors.length}`);
  await page.screenshot({ path: `/tmp/qa-partials-${label.replace(/[^a-z]/gi, '_')}.png` });
  await ctx.close();
}

await coldTest('Survive cold', '/#/survive', 'button:has-text("defense-"), [class*=survive-card]');
await coldTest('Counting cold', '/#/counting', 'button:has-text("L1"), button:has-text("ระดับ"), [class*=counting]');
await coldTest('Pattern cold', '/#/pattern', 'button:has-text("เริ่ม"), button:has-text("Start")');

await browser.close();
