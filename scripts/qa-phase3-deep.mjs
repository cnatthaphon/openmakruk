// QA Phase 3 — Deep journey testing. Simulates real-user flows
// end-to-end and captures everything: screenshots, console errors,
// network failures, layout overflow, slow operations.
//
// Goal: catch the bugs that automated assertions miss but humans hit.

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = process.argv[2] ?? 'https://www.openmakruk.com';
const OUT = '/tmp/qa-phase3';
const REPORT_PATH = `${OUT}/report.json`;

await mkdir(OUT, { recursive: true });

const findings = [];
function record(journey, kind, message, severity = 'medium') {
  findings.push({ journey, kind, message, severity, at: new Date().toISOString() });
  const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : 'ℹ️';
  console.log(`  ${icon} [${kind}] ${message}`);
}

async function setupPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width <= 500 });
  const page = await ctx.newPage();
  const localErrors = [];
  const localFailedReqs = [];
  page.on('console', (m) => { if (m.type() === 'error') localErrors.push(m.text()); });
  page.on('pageerror', (e) => localErrors.push(`PAGEERROR: ${e.message}`));
  page.on('requestfailed', (r) => localFailedReqs.push(`${r.url()} → ${r.failure()?.errorText}`));
  return { ctx, page, localErrors, localFailedReqs };
}

