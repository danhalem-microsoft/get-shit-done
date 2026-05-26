# GSD Copilot CLI + OpenCode Verify-and-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the GSD fork installs and runs cleanly on the Copilot CLI and OpenCode runtimes — verify what works, fix what's broken (up to 8 surgical fixes per runtime), and exercise a representative lifecycle slice (`/gsd:new-project` → `/gsd:plan-phase` → `/gsd:execute-phase` → `/gsd:verify-work`) end-to-end on each runtime.

**Architecture:** Two parallel runtime tracks (Copilot, OpenCode) share a single test harness (`tests/e2e/lib/`) that drives `bin/install.js`, captures structural fork features, executes the lifecycle slice against scratch repos, and classifies any gap so a fix budget is enforced. A small invocation-smoke layer is committed as `tests/e2e/lib/invocation-contract.json` so the lifecycle tests don't have to re-discover the CLI argv shape.

**Tech Stack:** Node 20+, `node:test` + `node:assert/strict`, Bazel (`js_test` from `@aspect_rules_js//js:defs.bzl`), `child_process.spawn` (process-group SIGKILL on timeout), real `copilot` and `opencode` CLIs.

**Spec:** [`docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-design.md`](../specs/2026-05-26-gsd-copilot-opencode-verify-design.md)

---

## File Structure

### New files to create

**Harness library (under `tests/e2e/lib/`):**
- `tests/e2e/lib/test-repo.cjs` — scratch-repo factory (init/teardown, lifecycle fixture, sandboxed fakehome)
- `tests/e2e/lib/runtime-driver.cjs` — `spawn`-based CLI invoker (process-group, timeout, buffered output, tail-on-fail)
- `tests/e2e/lib/preflight.cjs` — split CLI / auth / model probes returning `{ available, reason }`
- `tests/e2e/lib/install-probe.cjs` — direct-call wrapper around `bin/install.js` (GSD_TEST_MODE exports)
- `tests/e2e/lib/fork-structural.cjs` — checks 6 fork features exist after install (file presence + content markers)
- `tests/e2e/lib/gap-taxonomy.cjs` — policy module that classifies a failed check `{kind, runtime, detail} → category` and enforces the 8-fix budget
- `tests/e2e/lib/invocation-contract.json` — committed record of working CLI argv shape per runtime (written by Task 8, consumed by Tasks 13)

**Unit tests for harness modules (under `tests/e2e/lib/__tests__/`):**
- `tests/e2e/lib/__tests__/test-repo.test.cjs`
- `tests/e2e/lib/__tests__/runtime-driver.test.cjs`
- `tests/e2e/lib/__tests__/preflight.test.cjs`
- `tests/e2e/lib/__tests__/install-probe.test.cjs`
- `tests/e2e/lib/__tests__/fork-structural.test.cjs`
- `tests/e2e/lib/__tests__/gap-taxonomy.test.cjs`

**Sentinel skill fixture (used by invocation smoke test):**
- `tests/e2e/fixtures/gsd-e2e-echo/SKILL.md`
- `tests/e2e/fixtures/gsd-e2e-echo/README.md`

**Lifecycle scratch fixture (used by `test-repo.cjs`):**
- `tests/e2e/fixtures/lifecycle/README.md`
- `tests/e2e/fixtures/lifecycle/src/calc.js` (intentionally broken `add()`)
- `tests/e2e/fixtures/lifecycle/tests/calc.test.js`
- `tests/e2e/fixtures/lifecycle/package.json`

**E2E test files (under `tests/e2e/`):**
- `tests/e2e/invocation-smoke.test.cjs` — Plan 02 smoke (writes invocation-contract.json)
- `tests/e2e/copilot-install.test.cjs` — Plan 03 structural (Copilot)
- `tests/e2e/opencode-install.test.cjs` — Plan 04 structural (OpenCode)
- `tests/e2e/lifecycle-copilot.test.cjs` — Plan 07 Copilot lifecycle
- `tests/e2e/lifecycle-opencode.test.cjs` — Plan 07 OpenCode lifecycle

**Build files:**
- `tests/e2e/lib/BUILD.bazel` — js_library + js_test for unit tests
- `tests/e2e/BUILD.bazel` — js_test rules for the five E2E tests (all tagged `manual`)
- `tests/e2e/fixtures/BUILD.bazel` — filegroup wrapping fixtures so `data` deps resolve

**Follow-ups doc (created lazily by Task 11/12 if budget is exhausted):**
- `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md`

### Existing files to modify

- `BUILD.bazel` (repo root) — extend `//:project_sources` glob to include `tests/e2e/fixtures/**`
- `.bazelrc` — propagate `GSD_E2E_COPILOT`, `GSD_E2E_OPENCODE`, `GSD_E2E_KEEP_TMP`, `GSD_E2E_MODEL`, `GH_TOKEN`, `GITHUB_TOKEN` via `--test_env`
- `bin/install.js` — surgical fixes from Tasks 11/12 (specific line ranges depend on Task 9/10 results)
- `install-manifest.json` — possible surgical edits from Tasks 11/12 (template markers, destination paths)
- `FORK.md` — Installation section update (Task 14)

---

## Task 1: Scratch-repo factory (`test-repo.cjs`)

**Files:**
- Create: `tests/e2e/lib/test-repo.cjs`
- Create: `tests/e2e/lib/__tests__/test-repo.test.cjs`
- Create: `tests/e2e/fixtures/lifecycle/README.md`
- Create: `tests/e2e/fixtures/lifecycle/src/calc.js`
- Create: `tests/e2e/fixtures/lifecycle/tests/calc.test.js`
- Create: `tests/e2e/fixtures/lifecycle/package.json`

- [ ] **Step 1: Create the lifecycle fixture**

`tests/e2e/fixtures/lifecycle/README.md`:
```markdown
# GSD E2E Lifecycle Fixture

Marker: GSD_E2E_FIXTURE_MARKER_8d3c1f7a

A tiny Node project used by the GSD end-to-end lifecycle tests. The `add()`
function in `src/calc.js` is intentionally broken — `/gsd:execute-phase`
should make `node --test tests/calc.test.js` pass.
```

