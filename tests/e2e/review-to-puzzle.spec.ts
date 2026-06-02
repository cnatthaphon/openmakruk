// Issue #19 — review → puzzle promotion pipeline, end to end.
//
// Drives the contract pipeline through the page bundle: build one
// reviewed position (AnnotatedMove), call the facade
// `promoteReviewedPosition`, and assert (a) the promote succeeds
// through the REAL runtime (ffish motif lift) + extractor + repository
// (engine verify + user-puzzle store), (b) the saved puzzle carries
// the expected provenance, and (c) it surfaces in ปริศนา → ของฉัน.
//
// We drive the facade directly rather than playing + reviewing a whole
// game in the browser: a full review runs an engine search per ply
// (~30s for a real game) and would dominate the test for no extra
// coverage. The meaningful integration — lift → extract → deepen →
// verify → save → render — is fully exercised this way.

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

test.describe('review → puzzle pipeline (issue #19)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('promote a reviewed position → verified puzzle in ของฉัน', async ({ page }) => {
    test.setTimeout(90_000);

    // Land on a real page so the bundle + engine are reachable.
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    // Build a reviewed "blunder" on the opening position whose best
    // move is a legal bia push (e3e4). No mateIn → the extractor
    // classifies it 'tactic'; the repository verifies move legality
    // (tactic needs no forced mate) and saves.
    const result = await page.evaluate(async () => {
      // @ts-expect-error dynamic ESM import resolved by Vite at runtime
      const makruk = await import('/src/lib/makruk.ts');
      // @ts-expect-error dynamic
      const pipeline = await import('/src/lib/reviewPipeline/index.ts');
      const startFen = makruk.MAKRUK_START_FEN as string;

      const move = {
        ply: 3,
        uci: 'd3d4',
        side: 'white' as const,
        fenBefore: startFen,
        fenAfter: startFen, // unused by the pipeline for this path
        evalBefore: { scoreCp: 120, depth: 12 },
        evalAfter: { scoreCp: -200, depth: 12 },
        bestMove: 'e3e4',
        delta: 320,
        classification: 'blunder' as const,
        isBest: false,
      };

      const promoted = await pipeline.promoteReviewedPosition(move, {
        authorName: 'E2E',
        userSide: 'white',
        result: '0-1',
        sourceGameId: 'game_e2e_review',
      });
      return promoted;
    });

    expect(result.ok, `promote should succeed: ${JSON.stringify(result)}`).toBe(true);

    // The saved puzzle must carry pipeline provenance + the verified
    // solution seed.
    const saved = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const up = await import('/src/lib/userPuzzles.ts');
      const list = up.loadUserPuzzles() as Array<{
        id: string;
        fen: string;
        category: string;
        solution: string[];
        themes: string[];
        verifiedBy: string;
        reviewProvenance?: {
          sourceGameId: string;
          sourcePly: number;
          runtime: { runtimeId: string; engineId: string; rulesVersion: string };
          schemaVersion: number;
          visibility: string;
          qualityScore: number;
          ratingEstimate: number;
          severity: string;
          motifs: string[];
        };
      }>;
      return list[0] ?? null;
    });

    expect(saved).not.toBeNull();
    expect(saved.category).toBe('tactic');
    expect(saved.solution).toEqual(['e3e4']);
    expect(saved.themes).toContain('review-pipeline');
    expect(saved.themes).toContain('blunder');
    // Repository verifies through the real engine before saving.
    expect(saved.verifiedBy).toBe('engine');

    // Full review provenance is stamped additively on the saved puzzle.
    const prov = saved.reviewProvenance;
    expect(prov, 'reviewProvenance must be present').toBeTruthy();
    // sourceGameId threaded all the way from the caller to the saved row.
    expect(prov!.sourceGameId).toBe('game_e2e_review');
    expect(prov!.sourcePly).toBe(3);
    expect(prov!.runtime.runtimeId).toBe('client');
    expect(prov!.runtime.engineId).toBe('fairy-stockfish');
    expect(prov!.runtime.rulesVersion).toBe('makruk-1');
    expect(prov!.schemaVersion).toBe(1);
    expect(prov!.visibility).toBe('draft');
    expect(prov!.severity).toBe('blunder');
    expect(typeof prov!.qualityScore).toBe('number');
    expect(typeof prov!.ratingEstimate).toBe('number');
    expect(Array.isArray(prov!.motifs)).toBe(true);

    // And it surfaces in ปริศนา → ของฉัน.
    await page.goto('/#/puzzles');
    await waitForContentReady(page);
    await expect(page.locator('.my-puzzles-row')).toHaveCount(1, { timeout: 10_000 });
  });

  test('a clean "best" move does not qualify (pipeline rejects)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const result = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const makruk = await import('/src/lib/makruk.ts');
      // @ts-expect-error dynamic
      const pipeline = await import('/src/lib/reviewPipeline/index.ts');
      const startFen = makruk.MAKRUK_START_FEN as string;
      const move = {
        ply: 1,
        uci: 'e3e4',
        side: 'white' as const,
        fenBefore: startFen,
        fenAfter: startFen,
        evalBefore: { scoreCp: 10, depth: 12 },
        evalAfter: { scoreCp: 8, depth: 12 },
        bestMove: 'e3e4',
        delta: 2,
        classification: 'best' as const,
        isBest: true,
      };
      return pipeline.promoteReviewedPosition(move, { authorName: 'E2E' });
    });

    // 'best' is not in includeClassifications → no candidate.
    expect(result.ok).toBe(false);

    const count = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const up = await import('/src/lib/userPuzzles.ts');
      return up.loadUserPuzzles().length;
    });
    expect(count).toBe(0);
  });
});