async function dismissOnboarding(page) {
  const dismiss = page.locator('button:has-text("ข้าม"), button:has-text("ต่อไป"), .onboarding-close').first();
  if (await dismiss.count() > 0) {
    await dismiss.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function squareCoords(page, square) {
  const box = await page.locator('.cg-wrap').first().boundingBox();
  if (!box) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const sq = box.width / 8;
  return { x: box.x + sq * (file + 0.5), y: box.y + sq * (8 - rank + 0.5) };
}

// ────────────────────────────────────────────────────────────────────
// Journey 1: Full game with resign → Game Report
// ────────────────────────────────────────────────────────────────────
async function journey1(browser) {
  console.log('\n── Journey 1: Full game + resign + Game Report ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 1280, height: 800 });

  try {
    await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    await dismissOnboarding(page);
    await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

    await page.screenshot({ path: `${OUT}/j1-01-start.png` });

    // Make 3 moves
    const moves = [['e3', 'e4'], ['f3', 'f4'], ['d2', 'd3']];
    for (let i = 0; i < moves.length; i++) {
      const fc = await squareCoords(page, moves[i][0]);
      const tc = await squareCoords(page, moves[i][1]);
      if (!fc || !tc) {
        record('J1', 'no-board-box', `move ${i + 1}: cannot find squares`, 'high');
        break;
      }
      await page.mouse.click(fc.x, fc.y);
      await page.waitForTimeout(120);
      await page.mouse.click(tc.x, tc.y);
      await page.waitForTimeout(3000); // bot reply
      await page.screenshot({ path: `${OUT}/j1-0${i + 2}-move${i + 1}.png` });
    }

    // After moves, verify resign + draw buttons present
    const resign = await page.locator('.resign-button').count();
    const draw = await page.locator('.draw-button').count();
    if (resign === 0) record('J1', 'resign-missing', `resign button not in DOM after 3 moves`, 'high');
    if (draw === 0) record('J1', 'draw-missing', `draw button not in DOM after 3 moves`, 'medium');

    if (resign > 0) {
      const visible = await page.locator('.resign-button').first().isVisible();
      if (!visible) record('J1', 'resign-hidden', `resign button in DOM but not visible`, 'high');

      // Click resign
      await page.locator('.resign-button').first().click().catch((e) => record('J1', 'resign-click-error', e.message, 'high'));
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/j1-05-resign-clicked.png` });

      // Confirm modal
      const confirmBtn = page.locator('.toast-confirm-ok, button:has-text("ยืนยัน")').first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click().catch(() => {});
      } else {
        record('J1', 'no-confirm-dialog', `resign clicked but no confirm dialog appeared`, 'medium');
      }
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/j1-06-after-confirm.png` });

      // Game over UI
      const gameOver = await page.locator('.game-over-overlay').count();
      if (gameOver === 0) record('J1', 'no-gameover-overlay', `game-over-overlay not shown after resign confirm`, 'high');

      // Game Report — what surfaces it?
      const reportBtn = page.locator('button:has-text("รีวิว"), button:has-text("Review"), button:has-text("รายงาน")').first();
      const reportPanel = page.locator('.game-report, [class*=GameReport]').first();
      if (await reportPanel.count() > 0) {
        const visible = await reportPanel.isVisible();
        record('J1', 'game-report', `Game Report panel ${visible ? 'visible' : 'hidden'}`, visible ? 'low' : 'medium');
      } else if (await reportBtn.count() > 0) {
        record('J1', 'game-report', `Game Report behind button click — needs explicit trigger`, 'low');
      } else {
        record('J1', 'no-game-report', `No Game Report surface or button found`, 'medium');
      }
      await page.screenshot({ path: `${OUT}/j1-07-end-state.png` });
    }

    if (localErrors.length > 0) {
      for (const e of localErrors.slice(0, 3)) record('J1', 'console-error', e.slice(0, 150), 'high');
    }
  } catch (e) {
    record('J1', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Journey 2: Resume mid-game across reload
// ────────────────────────────────────────────────────────────────────
async function journey2(browser) {
  console.log('\n── Journey 2: Resume mid-game ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 1280, height: 800 });

  try {
    await page.goto(`${BASE}/#/play`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    await dismissOnboarding(page);
    await page.waitForFunction(() => document.querySelectorAll('.cg-wrap piece').length >= 32, { timeout: 20_000 });

    // Make 1 move
    const fc = await squareCoords(page, 'e3');
    const tc = await squareCoords(page, 'e4');
    await page.mouse.click(fc.x, fc.y);
    await page.waitForTimeout(120);
    await page.mouse.click(tc.x, tc.y);
    await page.waitForTimeout(3000);

    const fenBeforeReload = await page.evaluate(() => {
      const log = window.__openmakrukLog?.events ?? [];
      for (let i = log.length - 1; i >= 0; i--) if (log[i].data?.fen) return log[i].data.fen;
      return null;
    });
    record('J2', 'pre-reload-fen', `${fenBeforeReload?.slice(0, 30)}...`, 'low');

    // Reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cg-wrap', { timeout: 30_000 });
    await dismissOnboarding(page);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/j2-after-reload.png` });

    // Check for resume banner / button
    const resumeBtn = page.locator('button:has-text("เล่นต่อ"), button:has-text("Resume"), button:has-text("ต่อ")').first();
    const resumeBanner = await page.locator('.resume-banner, [class*=resume]').count();
    if (await resumeBtn.count() > 0) {
      record('J2', 'resume-button-found', `Found resume button — flow expected`, 'low');
      await resumeBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    } else if (resumeBanner > 0) {
      record('J2', 'resume-banner-found', `Found resume banner`, 'low');
    } else {
      // Maybe auto-resumed?
      const fenAfterReload = await page.evaluate(() => {
        const log = window.__openmakrukLog?.events ?? [];
        for (let i = log.length - 1; i >= 0; i--) if (log[i].data?.fen) return log[i].data.fen;
        return null;
      });
      if (fenAfterReload === fenBeforeReload) {
        record('J2', 'auto-resumed', `Game auto-resumed (FEN matches)`, 'low');
      } else {
        record('J2', 'no-resume', `No resume UI + FEN changed — saved game NOT restored`, 'high');
      }
    }

    if (localErrors.length > 0) {
      for (const e of localErrors.slice(0, 3)) record('J2', 'console-error', e.slice(0, 150), 'high');
    }
  } catch (e) {
    record('J2', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Journey 3: All lessons load without crash
// ────────────────────────────────────────────────────────────────────
async function journey3(browser) {
  console.log('\n── Journey 3: All lessons open without crash ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 1280, height: 800 });

  try {
    // Get full lesson list from content/manifest + lessons/all.json
    const resp = await fetch(`${BASE}/content/lessons/all.json`);
    const lessons = await resp.json();
    record('J3', 'lessons-fetched', `${lessons.length} lessons`, 'low');

    let crashCount = 0;
    let errorCount = 0;
    const errorsByLesson = [];

    for (const lesson of lessons) {
      const errorsBefore = localErrors.length;
      try {
        await page.goto(`${BASE}/#/learn/${lesson.id}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(800);
        const boundary = await page.locator('.error-boundary').count();
        if (boundary > 0) {
          crashCount++;
          record('J3', 'lesson-crash', `Lesson "${lesson.id}" triggered error boundary`, 'high');
        }
        const newErrors = localErrors.slice(errorsBefore);
        if (newErrors.length > 0) {
          errorCount++;
          errorsByLesson.push({ lesson: lesson.id, errors: newErrors });
        }
      } catch (e) {
        record('J3', 'lesson-load-fail', `Lesson "${lesson.id}" load failed: ${e.message.slice(0, 100)}`, 'high');
      }
    }

    record('J3', 'summary', `${lessons.length} lessons, ${crashCount} crashed, ${errorCount} had console errors`,
      crashCount > 0 ? 'high' : errorCount > 0 ? 'medium' : 'low');

    if (errorsByLesson.length > 0) {
      for (const { lesson, errors } of errorsByLesson.slice(0, 5)) {
        record('J3', 'lesson-errors', `${lesson}: ${errors[0]?.slice(0, 100)}`, 'medium');
      }
    }
  } catch (e) {
    record('J3', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Journey 4: All puzzles load without crash
// ────────────────────────────────────────────────────────────────────
async function journey4(browser) {
  console.log('\n── Journey 4: All puzzles open without crash ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 1280, height: 800 });

  try {
    const resp = await fetch(`${BASE}/content/puzzles/all.json`);
    const puzzles = await resp.json();
    record('J4', 'puzzles-fetched', `${puzzles.length} puzzles`, 'low');

    let crashCount = 0;
    let errorCount = 0;
    let boardMissingCount = 0;

    for (const puzzle of puzzles) {
      const errorsBefore = localErrors.length;
      try {
        await page.goto(`${BASE}/#/puzzles/${puzzle.id}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(800);
        const boundary = await page.locator('.error-boundary').count();
        if (boundary > 0) {
          crashCount++;
          record('J4', 'puzzle-crash', `Puzzle "${puzzle.id}" triggered error boundary`, 'high');
        }
        const board = await page.locator('.cg-wrap').count();
        if (board === 0) {
          boardMissingCount++;
          if (boardMissingCount <= 3) record('J4', 'puzzle-board-missing', `${puzzle.id}: no board rendered`, 'high');
        }
        const newErrors = localErrors.slice(errorsBefore);
        if (newErrors.length > 0) errorCount++;
      } catch (e) {
        record('J4', 'puzzle-load-fail', `Puzzle "${puzzle.id}" failed: ${e.message.slice(0, 100)}`, 'high');
      }
    }

    record('J4', 'summary', `${puzzles.length} puzzles · crashed=${crashCount} · board-missing=${boardMissingCount} · errors=${errorCount}`,
      crashCount + boardMissingCount > 0 ? 'high' : 'low');
  } catch (e) {
    record('J4', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Journey 5: Mobile viewport — every tab + flows
// ────────────────────────────────────────────────────────────────────
async function journey5(browser) {
  console.log('\n── Journey 5: Mobile (390x844) sweep ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 390, height: 844 });

  const routes = ['/#/play', '/#/learn', '/#/puzzles', '/#/custom', '/#/library', '/#/profile', '/#/settings', '/#/about'];
  try {
    for (const route of routes) {
      const errorsBefore = localErrors.length;
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await dismissOnboarding(page);
      await page.waitForTimeout(1500);

      // Check horizontal overflow
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      if (overflow.body > overflow.viewport + 1) {
        record('J5', 'horizontal-overflow', `${route}: body ${overflow.body}px > viewport ${overflow.viewport}px`, 'high');
      }

      // Check error boundary
      const boundary = await page.locator('.error-boundary').count();
      if (boundary > 0) record('J5', 'mobile-crash', `${route}: error boundary triggered`, 'high');

      // Console errors during this route
      const newErrors = localErrors.slice(errorsBefore);
      if (newErrors.length > 0) record('J5', 'route-errors', `${route}: ${newErrors[0]?.slice(0, 120)}`, 'medium');

      // Touch target check on buttons
      const tinyButtons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button:not([style*="display: none"])');
        let tiny = 0;
        const samples = [];
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)) {
            tiny++;
            if (samples.length < 3) samples.push(`${b.textContent?.trim().slice(0, 20) || b.className}: ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        return { tiny, samples };
      });
      if (tinyButtons.tiny > 0) {
        record('J5', 'tiny-tap-targets', `${route}: ${tinyButtons.tiny} buttons < 32px (samples: ${tinyButtons.samples.join('; ')})`, 'medium');
      }

      await page.screenshot({ path: `${OUT}/j5-mobile${route.replace(/\W/g, '_')}.png` });
    }
  } catch (e) {
    record('J5', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Journey 6: Engine swap + setting persistence
// ────────────────────────────────────────────────────────────────────
async function journey6(browser) {
  console.log('\n── Journey 6: Engine swap + settings persistence ──');
  const { ctx, page, localErrors } = await setupPage(browser, { width: 1280, height: 800 });

  try {
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'domcontentloaded' });
    await dismissOnboarding(page);
    await page.waitForTimeout(1500);

    // Toggle a setting (sound)
    const soundToggle = page.locator('.setting-row:has-text("เสียง") .settings-toggle, .setting-row:has-text("Sound") .settings-toggle').first();
    if (await soundToggle.count() > 0) {
      await soundToggle.click();
      await page.waitForTimeout(400);
      const localStorageValue = await page.evaluate(() => localStorage.getItem('openmakruk_settings'));
      if (!localStorageValue) {
        record('J6', 'settings-not-persisted', `Setting changed but no localStorage key`, 'high');
      } else {
        record('J6', 'settings-persisted', `localStorage has openmakruk_settings`, 'low');
      }
    } else {
      record('J6', 'no-sound-toggle', `Could not find sound toggle in Settings`, 'medium');
    }

    // Engine select check
    const selects = await page.locator('select').all();
    let engineSelectFound = false;
    for (const sel of selects) {
      const options = await sel.evaluate((el) => Array.from(el.options).map((o) => o.value));
      if (options.some((o) => o.includes('personality:') || o.includes('stockfish') || o.includes('random'))) {
        engineSelectFound = true;
        record('J6', 'engine-options', `${options.length} engine options · sample: ${options.slice(0, 3).join(', ')}`, 'low');
        break;
      }
    }
    if (!engineSelectFound) record('J6', 'no-engine-dropdown', `Engine selector not found in Settings`, 'medium');

    // Reload + verify settings persisted
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const settingsKey = await page.evaluate(() => localStorage.getItem('openmakruk_settings'));
    if (!settingsKey) {
      record('J6', 'settings-lost-after-reload', `Settings disappeared after reload`, 'high');
    }

    if (localErrors.length > 0) {
      for (const e of localErrors.slice(0, 3)) record('J6', 'console-error', e.slice(0, 150), 'medium');
    }
  } catch (e) {
    record('J6', 'journey-aborted', e.message.slice(0, 200), 'high');
  }
  await ctx.close();
}

// ────────────────────────────────────────────────────────────────────
// Run all
// ────────────────────────────────────────────────────────────────────
console.log(`\n=== QA Phase 3: Deep journey testing on ${BASE} ===`);

const browser = await chromium.launch();
await journey1(browser);
await journey2(browser);
await journey3(browser);
await journey4(browser);
await journey5(browser);
await journey6(browser);
await browser.close();

const high = findings.filter((f) => f.severity === 'high');
const medium = findings.filter((f) => f.severity === 'medium');
const low = findings.filter((f) => f.severity === 'low');

console.log(`\n=== Summary ===`);
console.log(`  🔴 HIGH:   ${high.length}`);
console.log(`  🟡 MEDIUM: ${medium.length}`);
console.log(`  ℹ️ LOW:    ${low.length}`);

if (high.length > 0) {
  console.log(`\nHigh-severity findings:`);
  high.forEach((f) => console.log(`  · [${f.journey}/${f.kind}] ${f.message}`));
}
if (medium.length > 0) {
  console.log(`\nMedium-severity findings:`);
  medium.forEach((f) => console.log(`  · [${f.journey}/${f.kind}] ${f.message}`));
}

await writeFile(REPORT_PATH, JSON.stringify({ base: BASE, findings, summary: { high: high.length, medium: medium.length, low: low.length } }, null, 2));
console.log(`\nFull report: ${REPORT_PATH}`);
console.log(`Screenshots: ${OUT}/`);
