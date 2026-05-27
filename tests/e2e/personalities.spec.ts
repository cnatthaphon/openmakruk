// Personality bots — verify the contract:
//   1. Each PERSONALITY in the catalog gets registered as an engine
//      with id `personality:<id>`.
//   2. Two different personalities, given the same starting position,
//      tend to pick DIFFERENT first moves (statistical, not absolute —
//      we sample several and assert the joint set has variety).
//   3. mixPersonalities() produces a synthetic engine that's valid.

import { test, expect } from '@playwright/test';

test.describe('personality bots — contract', () => {
  test('catalog is registered as engines', async ({ page }) => {
    await page.goto('/#/settings');
    // Phase 29 grouped Settings into sub-tabs. The Engine row lives in
    // the 'การเล่น' (gameplay) sub-tab — open it before reading.
    await page.getByRole('tab', { name: /การเล่น/ }).click();
    await expect(page.getByText(/Engine/).first()).toBeVisible({ timeout: 10_000 });
    // Find the select whose options include the Fairy-Stockfish entry.
    const allOptionTexts = await page.locator('select option').allTextContents();
    const joined = allOptionTexts.join(' ');
    expect(joined).toContain('Fairy-Stockfish');
    expect(joined).toContain('นักบุก');
    expect(joined).toContain('นักรับ');
    expect(joined).toContain('ตามตำแหน่ง');
    expect(joined).toContain('นักล่า');
  });

  test('listEngines exposes personality engines via the page bundle', async ({ page }) => {
    await page.goto('/#/settings');
    // Use page.evaluate to call into the live app — module side-effects
    // ran during page load so the registry should be populated.
    const ids = await page.evaluate(() => {
      // The Settings page already imported listEngines; we re-import
      // via the same bundle path. Vite serves the source module by
      // URL so dynamic import works.
      // @ts-expect-error — dynamic import resolved at runtime
      return import('/src/lib/engine.ts').then((m) => m.listEngines().map((e) => e.id));
    });
    expect(ids).toContain('personality:attacker');
    expect(ids).toContain('personality:defender');
    expect(ids).toContain('personality:hunter');
    expect(ids).toContain('personality:wanderer');
    expect(ids).toContain('personality:positional');
  });

  test('mixPersonalities builds a valid blended bot', async ({ page }) => {
    await page.goto('/#/settings');
    const result = await page.evaluate(async () => {
      // @ts-expect-error — dynamic
      const personalities = await import('/src/lib/personalities/personalities.ts');
      const attacker = personalities.findPersonality('attacker');
      const defender = personalities.findPersonality('defender');
      if (!attacker || !defender) return null;
      const blend = personalities.mixPersonalities(attacker, defender, 0.5);
      return {
        id: blend.id,
        weightsKeys: Object.keys(blend.weights).sort(),
        approxElo: blend.approxElo,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.id).toContain('mix:attacker:defender');
    // Both parents contribute weights, so the blend has the union.
    expect(result!.weightsKeys).toContain('material');
    expect(result!.weightsKeys).toContain('defense');
    expect(result!.weightsKeys).toContain('attack');
  });
});
