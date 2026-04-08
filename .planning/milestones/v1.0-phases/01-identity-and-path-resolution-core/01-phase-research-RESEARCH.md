# Phase 1: Identity and Path Resolution Core - Research

**Researched:** 2026-03-24
**Domain:** Node.js CommonJS module development — identity resolution, context management, path resolution
**Confidence:** HIGH

## Summary

Phase 1 establishes three new foundational modules (`identity.cjs`, `context.cjs`, and `getPlanningRoot()` in `core.cjs`) that enable multi-user GSD projects in a monorepo. The codebase is a mature Node.js CommonJS project (5725 LOC across 12 lib modules, 553 passing tests) with well-established patterns that new code must follow exactly.

The implementation is straightforward: resolve a user identity from git config (with fallbacks), manage an active project context file per user, and wire a single `getPlanningRoot()` function that returns user-qualified paths. All building blocks already exist in the codebase (`execGit`, `generateSlugInternal`, `safeReadFile`, `loadConfig` pattern). The primary complexity is in the 13 init functions that must be enhanced, the lazy-require pattern to avoid circular dependencies, and the `tryGetPlanningContext()` safe wrapper for init commands that run before a project exists.

No external dependencies are needed. The entire implementation uses Node.js built-ins (`fs`, `path`, `os`, `child_process`) and existing `core.cjs` utilities. The test infrastructure (Node.js built-in `node:test` + `node:assert`) is ready and includes helpers for creating temp git projects.

