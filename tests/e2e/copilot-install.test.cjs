const test = require('node:test');
const assert = require('node:assert/strict');
const { createScratchRepo, destroyScratchRepo } = require('./lib/test-repo.cjs');
const { runInstall } = require('./lib/install-probe.cjs');
const { runChecks } = require('./lib/fork-structural.cjs');

test('copilot install: produces a runnable .github/ tree', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'copilot', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, `install failed: ${inst.error || inst.stderr}`);
  } finally {
    destroyScratchRepo(scratch);
  }
});

test('copilot install: 5 fork features (critics, researchers, synthesizer, mistakes, taste) all present', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'copilot', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, inst.error || inst.stderr);
    const report = runChecks({ root: scratch.dir, runtime: 'copilot' });
    if (!report.allPass) console.log('STRUCTURAL FAILURES:', JSON.stringify(report.failures, null, 2));
    assert.equal(report.allPass, true);
  } finally {
    destroyScratchRepo(scratch);
  }
});
