import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFlag, BUILTIN_MARKERS } from '../src/markers.js';

test('computeFlag uses the printed range', () => {
  assert.equal(computeFlag(3.4, null, 3.0), 'H');
  assert.equal(computeFlag(2.0, 2.5, 5.0), 'L');
  assert.equal(computeFlag(4.0, 2.5, 5.0), 'N');
  assert.equal(computeFlag(4.0, null, null), null);
});

test('every built-in marker has a group and a standard unit', () => {
  for (const [code, m] of Object.entries(BUILTIN_MARKERS)) {
    assert.ok(m.group && m.unitStd, code);
  }
});