`tests/e2e/fixtures/lifecycle/src/calc.js`:
```javascript
function add(a, b) {
  return String(a) + String(b);
}

module.exports = { add };
```

`tests/e2e/fixtures/lifecycle/tests/calc.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { add } = require('../src/calc');

test('add returns the numeric sum', () => {
  assert.equal(add(2, 3), 5);
  assert.equal(add(-1, 1), 0);
});
```

`tests/e2e/fixtures/lifecycle/package.json`:
```json
{
  "name": "gsd-e2e-lifecycle-fixture",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Write the failing test for `test-repo.cjs`**

`tests/e2e/lib/__tests__/test-repo.test.cjs`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScratchRepo, destroyScratchRepo } = require('../test-repo.cjs');

test('createScratchRepo copies the lifecycle fixture and inits a git repo', () => {
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  try {
    assert.ok(fs.existsSync(path.join(scratch.dir, 'src', 'calc.js')));
    assert.ok(fs.existsSync(path.join(scratch.dir, '.git')));
    assert.ok(fs.existsSync(scratch.fakeHome));
    const readme = fs.readFileSync(path.join(scratch.dir, 'README.md'), 'utf8');
    assert.match(readme, /GSD_E2E_FIXTURE_MARKER_8d3c1f7a/);
  } finally {
    destroyScratchRepo(scratch);
  }
  assert.equal(fs.existsSync(scratch.dir), false);
});

test('destroyScratchRepo is skipped when GSD_E2E_KEEP_TMP=1', () => {
  process.env.GSD_E2E_KEEP_TMP = '1';
  const scratch = createScratchRepo({ fixture: 'lifecycle' });
  destroyScratchRepo(scratch);
  try {
    assert.equal(fs.existsSync(scratch.dir), true);
  } finally {
    delete process.env.GSD_E2E_KEEP_TMP;
    fs.rmSync(scratch.dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/test-repo.test.cjs
```
Expected: FAIL — `Cannot find module '../test-repo.cjs'`.

- [ ] **Step 4: Implement `test-repo.cjs`**

`tests/e2e/lib/test-repo.cjs`:
```javascript
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'e2e', 'fixtures');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function createScratchRepo({ fixture = 'lifecycle' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-e2e-'));
  const dir = path.join(root, 'project');
  const fakeHome = path.join(root, 'fakehome');
  fs.mkdirSync(fakeHome, { recursive: true });
  copyDir(path.join(FIXTURES_DIR, fixture), dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'gsd-e2e@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'GSD E2E'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir });
  return { root, dir, fakeHome };
}

function destroyScratchRepo(scratch) {
  if (!scratch || !scratch.root) return;
  if (process.env.GSD_E2E_KEEP_TMP === '1') {
    console.log(`[gsd-e2e] keeping scratch: ${scratch.root}`);
    return;
  }
  fs.rmSync(scratch.root, { recursive: true, force: true });
}

module.exports = { createScratchRepo, destroyScratchRepo, FIXTURES_DIR, REPO_ROOT };
```

- [ ] **Step 5: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/test-repo.test.cjs
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/lib/test-repo.cjs tests/e2e/lib/__tests__/test-repo.test.cjs tests/e2e/fixtures/lifecycle
git commit -m "feat(e2e): scratch repo factory with lifecycle fixture

Adds tests/e2e/lib/test-repo.cjs which creates a temp git repo populated
from tests/e2e/fixtures/lifecycle (intentionally broken add() so the
lifecycle slice has visible work to do). GSD_E2E_KEEP_TMP=1 preserves
the directory for post-mortem.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Runtime driver (`runtime-driver.cjs`)

**Files:**
- Create: `tests/e2e/lib/runtime-driver.cjs`
- Create: `tests/e2e/lib/__tests__/runtime-driver.test.cjs`

- [ ] **Step 1: Write the failing test**

`tests/e2e/lib/__tests__/runtime-driver.test.cjs`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { runRuntime } = require('../runtime-driver.cjs');

test('runRuntime returns stdout/stderr/exitCode for a quick command', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'process.stdout.write("ok"); process.stderr.write("warn")'],
    timeoutMs: 5000,
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout, 'ok');
  assert.equal(res.stderr, 'warn');
  assert.equal(res.timedOut, false);
});

test('runRuntime kills process group on timeout and tags timedOut=true', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'setInterval(()=>{}, 1000)'],
    timeoutMs: 250,
  });
  assert.equal(res.timedOut, true);
  assert.notEqual(res.exitCode, 0);
});

