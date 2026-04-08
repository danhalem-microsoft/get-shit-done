# Phase 01: Identity and Path Resolution Core - Conventions Research

**Researched:** 2026-03-24
**Domain:** Node.js CommonJS coding conventions for identity resolution, context management, and path resolution modules
**Confidence:** HIGH

## Summary

This research documents the specific coding conventions, patterns, and anti-patterns needed to implement the three new modules (`identity.cjs`, `context.cjs`) and the `getPlanningRoot()` addition to `core.cjs`, plus `init.cjs` enhancements. All findings are derived directly from the existing codebase — 12 `.cjs` library modules, 16 test files, and the established conventions documentation.

The codebase follows a remarkably consistent set of conventions. New modules must match these conventions exactly: CommonJS with `.cjs` extension, zero external dependencies, `node:test`/`node:assert` for testing, fail-gracefully-return-null error handling, synchronous file I/O, `cwd` as the first parameter to all functions, and visual section separators with box-drawing characters. The existing `generateSlugInternal()`, `execGit()`, `safeReadFile()`, and `loadConfig()` functions in `core.cjs` provide all the primitives needed — no new library code needs to be hand-rolled for slug generation, git operations, safe file reading, or config loading.

**Primary recommendation:** Follow existing module structure exactly (JSDoc header, grouped requires, `───` section separators, `module.exports` at bottom), reuse `core.cjs` utilities aggressively, write one test file per new module using the `createTempProject()`/`createTempGitProject()` pattern from `tests/helpers.cjs`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full name slug generation: `'Dan Halem'` -> `'dan-halem'` using existing `generateSlugInternal()` pattern (lowercase, hyphens, alphanumeric)
- Maximum slug length: 30 characters, trim trailing hyphens after truncation
- Email local-part fallback: extract before `@`, apply same slug rules
- Identity fallback chain: `git config user.name` -> email local-part -> OS username (`os.userInfo().username`)
- Silent fallthrough for identity chain; source recorded in user-map.json
- Hard error if ALL sources fail: `'Cannot resolve user identity. Set git user.name or GSD_USER env var.'`
- user-map.json: flat JSON mapping at `.planning/user-map.json`, committed to git, slug collisions get numeric suffix
- Corrupted JSON recovery: treat as empty, re-register, log warning to stderr
- GSD_USER env var: direct slug bypass, transient, used as-is
- First-use auto-register with one-time info message to stderr
- New `identity.cjs` module in `lib/` (~100 LOC)
- New `context.cjs` module in `lib/` (~300 LOC)
- `getPlanningRoot()` function added to `core.cjs` (~30 LOC)
- `.active` file at `.planning/users/<user>/.active` (gitignored), JSON format
- Old flat structure detection: `.planning/PROJECT.md` AND absence of `.planning/users/` -> hard block
- CI/CD detection: check `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, `TRAVIS` -> hard block
- `getPlanningRoot()` check order: CI/CD -> old structure -> identity -> context -> return path
- `tryGetPlanningContext(cwd)` safe wrapper returns nulls when no .active exists
- CI/CD and old-structure checks still hard-error through tryGetPlanningContext
- init.cjs enhanced to include `active_user`, `active_project`, `planning_root` in all output

### Claude's Discretion
- Exact error message wording (within "short + actionable" style)
- Internal helper function signatures and naming
- Test file organization for identity.cjs and context.cjs
- Whether user-map.json gets a schema version field for future-proofing

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IDEN-01 | User identity resolved from `git config user.name`, sanitized to filesystem-safe slug | Reuse `generateSlugInternal()` from core.cjs + `execGit()` for git commands; slug pattern verified in codebase |
| IDEN-02 | Fallback chain: user.name -> email local-part -> OS username | `execGit()` for git queries, `os.userInfo().username` for OS fallback; all Node.js built-ins |
| IDEN-03 | Identity slug locked in `.planning/user-map.json` on first use | Follow `loadConfig()` safe-read pattern; `fs.writeFileSync()` for atomic writes |
| IDEN-04 | Active project context stored per-user at `.planning/users/<user>/.active` (gitignored) | Follow existing JSON read/write patterns from config.cjs |
| IDEN-05 | Active context overridable via `GSD_USER` and `GSD_PROJECT` env vars | `process.env` access; no new dependencies |
| IDEN-06 | Old flat `.planning/PROJECT.md` detected with clear error directing re-initialization | `fs.existsSync()` checks + `error()` from core.cjs |
| IDEN-07 | CI/CD environments detected; refuse to auto-create user directories | `process.env` checks + `error()` from core.cjs |
| PATH-01 | `getPlanningRoot(cwd)` in `core.cjs` returns user-qualified planning directory | Follows existing function patterns in core.cjs; returns string or calls `error()` |
| PATH-10 | `init.cjs` includes `active_user`, `active_project`, `planning_root` in all init JSON output | Follows existing init command pattern of building result objects |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs` | 16.7+ | All file I/O (readFileSync, writeFileSync, existsSync, mkdirSync) | Zero-dependency policy; every existing module uses it |
| Node.js built-in `path` | 16.7+ | Path joining, resolution, normalization | Cross-platform path safety; `path.join()` mandatory per conventions |
| Node.js built-in `child_process` | 16.7+ | Git command execution via `execSync` | Used by `execGit()` in core.cjs |
| Node.js built-in `os` | 16.7+ | `os.userInfo().username` for identity fallback | Already imported in several modules for `os.tmpdir()` |
| Node.js built-in `node:test` | 18+ (polyfilled for 16.7) | Test framework | Established in all 16 test files |
| Node.js built-in `node:assert` | 16.7+ | Test assertions | `assert.strictEqual`, `assert.deepStrictEqual`, `assert.ok` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `core.cjs` (internal) | current | `generateSlugInternal`, `execGit`, `safeReadFile`, `loadConfig`, `toPosixPath`, `output`, `error` | Every new module requires core.cjs utilities |
| `c8` (dev) | ^11.0.0 | Code coverage reporting | `npm run test:coverage` for coverage checks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs.writeFileSync` for user-map.json | write-temp-rename atomic pattern | CONTEXT.md explicitly scoped out atomic local writes; git handles merge conflicts |
| Custom slug library (slugify, etc.) | `generateSlugInternal()` | Already exists in core.cjs, proven pattern, zero deps |
| External identity resolution (whoami, etc.) | `os.userInfo().username` | Built-in, cross-platform, already used in codebase for `os.tmpdir()` |

**Installation:** No new packages needed. Zero production dependencies maintained.

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/lib/
  core.cjs        # ADD: getPlanningRoot(), tryGetPlanningContext()
  identity.cjs    # NEW: ~100 LOC, identity resolution + user-map.json
  context.cjs     # NEW: ~300 LOC, .active file I/O + env var overrides
  init.cjs        # MODIFY: add active_user, active_project, planning_root to all outputs

tests/
  identity.test.cjs  # NEW: test identity resolution module
  context.test.cjs   # NEW: test context management module
  core.test.cjs      # MODIFY: add getPlanningRoot() tests
  helpers.cjs        # MODIFY: add createTempMultiUserProject() helper
```

