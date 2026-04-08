# Phase 01: Identity and Path Resolution Core - Research

**Project:** get-shit-done
**Phase:** 01-identity-and-path-resolution-core
**Researched:** 2026-03-24
**Confidence:** HIGH

## Summary

Phase 01 establishes three foundational modules (`identity.cjs`, `context.cjs`, and `getPlanningRoot()` in `core.cjs`) that enable multi-user GSD projects in a monorepo. The implementation is straightforward: resolve a user identity from git config (with fallbacks), manage an active project context file per user, and wire a single `getPlanningRoot()` function that returns user-qualified paths. All 13 init functions in `init.cjs` and `gsd-tools.cjs` are enhanced to include `active_user`, `active_project`, and `planning_root` in their output.

No external dependencies are needed. The entire implementation uses Node.js built-ins (`fs`, `path`, `os`, `child_process`) and existing `core.cjs` utilities. The codebase is mature (5725 LOC, 12 lib modules, 553 passing tests) with well-established patterns that new code must follow exactly: CommonJS with `.cjs` extension, synchronous file I/O, `cwd` as first parameter, fail-gracefully-return-null error handling, and visual `───` section separators. Every primitive needed already exists in `core.cjs` — `generateSlugInternal()` for slugs, `execGit()` for git config reads, `safeReadFile()` for file I/O, and `loadConfig()` for JSON loading. The new modules are composition layers that combine existing primitives.

