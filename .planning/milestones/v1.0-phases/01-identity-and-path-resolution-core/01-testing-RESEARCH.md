# Phase 01: Identity and Path Resolution Core - Testing Research

**Researched:** 2026-03-24
**Domain:** Testing patterns for identity.cjs, context.cjs, and getPlanningRoot()
**Confidence:** HIGH

## Summary

Phase 01 needs three new test files (`identity.test.cjs`, `context.test.cjs`) plus extensions to `core.test.cjs` for `getPlanningRoot()`. The codebase has a mature, well-documented testing pattern using Node.js native `node:test` with `node:assert`, temporary filesystem fixtures, and zero mocking libraries. This research documents the exact patterns, helpers, and pitfalls needed for each test file.

**Primary recommendation:** Follow existing patterns exactly. The only new infrastructure needed is a `createTempMultiUserProject()` helper in `tests/helpers.cjs`. Everything else uses existing patterns with minor adaptations for environment variable testing.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Identity slug from `generateSlugInternal()`, 30-char max, trailing-hyphen trim
- Fallback chain: git user.name -> email local-part -> OS username
- user-map.json: flat JSON at `.planning/user-map.json`, committed to git, `_version: 1`
- GSD_USER bypasses resolution chain entirely (transient, no persistence)
- Active context at `.planning/users/<user>/.active` (gitignored JSON)
- GSD_PROJECT overrides .active at runtime (transient)
- Old flat structure detection: `.planning/PROJECT.md` exists AND no `.planning/users/`
- CI/CD detection: hard block on `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, `TRAVIS`
- getPlanningRoot() check order: CI/CD -> old structure -> identity -> context -> return path
- `tryGetPlanningContext(cwd)` for init commands that may run before project exists
- Test helper `createTempMultiUserProject()` in helpers.cjs

### Claude's Discretion
- Test file organization for identity.cjs and context.cjs
- Exact error message wording
- Internal helper function signatures

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | Node >= 16.7.0 built-in | Test runner and `describe`/`test`/`beforeEach`/`afterEach` | Zero-dependency project policy, already used across 15 test files |
| `node:assert` | Node built-in | Assertions (`strictEqual`, `deepStrictEqual`, `ok`, `throws`) | Native, no external assertion libraries |
| `c8` | ^11.0.0 (devDep) | Code coverage, 70% line threshold | Already configured in package.json |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/helpers.cjs` | Local | `runGsdTools`, `createTempProject`, `createTempGitProject`, `cleanup` | Every test file imports this |
| `scripts/run-tests.cjs` | Local | Cross-platform test file discovery and execution | `npm test` runs this |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:test mocking | sinon/testdouble | Project policy: no external mock libraries. Use filesystem fixtures instead. |
| jest/vitest | node:test | Project policy: zero external test frameworks |

**Installation:**
No additional packages needed. All testing infrastructure exists.

---

## Architecture Patterns

### Recommended Test File Structure

```
tests/
  identity.test.cjs    # NEW - unit tests for identity.cjs
  context.test.cjs     # NEW - unit tests for context.cjs
  core.test.cjs        # EXTEND - add getPlanningRoot tests
  init.test.cjs        # EXTEND - verify context fields in init output
  helpers.cjs          # EXTEND - add createTempMultiUserProject()
```

### Pattern 1: Unit Test File Template (Direct Function Import)

**What:** Import functions directly from the module under test, exercise them in isolation.
**When to use:** Testing `sanitizeSlug`, `loadUserMap`, `lockIdentity`, `readActiveContext`, `writeActiveContext`.
**Example:**
```javascript
// Source: tests/core.test.cjs lines 14-29
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  resolveIdentity,
  sanitizeSlug,
  loadUserMap,
  lockIdentity
} = require('../get-shit-done/bin/lib/identity.cjs');
```

### Pattern 2: Temporary Git Project with Custom Identity