test('runRuntime injects env and respects cwd', async () => {
  const res = await runRuntime({
    command: 'node',
    args: ['-e', 'process.stdout.write(process.env.FOO + ":" + process.cwd())'],
    env: { FOO: 'bar' },
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  assert.equal(res.exitCode, 0);
  assert.match(res.stdout, /^bar:/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/runtime-driver.test.cjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runtime-driver.cjs`**

`tests/e2e/lib/runtime-driver.cjs`:
```javascript
'use strict';

const { spawn } = require('node:child_process');

function runRuntime({ command, args = [], cwd, env, timeoutMs = 120000, input }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

    const killGroup = (signal) => {
      try { process.kill(-child.pid, signal); } catch { /* group already gone */ }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      setTimeout(() => { if (!settled) killGroup('SIGKILL'); }, 5000);
    }, timeoutMs);

    const onClose = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code == null ? -1 : code,
        signal,
        stdout,
        stderr,
        timedOut,
        tail: tailLines(stderr, 50),
      });
    };
    child.on('close', onClose);
    child.on('error', (err) => onClose(-1, null) || (stderr += `\n[spawn error] ${err.message}`));

    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

function tailLines(text, n) {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

module.exports = { runRuntime, tailLines };
```

- [ ] **Step 4: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/runtime-driver.test.cjs
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/runtime-driver.cjs tests/e2e/lib/__tests__/runtime-driver.test.cjs
git commit -m "feat(e2e): runtime driver with process-group timeout

Wraps child_process.spawn to give E2E tests a stable surface: cwd/env
override, process-group SIGTERM-then-SIGKILL on timeout (so wrapper
scripts don't leak), buffered stdout/stderr, and a 50-line stderr tail
helper for failure diagnostics.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Preflight probes (`preflight.cjs`)

**Files:**
- Create: `tests/e2e/lib/preflight.cjs`
- Create: `tests/e2e/lib/__tests__/preflight.test.cjs`

- [ ] **Step 1: Write the failing test**

`tests/e2e/lib/__tests__/preflight.test.cjs`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCli, checkRuntime } = require('../preflight.cjs');

test('checkCli reports available when the binary exists on PATH', async () => {
  const res = await checkCli('node');
  assert.equal(res.available, true);
  assert.match(res.reason, /node\b/);
});

test('checkCli reports unavailable for a missing binary', async () => {
  const res = await checkCli('this-binary-does-not-exist-1234');
  assert.equal(res.available, false);
  assert.match(res.reason, /not found|missing|ENOENT/i);
});

test('checkRuntime composes cli+auth+model results', async () => {
  const res = await checkRuntime('copilot', {
    cliCheck: async () => ({ available: true, reason: 'cli ok' }),
    authCheck: async () => ({ available: false, reason: 'no GH_TOKEN' }),
    modelCheck: async () => ({ available: true, reason: 'default' }),
  });
  assert.equal(res.available, false);
  assert.match(res.reason, /no GH_TOKEN/);
  assert.deepEqual(res.parts.map((p) => p.kind), ['cli', 'auth', 'model']);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/preflight.test.cjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `preflight.cjs`**

`tests/e2e/lib/preflight.cjs`:
```javascript
'use strict';

const { spawn } = require('node:child_process');

function which(bin) {
  return new Promise((resolve) => {
    const child = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.on('close', (code) => resolve(code === 0 ? out.trim() : ''));
    child.on('error', () => resolve(''));
  });
}

async function checkCli(bin) {
  const p = await which(bin);
  if (p) return { kind: 'cli', available: true, reason: `${bin} at ${p}` };
  return { kind: 'cli', available: false, reason: `${bin} not found on PATH (ENOENT)` };
}

async function checkRuntime(name, { cliCheck, authCheck, modelCheck }) {
  const parts = [];
  const cli = await cliCheck(name);
  parts.push({ kind: 'cli', ...cli });
  if (!cli.available) return { runtime: name, available: false, reason: cli.reason, parts };
  const auth = await authCheck(name);
  parts.push({ kind: 'auth', ...auth });
  if (!auth.available) return { runtime: name, available: false, reason: auth.reason, parts };
  const model = await modelCheck(name);
  parts.push({ kind: 'model', ...model });
  if (!model.available) return { runtime: name, available: false, reason: model.reason, parts };
  return { runtime: name, available: true, reason: 'all checks ok', parts };
}

function defaultAuthCheck(name) {
  if (name === 'copilot') {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
      return { available: true, reason: 'GH_TOKEN/GITHUB_TOKEN present' };
    }
    return { available: false, reason: 'GH_TOKEN/GITHUB_TOKEN not set' };
  }
  if (name === 'opencode') {
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      return { available: true, reason: 'provider key present' };
    }
    return { available: false, reason: 'no provider API key' };
  }
  return { available: false, reason: `unknown runtime ${name}` };
}

function defaultModelCheck() {
  return { available: true, reason: `model=${process.env.GSD_E2E_MODEL || 'default'}` };
}

module.exports = { which, checkCli, checkRuntime, defaultAuthCheck, defaultModelCheck };
```

- [ ] **Step 4: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/preflight.test.cjs
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/preflight.cjs tests/e2e/lib/__tests__/preflight.test.cjs
git commit -m "feat(e2e): preflight cli/auth/model probes

Tests skip cleanly (with a reason) when the runtime CLI isn't on PATH,
the auth token is missing, or the model env var isn't satisfied.
Defaults: Copilot needs GH_TOKEN/GITHUB_TOKEN; OpenCode needs
ANTHROPIC_API_KEY or OPENAI_API_KEY.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Install probe (`install-probe.cjs`)

**Files:**
- Create: `tests/e2e/lib/install-probe.cjs`
- Create: `tests/e2e/lib/__tests__/install-probe.test.cjs`

- [ ] **Step 1: Write the failing test**

`tests/e2e/lib/__tests__/install-probe.test.cjs`:
```javascript
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
```

- [ ] **Step 2: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/install-probe.test.cjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `install-probe.cjs`**

`tests/e2e/lib/install-probe.cjs`:
```javascript
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('./test-repo.cjs');

const INSTALL_JS = path.join(REPO_ROOT, 'bin', 'install.js');

function runInstall({ runtime, dir, fakeHome, extraArgs = [], timeoutMs = 120000 }) {
  const args = [INSTALL_JS, '--local', `--${runtime}`, ...extraArgs];
  const env = { ...process.env, HOME: fakeHome, GSD_TEST_MODE: '1' };
  const res = spawnSync('node', args, {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (res.error) return { ok: false, error: res.error.message, stdout: res.stdout || '', stderr: res.stderr || '' };
  if (res.status !== 0) {
    return { ok: false, error: `install exited with ${res.status}`, stdout: res.stdout || '', stderr: res.stderr || '' };
  }
  return { ok: true, stdout: res.stdout || '', stderr: res.stderr || '' };
}

module.exports = { runInstall, INSTALL_JS };
```

- [ ] **Step 4: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/install-probe.test.cjs
```
Expected: PASS (2 tests). If a test fails because `bin/install.js` errors on `--copilot` or `--opencode`, capture the stderr — that becomes a gap in Task 9/10.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/install-probe.cjs tests/e2e/lib/__tests__/install-probe.test.cjs
git commit -m "feat(e2e): install probe driving bin/install.js --local

Spawns bin/install.js with HOME pointed at the scratch fakehome dir so
the installer can't touch the real machine. Used by the structural
characterization tests to materialize each runtime's installed tree.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Fork-structural assertions (`fork-structural.cjs`)

**Files:**
- Create: `tests/e2e/lib/fork-structural.cjs`
- Create: `tests/e2e/lib/__tests__/fork-structural.test.cjs`

- [ ] **Step 1: Write the failing test**

`tests/e2e/lib/__tests__/fork-structural.test.cjs`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runChecks } = require('../fork-structural.cjs');

function tmp(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-fs-'));
  for (const [rel, content] of Object.entries(structure)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

test('runChecks passes when all 6 fork features are present (copilot layout)', () => {
  const root = tmp({
    '.github/agents/gsd-critic-plan.md': 'plan',
    '.github/agents/gsd-critic-code.md': 'code',
    '.github/agents/gsd-critic-scope.md': 'scope',
    '.github/agents/gsd-critic-verify.md': 'verify',
    '.github/agents/gsd-critic-discuss.md': 'discuss',
    '.github/agents/gsd-critic-strategy.md': 'strategy',
    '.github/get-shit-done/researchers/architecture.md': '#',
    '.github/get-shit-done/researchers/build-system.md': '#',
    '.github/get-shit-done/researchers/conventions.md': '#',
    '.github/get-shit-done/researchers/data-model.md': '#',
    '.github/get-shit-done/researchers/deployment.md': '#',
    '.github/get-shit-done/researchers/features.md': '#',
    '.github/get-shit-done/researchers/phase-research.md': '#',
    '.github/get-shit-done/researchers/pitfalls.md': '#',
    '.github/get-shit-done/researchers/stack.md': '#',
    '.github/get-shit-done/researchers/testing.md': '#',
    '.github/get-shit-done/researchers/_template.md': '#',
    '.github/agents/gsd-research-synthesizer.md': 'adaptive synthesis',
    '.github/commands/gsd/add-mistake.md': 'add-mistake',
    '.github/commands/gsd/list-mistakes.md': 'list-mistakes',
    '.github/commands/gsd/add-taste.md': 'add-taste',
    '.github/commands/gsd/extract-taste.md': 'extract-taste',
    '.github/sdk/gsd-tools.cjs': 'gsd-tools',
    '.github/sdk/taste.cjs': 'taste',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  assert.equal(report.allPass, true, JSON.stringify(report.failures));
});

test('runChecks reports missing critics as failures', () => {
  const root = tmp({
    '.github/agents/gsd-critic-plan.md': 'plan',
  });
  const report = runChecks({ root, runtime: 'copilot' });
  assert.equal(report.allPass, false);
  assert.ok(report.failures.some((f) => f.feature === 'critics'));
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/fork-structural.test.cjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fork-structural.cjs`**

`tests/e2e/lib/fork-structural.cjs`:
```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_DIRS = { copilot: '.github', opencode: '.opencode', claude: '.claude' };

const CRITICS = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];
const RESEARCHERS = [
  'architecture', 'build-system', 'conventions', 'data-model', 'deployment',
  'features', 'phase-research', 'pitfalls', 'stack', 'testing', '_template',
];

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function checkCritics(base) {
  const missing = CRITICS.filter((c) => !exists(path.join(base, 'agents', `gsd-critic-${c}.md`)));
  return { feature: 'critics', pass: missing.length === 0, missing };
}

function checkResearchers(base) {
  const missing = RESEARCHERS.filter((r) => !exists(path.join(base, 'get-shit-done', 'researchers', `${r}.md`)));
  return { feature: 'researchers', pass: missing.length === 0, missing };
}

function checkSynthesizer(base) {
  return { feature: 'synthesizer', pass: exists(path.join(base, 'agents', 'gsd-research-synthesizer.md')) };
}

function checkMistakeRegistry(base) {
  const a = exists(path.join(base, 'commands', 'gsd', 'add-mistake.md'));
  const b = exists(path.join(base, 'commands', 'gsd', 'list-mistakes.md'));
  const c = exists(path.join(base, 'sdk', 'gsd-tools.cjs'));
  return { feature: 'mistake-registry', pass: a && b && c, parts: { 'add-mistake': a, 'list-mistakes': b, 'gsd-tools.cjs': c } };
}

function checkTasteLibrary(base) {
  const a = exists(path.join(base, 'commands', 'gsd', 'add-taste.md'));
  const b = exists(path.join(base, 'commands', 'gsd', 'extract-taste.md'));
  const c = exists(path.join(base, 'sdk', 'taste.cjs'));
  return { feature: 'taste-library', pass: a && b && c, parts: { 'add-taste': a, 'extract-taste': b, 'taste.cjs': c } };
}

function runChecks({ root, runtime }) {
  const subdir = RUNTIME_DIRS[runtime];
  if (!subdir) throw new Error(`unknown runtime ${runtime}`);
  const base = path.join(root, subdir);
  const checks = [
    checkCritics(base),
    checkResearchers(base),
    checkSynthesizer(base),
    checkMistakeRegistry(base),
    checkTasteLibrary(base),
  ];
  const failures = checks.filter((c) => !c.pass);
  return { runtime, base, checks, failures, allPass: failures.length === 0 };
}

module.exports = { runChecks, RUNTIME_DIRS, CRITICS, RESEARCHERS };
```

> **Note:** Code-search MCP marker assertion (feature #6) is conditional on the installer reaching that branch; checked in Tasks 9/10 as a structural gap rather than a hard fork-feature check, because absence may be expected (no MCP configured).

- [ ] **Step 4: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/fork-structural.test.cjs
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/fork-structural.cjs tests/e2e/lib/__tests__/fork-structural.test.cjs
git commit -m "feat(e2e): structural checks for 5 fork features

Pure file-presence assertions for: 6 critic agents, 11 researcher data
files, the research synthesizer, the mistake-registry triad, and the
taste-library triad. The 6th feature (code-search MCP markers) is
verified inline by the install tests because its expansion depends on
whether code-search is configured in settings.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Gap taxonomy (`gap-taxonomy.cjs`)

**Files:**
- Create: `tests/e2e/lib/gap-taxonomy.cjs`
- Create: `tests/e2e/lib/__tests__/gap-taxonomy.test.cjs`

- [ ] **Step 1: Write the failing test**

`tests/e2e/lib/__tests__/gap-taxonomy.test.cjs`:
```javascript
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
```

- [ ] **Step 2: Run the test and confirm it fails**

```
node --test tests/e2e/lib/__tests__/gap-taxonomy.test.cjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `gap-taxonomy.cjs`**

`tests/e2e/lib/gap-taxonomy.cjs`:
```javascript
'use strict';

function classify(gap) {
  const { kind, detail = '' } = gap;
  if (kind === 'missing-file' && /gsd-critic-/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'check install-manifest.json critic mapping' };
  }
  if (kind === 'missing-file' && /researchers\//.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'researcher copy step in bin/install.js' };
  }
  if (kind === 'missing-file' && /(add-mistake|list-mistakes|gsd-tools\.cjs)/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'mistake-registry triad' };
  }
  if (kind === 'missing-file' && /(add-taste|extract-taste|taste\.cjs)/.test(detail)) {
    return { category: 'fork-feature-loss', fixable: true, hint: 'taste-library triad' };
  }
  if (kind === 'install-error') {
    return { category: 'parity-deferred', fixable: false, hint: detail };
  }
  if (kind === 'lifecycle-failure') {
    return { category: 'lifecycle-blocker', fixable: true, hint: detail };
  }
  return { category: 'unknown', fixable: false, hint: detail };
}

class FixBudget {
  constructor({ cap = 8 } = {}) { this.cap = cap; this.consumed = new Map(); }
  canConsume(runtime) { return (this.consumed.get(runtime) || 0) < this.cap; }
  consume(runtime, label) {
    const n = (this.consumed.get(runtime) || 0) + 1;
    this.consumed.set(runtime, n);
    return { runtime, label, count: n, withinBudget: n <= this.cap };
  }
  remaining(runtime) { return Math.max(0, this.cap - (this.consumed.get(runtime) || 0)); }
}

module.exports = { classify, FixBudget };
```

- [ ] **Step 4: Run the test and confirm it passes**

```
node --test tests/e2e/lib/__tests__/gap-taxonomy.test.cjs
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/lib/gap-taxonomy.cjs tests/e2e/lib/__tests__/gap-taxonomy.test.cjs
git commit -m "feat(e2e): gap classifier + 8-fix budget

classify(gap) tags each discovered shortfall as fork-feature-loss,
parity-deferred, lifecycle-blocker, or unknown so Tasks 11/12 know
when to stop fixing and instead write a follow-ups doc.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Bazel wiring + .bazelrc env propagation

**Files:**
- Create: `tests/e2e/lib/BUILD.bazel`
- Create: `tests/e2e/BUILD.bazel`
- Create: `tests/e2e/fixtures/BUILD.bazel`
- Modify: `BUILD.bazel` (repo root, `//:project_sources`)
- Modify: `.bazelrc`

- [ ] **Step 1: Inspect existing test BUILD pattern**

Read `tests/BUILD.bazel` and note the `js_test` rule shape and `//:project_sources` reference.

```
view /home/danhalem/personal/get-shit-done/tests/BUILD.bazel
view /home/danhalem/personal/get-shit-done/BUILD.bazel
view /home/danhalem/personal/get-shit-done/.bazelrc
```

- [ ] **Step 2: Add fixtures filegroup**

`tests/e2e/fixtures/BUILD.bazel`:
```python
filegroup(
    name = "e2e_fixtures",
    srcs = glob(["**/*"]),
    visibility = ["//visibility:public"],
)
```

- [ ] **Step 3: Add harness library + unit-test BUILD**

`tests/e2e/lib/BUILD.bazel`:
```python
load("@aspect_rules_js//js:defs.bzl", "js_library", "js_test")

js_library(
    name = "e2e_lib",
    srcs = glob(
        ["*.cjs", "*.json"],
        exclude = ["__tests__/**"],
    ),
    visibility = ["//visibility:public"],
)

[
    js_test(
        name = name.replace(".test.cjs", ""),
        entry_point = "__tests__/{}".format(name),
        data = [
            ":e2e_lib",
            "//:project_sources",
            "//tests/e2e/fixtures:e2e_fixtures",
        ],
        tags = ["unit"],
    )
    for name in [
        "test-repo.test.cjs",
        "runtime-driver.test.cjs",
        "preflight.test.cjs",
        "install-probe.test.cjs",
        "fork-structural.test.cjs",
        "gap-taxonomy.test.cjs",
    ]
]
```

- [ ] **Step 4: Add E2E test BUILD (all manual)**

`tests/e2e/BUILD.bazel`:
```python
load("@aspect_rules_js//js:defs.bzl", "js_test")

[
    js_test(
        name = name.replace(".test.cjs", ""),
        entry_point = name,
        data = [
            "//tests/e2e/lib:e2e_lib",
            "//tests/e2e/fixtures:e2e_fixtures",
            "//:project_sources",
        ],
        tags = ["manual", "local", "exclusive", "requires-network"],
    )
    for name in [
        "invocation-smoke.test.cjs",
        "copilot-install.test.cjs",
        "opencode-install.test.cjs",
        "lifecycle-copilot.test.cjs",
        "lifecycle-opencode.test.cjs",
    ]
]
```

- [ ] **Step 5: Extend `//:project_sources` to include fixtures**

In `BUILD.bazel` (repo root), find the `js_library(name = "project_sources", ...)` rule and add `"tests/e2e/fixtures/**"` to its `srcs` glob.

- [ ] **Step 6: Propagate E2E env vars in `.bazelrc`**

Append to `.bazelrc`:
```
# GSD E2E runtime-track env (Copilot + OpenCode)
test --test_env=GSD_E2E_COPILOT
test --test_env=GSD_E2E_OPENCODE
test --test_env=GSD_E2E_KEEP_TMP
test --test_env=GSD_E2E_MODEL
test --test_env=GH_TOKEN
test --test_env=GITHUB_TOKEN
```

- [ ] **Step 7: Verify Bazel still builds and unit tests pass under Bazel**

```
bazel test //tests/e2e/lib/...
```
Expected: 6 unit tests PASS. (E2E targets in `//tests/e2e/...` are tagged `manual` and are not picked up by `//...`.)

```
bazel test //...
```
Expected: same as baseline before this task (no new failures, no new selections beyond `//tests/e2e/lib/...`).

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/lib/BUILD.bazel tests/e2e/BUILD.bazel tests/e2e/fixtures/BUILD.bazel BUILD.bazel .bazelrc
git commit -m "build(e2e): wire harness + env propagation into Bazel

Unit tests for the harness modules run under bazel test //tests/e2e/lib/...
Live runtime-driven E2E targets are tagged manual+local+exclusive+requires-network
so bazel test //... still passes the existing baseline. .bazelrc now
propagates GSD_E2E_* and GH_TOKEN/GITHUB_TOKEN through --test_env.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Invocation smoke test + invocation-contract.json

**Files:**
- Create: `tests/e2e/fixtures/gsd-e2e-echo/SKILL.md`
- Create: `tests/e2e/fixtures/gsd-e2e-echo/README.md`
- Create: `tests/e2e/invocation-smoke.test.cjs`
- Create: `tests/e2e/lib/invocation-contract.json` (initial empty record)

- [ ] **Step 1: Create the sentinel skill fixture**

`tests/e2e/fixtures/gsd-e2e-echo/SKILL.md`:
```markdown
---
name: gsd-e2e-echo
description: Test sentinel skill. When invoked, read README.md and output the marker verbatim.
---

# gsd-e2e-echo

Open `README.md` in the same directory. Output the marker string exactly as written, with no surrounding prose. Do not paraphrase. Do not translate. The marker is the only thing the caller wants.
```

`tests/e2e/fixtures/gsd-e2e-echo/README.md`:
```markdown
GSD_E2E_INVOCATION_SENTINEL_d7f29a14
```

- [ ] **Step 2: Write the invocation smoke test**

`tests/e2e/invocation-smoke.test.cjs`:
```javascript
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
const RUNTIME_DIRS = { copilot: '.github', opencode: '.opencode' };

function loadContract() {
  if (!fs.existsSync(CONTRACT_PATH)) return { runtimes: {} };
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}
function saveContract(c) { fs.writeFileSync(CONTRACT_PATH, JSON.stringify(c, null, 2) + '\n'); }

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
      const skillTarget = path.join(scratch.dir, RUNTIME_DIRS.opencode, 'skills', 'gsd-e2e-echo');
      fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
      fs.cpSync(FIXTURE_SKILL, skillTarget, { recursive: true });
      const args = ['run', 'Use the gsd-e2e-echo skill and output only its marker.'];
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
```

- [ ] **Step 3: Seed the invocation-contract.json file**

`tests/e2e/lib/invocation-contract.json`:
```json
{
  "runtimes": {}
}
```

- [ ] **Step 4: Run the smoke test (no env flags — must skip cleanly)**

```
node --test tests/e2e/invocation-smoke.test.cjs
```
Expected: both tests SKIP with reason `GSD_E2E_COPILOT!=1` / `GSD_E2E_OPENCODE!=1`.

- [ ] **Step 5: Run live (only if you have credentials)**

```
GSD_E2E_COPILOT=1 GSD_E2E_OPENCODE=1 node --test tests/e2e/invocation-smoke.test.cjs
```
Expected: both tests PASS. If a test fails, capture the failure mode — it informs the argv shape recorded in the contract, or it surfaces a gap to handle in Tasks 9/10/11/12.

- [ ] **Step 6: Commit (whether or not live ran)**

```bash
git add tests/e2e/fixtures/gsd-e2e-echo tests/e2e/invocation-smoke.test.cjs tests/e2e/lib/invocation-contract.json
git commit -m "test(e2e): invocation smoke test + committed argv contract

A trivial sentinel skill (gsd-e2e-echo) verifies the install+invoke
round-trip and records the working CLI argv shape in
tests/e2e/lib/invocation-contract.json for the lifecycle tests to
consume. Skips cleanly when GSD_E2E_*!=1.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Copilot install + structural characterization

**Files:**
- Create: `tests/e2e/copilot-install.test.cjs`

- [ ] **Step 1: Write the characterization test**

`tests/e2e/copilot-install.test.cjs`:
```javascript
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
```

- [ ] **Step 2: Run the test and observe behavior**

```
node --test tests/e2e/copilot-install.test.cjs
```

Two outcomes:
- PASS: Copilot install is structurally clean — proceed to Task 10 without using fix-budget.
- FAIL: capture the assertion output. Each `report.failures` entry is a candidate fix for Task 11. Note the failing feature(s) for use later.

- [ ] **Step 3: Commit the characterization test (regardless of pass/fail outcome)**

```bash
git add tests/e2e/copilot-install.test.cjs
git commit -m "test(e2e): copilot install structural characterization

Asserts bin/install.js --copilot --local succeeds and the resulting
.github/ tree contains all 5 hard-checkable fork features (critics,
researchers, synthesizer, mistake registry, taste library). Failures
here drive the Task 11 fix loop.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: OpenCode install + structural characterization

**Files:**
- Create: `tests/e2e/opencode-install.test.cjs`

- [ ] **Step 1: Write the characterization test**

`tests/e2e/opencode-install.test.cjs`:
```javascript
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
```

- [ ] **Step 2: Run the test and observe behavior**

```
node --test tests/e2e/opencode-install.test.cjs
```

- [ ] **Step 3: Commit the characterization test**

```bash
git add tests/e2e/opencode-install.test.cjs
git commit -m "test(e2e): opencode install structural characterization

Asserts bin/install.js --opencode --local succeeds and the resulting
.opencode/ tree contains all 5 hard-checkable fork features. Failures
here drive the Task 12 fix loop.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Copilot gap-fix loop (procedural template, budget cap = 8)

**Files:**
- Modify: `bin/install.js` and/or `install-manifest.json` per discovered gap
- Possibly create: `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md`

This is a **procedural template**. It runs only if Task 9 produced failures. Repeat for each failing assertion, up to 8 fixes total.

- [ ] **Step 1: Re-run Task 9's tests and list failures**

```
node --test tests/e2e/copilot-install.test.cjs
```
Record each `report.failures[i]` as `{feature, missing, runtime: 'copilot'}`.

- [ ] **Step 2: For each failure, classify and decide**

For failure `F`:
```javascript
const { classify, FixBudget } = require('./tests/e2e/lib/gap-taxonomy.cjs');
classify({ kind: 'missing-file', detail: F.missing[0] });
```
- If `category === 'fork-feature-loss'` and budget remains: proceed to fix.
- If `category === 'parity-deferred'` OR budget is exhausted: append to follow-ups doc and skip.

- [ ] **Step 3: Surgical fix (per gap, repeat up to 8 times)**

For each fix:
1. Identify the code path in `bin/install.js` or row in `install-manifest.json` responsible for emitting that file/feature.
2. Make the smallest possible change — never restructure.
3. Add or extend a focused unit test under `tests/install-*.test.cjs` if a related test already exists (follow `tests/install-shared-dir.test.cjs` pattern).
4. Re-run:
   ```
   node --test tests/e2e/copilot-install.test.cjs
   bazel test //tests/...
   ```
5. Stage and commit (one fix per commit):
   ```bash
   git add bin/install.js install-manifest.json tests/install-*.test.cjs
   git commit -m "fix(install): copilot — restore <feature> in .github/

   <one-paragraph rationale referencing the failing E2E assertion>

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
   ```

- [ ] **Step 4: When budget hits 8 (or all gaps fixed), stop**

If gaps remain after 8 fixes, create `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md`:
```markdown
# GSD Copilot/OpenCode Verify — Follow-ups

Discovered during the Copilot/OpenCode verify-and-fix work but deferred because the per-runtime fix budget (8) was reached.

## Copilot
- [gap] <description>
  - Category: <fork-feature-loss | parity-deferred | lifecycle-blocker | unknown>
  - Hint: <classify().hint>
  - Reproducer: `node --test tests/e2e/copilot-install.test.cjs`

## OpenCode
<same shape>
```

- [ ] **Step 5: Verify Task 9 now passes (or all remaining gaps are documented)**

```
node --test tests/e2e/copilot-install.test.cjs
```
Expected: PASS, OR `console.log` STRUCTURAL FAILURES output matches the gaps captured in the follow-ups doc 1:1.

- [ ] **Step 6: Final commit (if a follow-ups doc was written)**

```bash
git add docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md
git commit -m "docs(e2e): copilot follow-ups outside the 8-fix budget

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: OpenCode gap-fix loop (procedural template, budget cap = 8)

**Files:** same shape as Task 11, scoped to OpenCode.

- [ ] **Step 1: Re-run Task 10's tests and list failures**

```
node --test tests/e2e/opencode-install.test.cjs
```

- [ ] **Step 2: Classify each failure** (same pattern as Task 11 Step 2)

- [ ] **Step 3: Surgical fix, one per commit** (same pattern as Task 11 Step 3)

For each fix:
```bash
git add bin/install.js install-manifest.json tests/install-*.test.cjs
git commit -m "fix(install): opencode — restore <feature> in .opencode/

<rationale>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 4: Cap at 8 fixes; document overflow in the same follow-ups doc**

If the doc already exists from Task 11, append a `## OpenCode` section (or expand the existing one). If not, create it with both `## Copilot` (empty/none) and `## OpenCode` sections.

- [ ] **Step 5: Verify Task 10 now passes**

```
node --test tests/e2e/opencode-install.test.cjs
```
Expected: PASS or documented gaps in follow-ups.

- [ ] **Step 6: Final commit if a follow-ups doc was updated**

```bash
git add docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md
git commit -m "docs(e2e): opencode follow-ups outside the 8-fix budget

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Lifecycle slice E2E (Copilot + OpenCode)

**Files:**
- Create: `tests/e2e/lifecycle-copilot.test.cjs`
- Create: `tests/e2e/lifecycle-opencode.test.cjs`

The actual GSD command names: `gsd:new-project`, `gsd:plan-phase`, `gsd:execute-phase`, `gsd:verify-work` (verify-work, **not** verify-phase — the workflow file is named `verify-phase.md` but the user-facing command is `verify-work`).

- [ ] **Step 1: Write the Copilot lifecycle test**

`tests/e2e/lifecycle-copilot.test.cjs`:
```javascript
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

    // Step 1: new-project — initialize GSD state
    const s1 = await runStep(scratch.dir, 'Run /gsd:new-project to initialize this repository as a GSD project. Use the fixture README as project context. Do not ask clarifying questions; choose reasonable defaults.');
    assert.equal(s1.timedOut, false, 'new-project timed out');
    assert.ok(fs.existsSync(path.join(scratch.dir, '.gsd')) || fs.existsSync(path.join(scratch.dir, 'docs', 'gsd')) || s1.stdout.match(/initialized|created/i),
      `new-project produced no visible state.\nTAIL:\n${s1.tail}`);

    // Step 2: plan-phase — produce a plan that mentions fixing add()
    const s2 = await runStep(scratch.dir, 'Run /gsd:plan-phase to plan fixing the broken add() function in src/calc.js so tests/calc.test.js passes. Save the plan to disk.');
    assert.equal(s2.timedOut, false, 'plan-phase timed out');
    // Plan should reference add() and the test file
    const planMentionsAdd = s2.stdout.match(/\badd\(/) || findFileMentioning(scratch.dir, ['plan'], /add\(/);
    assert.ok(planMentionsAdd, `plan-phase did not produce a plan referencing add().\nTAIL:\n${s2.tail}`);

    // Step 3: execute-phase — actually fix the code
    const s3 = await runStep(scratch.dir, 'Run /gsd:execute-phase to implement the plan. Make node --test tests/calc.test.js pass.');
    assert.equal(s3.timedOut, false, 'execute-phase timed out');
    const calc = fs.readFileSync(path.join(scratch.dir, 'src', 'calc.js'), 'utf8');
    assert.ok(!/String\(a\)\s*\+\s*String\(b\)/.test(calc), `execute-phase did not replace broken add().\nFile:\n${calc}\nTAIL:\n${s3.tail}`);
    const testRun = spawnSync('node', ['--test', 'tests/calc.test.js'], { cwd: scratch.dir, encoding: 'utf8' });
    assert.equal(testRun.status, 0, `node --test still failing after execute-phase.\nstdout:\n${testRun.stdout}\nstderr:\n${testRun.stderr}`);

    // Step 4: verify-work — runtime self-attests
    const s4 = await runStep(scratch.dir, 'Run /gsd:verify-work on the work just completed in execute-phase. Run the project tests as part of verification.');
    assert.equal(s4.timedOut, false, 'verify-work timed out');
    assert.ok(/verif/i.test(s4.stdout) || /pass/i.test(s4.stdout), `verify-work produced no verification signal.\nTAIL:\n${s4.tail}`);
  } finally {
    destroyScratchRepo(scratch);
  }
});

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
```

- [ ] **Step 2: Write the OpenCode lifecycle test (mirror structure)**

`tests/e2e/lifecycle-opencode.test.cjs`:
```javascript
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
```

- [ ] **Step 3: Run both tests with no env (must skip)**

```
node --test tests/e2e/lifecycle-copilot.test.cjs tests/e2e/lifecycle-opencode.test.cjs
```
Expected: both SKIP.

- [ ] **Step 4: Run live (if credentials available)**

```
GSD_E2E_COPILOT=1 node --test tests/e2e/lifecycle-copilot.test.cjs
GSD_E2E_OPENCODE=1 node --test tests/e2e/lifecycle-opencode.test.cjs
```
Expected: both PASS.

If a step fails:
- Capture the stderr tail and the runtime tool output.
- Classify with `gap-taxonomy.classify({ kind: 'lifecycle-failure', detail: ... })`.
- If `fixable` and budget remains: surgical fix to `commands/gsd/*.md`, `get-shit-done/workflows/*.md`, or `bin/install.js`.
- Else: append to `2026-05-26-gsd-copilot-opencode-verify-followups.md` under a `## Lifecycle` section.

- [ ] **Step 5: Commit both tests (and any fixes)**

```bash
git add tests/e2e/lifecycle-copilot.test.cjs tests/e2e/lifecycle-opencode.test.cjs
git commit -m "test(e2e): lifecycle slice for copilot + opencode

Drives /gsd:new-project → /gsd:plan-phase → /gsd:execute-phase →
/gsd:verify-work against a scratch fixture whose add() is intentionally
broken. Step 3 asserts node --test passes AND the broken string-concat
literal is gone, so LLM improvisation can't satisfy the assertion.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

If lifecycle fixes were applied, commit them separately with `fix(...)` messages following the Task 11/12 template.

---

## Task 14: Verification output + FORK.md update

**Files:**
- Modify: `FORK.md`

- [ ] **Step 1: Run the full new test suite locally and capture results**

```
# Unit tests for harness (always run, no flags needed)
bazel test //tests/e2e/lib/...

# Live E2E (only with credentials)
GSD_E2E_COPILOT=1 GSD_E2E_OPENCODE=1 \
  node --test tests/e2e/invocation-smoke.test.cjs tests/e2e/copilot-install.test.cjs tests/e2e/opencode-install.test.cjs tests/e2e/lifecycle-copilot.test.cjs tests/e2e/lifecycle-opencode.test.cjs

# Baseline must still pass
bazel test //...
```
Expected:
- harness unit tests: 6 pass
- live E2E: 5 pass (or have documented follow-ups)
- `bazel test //...` baseline: same pass count as before the plan started (E2E targets are tagged `manual` so they are not selected)

- [ ] **Step 2: Read current `FORK.md`**

```
view /home/danhalem/personal/get-shit-done/FORK.md
```

- [ ] **Step 3: Edit `FORK.md` — update the Installation section**

Replace whatever Installation section currently exists with a verified status section. The exact phrasing depends on what's already in the file, but it must include:

- Claude Code: existing supported runtime (unchanged).
- Copilot CLI: now verified. Command: `node bin/install.js --local --copilot`. Lifecycle slice (`/gsd:new-project` → `/gsd:plan-phase` → `/gsd:execute-phase` → `/gsd:verify-work`) confirmed working against the lifecycle fixture.
- OpenCode: now verified. Command: `node bin/install.js --local --opencode`. Same lifecycle slice confirmed working.
- A pointer to `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-design.md` for the verification methodology.
- A pointer to the follow-ups doc *if it exists*.

Use `edit` (not `create`) since the file already exists.

- [ ] **Step 4: Re-run baseline to ensure FORK.md edits don't break anything**

```
bazel test //...
```
Expected: identical to baseline.

- [ ] **Step 5: Commit**

```bash
git add FORK.md
git commit -m "docs(fork): mark Copilot CLI and OpenCode as verified runtimes

Updates the Installation section after the verify-and-fix plan
landed: Copilot CLI and OpenCode both pass the full E2E lifecycle
slice against the GSD fork. Links the design spec and (if any)
the follow-ups doc.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Success Criteria (from spec, restated)

1. `tests/e2e/invocation-smoke.test.cjs` passes for Copilot with credentials.
2. `tests/e2e/invocation-smoke.test.cjs` passes for OpenCode with credentials.
3. `tests/e2e/copilot-install.test.cjs` passes (after Task 11 fixes).
4. `tests/e2e/opencode-install.test.cjs` passes (after Task 12 fixes).
5. `tests/e2e/lifecycle-copilot.test.cjs` passes end-to-end.
6. `tests/e2e/lifecycle-opencode.test.cjs` passes end-to-end.
7. `bazel test //...` continues passing without env flags (new E2E targets skipped via `manual` tag and runtime preflight).
8. `FORK.md` Installation section reflects verified Copilot + OpenCode support.

If any of 3/4/5/6 cannot be satisfied within the 8-fix budget per runtime, the corresponding gap is recorded in `docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md` with category, hint, and reproducer — this counts as plan-complete with documented deferrals, not failure.