### Pattern 1: Module File Structure
**What:** Every `.cjs` module follows an exact template
**When to use:** All new modules (identity.cjs, context.cjs)
**Example:**
```javascript
// Source: Observed in all 12 existing lib/*.cjs modules
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

function sanitizeSlug(raw) {
  // Implementation
}

// --- User Map Management ---------------------------------------------------

function loadUserMap(cwd) {
  // Implementation
}

function lockIdentity(cwd, raw, slug) {
  // Implementation
}

module.exports = {
  resolveIdentity,
  sanitizeSlug,
  loadUserMap,
  lockIdentity,
};
```

**Key rules (enforced by convention):**
1. JSDoc one-liner at top using `ModuleName -- Description` format (em dash, not en dash)
2. `require()` statements grouped at top, alphabetical by module name
3. Visual separators: `// --- Section Name ---` using box-drawing U+2500 chars, 80 chars wide
4. Internal helpers defined AFTER public functions in the same section (no `Internal` suffix unless exported)
5. `module.exports = {}` at the very end of the file, listing only the public API

### Pattern 2: Function Signature Conventions
**What:** Consistent parameter ordering and naming
**When to use:** All new functions
**Example:**
```javascript
// Source: Observed across core.cjs, state.cjs, config.cjs, init.cjs

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

**Rules:**
- `cwd` is ALWAYS the first parameter when filesystem access is needed
- `raw` (boolean for output mode) is ALWAYS the last parameter on `cmd*` functions
- No destructured options objects for simple functions (only used when 4+ optional params)

### Pattern 3: Error Handling - Fail Gracefully
**What:** Utility functions return null/defaults, never throw; only `cmd*` functions call `error()`
**When to use:** All functions in identity.cjs and context.cjs
**Example:**
```javascript
// Source: core.cjs safeReadFile, loadConfig, findPhaseInternal patterns