**Primary recommendation:** Follow existing codebase patterns exactly. Use `generateSlugInternal()` + 30-char truncation for slugs, `execGit()` for git config reads, `safeReadFile()`/`loadConfig()` pattern for JSON file I/O, and lazy `require()` inside `getPlanningRoot()` to avoid circular dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Identity slug generation: Full name slug via existing `generateSlugInternal()` pattern (lowercase, hyphens, alphanumeric), max 30 chars, trim trailing hyphens after truncation
- Email local-part fallback: Extract before `@`, apply same slug rules
- Identity fallback chain: `git config user.name` -> email local-part -> OS username, silent fallthrough, source recorded in user-map.json
- Hard error if ALL three sources fail: `'Cannot resolve user identity. Set git user.name or GSD_USER env var.'`
- user-map.json: Flat JSON `{rawKey: slug}`, committed to git, at `.planning/user-map.json`, first registration wins, slug collisions get numeric suffix (`-2`, `-3`, etc.)
- Concurrent write strategy: Git handles merge conflicts, no file locking
- Corrupted JSON recovery: Treat as empty, re-register, log warning to stderr
- GSD_USER: Direct slug, bypasses identity resolution and user-map.json entirely, transient (not persisted), used as-is
- First-use: Auto-register, one-time info message to stderr, no interactive prompts
- Module structure: `identity.cjs` (~100 LOC) and `context.cjs` (~300 LOC) in `lib/`
- Active context: `.planning/users/<user>/.active` (gitignored JSON), GSD_PROJECT overrides at runtime
- Error messages for missing .active and invalid .active target defined in CONTEXT.md
- Old flat structure detection: Check for `.planning/PROJECT.md` AND absence of `.planning/users/`, both conditions required
- Inline migration guidance in error message (no automated migration tool)
- CI/CD detection: Check `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, `TRAVIS`, hard error with no escape hatch
- getPlanningRoot() check order: CI/CD -> old structure -> identity -> context -> return path
- init.cjs: All init commands include `active_user`, `active_project`, `planning_root`
- Bootstrap: `tryGetPlanningContext(cwd)` safe wrapper returns nulls when no .active exists, CI/CD and old-structure still hard-error
- Test helper: `createTempMultiUserProject()` for Phase 1/2 tests

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
| IDEN-01 | User identity resolved from `git config user.name`, sanitized to filesystem-safe slug | `execGit(cwd, ['config', 'user.name'])` + `generateSlugInternal()` + 30-char truncation. Verified both APIs work correctly in codebase. |
| IDEN-02 | Fallback chain: user.name -> email local-part -> OS username | `execGit` returns `exitCode: 1` when config missing. Email: `split('@')[0]` then slug. OS: `os.userInfo().username` (wrap in try/catch for Docker). |
| IDEN-03 | Identity slug locked in `.planning/user-map.json` on first use | `loadConfig()` pattern for safe JSON read/write. Flat `{rawKey: slug}` format. First-write wins. Collision suffix `-2`, `-3`. |
| IDEN-04 | Active project context stored per-user at `.planning/users/<user>/.active` (gitignored) | JSON format `{project, resolved_path}`. `safeReadFile()` for reading. `fs.writeFileSync` for writing. Must be gitignored. |
| IDEN-05 | Active context overridable via `GSD_USER` and `GSD_PROJECT` env vars | `process.env.GSD_USER` checked first in identity resolution. `process.env.GSD_PROJECT` checked before .active file. Both transient. |
| IDEN-06 | Old flat `.planning/PROJECT.md` detected with clear error directing re-initialization | `fs.existsSync()` for PROJECT.md and `!fs.existsSync()` for users/ directory. Both conditions required. Error includes migration guidance inline. |
| IDEN-07 | CI/CD environments detected; refuse to auto-create user directories | Check 6 env vars (`CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, `TRAVIS`). Hard error via `error()`. First check in `getPlanningRoot()`. |
| PATH-01 | `getPlanningRoot(cwd)` in `core.cjs` returns user-qualified planning directory | ~30 LOC function in core.cjs using lazy-require of context.cjs to avoid circular deps. Returns `.planning/users/<user>/<project>/`. |
| PATH-10 | `init.cjs` includes `active_user`, `active_project`, `planning_root` in all init JSON output | 13 init functions enhanced. `tryGetPlanningContext(cwd)` safe wrapper for pre-project commands. Non-breaking addition. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fs` | N/A (Node >=16.7.0) | File I/O for user-map.json, .active files | Already used throughout codebase. `readFileSync`/`writeFileSync` pattern matches `loadConfig()`. |
| Node.js built-in `path` | N/A | Path construction and normalization | Already used. `path.join(cwd, '.planning', ...)` is the established pattern. |
| Node.js built-in `os` | N/A | `os.userInfo().username` for identity fallback | Available since Node 6. Must wrap in try/catch for edge cases (Docker containers without `/etc/passwd` entries). |
| Node.js built-in `child_process` | N/A | `execGit()` wrapper for git config reads | Already used via `core.cjs::execGit()`. No changes needed. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` | Built-in (Node 18+) | Test framework | All new test files. Current test runner: `node --test tests/*.test.cjs`. |
| `node:assert` | Built-in | Test assertions | Strict mode assertions throughout. `assert.strictEqual`, `assert.ok`, `assert.throws`. |
| `c8` | ^11.0.0 (devDependency) | Code coverage | Coverage threshold: 70% lines on `get-shit-done/bin/lib/*.cjs`. New modules included automatically. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `execGit(cwd, ['config', 'user.name'])` | `child_process.execSync('git config user.name')` directly | `execGit` already handles error cases, returns structured `{exitCode, stdout, stderr}`. Use existing wrapper. |
| `generateSlugInternal()` for slugs | Custom regex-based slug function | `generateSlugInternal` is the project's established slug pattern. Reuse with 30-char truncation wrapper. |
| Flat `user-map.json` | Structured JSON with metadata per user | Flat format is simpler, matches the decision. `_version` field is optional future-proofing. |

**Installation:**
```bash
# No new dependencies needed. Everything uses Node.js built-ins and existing project utilities.
```

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/bin/lib/
  identity.cjs        # [NEW] User identity resolution, slug sanitization, user-map.json management
  context.cjs          # [NEW] Active context reader/writer, .active file I/O, env var overrides, resolveContext()
  core.cjs             # [MODIFIED] Add getPlanningRoot() with lazy-require of context.cjs
  init.cjs             # [MODIFIED] Add active_user, active_project, planning_root to all 13 init functions