The primary complexity is in the lazy-require pattern to avoid circular dependencies (core.cjs -> context.cjs -> core.cjs), the `tryGetPlanningContext()` safe wrapper for init commands that run before a project exists, and environment variable isolation in tests. Testing uses the existing `node:test`/`node:assert` infrastructure with temp git project fixtures. The only new test infrastructure needed is a `createTempMultiUserProject()` helper in `tests/helpers.cjs`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs` | N/A (Node >=16.7.0) | File I/O for user-map.json, .active files | Already used throughout codebase. `readFileSync`/`writeFileSync` pattern matches `loadConfig()`. |
| Node.js built-in `path` | N/A | Path construction and normalization | Already used. `path.join(cwd, '.planning', ...)` is the established pattern. |
| Node.js built-in `os` | N/A | `os.userInfo().username` for identity fallback | Must wrap in try/catch for Docker containers without `/etc/passwd` entries. |
| Node.js built-in `child_process` | N/A | Git command execution via `execGit()` wrapper | Already used via `core.cjs::execGit()`. No changes needed. |

### Testing
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | Built-in (Node 18+) | Test framework | Used across all 16 existing test files. |
| `node:assert` | Built-in | Test assertions (strict mode) | `assert.strictEqual`, `assert.deepStrictEqual`, `assert.ok`, `assert.throws`. |
| `c8` | ^11.0.0 (devDep) | Code coverage | 70% line threshold on `get-shit-done/bin/lib/*.cjs`. New modules included automatically. |

### Core Utilities from `core.cjs` (Reuse, Don't Rebuild)
| Utility | Purpose in Phase 01 |
|---------|---------------------|
| `generateSlugInternal(text)` | Base slug generation — wrap with 30-char limit |
| `execGit(cwd, args)` | Git config reads (`user.name`, `user.email`) |
| `safeReadFile(filePath)` | Reading `.active` files safely (returns null on error) |
| `loadConfig(cwd)` | Pattern to follow for `loadUserMap()` |
| `toPosixPath(p)` | Path normalization for `resolved_path` storage |
| `pathExistsInternal(cwd, path)` | Validating `.active` target directory |
| `output(result, raw, rawValue)` | Standard CLI JSON output (handles >50KB, @file: redirect) |
| `error(message)` | Hard errors (CI/CD detection, old structure, all-sources-fail) |

### Installation
```bash
# No new dependencies needed. Everything uses Node.js built-ins and existing project utilities.
```

## Architecture Patterns

### Project Structure
```
get-shit-done/bin/lib/
  identity.cjs        # [NEW] ~100 LOC: User identity resolution, slug sanitization, user-map.json
  context.cjs          # [NEW] ~300 LOC: Active context reader/writer, .active I/O, env var overrides
  core.cjs             # [MODIFIED] Add getPlanningRoot() (~30 LOC) + tryGetPlanningContext()
  init.cjs             # [MODIFIED] Add active_user, active_project, planning_root to all 13 init functions

tests/
  identity.test.cjs    # [NEW] Identity resolution tests
  context.test.cjs     # [NEW] Context management tests
  core.test.cjs        # [MODIFIED] Add getPlanningRoot tests (CI/CD, old structure)
  init.test.cjs        # [MODIFIED] Add context field assertions
  helpers.cjs          # [MODIFIED] Add createTempMultiUserProject() helper

# Runtime-created files (in downstream repos):
.planning/user-map.json            # Committed to git - identity slug mappings
.planning/users/<user>/.active     # Gitignored - active project context per user
```

### Pattern 1: Module File Structure
Every `.cjs` module follows an exact template:
```javascript
/**
 * Identity -- User identity resolution and slug management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit, generateSlugInternal, safeReadFile, error } = require('./core.cjs');

// --- Identity Resolution ---------------------------------------------------

function resolveIdentity(cwd) {
  // Implementation
}

// --- User Map Management ---------------------------------------------------

function loadUserMap(cwd) {
  // Implementation
}

module.exports = {
  resolveIdentity,
  sanitizeSlug,
  loadUserMap,
  lockIdentity,
};
```

**Key rules:**
1. JSDoc one-liner at top using `ModuleName -- Description` format (em dash)
2. `require()` statements grouped at top, alphabetical by module name
3. Visual separators: `// --- Section Name ---` using box-drawing chars, ~80 chars wide
4. `module.exports = {}` at the very end of the file
5. No `cmd*` prefix (these are internal plumbing, not CLI dispatch targets)
6. No `*Internal` suffix (unless the function is also exported alongside a public wrapper)

### Pattern 2: Lazy Require for Circular Dependency Avoidance
`getPlanningRoot()` lives in `core.cjs` but needs `context.cjs` which itself requires `core.cjs`. Use `require()` inside the function body, not at module scope.

```javascript
// In core.cjs - lazy require avoids circular dep
function getPlanningRoot(cwd) {
  // CI/CD check first (no external module needed)
  const ciVars = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];
  if (ciVars.some(v => process.env[v])) {
    error('GSD Error: CI/CD environment detected. GSD is not supported in CI.');
  }

  // Old structure check (no external module needed)
  if (fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md')) &&
      !fs.existsSync(path.join(cwd, '.planning', 'users'))) {
    error('GSD Error: Legacy .planning/ structure detected...');
  }

  // Lazy require to avoid circular dependency
  const { resolveContext } = require('./context.cjs');
  return resolveContext(cwd);
}
```

### Pattern 3: Identity Resolution Chain with Source Tracking
Sequential fallback: GSD_USER env -> git user.name -> git email local-part -> OS username. Each step tries only if previous is empty. Source is recorded in user-map.json.

```javascript
function resolveIdentity(cwd) {
  // 1. GSD_USER env var — direct slug, bypass everything
  const envUser = process.env.GSD_USER;
  if (envUser) {
    return { slug: envUser, source: 'GSD_USER', raw: envUser };
  }

  // 2. git config user.name
  const nameResult = execGit(cwd, ['config', 'user.name']);
  if (nameResult.exitCode === 0 && nameResult.stdout.trim()) {
    const raw = nameResult.stdout.trim();
    return resolveFromMap(cwd, raw, 'git-user-name');
  }

  // 3. git config user.email -> local-part
  const emailResult = execGit(cwd, ['config', 'user.email']);
  if (emailResult.exitCode === 0 && emailResult.stdout.trim()) {
    const localPart = emailResult.stdout.trim().split('@')[0];
    if (localPart) {
      return resolveFromMap(cwd, localPart, 'git-user-email');
    }
  }

  // 4. OS username
  try {
    const username = require('os').userInfo().username;
    if (username) {
      return resolveFromMap(cwd, username, 'os-username');
    }
  } catch {}

  // 5. All failed
  return null; // caller (getPlanningRoot) will hard error
}
```

### Pattern 4: Safe Wrapper for Pre-Project Init Commands
`tryGetPlanningContext(cwd)` wraps `getPlanningRoot()`, returning null fields when context isn't available. CI/CD and old-structure errors still propagate.

```javascript
function tryGetPlanningContext(cwd) {
  // CI/CD and old-structure checks still hard-error
  const ciVars = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'];
  if (ciVars.some(v => process.env[v])) {
    error('GSD Error: CI/CD environment detected. GSD is not supported in CI.');
  }
  if (fs.existsSync(path.join(cwd, '.planning', 'PROJECT.md')) &&
      !fs.existsSync(path.join(cwd, '.planning', 'users'))) {
    error('GSD Error: Legacy .planning/ structure detected...');
  }

  try {
    const { resolveContext } = require('./context.cjs');
    const ctx = resolveContext(cwd);
    return { active_user: ctx.user, active_project: ctx.project, planning_root: ctx.planning_root };
  } catch {
    return { active_user: null, active_project: null, planning_root: null };
  }
}
```

### Pattern 5: Function Signature Conventions
```javascript
// CLI command functions: cwd first, then specific args, then raw flag
function cmdSomething(cwd, arg1, arg2, raw) { }

// Internal utility functions: cwd first, then specific args
function resolveIdentity(cwd) { }
function loadUserMap(cwd) { }
function lockIdentity(cwd, rawName, slug) { }
function readActiveContext(cwd, user) { }

// Pure functions: just data in, data out
function sanitizeSlug(raw) { }
```

### Pattern 6: Error Handling — Fail Gracefully
Utility functions return null/defaults, never throw. Only `getPlanningRoot()` and `cmd*` functions call `error()`. Informational messages go to stderr to avoid corrupting JSON stdout.

```javascript
// CORRECT: utility returns null/empty on failure
function loadUserMap(cwd) {
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// CORRECT: stderr for info messages
process.stderr.write('GSD: Registered user dan-halem (from git user.name)\n');

// WRONG: throwing from utility, or console.log corrupting stdout
```

### Pattern 7: Testing — Environment Variable Save/Restore
```javascript
test('GSD_USER bypasses resolution chain', () => {
  const original = process.env.GSD_USER;
  process.env.GSD_USER = 'override-user';
  try {
    const result = resolveIdentity(tmpDir);
    assert.strictEqual(result.slug, 'override-user');
  } finally {
    if (original !== undefined) {
      process.env.GSD_USER = original;
    } else {
      delete process.env.GSD_USER;
    }
  }
});
```

### Pattern 8: Testing Functions That Call `error()` (process.exit)
Functions that call `error()` from core.cjs do `process.exit(1)`. They MUST be tested through subprocess execution, never by calling the function directly in the test process.

```javascript
test('CI/CD environment blocks execution', () => {
  const { tmpDir } = createTempMultiUserProject();
  try {
    execSync(`node "${TOOLS_PATH}" init progress`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' }
    });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err.stderr.includes('CI/CD environment detected'));
  } finally {
    cleanup(tmpDir);
  }
});
```

### Anti-Patterns to Avoid
- **Top-level require of context.cjs in core.cjs:** Creates circular dependency crash. Use lazy require inside function body.
- **Throwing from utility functions:** Return null/defaults. Only `error()` from `cmd*` functions and `getPlanningRoot()`.
- **Using `console.log()` for output:** All output through `output()` for JSON, `process.stderr.write()` for info/warnings.
- **Manual path concatenation:** Always `path.join()`, then `toPosixPath()` for display/storage. Never `cwd + '/.planning/'`.
- **Async operations:** Entire codebase is synchronous. Don't introduce `async/await` or Promises.
- **External dependencies:** Zero production dependencies is a hard constraint.
- **Persisting GSD_USER/GSD_PROJECT to .active:** Environment variables are explicitly transient.
- **Auto-creating `.planning/` directory in identity.cjs:** If `.planning/` doesn't exist, GSD hasn't been initialized. `new-project` handles directory creation.
- **Interactive prompts during identity resolution:** CONTEXT.md explicitly states "no interactive prompts."
- **Mocking `fs` in tests:** Use real temp directories. Project policy: filesystem fixtures, not mocks.
- **Calling `error()` directly in tests:** Kills the test runner. Use subprocess execution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug generation | Custom lowercase/hyphen regex | `core.cjs::generateSlugInternal(text)` + 30-char wrapper | Already tested, handles edge cases. |
| Git config reading | Raw `execSync('git config ...')` | `core.cjs::execGit(cwd, args)` | Handles errors, returns structured `{exitCode, stdout, stderr}`. |
| Safe file reads | Inline try/catch on `readFileSync` | `core.cjs::safeReadFile(filePath)` | Returns null on error. Consistent pattern. |
| Path normalization | Manual `replace(/\\/g, '/')` | `core.cjs::toPosixPath(p)` | Cross-platform, used everywhere. |
| JSON CLI output | `console.log(JSON.stringify(...))` | `core.cjs::output(result, raw, rawValue)` | Handles >50KB payloads, `@file:` redirect, `--raw` mode. |
| Error exit | `process.exit(1)` | `core.cjs::error(message)` | Writes to stderr, exits consistently. |
| Temp git repos in tests | Raw `fs.mkdtempSync` + `git init` inline | `helpers.cjs::createTempGitProject()` or new `createTempMultiUserProject()` | Handles config, initial commit, cleanup. |
| CLI subprocess tests | Raw `execSync` | `helpers.cjs::runGsdTools(args, cwd)` | Normalizes stdout/stderr/exit-code. |

## Common Pitfalls

### Pitfall 1: Circular Dependency Crash
**What goes wrong:** Putting `const { resolveContext } = require('./context.cjs')` at the top of `core.cjs` causes a partial module load — `context.cjs` gets an incomplete `core.cjs`.
**How to avoid:** Lazy-require inside `getPlanningRoot()` function body. By the time it executes, both modules are fully loaded.
**Warning sign:** `TypeError: resolveContext is not a function` at runtime.

### Pitfall 2: Environment Variable Leaks Between Tests
**What goes wrong:** Setting `process.env.CI = 'true'` in one test leaks to all subsequent tests, causing cascading "CI/CD environment detected" failures.
**How to avoid:** Always use `try/finally` with save/restore. For CLI subprocess tests, pass env via `execSync` options.
**Warning sign:** Tests pass individually but fail when run as a suite.

### Pitfall 3: Git Identity Leaking from Host Machine
**What goes wrong:** Tests read the developer's real `git config user.name` instead of the test fixture's value because global git config provides a value when local is unset.
**How to avoid:** For "no user.name" fallback testing, set `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_SYSTEM=/dev/null` in the subprocess env.
**Warning sign:** Tests pass on CI but fail on developer machines (or vice versa).

### Pitfall 4: `os.userInfo()` Throwing in Containers
**What goes wrong:** `os.userInfo()` throws `SystemError` in Docker containers without `/etc/passwd` entries.
**How to avoid:** Wrap in try/catch, return null to fall through to the hard error path.
**Warning sign:** Uncaught `SystemError: uv_os_get_passwd` in container environments.

### Pitfall 5: Corrupting JSON stdout with Info Messages
**What goes wrong:** Writing info/debug messages to stdout breaks orchestrator JSON parsing.
**How to avoid:** All informational messages go to `process.stderr.write()`. Only JSON output goes to stdout via `output()`.
**Warning sign:** Tests that parse stdout get unexpected prefixed text.

### Pitfall 6: Forgetting the 30-char Slug Limit
**What goes wrong:** `generateSlugInternal()` doesn't enforce length limits — it returns the full slug.
**How to avoid:** `sanitizeSlug()` must wrap with `.slice(0, 30).replace(/-+$/, '')`.
**Warning sign:** Extremely long git usernames producing unwieldy directory names.

### Pitfall 7: Init Commands Calling `error()` for Missing Context
**What goes wrong:** Init commands hard-error when no `.active` file exists, preventing bootstrapping of new projects.
**How to avoid:** Init commands use `tryGetPlanningContext()` which returns null fields. Only `getPlanningRoot()` hard-errors.
**Warning sign:** `gsd-tools.cjs init new-project` failing when there's no existing `.active` file.

### Pitfall 8: GSD_USER Bypassing user-map.json Validation
**What goes wrong:** Applying slug generation to `GSD_USER` when it should be used as-is.
**How to avoid:** Per CONTEXT.md: GSD_USER is a direct slug, transient, does NOT persist to user-map.json. Short-circuit identity resolution entirely when GSD_USER is set.
**Warning sign:** `GSD_USER="Alice"` being converted to `"alice"` instead of used literally.

### Pitfall 9: Old Structure Detection with Partial Migration
**What goes wrong:** A project has `.planning/PROJECT.md` AND `.planning/users/` — the old-structure check must fail-open.
**How to avoid:** Both conditions required: PROJECT.md exists AND users/ does NOT exist. If users/ exists alongside PROJECT.md, it's the new structure.
**Warning sign:** New-structure projects blocked as "legacy".

### Pitfall 10: Testing `getPlanningRoot()` Directly When CI=true
**What goes wrong:** Calling `getPlanningRoot()` directly in a test running in CI triggers `process.exit(1)`.
**How to avoid:** ALL tests for CI/CD detection and old-structure detection MUST use subprocess execution. Direct unit tests of `resolveIdentity`, `sanitizeSlug`, etc. are safe (they don't check CI env vars).
**Warning sign:** Test suite abruptly exits with no output on CI runners.

## Code Examples

### Slug Generation with 30-char Limit
```javascript
function sanitizeSlug(raw) {
  const base = generateSlugInternal(raw);
  if (!base) return null;
  if (base.length <= 30) return base;
  return base.substring(0, 30).replace(/-+$/, '');
}
```

### user-map.json Read/Write
```javascript
function loadUserMap(cwd) {
  const content = safeReadFile(path.join(cwd, '.planning', 'user-map.json'));
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    process.stderr.write('Warning: user-map.json corrupted, re-registering identity.\n');
    return {};
  }
}

function lockIdentity(cwd, raw, slug) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  let map = loadUserMap(cwd);

  if (map[raw]) return map[raw]; // First registration wins

  const existingSlugs = new Set(Object.values(map).filter(v => typeof v === 'string'));
  let finalSlug = slug;
  let counter = 2;
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  map[raw] = finalSlug;
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
  return finalSlug;
}
```

### Active Context File I/O
```javascript
function readActiveContext(cwd, user) {
  const activePath = path.join(cwd, '.planning', 'users', user, '.active');
  const raw = safeReadFile(activePath);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project) return null;
    return parsed; // { project, resolved_path }
  } catch {
    return null;
  }
}

function writeActiveContext(cwd, user, project) {
  const userDir = path.join(cwd, '.planning', 'users', user);
  const resolved_path = toPosixPath(path.join('.planning', 'users', user, project));
  const data = { project, resolved_path };
  fs.writeFileSync(path.join(userDir, '.active'), JSON.stringify(data, null, 2), 'utf-8');
}
```

### Init Function Enhancement Pattern
```javascript
function cmdInitExecutePhase(cwd, phase, raw) {
  // ... existing code ...

  // NEW: Add context fields (uses tryGetPlanningContext for graceful degradation)
  const ctx = tryGetPlanningContext(cwd);

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: ctx.planning_root,
    // ... existing fields unchanged ...
  };

  output(result, raw);
}
```

### Test Helper: createTempMultiUserProject
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
    JSON.stringify({ [userName]: userSlug }, null, 2)
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

  // gitignore and initial commit
  fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.planning/users/*/.active\n');
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return { tmpDir, userSlug, projectName };
}
```

### Dependency & Call Graph
```
gsd-tools.cjs
  |
  +--> init.cjs (all cmdInit* functions)
  |      |
  |      +--> core.cjs::tryGetPlanningContext(cwd)
  |             |
  |             +--> CI/CD env var check (process.env)
  |             +--> Old structure check (fs.existsSync)
  |             +--> context.cjs::resolveContext(cwd)  [lazy require]
  |                    |
  |                    +--> identity.cjs::resolveIdentity(cwd)
  |                    |      +--> process.env.GSD_USER (short-circuit)
  |                    |      +--> core.cjs::execGit (git config user.name/email)
  |                    |      +--> core.cjs::generateSlugInternal
  |                    |      +--> identity.cjs::loadUserMap / lockIdentity
  |                    |      +--> os.userInfo().username (last resort)
  |                    |
  |                    +--> process.env.GSD_PROJECT (short-circuit)
  |                    +--> context.cjs::readActiveContext(cwd, user)