// CORRECT: utility returns null on failure
function loadUserMap(cwd) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};  // Graceful fallback to empty map
  }
}

// CORRECT: hard errors only from chokepoint functions or cmd* functions
function getPlanningRoot(cwd) {
  // CI check - hard error
  if (isCIEnvironment()) {
    error('GSD Error: CI/CD environment detected. GSD is not supported in CI.');
  }
  // ... rest of resolution
}

// WRONG: throwing from a utility
function loadUserMap(cwd) {
  const raw = fs.readFileSync(mapPath, 'utf-8');  // throws on missing!
  return JSON.parse(raw);  // throws on bad JSON!
}
```

### Pattern 4: Reusing Core Utilities
**What:** Identity and context modules should import from core.cjs, not re-implement
**When to use:** All Phase 1 code
**Example:**
```javascript
// Source: core.cjs exports analysis

// Slug generation - REUSE generateSlugInternal()
const { generateSlugInternal } = require('./core.cjs');
function sanitizeSlug(raw) {
  const slug = generateSlugInternal(raw);
  if (!slug) return null;
  // Apply 30-char limit per CONTEXT.md decision
  const trimmed = slug.slice(0, 30).replace(/-+$/, '');
  return trimmed || null;
}

// Git commands - REUSE execGit()
const { execGit } = require('./core.cjs');
function getGitUserName(cwd) {
  const result = execGit(cwd, ['config', 'user.name']);
  return result.exitCode === 0 ? result.stdout : null;
}

// Safe file reading - REUSE safeReadFile()
const { safeReadFile } = require('./core.cjs');
function loadUserMap(cwd) {
  const content = safeReadFile(path.join(cwd, '.planning', 'user-map.json'));
  if (!content) return {};
  try { return JSON.parse(content); } catch { return {}; }
}

// Path normalization - REUSE toPosixPath()
const { toPosixPath } = require('./core.cjs');
function getResolvedPath(user, project) {
  return toPosixPath(path.join('.planning', 'users', user, project));
}
```

### Pattern 5: Init Command Enhancement Pattern
**What:** All init commands build a flat result object and call `output(result, raw)`
**When to use:** Adding `active_user`, `active_project`, `planning_root` to init.cjs outputs
**Example:**
```javascript
// Source: init.cjs cmdInitExecutePhase, cmdInitPlanPhase, cmdInitNewProject

function cmdInitSomething(cwd, phase, raw) {
  // 1. Load config
  const config = loadConfig(cwd);

  // 2. Gather context (NEW: add identity/context resolution)
  // const context = resolveContext(cwd);  // from context.cjs

  // 3. Build flat result object
  const result = {
    // Existing fields...
    executor_model: resolveModelInternal(cwd, 'gsd-executor'),
    phase_found: !!phaseInfo,
    // ...

    // NEW fields added to ALL init commands
    active_user: context?.active_user || null,
    active_project: context?.active_project || null,
    planning_root: context?.planning_root || null,
  };

  output(result, raw);
}
```

**Key pattern:** init commands never call `error()` for missing context — they return nulls. The `getPlanningRoot()` function is the chokepoint that hard-errors.

### Pattern 6: Stderr Info Messages (Not stdout)
**What:** Informational messages go to stderr to avoid corrupting JSON output on stdout
**When to use:** First-use registration message, corrupted JSON warnings
**Example:**
```javascript
// Source: core.cjs error() function writes to stderr

// CORRECT: info message on stderr (doesn't corrupt JSON stdout)
process.stderr.write('GSD: Registered user dan-halem (from git user.name)\n');

// CORRECT: warning on stderr
process.stderr.write('Warning: user-map.json corrupted, re-registering identity.\n');

