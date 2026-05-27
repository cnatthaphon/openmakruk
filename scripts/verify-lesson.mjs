import { chromium } from '@playwright/test';
const BASE = 'https://www.openmakruk.com';
const browser = await chromium.launch();

// PART A: deep-link into a lesson + step through
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch { /* ignore */ } });
  await page.goto(`${BASE}/#/learn/basics-board`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const onIndex = await page.locator('.learn-cards, .learn-group').count() > 0;
  const inLesson = await page.locator('.lesson-step, [class*=lesson-view], .lesson-body, button:has-text("ถัดไป")').count() > 0;
  console.log(`PART A — deep-link /#/learn/basics-board:`);
  console.log(`  On index: ${onIndex} · In lesson view: ${inLesson}`);
  let steps = 0;
  for (let i=0;i<10;i++){
    const next = page.locator('button:has-text("ถัดไป"), button:has-text("จบบทเรียน"), button:has-text("บทถัดไป")').first();
    if (await next.count()===0) break;
    if (!(await next.isEnabled().catch(()=>false))) break;
    await next.click().catch(()=>{});
    await page.waitForTimeout(600);
    steps++;
    if (await page.locator('.error-boundary').count()>0){ console.log(`  CRASH at step ${steps}`); break; }
  }
  console.log(`  Stepped through: ${steps} steps · errors: ${errors.length}`);
  await page.screenshot({ path: '/tmp/verify-lesson-deeplink.png' });
  await ctx.close();
}

// PART B: card click from index navigates into lesson
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('openmakruk_onboarded','1'); } catch { /* ignore */ } });
  await page.goto(`${BASE}/#/learn`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const cardBefore = await page.locator('.learn-cards, .learn-group').count();
  // Click the first lesson card (the whole card or its inner)
  const card = page.locator('.learn-card, [class*=learn-card]').first();
  const tag = await card.evaluate(el => el.tagName + '.' + el.className).catch(()=>'?');
  await card.click().catch(()=>{});
  await page.waitForTimeout(1800);
  const hash = page.url();
  const inLesson = await page.locator('button:has-text("ถัดไป"), .lesson-step').count() > 0;
  console.log(`\nPART B — card click from index:`);
  console.log(`  Card element: ${tag}`);
  console.log(`  URL after click: ${hash}`);
  console.log(`  Navigated into lesson: ${inLesson}`);
  await page.screenshot({ path: '/tmp/verify-lesson-cardclick.png' });
  await ctx.close();
}
await browser.close();
