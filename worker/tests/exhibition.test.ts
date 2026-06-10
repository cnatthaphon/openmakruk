// POST /api/exhibition/submit — idempotency (issue #48).
//
// The external runner can receive a D1 "storage timeout after commit"
// 500 even though the INSERT landed. With a caller-supplied clientGameId
// a retry must collapse onto the same row instead of double-inserting.
//
// Contract verified here:
//   1. Re-submitting the same clientGameId returns the same id, marks
//      deduped:true, preserves the original createdAt, and leaves exactly
//      one row.
//   2. Omitting clientGameId still works (server mints a UUID) — back-compat.

import { describe, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { baseUrl, queryLocalD1, sqlString } from './helpers';

const ADMIN = 'test-admin-token'; // matches global-setup wrangler dev var
const FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

async function twoBotIds(): Promise<[string, string]> {
  const res = await fetch(`${baseUrl()}/api/bots`);
  const body = (await res.json()) as { bots: Array<{ id: string }> };
  return [body.bots[0].id, body.bots[1].id];
}

async function submit(payload: Record<string, unknown>) {
  return fetch(`${baseUrl()}/api/exhibition/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify(payload),
  });
}

describe('POST /api/exhibition/submit idempotency (issue #48)', () => {
  test('same clientGameId collapses to one row and reports deduped', async () => {
    const [white, black] = await twoBotIds();
    const clientGameId = randomUUID();
    const payload = {
      clientGameId,
      whiteBotId: white,
      blackBotId: black,
      outcome: 'draw',
      plyCount: 2,
      moves: ['c2c3', 'c7c6'],
      finalFen: FEN,
    };

    const r1 = await submit(payload);
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as {
      ok: boolean;
      id: string;
      createdAt: number;
      deduped: boolean;
    };
    expect(b1.ok).toBe(true);
    expect(b1.id).toBe(clientGameId);
    expect(b1.deduped).toBe(false);

    // Simulate the runner retrying after a timeout-after-commit.
    const r2 = await submit(payload);
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { id: string; createdAt: number; deduped: boolean };
    expect(b2.id).toBe(clientGameId);
    expect(b2.deduped).toBe(true);
    // Original timestamp preserved — not overwritten by the retry's clock.
    expect(b2.createdAt).toBe(b1.createdAt);

    const rows = await queryLocalD1<{ n: number }>(
      `SELECT COUNT(*) AS n FROM bot_exhibition_games WHERE id = ${sqlString(clientGameId)}`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  test('rejects a present-but-malformed clientGameId (no silent fallback)', async () => {
    const [white, black] = await twoBotIds();
    for (const clientGameId of ['not a valid id!!', 123, false]) {
      const res = await submit({
        clientGameId,
        whiteBotId: white,
        blackBotId: black,
        outcome: 'draw',
        plyCount: 2,
        moves: ['c2c3', 'c7c6'],
        finalFen: FEN,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; reason: string };
      expect(body.error).toBe('bad_request');
      expect(body.reason).toBe('clientGameId_invalid');
    }
  });

  test('works without clientGameId (back-compat)', async () => {
    const [white, black] = await twoBotIds();
    const r = await submit({
      whiteBotId: white,
      blackBotId: black,
      outcome: 'draw',
      plyCount: 2,
      moves: ['c2c3', 'c7c6'],
      finalFen: FEN,
    });
    expect(r.status).toBe(200);
    const b = (await r.json()) as { ok: boolean; id: string; deduped: boolean };
    expect(b.ok).toBe(true);
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(b.deduped).toBe(false);
  });
});