tests/
  identity.test.cjs    # [NEW] Identity resolution tests
  context.test.cjs     # [NEW] Context management tests
  helpers.cjs           # [MODIFIED] Add createTempMultiUserProject() helper

# Runtime-created files (in downstream repos):
.planning/user-map.json            # Committed to git - identity slug mappings
.planning/users/<user>/.active     # Gitignored - active project context per user
```

### Pattern 1: Lazy Require for Circular Dependency Avoidance
**What:** `getPlanningRoot()` lives in `core.cjs` but needs `context.cjs` which itself requires `core.cjs`. Use `require()` inside the function body, not at module scope.
**When to use:** When a core utility function needs to call a higher-level module that depends on core.
**Example:**
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
**Confidence:** HIGH - Verified: Node.js CommonJS supports lazy require inside function bodies. This is the idiomatic pattern. `identity.cjs` and `context.cjs` don't call `getPlanningRoot()`, so no actual cycle occurs at runtime.

### Pattern 2: Safe Wrapper for Pre-Project Init Commands
**What:** `tryGetPlanningContext(cwd)` wraps `getPlanningRoot()` in a try/catch, returning `{active_user: null, active_project: null, planning_root: null}` when context isn't available. CI/CD and old-structure errors still propagate.
**When to use:** In init commands that run before a project exists (`cmdInitNewProject`, `cmdInitResume`, `cmdInitQuick`).
**Example:**
```javascript
// In core.cjs or context.cjs
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
**Confidence:** HIGH - This pattern is explicitly defined in CONTEXT.md decisions.

### Pattern 3: Identity Resolution Chain with Source Tracking
**What:** Sequential fallback: GSD_USER env -> git user.name -> git email local-part -> OS username. Each step tries only if previous is empty. Source is recorded in user-map.json.
**When to use:** In `resolveIdentity(cwd)` — the single entry point for identity resolution.
**Example:**
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
    const email = emailResult.stdout.trim();
    const localPart = email.split('@')[0];
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
**Confidence:** HIGH - Verified: `execGit` returns `{exitCode: 1, stdout: ''}` when config is missing. `os.userInfo()` can throw in Docker (wrap in try/catch). All APIs verified in current Node.js 18.x environment.

### Pattern 4: Module Function Naming Convention
**What:** The codebase uses `cmd*` prefix for CLI-facing functions and `*Internal` suffix for internal helpers. New identity/context functions are internal plumbing (not directly exposed as CLI commands), so they should use neither prefix — they're module-level exports called by other modules.
**When to use:** Naming decisions for all new functions.
**Example:**
```javascript
// identity.cjs exports (called by context.cjs, not by CLI dispatcher)
module.exports = {
  resolveIdentity,    // Main entry point
  sanitizeSlug,       // Slug generation with 30-char limit
  loadUserMap,        // Read user-map.json
  lockIdentity,       // Write/update user-map.json
};

// context.cjs exports (called by getPlanningRoot in core.cjs)
module.exports = {
  readActiveContext,   // Read .active file
  writeActiveContext,  // Write .active file
  resolveContext,      // Full orchestration: identity + context
};
```
**Confidence:** HIGH - Follows existing patterns. `cmd*` is only for direct CLI dispatch targets. Internal module functions don't use prefix/suffix.

