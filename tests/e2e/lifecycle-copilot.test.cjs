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
// 20 min per step. The /gsd-new-project workflow alone reads ~1700 lines
// of workflow context, then runs research → requirements → roadmap; even
// in --auto mode this takes well past the original 8-minute budget.
const STEP_TIMEOUT_MS = 20 * 60 * 1000;

function copilotPrompt(promptText) {
  return ['--allow-all', '--prompt', promptText];
}

async function runStep(scratchDir, promptText) {
  return runRuntime({
    command: 'copilot',
    args: copilotPrompt(promptText),
    cwd: scratchDir,
    timeoutMs: STEP_TIMEOUT_MS,
  });
}

function findFileMentioning(dir, pathSubstrings, pattern) {
  function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(p, e.name);
      if (e.isDirectory()) { const hit = walk(full); if (hit) return hit; }
      else if (e.isFile()) {
        if (pathSubstrings.some((s) => full.includes(s))) {
          try {
            const c = fs.readFileSync(full, 'utf8');
            if (pattern.test(c)) return full;
          } catch { /* skip binary */ }
        }
      }
    }
    return null;
  }
  return walk(dir);
}

test('copilot lifecycle: new-project → plan-phase → execute-phase → verify-work', async (t) => {
  if (process.env.GSD_E2E_COPILOT !== '1') { t.skip('GSD_E2E_COPILOT!=1'); return; }
  if (!CONTRACT.runtimes || !CONTRACT.runtimes.copilot) { t.skip('invocation-contract.json missing copilot entry — run Task 8 live first'); return; }
  const pre = await checkRuntime('copilot', {
    cliCheck: (n) => checkCli(n),
    authCheck: () => defaultAuthCheck('copilot'),
    modelCheck: () => defaultModelCheck('copilot'),
  });
  if (!pre.available) { t.skip(pre.reason); return; }

  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    const inst = runInstall({ runtime: 'copilot', dir: scratch.dir, fakeHome: scratch.fakeHome });
    assert.equal(inst.ok, true, inst.error || inst.stderr);

    const s1 = await runStep(scratch.dir, 'Run /gsd-new-project --auto to initialize this repository as a GSD project. Use the README as the idea document. Choose all recommended defaults; do not stop to ask clarifying questions.');
    assert.equal(s1.timedOut, false, 'new-project timed out');
    assert.ok(fs.existsSync(path.join(scratch.dir, '.gsd')) || fs.existsSync(path.join(scratch.dir, 'docs', 'gsd')) || fs.existsSync(path.join(scratch.dir, '.planning')) || s1.stdout.match(/initialized|created/i),
      `new-project produced no visible state.\nTAIL:\n${s1.tail}`);

    const s2 = await runStep(scratch.dir, 'Run /gsd-plan-phase 1 --auto to plan fixing the broken add() function in src/calc.js so tests/calc.test.js passes. Save the plan to disk and choose all recommended defaults.');
    assert.equal(s2.timedOut, false, 'plan-phase timed out');
    const planMentionsAdd = s2.stdout.match(/\badd\(/) || findFileMentioning(scratch.dir, ['plan', 'PLAN'], /add\(/);
    assert.ok(planMentionsAdd, `plan-phase did not produce a plan referencing add().\nTAIL:\n${s2.tail}`);

    const s3 = await runStep(scratch.dir, 'Run /gsd-execute-phase 1 to implement the plan. Make node --test tests/calc.test.js pass.');
    assert.equal(s3.timedOut, false, 'execute-phase timed out');
    const calc = fs.readFileSync(path.join(scratch.dir, 'src', 'calc.js'), 'utf8');
    assert.ok(!/String\(a\)\s*\+\s*String\(b\)/.test(calc), `execute-phase did not replace broken add().\nFile:\n${calc}\nTAIL:\n${s3.tail}`);
    const testRun = spawnSync('node', ['--test', 'tests/calc.test.js'], { cwd: scratch.dir, encoding: 'utf8' });
    assert.equal(testRun.status, 0, `node --test still failing after execute-phase.\nstdout:\n${testRun.stdout}\nstderr:\n${testRun.stderr}`);

    const s4 = await runStep(scratch.dir, 'Run /gsd-verify-work 1 on the work just completed in execute-phase. Run the project tests as part of verification.');
    assert.equal(s4.timedOut, false, 'verify-work timed out');
    assert.ok(/verif/i.test(s4.stdout) || /pass/i.test(s4.stdout), `verify-work produced no verification signal.\nTAIL:\n${s4.tail}`);
  } finally {
    destroyScratchRepo(scratch);
  }
});
