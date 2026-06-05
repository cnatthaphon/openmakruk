// AI Lab slice 1 (issue #34) — prove the engine plug-in path.
//
// Two new MakrukEngine adapters (random, minimax) register themselves
// on import and must: appear via listEngines() with research:true,
// produce legal moves, be seed-reproducible (random), NOT become the
// default, and surface only under the labeled "🧪 AI Lab" optgroup in
// the engine selector — never as a normal play engine.

import { test, expect } from '@playwright/test';
import { waitForContentReady } from './helpers';

test.describe('AI Lab baseline engines (issue #34)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('openmakruk_onboarded', '1');
    });
  });

  test('register as research engines; default stays fairy-stockfish', async ({ page }) => {
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const info = await page.evaluate(async () => {
      // @ts-expect-error dynamic ESM import resolved by Vite at runtime
      const reg = await import('/src/lib/engines/registry.ts');
      // Ensure the engine modules (self-registering) are loaded.
      // @ts-expect-error dynamic
      await import('/src/lib/engine.ts');
      const engines = reg.listEngines() as Array<{ id: string; name: string; research: boolean }>;
      return {
        random: engines.find((e) => e.id === 'lab-random') ?? null,
        minimax: engines.find((e) => e.id === 'lab-minimax') ?? null,
        mcts: engines.find((e) => e.id === 'lab-mcts') ?? null,
        fairy: engines.find((e) => e.id === 'fairy-stockfish') ?? null,
        defaultId: reg.getActiveEngineId?.() ?? null,
      };
    });

    expect(info.random).toMatchObject({ research: true });
    expect(info.minimax).toMatchObject({ research: true });
    expect(info.mcts).toMatchObject({ research: true });
    expect(info.fairy).toMatchObject({ research: false });
    // Baselines must NOT have hijacked the default.
    expect(info.defaultId).toBe('fairy-stockfish');
  });

  test('baselines play legal moves; random is seed-reproducible', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/play');
    await waitForContentReady(page);
    await page.waitForSelector('.screen.loading', { state: 'detached', timeout: 30_000 });

    const r = await page.evaluate(async () => {
      // @ts-expect-error dynamic
      const reg = await import('/src/lib/engines/registry.ts');
      // @ts-expect-error dynamic
      await import('/src/lib/engine.ts');
      // @ts-expect-error dynamic
      const makruk = await import('/src/lib/makruk.ts');
      const startFen = makruk.MAKRUK_START_FEN as string;
      const ffish = await makruk.loadFfish();
      const board = new ffish.Board('makruk', startFen);
      const legal = board.legalMoves().split(' ').filter(Boolean);
      board.delete();

      const random = await reg.getEngineById('lab-random');
      const a = await random.search(startFen, { seed: 'seed-1' });
      const b = await random.search(startFen, { seed: 'seed-1' });
      const c = await random.search(startFen, { seed: 'seed-2' });

      const minimax = await reg.getEngineById('lab-minimax');
      const m = await minimax.search(startFen, { depth: 2 });
      const blackDownMaterialFen = '1nsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR b - - 0 1';
      const blackDown = await minimax.search(blackDownMaterialFen, {
        depth: 1,
        seed: 'eval-contract',
      });

      // MCTS: legal + seed/temp-0 reproducible + material sense. On a
      // bare board white can take a hanging black rook for free
      // (Ra1xa8); with a real budget the rollouts favour +rook.
      const mcts = await reg.getEngineById('lab-mcts');
      const mc1 = await mcts.search(startFen, { nodes: 200, seed: 'mcts-seed', temperature: 0 });
      const mc2 = await mcts.search(startFen, { nodes: 200, seed: 'mcts-seed', temperature: 0 });
      const freeRookFen = 'r6k/8/8/8/8/8/8/R6K w - - 0 1';
      const grab = await mcts.search(freeRookFen, { nodes: 600, seed: 'grab', temperature: 0 });

      return {
        legal,
        randomMove: a.bestMove,
        sameSeedMatches: a.bestMove === b.bestMove,
        // different seed MAY differ (not guaranteed, but record it)
        otherSeedMove: c.bestMove,
        minimaxMove: m.bestMove,
        minimaxScoreIsNumber: typeof m.scoreCp === 'number',
        blackDownScore: blackDown.scoreCp,
        mctsMove: mc1.bestMove,
        mctsReproducible: mc1.bestMove === mc2.bestMove,
        mctsGrab: grab.bestMove,
      };
    });

    // Random played a legal move + is reproducible for a fixed seed.
    expect(r.legal).toContain(r.randomMove);
    expect(r.sameSeedMatches).toBe(true);
    // Minimax played a legal move + reports an eval.
    expect(r.legal).toContain(r.minimaxMove);
    expect(r.minimaxScoreIsNumber).toBe(true);
    // scoreCp contract: eval is from the side-to-move's POV. In this FEN
    // black is missing a rook, so black-to-move should see a bad score.
    expect(r.blackDownScore).toBeLessThan(0);
    // MCTS: legal move from the start, reproducible with a fixed seed +
    // temperature 0, and it grabs the free rook (material sense > random).
    expect(r.legal).toContain(r.mctsMove);
    expect(r.mctsReproducible).toBe(true);
    expect(r.mctsGrab).toBe('a1a8');
  });

  test('selector groups baselines under the 🧪 AI Lab optgroup only', async ({ page }) => {
    await page.goto('/#/settings');
    await waitForContentReady(page);
    await page.getByRole('tab', { name: /การเล่น/ }).click();

    // The engine <select> is the one whose options include a personality
    // / fairy-stockfish. Find the optgroup holding the Lab baselines.
    const labGroup = page.locator('optgroup[label*="AI Lab"]');
    await expect(labGroup).toHaveCount(1);
    await expect(labGroup.locator('option')).toContainText(['Random', 'Minimax', 'MCTS']);

    // The baselines must NOT appear as top-level (non-optgroup) options.
    const topLevelLabBaseline = page.locator(
      'select > option:has-text("Random (baseline)")',
    );
    await expect(topLevelLabBaseline).toHaveCount(0);
  });
});