### Anti-Patterns to Avoid
- **Top-level require of context.cjs in core.cjs:** Creates a circular dependency at module load time. Use lazy require inside function body.
- **Throwing from utility functions:** Existing pattern is to return `null` on errors. Only `error()` from core.cjs calls `process.exit(1)`, and only at the CLI command level.
- **Auto-creating directories in identity.cjs:** If `.planning/` doesn't exist, GSD hasn't been initialized. `new-project` handles directory creation. `identity.cjs` should only create `user-map.json` inside an existing `.planning/` directory.
- **Persisting GSD_USER/GSD_PROJECT to .active:** Environment variables are explicitly transient per CONTEXT.md decisions.
- **Interactive prompts during identity resolution:** CONTEXT.md explicitly states "no interactive prompts or interruptions."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git config reading | Custom `execSync('git config ...')` parsing | `core.cjs::execGit(cwd, ['config', 'user.name'])` | Already handles errors, shell escaping, returns structured `{exitCode, stdout, stderr}`. |
| Slug generation | Custom regex sanitization | `core.cjs::generateSlugInternal(text)` + 30-char truncation wrapper | Established project pattern. The regex `[^a-z0-9]+` -> `-` with trim is already correct. |
| Safe file reads | Custom try/catch on `fs.readFileSync` | `core.cjs::safeReadFile(filePath)` | Returns `null` on any error. Already used across the codebase. |
| Path normalization | Custom slash replacement | `core.cjs::toPosixPath(p)` | Handles `path.sep` differences across platforms. |
| File existence checks | Custom `fs.existsSync` wrappers | `core.cjs::pathExistsInternal(cwd, path)` | Consistent error handling pattern. |
| JSON output to CLI | Custom `console.log(JSON.stringify(...))` | `core.cjs::output(result, raw, rawValue)` | Handles large payloads (>50KB), `@file:` redirect, `--raw` mode. |

**Key insight:** Every utility needed for this phase already exists in `core.cjs`. The new modules are essentially composition layers that combine existing primitives in new ways.

## Common Pitfalls

### Pitfall 1: Circular Dependency Crash
**What goes wrong:** Putting `const { resolveContext } = require('./context.cjs')` at the top of `core.cjs` causes a partial module load. `context.cjs` requires `core.cjs` which is still being evaluated, so `context.cjs` gets an incomplete module object missing later-defined exports.
**Why it happens:** Node.js CommonJS handles circular requires by returning the partially-loaded module at the point of the cycle.
**How to avoid:** Lazy-require inside `getPlanningRoot()` function body. The function isn't called during module loading, so by the time it executes, both modules are fully loaded.
**Warning signs:** `TypeError: resolveContext is not a function` at runtime.

### Pitfall 2: Environment Variable Leaks Between Tests
**What goes wrong:** Setting `process.env.CI = 'true'` in a CI/CD detection test leaks to subsequent tests, causing them to fail with "CI/CD environment detected" errors.
**Why it happens:** Node.js test runner (`node --test`) runs all tests in the same process. `process.env` is global mutable state.
**How to avoid:** Always use `afterEach` or `after` hooks to clean up: `delete process.env.CI`. Consider wrapping env var manipulation in a helper.
**Warning signs:** Tests pass individually but fail when run as a suite.

### Pitfall 3: user-map.json Write During Read-Only Operations
**What goes wrong:** Calling `resolveIdentity()` during a read-only operation (like `init progress`) unexpectedly creates/modifies `user-map.json` on first use.
**Why it happens:** Identity resolution auto-registers on first use per the CONTEXT.md decision.
**How to avoid:** This is expected behavior — but tests must account for it. Test assertions should verify user-map.json creation as a side effect of identity resolution. The one-time info message goes to stderr, not stdout, so it doesn't corrupt JSON output.
**Warning signs:** Tests that check file state before/after init commands must expect user-map.json to appear.

### Pitfall 4: os.userInfo() Throwing in Containers
**What goes wrong:** `os.userInfo()` throws `SystemError` in Docker containers that don't have a proper `/etc/passwd` entry for the running UID.
**Why it happens:** Node.js uses `getpwuid_r()` system call which fails when the UID has no passwd entry.
**How to avoid:** Wrap `os.userInfo().username` in a try/catch, return `null` to continue to the hard error path.
**Warning signs:** Uncaught `SystemError: uv_os_get_passwd` in Docker/container environments.