// WRONG: info message on stdout (corrupts JSON output parsed by orchestrators)
console.log('Registered user dan-halem');  // NEVER DO THIS
process.stdout.write('Info: ...\n');       // NEVER DO THIS
```

### Anti-Patterns to Avoid
- **Throwing from utility functions:** Core convention is return null/defaults. Only `getPlanningRoot()` and `cmd*` functions may call `error()`.
- **Using `console.log()` for output:** All output goes through `output()` for JSON or `process.stderr.write()` for info/warnings. Never `console.log()`.
- **Manual path concatenation:** Always `path.join()`, then `toPosixPath()` for display. Never `cwd + '/.planning/'`.
- **Re-implementing existing utilities:** `generateSlugInternal()`, `execGit()`, `safeReadFile()`, `loadConfig()` already exist. Don't write new versions.
- **Async operations:** The entire codebase is synchronous (`readFileSync`, `writeFileSync`, `execSync`). Don't introduce `async/await` or Promises.
- **External dependencies:** Zero production dependencies is a hard constraint. No npm packages.
- **Nested try/catch:** Single try/catch at the boundary, return defaults in catch. Never nest.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slug generation | Custom lowercase/hyphen logic | `generateSlugInternal()` from core.cjs | Already tested, handles edge cases (empty strings, leading/trailing hyphens) |
| Git command execution | Raw `execSync('git ...')` | `execGit(cwd, args)` from core.cjs | Handles shell escaping, structured return with exitCode/stdout/stderr |
| Safe file reading | `try { readFileSync } catch {}` inline | `safeReadFile(filePath)` from core.cjs | Returns null on error, consistent pattern |
| Path normalization | `p.replace(/\\/g, '/')` | `toPosixPath(p)` from core.cjs | Cross-platform, already used everywhere |
| Regex escaping | Manual escaping | `escapeRegex(value)` from core.cjs | Handles all special regex characters |
| JSON output | `process.stdout.write(JSON.stringify(...))` | `output(result, raw, rawValue)` from core.cjs | Handles large output buffering (>50KB -> @file:) |
| Error exit | `process.exit(1)` | `error(message)` from core.cjs | Writes to stderr, exits with code 1 |

**Key insight:** core.cjs is the utility belt. Every new module's first import should be `require('./core.cjs')`. The existing utilities handle all the deceptive complexity (shell escaping, cross-platform paths, output buffering, safe file ops).

## Common Pitfalls

### Pitfall 1: Corrupting JSON stdout with info messages
**What goes wrong:** Writing info/debug messages to stdout breaks orchestrator JSON parsing.
**Why it happens:** Habit of using `console.log()` for debugging/status messages.
**How to avoid:** All informational messages go to `process.stderr.write()`. Only JSON output goes to stdout via `output()`.
**Warning signs:** Tests that parse stdout get unexpected prefixed text.

### Pitfall 2: Forgetting the 30-char slug limit
**What goes wrong:** `generateSlugInternal()` doesn't enforce length limits — it returns the full slug.
**Why it happens:** The length limit is a CONTEXT.md decision, not built into the existing utility.
**How to avoid:** `sanitizeSlug()` in identity.cjs must wrap `generateSlugInternal()` with `.slice(0, 30).replace(/-+$/, '')`.
**Warning signs:** Extremely long git usernames producing unwieldy directory names.

### Pitfall 3: Not handling concurrent slug registration
**What goes wrong:** Two users register the same slug simultaneously.
**Why it happens:** user-map.json is a shared file written without locking.
**How to avoid:** Per CONTEXT.md, git handles merge conflicts. `lockIdentity()` uses first-registration-wins semantics; collisions get numeric suffix. No file locking needed.
**Warning signs:** N/A — this is a git merge concern, not a runtime concern.

### Pitfall 4: Path separator issues on Windows
**What goes wrong:** `.planning\users\dan-halem\project` breaks path comparisons and display.
**Why it happens:** `path.join()` on Windows produces backslashes.
**How to avoid:** Use `toPosixPath()` on ALL paths used for display, storage, or JSON output. Only use raw `path.join()` results for filesystem operations.
**Warning signs:** Test failures on Windows (or CI running Windows) with path mismatches.

### Pitfall 5: Init commands calling error() for missing context
**What goes wrong:** Init commands hard-error when no .active file exists, preventing bootstrapping.
**Why it happens:** Using `getPlanningRoot()` directly in init commands instead of `tryGetPlanningContext()`.
**How to avoid:** Init commands use `tryGetPlanningContext()` which returns nulls. Only `getPlanningRoot()` hard-errors. The CONTEXT.md specifically addresses this bootstrap problem.
**Warning signs:** `gsd-tools.cjs init new-project` failing when there's no existing .active file.

### Pitfall 6: Breaking the old-structure detection heuristic
**What goes wrong:** False positive on old-structure detection when `.planning/PROJECT.md` exists alongside `users/`.
**Why it happens:** Checking only for PROJECT.md without checking for users/ directory.
**How to avoid:** Both conditions must be true: `.planning/PROJECT.md` exists AND `.planning/users/` does NOT exist. If users/ exists, it's the new structure.
**Warning signs:** New-structure projects being blocked as "legacy".

### Pitfall 7: GSD_USER bypassing user-map.json validation
**What goes wrong:** GSD_USER is expected to be used as-is (no slug generation), but developer applies slug generation to it.
**Why it happens:** Treating GSD_USER the same as git identity.
**How to avoid:** Per CONTEXT.md: GSD_USER is a direct slug, used as-is, transient, does NOT persist to user-map.json. Short-circuit identity resolution entirely when GSD_USER is set.
**Warning signs:** GSD_USER="Alice" being converted to "alice" instead of used literally.

## Code Examples

Verified patterns from the existing codebase:

### Module Import Pattern (for new modules)
```javascript
// Source: Every lib/*.cjs module follows this pattern
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execGit, generateSlugInternal, safeReadFile, toPosixPath, error } = require('./core.cjs');
```

### Git Identity Reading
```javascript
// Source: core.cjs execGit pattern
function getGitUserName(cwd) {
  const result = execGit(cwd, ['config', 'user.name']);
  return result.exitCode === 0 && result.stdout ? result.stdout : null;
}

