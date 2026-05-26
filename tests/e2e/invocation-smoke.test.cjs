const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScratchRepo, destroyScratchRepo } = require('./lib/test-repo.cjs');
const { runInstall } = require('./lib/install-probe.cjs');
const { runRuntime } = require('./lib/runtime-driver.cjs');
const { checkRuntime, checkCli, defaultAuthCheck, defaultModelCheck } = require('./lib/preflight.cjs');

const CONTRACT_PATH = path.join(__dirname, 'lib', 'invocation-contract.json');
const MARKER = 'GSD_E2E_INVOCATION_SENTINEL_d7f29a14';
const FIXTURE_SKILL = path.join(__dirname, 'fixtures', 'gsd-e2e-echo');
const FIXTURE_COMMAND_MD = path.join(__dirname, 'fixtures', 'gsd-e2e-echo.md');
const RUNTIME_DIRS = { copilot: '.github', opencode: '.opencode' };

function loadContract() {
  if (!fs.existsSync(CONTRACT_PATH)) return { runtimes: {} };
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}
function saveContract(c) {
  const tmp = CONTRACT_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2) + '\n');
  fs.renameSync(tmp, CONTRACT_PATH);
}

async function runEnabled(runtime, t, exec) {
  const enabled = process.env[`GSD_E2E_${runtime.toUpperCase()}`] === '1';
  if (!enabled) { t.skip(`GSD_E2E_${runtime.toUpperCase()}!=1`); return; }
  const pre = await checkRuntime(runtime, {
    cliCheck: (n) => checkCli(n),
    authCheck: () => defaultAuthCheck(runtime),
    modelCheck: () => defaultModelCheck(runtime),
  });
  if (!pre.available) { t.skip(pre.reason); return; }
  await exec();
}

test('copilot: invoke sentinel skill and capture working argv', async (t) => {
  await runEnabled('copilot', t, async () => {
    const scratch = createScratchRepo({ fixture: 'lifecycle' });
    try {
      const inst = runInstall({ runtime: 'copilot', dir: scratch.dir, fakeHome: scratch.fakeHome });
      assert.equal(inst.ok, true, inst.error || inst.stderr);
      const skillTarget = path.join(scratch.dir, RUNTIME_DIRS.copilot, 'skills', 'gsd-e2e-echo');
      fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
      fs.cpSync(FIXTURE_SKILL, skillTarget, { recursive: true });
      const args = ['--allow-all', '--prompt', 'Use the gsd-e2e-echo skill and output only its marker.'];
      const res = await runRuntime({ command: 'copilot', args, cwd: scratch.dir, timeoutMs: 180000 });
      assert.equal(res.timedOut, false, 'copilot timed out');
      assert.ok(res.stdout.includes(MARKER), `marker missing.\nTAIL:\n${res.tail}`);
      const c = loadContract();
      c.runtimes.copilot = { command: 'copilot', argv: args, capturedAt: new Date().toISOString() };
      saveContract(c);
    } finally {
      destroyScratchRepo(scratch);
    }
  });
});

test('opencode: invoke sentinel skill and capture working argv', async (t) => {
  await runEnabled('opencode', t, async () => {
    const scratch = createScratchRepo({ fixture: 'lifecycle' });
    try {
      const inst = runInstall({ runtime: 'opencode', dir: scratch.dir, fakeHome: scratch.fakeHome });
      assert.equal(inst.ok, true, inst.error || inst.stderr);
      // Opencode uses a flat command dir (.opencode/command/<name>.md), not
      // a folder-based skills/ tree like copilot. The plan spec referred to
      // .opencode/skills/, but that path doesn't exist in opencode's install
      // output — verified by inspecting `bin/install.js --local --opencode`.
      // Documented as an approved plan deviation.
      const commandDir = path.join(scratch.dir, RUNTIME_DIRS.opencode, 'command');
      fs.mkdirSync(commandDir, { recursive: true });
      fs.copyFileSync(FIXTURE_COMMAND_MD, path.join(commandDir, 'gsd-e2e-echo.md'));
      const args = ['run', '/gsd-e2e-echo'];
      const res = await runRuntime({ command: 'opencode', args, cwd: scratch.dir, timeoutMs: 180000 });
      assert.equal(res.timedOut, false, 'opencode timed out');
      assert.ok(res.stdout.includes(MARKER), `marker missing.\nTAIL:\n${res.tail}`);
      const c = loadContract();
      c.runtimes.opencode = { command: 'opencode', argv: args, capturedAt: new Date().toISOString() };
      saveContract(c);
    } finally {
      destroyScratchRepo(scratch);
    }
  });
});