**What:** Create temp git repo with specific `user.name` and `user.email` to test identity resolution.
**When to use:** Any test that calls `resolveIdentity()` or `getPlanningRoot()`.
**Example (derived from existing `createTempGitProject`):**
```javascript
function createTempMultiUserProject(opts = {}) {
  const {
    userName = 'Test User',
    userEmail = 'test@test.com',
    userSlug = 'test-user',
    projectName = 'test-project',
    withActive = true
  } = opts;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  const userProjectDir = path.join(tmpDir, '.planning', 'users', userSlug, projectName, 'phases');
  fs.mkdirSync(userProjectDir, { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git config user.email "${userEmail}"`, { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git config user.name "${userName}"`, { cwd: tmpDir, stdio: 'pipe' });

  // user-map.json
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'user-map.json'),
    JSON.stringify({ _version: 1, [userName]: userSlug }, null, 2)
  );

  // .active file
  if (withActive) {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'users', userSlug, '.active'),
      JSON.stringify({
        project: projectName,
        resolved_path: `.planning/users/${userSlug}/${projectName}`
      })
    );
  }

  // Initial commit
  fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.planning/users/*/.active\n');
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return { tmpDir, userSlug, projectName };
}
```

### Pattern 3: Environment Variable Testing (Save/Restore)

**What:** Temporarily set env vars, test behavior, restore originals.
**When to use:** Testing `GSD_USER`, `GSD_PROJECT`, CI/CD detection (`CI`, `GITHUB_ACTIONS`, etc.).
**Example (derived from tests/config.test.cjs lines 79-100):**
```javascript
test('GSD_USER bypasses resolution chain', () => {
  const original = process.env.GSD_USER;
  process.env.GSD_USER = 'override-user';
  try {
    const result = resolveIdentity(tmpDir);
    assert.strictEqual(result.slug, 'override-user');
    assert.strictEqual(result.source, 'env');
  } finally {
    if (original !== undefined) {
      process.env.GSD_USER = original;
    } else {
      delete process.env.GSD_USER;
    }
  }
});
```

**CRITICAL:** Node.js test runner runs all tests in a single process. Env var leaks between tests WILL cause cascading failures. The `try/finally` pattern is mandatory.

### Pattern 4: Testing CLI Commands That Hard-Error

**What:** Test functions that call `error()` (which does `process.exit(1)`) through `runGsdTools()` subprocess.
**When to use:** CI/CD detection, old structure detection, all-sources-fail identity error.
**Example:**
```javascript
test('CI/CD environment blocks execution', () => {
  // runGsdTools spawns a subprocess, so process.exit(1) doesn't kill the test runner
  const result = runGsdTools(['init', 'progress'], tmpDir);
  // The subprocess had CI=true set... but we need to pass env vars to subprocess
  // Use execSync directly with modified env:
  try {
    execSync(`CI=true node "${TOOLS_PATH}" init progress`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' }
    });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.stderr.includes('CI/CD environment detected'));
  }
});
```

**Key insight:** Functions that call `error()` from core.cjs do `process.exit(1)`. They MUST be tested through subprocess execution (runGsdTools or direct execSync), never by calling the function directly in the test process.

### Pattern 5: Testing Filesystem Side Effects

**What:** Verify that functions create/modify files correctly.
**When to use:** `lockIdentity` creating `user-map.json`, `writeActiveContext` creating `.active`.
**Example (derived from tests/config.test.cjs lines 42-64):**
```javascript
test('lockIdentity creates user-map.json with _version field', () => {
  const slug = lockIdentity(tmpDir, 'Dan Halem', 'dan-halem');
  assert.strictEqual(slug, 'dan-halem');

  const mapPath = path.join(tmpDir, '.planning', 'user-map.json');
  assert.ok(fs.existsSync(mapPath), 'user-map.json should be created');

  const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  assert.strictEqual(map._version, 1);
  assert.strictEqual(map['Dan Halem'], 'dan-halem');
});
```

### Anti-Patterns to Avoid

- **Never mock `fs` module:** Use real temp directories. The codebase policy is explicit about this (TESTING.md: "Use temporary directories, not mocks").
- **Never call `error()` directly in tests:** It calls `process.exit(1)` which kills the test runner. Always test through subprocess.
- **Never share temp directories between `describe` blocks:** Each block gets its own `tmpDir` via `beforeEach`/`afterEach`.
- **Never forget env var cleanup:** Leaked `CI=true` or `GSD_USER` will break every subsequent test.
- **Never test with `process.env.CI = 'true'` directly for CLI tests:** The test runner itself may be affected. Use subprocess `env` option instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp directory creation | Custom temp dir logic | `createTempProject()` / `createTempGitProject()` from helpers.cjs | Handles cleanup edge cases, cross-platform |
| Git repo initialization | Raw `execSync('git init')` inline | `createTempGitProject()` or new `createTempMultiUserProject()` | Includes config, initial commit — tests need a valid repo |
| Slug generation testing | Re-testing `generateSlugInternal` behavior | Test `sanitizeSlug` wrapper only | `generateSlugInternal` is already thoroughly tested in core.test.cjs |
| Subprocess execution | Raw `execSync` for CLI tests | `runGsdTools()` from helpers.cjs | Handles stdout/stderr/exit-code normalization |

**Key insight:** The existing test helper surface is comprehensive. Phase 01 only needs to ADD `createTempMultiUserProject()` — the rest reuses existing infrastructure.

---

## Common Pitfalls

### Pitfall 1: Environment Variable Cross-Contamination
**What goes wrong:** Setting `process.env.CI = 'true'` in a test leaks to all subsequent tests, causing unexpected CI/CD detection failures.
**Why it happens:** Node.js test runner runs all tests in-process. `process.env` is global state.
**How to avoid:** Always use `try/finally` with save/restore. For CLI subprocess tests, pass env via `execSync` options.
**Warning signs:** Tests pass individually but fail when run as suite.

### Pitfall 2: Testing `error()` in-process
**What goes wrong:** Calling a function that invokes `error()` from core.cjs kills the test runner with `process.exit(1)`.
**Why it happens:** `error()` is designed for CLI-level failure — it writes to stderr and exits the process.
**How to avoid:** Test error paths through `runGsdTools()` subprocess. Check `result.success === false` and `result.error` content.
**Warning signs:** Test suite abruptly exits with no output.

### Pitfall 3: Git Identity Leaking from Host Machine
**What goes wrong:** Tests read the developer's real `git config user.name` instead of the test fixture's value because the temp git repo inherits global config.
**Why it happens:** Git config inheritance: local -> global -> system. `git config user.name "Test"` sets local, but if you UNSET it for fallback testing, global config may provide a value.
**How to avoid:** To test "no user.name" scenario, use `git config --unset user.name` AND set `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null` in the subprocess env.
**Warning signs:** Tests pass on CI but fail on developer machines (or vice versa).

### Pitfall 4: Temp Directory Path Length on Windows
**What goes wrong:** Deeply nested multi-user project paths (`.planning/users/test-user/test-project/phases/`) combined with `os.tmpdir()` may exceed Windows MAX_PATH.
**Why it happens:** `os.tmpdir()` on Windows can be long (`C:\Users\username\AppData\Local\Temp\`).
**How to avoid:** Keep slug/project names short in test fixtures. The default `test-user`/`test-project` is fine.
**Warning signs:** `ENAMETOOLONG` errors on Windows only.

### Pitfall 5: Corrupted JSON Tests Logging to stderr
**What goes wrong:** Tests for corrupted `user-map.json` produce warning output to stderr, which may trigger test runner noise or false failure detection.
**Why it happens:** The spec requires `console.error('Warning: user-map.json corrupted...')` on corrupt JSON.
**How to avoid:** This is expected behavior — the test should verify the function returns `{}` and doesn't throw. stderr output from direct function calls goes to the test runner output but doesn't affect pass/fail. If testing through subprocess, check `result.error` includes the warning text.
**Warning signs:** Noisy test output that looks like failures but isn't.

---

## Code Examples

### Complete identity.test.cjs Structure

```javascript
/**
 * GSD Tools Tests - identity.cjs
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const {
  createTempGitProject,
  createTempMultiUserProject,
  cleanup
} = require('./helpers.cjs');

const {
  resolveIdentity,
  sanitizeSlug,
  loadUserMap,
  lockIdentity
} = require('../get-shit-done/bin/lib/identity.cjs');

// ─── sanitizeSlug ──────────────────────────────────────────────────────────────

describe('sanitizeSlug', () => {
  // Pure function tests — no temp dirs needed

  test('converts name to lowercase kebab-case', () => {
    assert.strictEqual(sanitizeSlug('Dan Halem'), 'dan-halem');
  });

  test('truncates to 30 characters', () => {
    const long = 'A Very Long Name That Exceeds Thirty Characters Easily';
    const result = sanitizeSlug(long);
    assert.ok(result.length <= 30, `slug ${result} exceeds 30 chars`);
  });

  test('trims trailing hyphen after truncation', () => {
    // Construct input where truncation at 30 leaves a trailing hyphen
    const input = 'abcdefghijklmnopqrstuvwxyz-foo bar';
    const result = sanitizeSlug(input);
    assert.ok(!result.endsWith('-'), `slug "${result}" ends with hyphen`);
    assert.ok(result.length <= 30);
  });

  test('returns null for null input', () => {
    assert.strictEqual(sanitizeSlug(null), null);
  });

  test('returns null for empty string', () => {
    assert.strictEqual(sanitizeSlug(''), null);
  });

  test('handles email local-part with plus', () => {
    assert.strictEqual(sanitizeSlug('dan.halem+work'), 'dan-halem-work');
  });

  test('handles special characters', () => {
    assert.strictEqual(sanitizeSlug("John O'Brien III"), 'john-o-brien-iii');
  });
});

// ─── loadUserMap ───────────────────────────────────────────────────────────────

describe('loadUserMap', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns empty object when file missing', () => {
    assert.deepStrictEqual(loadUserMap(tmpDir), {});
  });

  test('returns parsed JSON when file valid', () => {
    const map = { _version: 1, 'Dan Halem': 'dan-halem' };
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'),
      JSON.stringify(map)
    );
    assert.deepStrictEqual(loadUserMap(tmpDir), map);
  });

  test('returns empty object on corrupted JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'),
      'not valid json {{{{'
    );
    assert.deepStrictEqual(loadUserMap(tmpDir), {});
  });
});

// ─── lockIdentity ──────────────────────────────────────────────────────────────

describe('lockIdentity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('first registration creates file and returns slug', () => {
    const slug = lockIdentity(tmpDir, 'Dan Halem', 'dan-halem');
    assert.strictEqual(slug, 'dan-halem');

    const map = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.planning', 'user-map.json'), 'utf-8'
    ));
    assert.strictEqual(map['Dan Halem'], 'dan-halem');
    assert.strictEqual(map._version, 1);
  });

  test('same raw key returns locked slug (identity stability)', () => {
    lockIdentity(tmpDir, 'Dan Halem', 'dan-halem');
    const slug = lockIdentity(tmpDir, 'Dan Halem', 'different-slug');
    assert.strictEqual(slug, 'dan-halem', 'should return original locked slug');
  });

  test('different raw key with same slug gets numeric suffix', () => {
    lockIdentity(tmpDir, 'Dan Halem', 'dan-halem');
    const slug = lockIdentity(tmpDir, 'Daniel Halem', 'dan-halem');
    assert.strictEqual(slug, 'dan-halem-2');
  });
});

// ─── resolveIdentity ───────────────────────────────────────────────────────────

describe('resolveIdentity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    delete process.env.GSD_USER; // Safety cleanup
    cleanup(tmpDir);
  });

  test('resolves from git user.name', () => {
    const result = resolveIdentity(tmpDir);
    assert.strictEqual(result.slug, 'test-user');
    assert.strictEqual(result.source, 'git-name');
    assert.strictEqual(result.raw, 'Test User');
  });

  test('GSD_USER env var bypasses resolution', () => {
    process.env.GSD_USER = 'override-user';
    try {
      const result = resolveIdentity(tmpDir);
      assert.strictEqual(result.slug, 'override-user');
      assert.strictEqual(result.source, 'env');
    } finally {
      delete process.env.GSD_USER;
    }
  });

  test('falls back to email when user.name unset', () => {
    execSync('git config --unset user.name', { cwd: tmpDir, stdio: 'pipe' });
    // Also block global git config from leaking host identity
    const result = resolveIdentity(tmpDir);
    // Should fall back to email local-part 'test' or OS username
    assert.ok(result.source === 'git-email' || result.source === 'os-username',
      `Expected fallback source, got: ${result.source}`);
  });
});
```

### Complete context.test.cjs Structure

```javascript
/**
 * GSD Tools Tests - context.cjs
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  createTempMultiUserProject,
  cleanup
} = require('./helpers.cjs');

const {
  readActiveContext,
  writeActiveContext,
  resolveContext
} = require('../get-shit-done/bin/lib/context.cjs');

// ─── readActiveContext ─────────────────────────────────────────────────────────

describe('readActiveContext', () => {
  let tmpDir;

  beforeEach(() => {
    const project = createTempMultiUserProject();
    tmpDir = project.tmpDir;
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('reads valid .active file', () => {
    const ctx = readActiveContext(tmpDir, 'test-user');
    assert.strictEqual(ctx.project, 'test-project');
    assert.ok(ctx.resolved_path.includes('test-user'));
  });

  test('returns null for missing .active', () => {
    const project = createTempMultiUserProject({ withActive: false });
    const ctx = readActiveContext(project.tmpDir, 'test-user');
    assert.strictEqual(ctx, null);
    cleanup(project.tmpDir);
  });
});

// ─── resolveContext ────────────────────────────────────────────────────────────

describe('resolveContext', () => {
  // Tests for GSD_PROJECT override
  // Tests for .active pointing to nonexistent directory
  // Tests for full integration: identity + context
});
```

### getPlanningRoot Tests in core.test.cjs

```javascript
// ─── getPlanningRoot ───────────────────────────────────────────────────────────

describe('getPlanningRoot', () => {
  // CI/CD tests MUST use subprocess to avoid process.exit(1) in test runner

  test('CI env var blocks execution', () => {
    const { tmpDir } = createTempMultiUserProject();
    try {
      execFileSync(process.execPath, [TOOLS_PATH, 'init', 'progress'], {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true' },
      });
      assert.fail('Should have exited with error');
    } catch (err) {
      assert.ok(
        err.stderr.toString().includes('CI/CD environment detected'),
        `Expected CI error, got: ${err.stderr}`
      );
    } finally {
      cleanup(tmpDir);
    }
  });

  test('old flat structure detection blocks execution', () => {
    const tmpDir = createTempProject();
    // Create old-style PROJECT.md without users/ directory
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Project'
    );
    try {
      // Call should fail with old structure error
      // Test through subprocess since it calls error() -> process.exit(1)
    } finally {
      cleanup(tmpDir);
    }
  });
});
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js native `node:test` (built-in, no version to track separately) |
| Config file | None (native, no config needed) |
| Quick run command | `node --test tests/identity.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDEN-01 | Identity resolved from git user.name, sanitized to slug | unit | `node --test tests/identity.test.cjs` | Wave 0 |
| IDEN-02 | Fallback to email local-part, then OS username | unit | `node --test tests/identity.test.cjs` | Wave 0 |
| IDEN-03 | Slug locked in user-map.json on first use | unit | `node --test tests/identity.test.cjs` | Wave 0 |
| IDEN-04 | Active context in per-user .active file | unit | `node --test tests/context.test.cjs` | Wave 0 |
| IDEN-05 | GSD_USER/GSD_PROJECT env var overrides | unit | `node --test tests/identity.test.cjs && node --test tests/context.test.cjs` | Wave 0 |
| IDEN-06 | Old flat .planning/ structure detected with error | integration | `node --test tests/core.test.cjs` | Wave 0 |
| IDEN-07 | CI/CD environments detected and blocked | integration | `node --test tests/core.test.cjs` | Wave 0 |
| PATH-01 | getPlanningRoot returns user-qualified path | unit+integration | `node --test tests/core.test.cjs` | Wave 0 |
| PATH-10 | Init commands include active_user, active_project, planning_root | integration | `node --test tests/init.test.cjs` | Extend existing |

### Sampling Rate
- **Per task commit:** `node --test tests/identity.test.cjs` (or whichever test file was modified)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run test:coverage` (full suite + 70% line coverage)

### Wave 0 Gaps
- [ ] `tests/identity.test.cjs` -- covers IDEN-01, IDEN-02, IDEN-03, IDEN-05 (GSD_USER)
- [ ] `tests/context.test.cjs` -- covers IDEN-04, IDEN-05 (GSD_PROJECT)
- [ ] `tests/helpers.cjs` -- add `createTempMultiUserProject()` helper
- [ ] Extend `tests/core.test.cjs` -- covers IDEN-06, IDEN-07, PATH-01
- [ ] Extend `tests/init.test.cjs` -- covers PATH-10

No framework install needed -- test infrastructure fully exists.

---

## Specific Testing Considerations

### 1. Testing the "All Sources Fail" Error Path

The hardest test scenario is when git user.name, email, AND OS username all fail. This requires:
- Unsetting git user.name AND user.email in the temp repo
- Blocking global git config with `GIT_CONFIG_GLOBAL=/dev/null`
- `os.userInfo().username` always returns a value on normal systems

**Recommendation:** Test through subprocess with env vars `GSD_USER` unset, git config cleared, and verify the function falls through to OS username (which always works). Testing the true "all fail" path requires a Docker container with no home directory -- mark as LOW priority / skip.

### 2. Testing stderr Output for Registration Messages

The one-time registration message (`'GSD: Registered user dan-halem (from git user.name)'`) goes to stderr per CONTEXT.md. When testing through `runGsdTools()`:
- `result.error` captures stderr
- On success, stderr content doesn't affect `result.success`

When testing direct function calls, stderr goes to test runner output (cosmetic noise only).

### 3. Testing Git Config Overrides

Use `git config --local` to set values in temp repos (this is what `createTempGitProject` already does). To test "no user.name" fallback:

```javascript
// Unset local user.name so git falls through to email
execSync('git config --unset user.name', { cwd: tmpDir, stdio: 'pipe' });
// Block global/system config leaking host identity (important for dev machines)
// Option A: Set env vars in subprocess
// Option B: Use `git config --local user.name ""` (empty string counts as set)
```

**Pitfall:** On developer machines, global git config provides user.name even when local is unset. For reliable fallback testing, either:
1. Test email fallback by checking result.source is 'git-email' OR 'os-username' (accept either)
2. Use subprocess with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null`

### 4. CI/CD Detection in Test Environment

The test runner itself may be invoked in CI (e.g., GitHub Actions), where `CI=true` is already set. The CI/CD detection in `getPlanningRoot()` would fire in the actual test process.

**Key distinction:**
- Direct function tests of `getPlanningRoot()`: Dangerous -- could trigger `process.exit(1)` if `CI=true` is in the real env
- Subprocess tests: Safe -- can control env vars passed to child process

**Recommendation:** ALL tests for CI/CD detection and old-structure detection MUST use subprocess execution (runGsdTools or execSync). Never call `getPlanningRoot()` directly in a test that might run in CI.

For direct unit tests of identity.cjs and context.cjs functions that DON'T go through getPlanningRoot (i.e., testing `resolveIdentity`, `sanitizeSlug`, `readActiveContext` directly), there is no CI/CD check concern -- those functions don't check CI env vars.

### 5. Coverage Impact

Phase 01 creates two new modules:
- `identity.cjs` (~100 LOC) in `get-shit-done/bin/lib/`
- `context.cjs` (~300 LOC) in `get-shit-done/bin/lib/`
- `getPlanningRoot()` adds ~30 LOC to `core.cjs`

c8 coverage includes `get-shit-done/bin/lib/*.cjs` -- new modules are automatically in scope. The 70% line coverage threshold applies across ALL lib files. New modules with poor coverage could drop the overall percentage below threshold. **Thorough tests are not optional.**

---

## Open Questions

1. **Should `getPlanningRoot()` tests go in `core.test.cjs` or a new `planning-root.test.cjs`?**
   - What we know: The 01-RESEARCH.md mentions either option. The function lives in core.cjs.
   - What's unclear: Whether core.test.cjs is getting too large.
   - Recommendation: Add to `core.test.cjs` to match the one-test-file-per-module pattern. It's where the function lives.

2. **How to test the "all identity sources fail" error path reliably?**
   - What we know: os.userInfo().username almost always returns a value.
   - What's unclear: Whether we can reliably make it fail without Docker.
   - Recommendation: LOW priority. Test the error message content through a subprocess test where we can mock via env vars, or simply accept that the OS username fallback is the practical bottom of the chain and test that it works.

---

## Sources

### Primary (HIGH confidence)
- `tests/helpers.cjs` -- actual helper source code, read in full
- `tests/core.test.cjs` -- existing test patterns, read in full (440+ lines)
- `tests/init.test.cjs` -- init command test patterns, read first 100 lines
- `tests/config.test.cjs` -- env var testing pattern, read first 100 lines
- `.planning/codebase/TESTING.md` -- canonical testing documentation
- `.planning/codebase/CONVENTIONS.md` -- coding conventions including testing
- `scripts/run-tests.cjs` -- test runner implementation
- `package.json` -- test/coverage scripts

### Secondary (MEDIUM confidence)
- `.planning/phases/01-identity-and-path-resolution-core/01-RESEARCH.md` -- Phase 1 research
- `.planning/phases/01-identity-and-path-resolution-core/01-CONTEXT.md` -- User decisions
- `.planning/phases/01-identity-and-path-resolution-core/01-01-PLAN.md` -- Existing plan

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- native test runner already used across 15 test files, no changes needed
- Architecture: HIGH -- patterns directly derived from existing test files in the same codebase
- Pitfalls: HIGH -- identified from reading actual test code and understanding the env var / process.exit interaction model

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable infrastructure, unlikely to change)