function getGitUserEmail(cwd) {
  const result = execGit(cwd, ['config', 'user.email']);
  return result.exitCode === 0 && result.stdout ? result.stdout : null;
}
```

### Safe JSON File Read/Write
```javascript
// Source: core.cjs loadConfig, safeReadFile patterns
function loadUserMap(cwd) {
  const content = safeReadFile(path.join(cwd, '.planning', 'user-map.json'));
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch {
    // Corrupted JSON recovery per CONTEXT.md
    process.stderr.write('Warning: user-map.json corrupted, re-registering identity.\n');
    return {};
  }
}

function saveUserMap(cwd, map) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
}
```

### Directory Existence Check and Creation
```javascript
// Source: config.cjs cmdConfigEnsureSection
function ensureUserDir(cwd, userSlug) {
  const userDir = path.join(cwd, '.planning', 'users', userSlug);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}
```

### Environment Variable Checks
```javascript
// Source: init.cjs Brave Search detection pattern
function isCIEnvironment() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.CIRCLECI ||
    process.env.TRAVIS
  );
}
```

### Test File Structure
```javascript
// Source: tests/core.test.cjs, tests/helpers.cjs
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('identity resolution', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    // Initialize git repo for identity tests
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('resolves identity from git user.name', () => {
    // Arrange: git user.name already set in beforeEach

    // Act
    const identity = resolveIdentity(tmpDir);

    // Assert
    assert.strictEqual(identity.slug, 'test-user');
    assert.strictEqual(identity.source, 'git-user-name');
  });
});
```

### Test Helper: createTempMultiUserProject
```javascript
// Source: Extends existing createTempProject/createTempGitProject from helpers.cjs
function createTempMultiUserProject(userName = 'test-user', projectName = 'test-project') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));

  // Initialize git repo
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync(`git config user.name "${userName}"`, { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });

  // Create multi-user directory structure
  const userSlug = userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const projectDir = path.join(tmpDir, '.planning', 'users', userSlug, projectName);
  fs.mkdirSync(path.join(projectDir, 'phases'), { recursive: true });

  // Create user-map.json
  const userMap = { [userName]: userSlug };
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'user-map.json'),
    JSON.stringify(userMap, null, 2),
    'utf-8'
  );

  // Create .active file
  const activeDir = path.join(tmpDir, '.planning', 'users', userSlug);
  fs.writeFileSync(
    path.join(activeDir, '.active'),
    JSON.stringify({
      project: projectName,
      resolved_path: `.planning/users/${userSlug}/${projectName}`
    }, null, 2),
    'utf-8'
  );

  // Initial commit
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `.planning/` paths | `getPlanningRoot()` chokepoint | Phase 1 (this phase) | All path construction goes through single function |
| No user identity concept | `identity.cjs` with git-based resolution | Phase 1 (this phase) | Every GSD operation is user-qualified |
| No active project context | `.active` file per user + env var overrides | Phase 1 (this phase) | Multiple projects per user supported |
| init commands return bare paths | init commands include `active_user`, `active_project`, `planning_root` | Phase 1 (this phase) | Orchestrators get user context automatically |

**Deprecated/outdated:**
- Direct `.planning/` path construction: Will be replaced by `getPlanningRoot()` in Phase 2 (not this phase)

## Open Questions

1. **Schema version in user-map.json**
   - What we know: CONTEXT.md lists this as Claude's discretion
   - What's unclear: Whether a `"_version": 1` field is worth the complexity
   - Recommendation: Include it. Costs one line, enables future migration. Use `"_schema": 1` to avoid collision with user names. Example: `{"_schema": 1, "Dan Halem": "dan-halem"}`

