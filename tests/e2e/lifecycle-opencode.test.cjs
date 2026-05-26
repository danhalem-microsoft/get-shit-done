const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createScratchRepo, destroyScratchRepo } = require('./lib/test-repo.cjs');
const { runInstall } = require('./lib/install-probe.cjs');
const { runRuntime } = require('./lib/runtime-driver.cjs');
const { checkRuntime, checkCli, defaultAuthCheck, defaultModelCheck } = require('./lib/preflight.cjs');

const CONTRACT = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'invocation-contract.json'), 'utf8'));
const STEP_TIMEOUT_MS = 8 * 60 * 1000;

async function runStep(scratchDir, promptText) {
  return runRuntime({
    command: 'opencode',
    args: ['run', promptText],
    cwd: scratchDir,
    timeoutMs: STEP_TIMEOUT_MS,
  });
}

test('opencode lifecycle: new-project → plan-phase → execute-phase → verify-work', async (t) => {
  if (process.env.GSD_E2E_OPENCODE !== '1') { t.skip('GSD_E2E_OPENCODE!=1'); return; }
  if (!CONTRACT.runtimes || !CONTRACT.runtimes.opencode) { t.skip('invocation-contract.json missing opencode entry — run Task 8 live first'); return; }
  const pre = await checkRuntime('opencode', {
    cliCheck: (n) => checkCli(n),
    authCheck: () => defaultAuthCheck('opencode'),
    modelCheck: () => defaultModelCheck('opencode'),
  });
  if (!pre.available) { t.skip(pre.reason); return; }

  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'opencode', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, inst.error || inst.stderr);

    const s1 = await runStep(scratch.dir, 'Run /gsd:new-project to initialize this repository as a GSD project. Use the fixture README as project context. Choose reasonable defaults.');
    assert.equal(s1.timedOut, false, 'new-project timed out');
    assert.ok(fs.existsSync(path.join(scratch.dir, '.gsd')) || fs.existsSync(path.join(scratch.dir, 'docs', 'gsd')) || s1.stdout.match(/initialized|created/i),
      `new-project produced no visible state.\nTAIL:\n${s1.tail}`);

    const s2 = await runStep(scratch.dir, 'Run /gsd:plan-phase to plan fixing the broken add() function in src/calc.js so tests/calc.test.js passes. Save the plan to disk.');
    assert.equal(s2.timedOut, false, 'plan-phase timed out');
    assert.ok(s2.stdout.match(/\badd\(/), `plan-phase did not reference add().\nTAIL:\n${s2.tail}`);

    const s3 = await runStep(scratch.dir, 'Run /gsd:execute-phase to implement the plan. Make node --test tests/calc.test.js pass.');
    assert.equal(s3.timedOut, false, 'execute-phase timed out');
    const calc = fs.readFileSync(path.join(scratch.dir, 'src', 'calc.js'), 'utf8');
    assert.ok(!/String\(a\)\s*\+\s*String\(b\)/.test(calc), `execute-phase did not replace broken add().\nFile:\n${calc}\nTAIL:\n${s3.tail}`);
    const testRun = spawnSync('node', ['--test', 'tests/calc.test.js'], { cwd: scratch.dir, encoding: 'utf8' });
    assert.equal(testRun.status, 0, `node --test still failing after execute-phase.\nstdout:\n${testRun.stdout}\nstderr:\n${testRun.stderr}`);

    const s4 = await runStep(scratch.dir, 'Run /gsd:verify-work on the work just completed. Run the project tests as part of verification.');
    assert.equal(s4.timedOut, false, 'verify-work timed out');
    assert.ok(/verif/i.test(s4.stdout) || /pass/i.test(s4.stdout), `verify-work produced no verification signal.\nTAIL:\n${s4.tail}`);
  } finally {
    destroyScratchRepo(scratch);
  }
});
