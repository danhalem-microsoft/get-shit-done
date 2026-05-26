const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, FixBudget } = require('../gap-taxonomy.cjs');

test('classify maps missing-critic to fork-feature-loss', () => {
  const cat = classify({ kind: 'missing-file', detail: '.github/agents/gsd-critic-plan.md' });
  assert.equal(cat.category, 'fork-feature-loss');
  assert.equal(cat.fixable, true);
});

test('classify maps unknown-runtime errors to parity-deferred', () => {
  const cat = classify({ kind: 'install-error', detail: 'unsupported --opencode flag' });
  assert.equal(cat.category, 'parity-deferred');
});

test('classify maps missing mistakes.md to fork-feature-loss (mistake-registry)', () => {
  const cat = classify({ kind: 'missing-file', detail: '.github/commands/gsd/mistakes.md' });
  assert.equal(cat.category, 'fork-feature-loss');
  assert.equal(cat.fixable, true);
});

test('classify maps missing taste.cjs to fork-feature-loss (taste-library)', () => {
  const cat = classify({ kind: 'missing-file', detail: '.github/get-shit-done/bin/lib/taste.cjs' });
  assert.equal(cat.category, 'fork-feature-loss');
  assert.equal(cat.fixable, true);
});

test('FixBudget enforces the 8-fix cap per runtime', () => {
  const b = new FixBudget({ cap: 8 });
  for (let i = 0; i < 8; i++) b.consume('copilot', `fix-${i}`);
  assert.equal(b.canConsume('copilot'), false);
  assert.equal(b.canConsume('opencode'), true);
});