```

## Open Questions

1. **Should `getPlanningRoot()` cache its result within a single process invocation?**
   - Each CLI call runs as a fresh `node` process, but multiple init functions in the same process would re-resolve context (execGit + file reads).
   - **Recommendation:** Yes, use module-level memoization keyed by `cwd`. The resolution involves git subprocess calls and file I/O — caching avoids redundant work.

2. **Should user-map.json include a `_version` or `_schema` field?**
   - CONTEXT.md marks this as Claude's Discretion. Costs one line, enables future migration.
   - **Recommendation:** Include it. Use `"_schema": 1` (avoids collision with user names that start with `_`). `loadUserMap()` filters it when iterating entries.

3. **Should `tryGetPlanningContext()` live in core.cjs or context.cjs?**
   - It wraps `getPlanningRoot()` (core.cjs) and is called by init.cjs.
   - **Recommendation:** Put it in core.cjs alongside `getPlanningRoot()`. Callers choose `getPlanningRoot()` (hard error) vs `tryGetPlanningContext()` (graceful null). Reduces import complexity for init.cjs.

4. **How to test the "all identity sources fail" error path reliably?**
   - `os.userInfo().username` almost always returns a value. True failure requires a container with no home directory.
   - **Recommendation:** LOW priority. Test the error message content through subprocess if feasible. Accept that OS username fallback is the practical bottom of the chain and verify it works.

5. **Should `getPlanningRoot()` tests go in `core.test.cjs` or a new file?**
   - The function lives in core.cjs. One-test-file-per-module is the convention.
   - **Recommendation:** Add to `core.test.cjs` to match the convention.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (Node 18.19.1) |
| Config file | None — `scripts/run-tests.cjs` discovers `tests/*.test.cjs` |
| Quick run command | `node --test tests/identity.test.cjs tests/context.test.cjs` |
| Full suite command | `npm test` (553 existing tests + new tests) |
| Coverage command | `npm run test:coverage` (c8, 70% line threshold) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Test File | Status |
|--------|----------|-----------|-----------|--------|
| IDEN-01 | Resolve identity from git user.name, sanitize slug | unit | `identity.test.cjs` | Wave 0 |
| IDEN-02 | Fallback chain: name -> email -> OS username | unit | `identity.test.cjs` | Wave 0 |
| IDEN-03 | Lock identity in user-map.json | unit | `identity.test.cjs` | Wave 0 |
| IDEN-04 | Active context stored in .active file | unit | `context.test.cjs` | Wave 0 |
| IDEN-05 | GSD_USER/GSD_PROJECT env var overrides | unit | `identity.test.cjs` + `context.test.cjs` | Wave 0 |
| IDEN-06 | Old flat structure detection | integration | `core.test.cjs` | Wave 0 (extend) |
| IDEN-07 | CI/CD environment detection | integration | `core.test.cjs` | Wave 0 (extend) |
| PATH-01 | getPlanningRoot returns user-qualified path | unit+integration | `core.test.cjs` | Wave 0 (extend) |
| PATH-10 | Init commands include context fields | integration | `init.test.cjs` | Extend existing |

### Sampling Rate
- **Per task commit:** `node --test tests/identity.test.cjs tests/context.test.cjs tests/core.test.cjs tests/init.test.cjs`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** `npm run test:coverage` (full suite + 70% line coverage)

### Wave 0 Gaps
- [ ] `tests/identity.test.cjs` — covers IDEN-01, IDEN-02, IDEN-03, IDEN-05 (GSD_USER)
- [ ] `tests/context.test.cjs` — covers IDEN-04, IDEN-05 (GSD_PROJECT)
- [ ] `tests/helpers.cjs` update — add `createTempMultiUserProject()` shared helper
- [ ] `tests/core.test.cjs` update — add getPlanningRoot, CI detection, old structure detection tests
- [ ] `tests/init.test.cjs` update — add active_user/active_project/planning_root field tests
- [ ] Framework install: None needed — all test infrastructure exists

---

## Sources

Synthesized from 3 research files:

- 01-phase-research-RESEARCH.md
- 01-conventions-RESEARCH.md
- 01-testing-RESEARCH.md

---
*Research completed: 2026-03-24*
*Phase: 01-identity-and-path-resolution-core*
*Ready for planning: yes*
