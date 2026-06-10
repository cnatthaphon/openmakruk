// POST /api/errors — client crash-report sink (issue #46).
//
// Contract the client adapter (src/lib/errorReporter.ts) relies on:
//   1. Anonymous reports are accepted and stored.
//   2. A missing message is a 400.
//   3. Over-long fields are truncated, not rejected.
//   4. A query/hash that slips into urlPath is stripped server-side.
//   5. An optional bearer attaches the user_id.

import { describe, expect, test } from 'vitest';
import { baseUrl, createAnonUser, queryLocalD1, sqlString } from './helpers';

async function postError(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl()}/api/errors`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res;
}

describe('POST /api/errors', () => {
  test('accepts an anonymous report and returns an id', async () => {
    const res = await postError({
      scope: 'play',
      message: 'TypeError: cannot read x of undefined',
      stack: 'Error\n  at foo (chunk.js:1:1)',
      buildSha: 'abc1234',
      locale: 'th-TH',
      urlPath: '/play',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string; receivedAt: number };
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
    expect(typeof body.receivedAt).toBe('number');

    const rows = await queryLocalD1<{ user_id: string | null; message: string; url_path: string }>(
      `SELECT user_id, message, url_path FROM client_errors WHERE id = ${sqlString(body.id)}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].message).toBe('TypeError: cannot read x of undefined');
    expect(rows[0].url_path).toBe('/play');
  });

  test('rejects a report with no message', async () => {
    const res = await postError({ scope: 'play', stack: 'x' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('bad_request');
    expect(body.reason).toBe('message_required');
  });

  test('truncates over-long fields instead of rejecting', async () => {
    const res = await postError({
      message: 'm'.repeat(1_500),
      stack: 's'.repeat(5_000),
      componentStack: 'c'.repeat(2_500),
      urlPath: '/play',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('stores only the page-level urlPath server-side', async () => {
    // Even if the client missed it, the server must not persist ids or params.
    const res = await postError({
      message: 'leaky path test',
      urlPath: '/challenge/SECRET123?token=abc#frag',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    const rows = await queryLocalD1<{ url_path: string }>(
      `SELECT url_path FROM client_errors WHERE id = ${sqlString(body.id)}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].url_path).toBe('/challenge');
  });

  test('attaches user_id when a valid bearer is present', async () => {
    const user = await createAnonUser('crash-reporter');
    const res = await postError({ message: 'authed crash' }, user.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    const rows = await queryLocalD1<{ user_id: string | null }>(
      `SELECT user_id FROM client_errors WHERE id = ${sqlString(body.id)}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(user.id);
  });

  test('rate-limits repeated anonymous crash fingerprints', async () => {
    const message = `duplicate crash ${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      const res = await postError({ message, scope: 'window', urlPath: '/play' });
      expect(res.status).toBe(200);
    }

    const blocked = await postError({ message, scope: 'window', urlPath: '/play' });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; reason: string };
    expect(body.error).toBe('rate_limited');
    expect(body.reason).toBe('duplicate_hourly_cap');
  });

  test('rejects over-sized payloads before JSON parsing', async () => {
    const res = await postError({ message: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe('payload_too_large');
    expect(body.reason).toBe('body_too_large');
  });
});
