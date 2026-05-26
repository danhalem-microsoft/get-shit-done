const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScratchRepo, destroyScratchRepo } = require('../test-repo.cjs');
const { runInstall } = require('../install-probe.cjs');

test('runInstall(copilot) populates .github/ in the scratch repo', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const result = runInstall({ runtime: 'copilot', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(result.ok, true, result.error || '');
    assert.ok(fs.existsSync(path.join(scratch.dir, '.github')));
  } finally {
    destroyScratchRepo(scratch);
  }
});

test('runInstall(opencode) populates .opencode/', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const result = runInstall({ runtime: 'opencode', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(result.ok, true, result.error || '');
    assert.ok(fs.existsSync(path.join(scratch.dir, '.opencode')));
  } finally {
    destroyScratchRepo(scratch);
  }
});