2. **OS username edge cases**
   - What we know: `os.userInfo().username` works on Linux/macOS/Windows
   - What's unclear: Whether it can return empty string or throw on certain systems
   - Recommendation: Wrap in try/catch per fail-gracefully convention. Some containerized environments may not have a valid user. This is the last fallback before hard error, so handle defensively.

3. **Test isolation for env var overrides**
   - What we know: GSD_USER and GSD_PROJECT override identity resolution
   - What's unclear: Whether `process.env` modifications in tests leak between test cases
   - Recommendation: Save and restore env vars in beforeEach/afterEach. Node `node:test` runs tests in the same process, so env mutations are visible across tests. Use `delete process.env.GSD_USER` in afterEach.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert` (no version constraint beyond Node 16.7+) |
| Config file | None needed - uses `scripts/run-tests.cjs` to discover test files |
| Quick run command | `node --test tests/identity.test.cjs` |
| Full suite command | `npm test` (runs `node scripts/run-tests.cjs`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDEN-01 | Resolve identity from git user.name, sanitize to slug | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-02 | Fallback: user.name -> email -> OS username | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-03 | Lock identity in user-map.json | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-04 | .active file read/write per user | unit | `node --test tests/context.test.cjs` | No - Wave 0 |
| IDEN-05 | GSD_USER/GSD_PROJECT env var overrides | unit | `node --test tests/context.test.cjs` | No - Wave 0 |
| IDEN-06 | Old flat structure detection | unit | `node --test tests/core.test.cjs` | No - Wave 0 (add to existing file) |
| IDEN-07 | CI/CD env detection | unit | `node --test tests/core.test.cjs` | No - Wave 0 (add to existing file) |
| PATH-01 | getPlanningRoot returns user-qualified path | unit | `node --test tests/core.test.cjs` | No - Wave 0 (add to existing file) |
| PATH-10 | init.cjs includes active_user, active_project, planning_root | integration | `node --test tests/init.test.cjs` | Partially - existing file needs new tests |

### Sampling Rate
- **Per task commit:** `node --test tests/identity.test.cjs tests/context.test.cjs tests/core.test.cjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/identity.test.cjs` -- covers IDEN-01, IDEN-02, IDEN-03
- [ ] `tests/context.test.cjs` -- covers IDEN-04, IDEN-05
- [ ] `tests/helpers.cjs` update -- add `createTempMultiUserProject()` shared helper
- [ ] `tests/core.test.cjs` update -- add getPlanningRoot, CI detection, old structure detection tests
- [ ] `tests/init.test.cjs` update -- add active_user/active_project/planning_root field tests

## Sources

### Primary (HIGH confidence)
- `get-shit-done/bin/lib/core.cjs` - Full source analysis of all 498 lines: function signatures, exports, patterns
- `get-shit-done/bin/lib/init.cjs` - First 200 lines: init command pattern, result object construction
- `get-shit-done/bin/lib/config.cjs` - First 50 lines: config loading pattern, directory creation
- `.planning/codebase/CONVENTIONS.md` - Full 800-line conventions document
- `.planning/codebase/ARCHITECTURE.md` - Full 880-line architecture analysis
- `.planning/phases/01-identity-and-path-resolution-core/01-CONTEXT.md` - Full CONTEXT.md with locked decisions
- `tests/helpers.cjs` - Full 76-line test helper module
- `tests/core.test.cjs` - First 120 lines: test patterns, assertions, setup/teardown
- `package.json` - Test scripts, Node version constraints, dependencies
- `scripts/run-tests.cjs` - Test runner discovery mechanism
- `.planning/REQUIREMENTS.md` - Phase 1 requirement IDs: IDEN-01 through IDEN-07, PATH-01, PATH-10

### Secondary (MEDIUM confidence)
- None needed -- all findings derived from direct codebase analysis

### Tertiary (LOW confidence)
- `os.userInfo().username` behavior in containers -- based on Node.js documentation knowledge, not verified in exotic environments

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero-dependency Node.js built-ins, directly observed in codebase
- Architecture: HIGH - Module structure, function signatures, and patterns extracted from 12 existing modules
- Conventions: HIGH - 800-line CONVENTIONS.md plus cross-verified against actual source code
- Pitfalls: HIGH - Derived from locked CONTEXT.md decisions and observed codebase patterns

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable codebase, conventions unlikely to change)
