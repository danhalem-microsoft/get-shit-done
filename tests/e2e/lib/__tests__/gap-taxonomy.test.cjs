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

test('FixBudget enforces the 8-fix cap per runtime', () => {
  const b = new FixBudget({ cap: 8 });
  for (let i = 0; i < 8; i++) b.consume('copilot', `fix-${i}`);
  assert.equal(b.canConsume('copilot'), false);
  assert.equal(b.canConsume('opencode'), true);
});
