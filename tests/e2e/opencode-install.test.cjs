const test = require('node:test');
const assert = require('node:assert/strict');
const { createScratchRepo, destroyScratchRepo } = require('./lib/test-repo.cjs');
const { runInstall } = require('./lib/install-probe.cjs');
const { runChecks } = require('./lib/fork-structural.cjs');

test('opencode install: produces a runnable .opencode/ tree', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'opencode', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, `install failed: ${inst.error || inst.stderr}`);
  } finally {
    destroyScratchRepo(scratch);
  }
});

test('opencode install: 5 fork features present in .opencode/', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'opencode', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, inst.error || inst.stderr);
    const report = runChecks({ root: scratch.dir, runtime: 'opencode' });
    if (!report.allPass) console.log('STRUCTURAL FAILURES:', JSON.stringify(report.failures, null, 2));
    assert.equal(report.allPass, true);
  } finally {
    destroyScratchRepo(scratch);
  }
});