### Pitfall 5: Old Structure False Positive After Partial Migration
**What goes wrong:** A user creates `.planning/users/` manually but hasn't removed `PROJECT.md` from root. The old-structure check passes (users/ exists) but the project isn't properly initialized.
**Why it happens:** The heuristic only checks for the absence of `users/` directory, not for valid content within it.
**How to avoid:** This is acceptable — the check is intentionally lenient. If `users/` exists alongside `PROJECT.md`, it's assumed to be the new structure. The user will get a different error (no `.active` file) which guides them to run `/gsd:new-project`.
**Warning signs:** No false positive — the check handles this correctly per CONTEXT.md decisions.

### Pitfall 6: Slug Truncation Creating Duplicates
**What goes wrong:** Two different names like `'Alexander Hamilton-Roosevelt'` and `'Alexander Hamilton-Roosevel'` both truncate to the same 30-char slug.
**Why it happens:** 30-char truncation can lose distinguishing characters at the end.
**How to avoid:** The slug collision mechanism (numeric suffix `-2`, `-3`) handles this automatically. First registration wins.
**Warning signs:** Unexpected slug like `alexander-hamilton-roosevelt-2` — but this is correct behavior.

## Code Examples

Verified patterns from codebase investigation:

### Slug Generation with 30-char Limit
```javascript
// Source: core.cjs generateSlugInternal + CONTEXT.md 30-char decision
function sanitizeSlug(raw) {
  const base = generateSlugInternal(raw);
  if (!base) return null;
  if (base.length <= 30) return base;
  // Truncate and trim trailing hyphens
  return base.substring(0, 30).replace(/-+$/, '');
}
```

### Reading Git Config via execGit
```javascript
// Source: core.cjs execGit pattern, verified in test environment
const nameResult = execGit(cwd, ['config', 'user.name']);
// Returns: { exitCode: 0, stdout: 'Dan Halem', stderr: '' }
// Or:      { exitCode: 1, stdout: '', stderr: '' } when not set

if (nameResult.exitCode === 0 && nameResult.stdout.trim()) {
  const raw = nameResult.stdout.trim();
  // Use raw for slug generation
}
```

### Email Local-Part Extraction
```javascript
// Source: CONTEXT.md decision on email fallback
const email = emailResult.stdout.trim();
const localPart = email.split('@')[0];
// 'dan.halem+work@example.com' -> 'dan.halem+work'
const slug = sanitizeSlug(localPart);
// 'dan.halem+work' -> 'dan-halem-work' (via generateSlugInternal)
```

### user-map.json Read/Write Pattern
```javascript
// Source: follows loadConfig() pattern from core.cjs
function loadUserMap(cwd) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  try {
    const raw = fs.readFileSync(mapPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // File missing or corrupted — return empty map
    return {};
  }
}

function lockIdentity(cwd, raw, slug) {
  const mapPath = path.join(cwd, '.planning', 'user-map.json');
  let map = loadUserMap(cwd);

  // Check if raw key already mapped
  if (map[raw]) return map[raw];

  // Check for slug collision
  const existingSlugs = new Set(Object.values(map));
  let finalSlug = slug;
  let counter = 2;
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  map[raw] = finalSlug;
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf-8');
  return finalSlug;
}
```

