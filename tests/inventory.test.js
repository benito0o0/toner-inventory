import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, adjust, isDirty } from '../inventory.js';
test('all four toner items start at zero and invalid stored counts are rejected', () => {
  assert.deepEqual(normalize(null), { K: 0, C: 0, M: 0, Y: 0 });
  assert.deepEqual(normalize({ K: -1, C: 2, M: 1.5, Y: '3' }), { K: 0, C: 2, M: 0, Y: 0 });
});
test('plus/minus one and two work for every item without changing saved inventory', () => {
  for (const id of ['K', 'C', 'M', 'Y']) {
    const saved = normalize(null);
    let draft = adjust(saved, id, 1);
    draft = adjust(draft, id, 2);
    assert.equal(draft[id], 3);
    assert.equal(saved[id], 0);
    assert.equal(isDirty(saved, draft), true);
    draft = adjust(draft, id, -1);
    draft = adjust(draft, id, -2);
    assert.equal(draft[id], 0);
    assert.equal(isDirty(saved, draft), false);
  }
});
test('counts cannot become negative or overflow', () => {
  assert.equal(adjust(normalize({ K: 1 }), 'K', -2).K, 0);
  assert.equal(adjust(normalize({ K: Number.MAX_SAFE_INTEGER }), 'K', 2).K, Number.MAX_SAFE_INTEGER);
});
