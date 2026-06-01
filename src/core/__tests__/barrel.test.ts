// Public barrel contract. The shared core is intended to be imported
// directly by Node-run tests and future worker parity checks, so the
// stable index must be resolvable by Node's ESM loader.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAKRUK_START_FEN,
  parseCounting,
  parseFen,
} from '../index.ts';

describe('src/core/index.ts barrel', () => {
  it('imports in Node ESM and exposes the public core helpers', () => {
    const parsed = parseFen(MAKRUK_START_FEN);

    assert.ok(parsed);
    assert.deepEqual(parseCounting(parsed), { active: false });
  });
});