### Active Context File I/O
```javascript
// Source: safeReadFile pattern from core.cjs, CONTEXT.md .active format
function readActiveContext(cwd, user) {
  const activePath = path.join(cwd, '.planning', 'users', user, '.active');
  const raw = safeReadFile(activePath);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project) return null;
    return parsed; // { project: 'frontend', resolved_path: '.planning/users/dan-halem/frontend' }
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
// Source: init.cjs cmdInitExecutePhase pattern + CONTEXT.md PATH-10
function cmdInitExecutePhase(cwd, phase, raw) {
  // ... existing code ...

  // NEW: Add context fields (uses tryGetPlanningContext for graceful degradation)
  const ctx = tryGetPlanningContext(cwd);

  const result = {
    // NEW context fields
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
// Source: extends existing createTempGitProject from helpers.cjs
function createTempMultiUserProject(userName = 'Test', userSlug = 'test', projectName = 'test-project') {
  const tmpDir = createTempGitProject();

  // Create multi-user directory structure
  const userDir = path.join(tmpDir, '.planning', 'users', userSlug);
  const projectDir = path.join(userDir, projectName);
  fs.mkdirSync(projectDir, { recursive: true });

  // Create .active file
  const activeData = {
    project: projectName,
    resolved_path: `.planning/users/${userSlug}/${projectName}`
  };
  fs.writeFileSync(path.join(userDir, '.active'), JSON.stringify(activeData, null, 2));

  // Create user-map.json
  const userMap = { [userName]: userSlug };
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'user-map.json'),
    JSON.stringify(userMap, null, 2)
  );

  return tmpDir;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single flat `.planning/` directory | User-qualified `.planning/users/<user>/<project>/` | Phase 1 (this phase) | Enables multi-user monorepo support |
| Hardcoded `.planning/` paths in all modules | `getPlanningRoot()` single chokepoint | Phase 1 adds function, Phase 2 migrates | All path resolution centralized |
| No user identity concept | `identity.cjs` resolves from git config | Phase 1 (this phase) | Each user gets isolated planning directory |
| No active project context | `.active` file per user + env var overrides | Phase 1 (this phase) | Multiple projects per user supported |

**Deprecated/outdated:**
- Flat `.planning/` structure: Detected and blocked with clear error. No automated migration — error message IS the migration guide.

## Open Questions

1. **Should `getPlanningRoot()` cache its result within a single process invocation?**
   - What we know: Each CLI call runs as a fresh `node` process. Multiple init functions in the same process would re-resolve context.
   - What's unclear: Whether the overhead of repeated `execGit` + file reads is noticeable.
   - Recommendation: Yes, use module-level memoization. The resolution involves git subprocess calls and file I/O — caching avoids redundant work. Cache key: `cwd`. Clear on test teardown if needed.

2. **Should user-map.json include a `_version` field?**
   - What we know: CONTEXT.md marks this as Claude's Discretion.
   - What's unclear: Whether future schema changes are likely.
   - Recommendation: Include `"_version": 1` as the first key. Costs nothing, enables future migration logic. `loadUserMap()` can ignore it when iterating entries (`Object.entries(map).filter(([k]) => !k.startsWith('_'))`).

3. **Should `tryGetPlanningContext()` live in core.cjs or context.cjs?**
   - What we know: It wraps `getPlanningRoot()` which is in core.cjs. It's called by init.cjs functions.
   - What's unclear: Whether placing it in core.cjs (next to `getPlanningRoot`) or context.cjs (with other context functions) is cleaner.
   - Recommendation: Put it in core.cjs alongside `getPlanningRoot()`. It's the safe counterpart — callers choose `getPlanningRoot()` (hard error) vs `tryGetPlanningContext()` (graceful null). Having both in the same module reduces import complexity for init.cjs.

4. **How should the corrupted user-map.json warning be formatted?**
   - What we know: CONTEXT.md says "Log a warning to stderr."
   - Recommendation: Use `process.stderr.write('Warning: user-map.json corrupted, re-registering identity.\n')` — matches the existing `error()` pattern of writing to stderr, but without `process.exit(1)`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (Node 18.19.1) |
| Config file | None — test runner uses `scripts/run-tests.cjs` to discover `tests/*.test.cjs` |
| Quick run command | `node --test tests/identity.test.cjs tests/context.test.cjs` |
| Full suite command | `npm test` (553 existing tests + new tests) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDEN-01 | Resolve identity from git user.name, sanitize slug | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-02 | Fallback chain: name -> email -> OS username | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-03 | Lock identity in user-map.json | unit | `node --test tests/identity.test.cjs` | No - Wave 0 |
| IDEN-04 | Active context stored in .active file | unit | `node --test tests/context.test.cjs` | No - Wave 0 |
| IDEN-05 | GSD_USER/GSD_PROJECT env var overrides | unit | `node --test tests/context.test.cjs` | No - Wave 0 |
| IDEN-06 | Old flat structure detection | unit | `node --test tests/core.test.cjs` | No - Wave 0 (extend existing) |
| IDEN-07 | CI/CD environment detection | unit | `node --test tests/core.test.cjs` | No - Wave 0 (extend existing) |
| PATH-01 | getPlanningRoot returns user-qualified path | unit | `node --test tests/core.test.cjs` | No - Wave 0 (extend existing) |
| PATH-10 | Init commands include context fields | integration | `node --test tests/init.test.cjs` | Partially - extend existing |

### Sampling Rate
- **Per task commit:** `node --test tests/identity.test.cjs tests/context.test.cjs tests/core.test.cjs tests/init.test.cjs`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/identity.test.cjs` -- covers IDEN-01, IDEN-02, IDEN-03 (slug sanitization, fallback chain, user-map.json)
- [ ] `tests/context.test.cjs` -- covers IDEN-04, IDEN-05 (.active file, env var overrides, resolveContext)
- [ ] Extend `tests/core.test.cjs` -- covers IDEN-06, IDEN-07, PATH-01 (old structure, CI/CD, getPlanningRoot)
- [ ] Extend `tests/init.test.cjs` -- covers PATH-10 (active_user, active_project, planning_root fields)
- [ ] Extend `tests/helpers.cjs` -- add `createTempMultiUserProject()` helper
- [ ] Framework install: None needed -- `node:test` and `node:assert` are built-in

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `get-shit-done/bin/lib/core.cjs` (498 LOC) — verified `execGit`, `generateSlugInternal`, `safeReadFile`, `loadConfig`, `toPosixPath`, `pathExistsInternal`, `output`, `error` APIs and their behavior
- Codebase inspection: `get-shit-done/bin/lib/init.cjs` (711 LOC) — verified all 12 `cmdInit*` functions and their output patterns
- Codebase inspection: `get-shit-done/bin/gsd-tools.cjs` — verified 13th init function (`cmdInitMistakes`) and CLI dispatch pattern
- Codebase inspection: `tests/helpers.cjs` — verified `createTempProject`, `createTempGitProject`, `runGsdTools`, `cleanup` helpers
- Codebase inspection: `tests/core.test.cjs`, `tests/init.test.cjs` — verified test patterns (node:test, node:assert, temp dirs)
- Live verification: `execGit(cwd, ['config', 'user.name'])` returns `{exitCode: 0, stdout: 'Dan Halem'}` and `{exitCode: 1, stdout: ''}` when not set
- Live verification: `generateSlugInternal('Dan Halem')` returns `'dan-halem'`; `generateSlugInternal('dan.halem+work@example.com')` returns `'dan-halem-work-example-com'` (confirms email local-part must be extracted first)
- Live verification: `os.userInfo().username` returns `'danhalem'` — confirmed API works on current platform
- Live verification: `npm test` — all 553 tests pass (baseline confirmed)

### Secondary (MEDIUM confidence)
- Node.js documentation: `os.userInfo()` can throw `SystemError` in Docker containers without `/etc/passwd` entries — known behavior since Node 8+
- Node.js documentation: CommonJS circular require returns partially-loaded module — well-documented behavior, lazy require is the standard solution

### Tertiary (LOW confidence)
- None — all findings verified against codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies. All Node.js built-ins verified in current environment.
- Architecture: HIGH - All patterns verified against existing codebase. Lazy require, safe wrapper, and module naming all follow established conventions.
- Pitfalls: HIGH - Circular dependency, env var leaks, os.userInfo() edge cases all verified through codebase investigation and live testing.

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable — no external dependency churn, all Node.js built-ins)
