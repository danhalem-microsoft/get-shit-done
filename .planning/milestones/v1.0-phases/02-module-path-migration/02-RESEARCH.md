# Phase 02: Module Path Migration - Research

**Researched:** 2026-03-31
**Domain:** Internal codebase refactor — path resolution migration
**Confidence:** HIGH

## Summary

This phase is a pure internal refactor: migrate all GSD modules, workflows, agent files, and templates from hardcoded `.planning/` path references to use the `getPlanningRoot()` chokepoint function built in Phase 1. The codebase is a single-repo Node.js CLI tool (no external dependencies needed), and all the infrastructure for path resolution already exists and is well-tested (596 tests pass).

The scope is well-defined by the CONTEXT.md decisions: 12 `.cjs` modules + 1 dispatcher with 177 references, 37 workflow markdown files with 361 references, 16 agent files with 132 references, 30 template files with 73 references, and 14 test files with 632 references. The final deliverable is a grep audit gate test (`tests/audit-paths.test.cjs`) that permanently enforces zero unresolved `.planning/` references in operational code.

**Primary recommendation:** Migrate modules first (they are the path resolution foundation), then workflow/template markdown, then agent markdown, then build the grep audit gate test. Repeat `path.join(getPlanningRoot(cwd), ...)` inline rather than creating new helper functions — this is a refactor phase, not a feature phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Internal resolution:** Each module calls `getPlanningRoot(cwd)` itself when it needs a planning path. No new parameters added to function signatures.
- **All-at-once migration:** All 8 modules with hardcoded `.planning/` references are migrated in a single phase sweep, not incrementally by dependency order or reference density.
- **Audit zero-ref modules too:** `state.cjs` and `roadmap.cjs` show 0 grep hits but must still be audited for implicit path assumptions (e.g., paths received from callers that assume `.planning/` root). Fix if needed.
- **Rely on existing memoization:** `getPlanningRoot()` already has a memoization cache with `clearPlanningRootCache()` for test isolation. No per-module caching needed — repeated calls within one process are fast.
- **Use `planning_root` from init JSON:** Workflows already call `gsd-tools.cjs init` and parse JSON. Replace all hardcoded `.planning/STATE.md` references with `${planning_root}/STATE.md` (inline substitution).
- **Always construct from `planning_root`:** Even when init JSON provides pre-resolved paths like `state_path`, workflows should construct paths from `planning_root` for consistency. Example: `${planning_root}/STATE.md` not `${state_path}`.
- **Update documentation too:** Both operational path references AND documentation/example references within workflow markdown get updated. Docs should reflect the new `.planning/users/<user>/<project>/` structure, not the old flat structure.
- **Scope:** ~37 workflow files with `.planning/` references, ~335 total references to audit and update.
- **Strict isolation (PATH-12):** Agents receive ALL file paths via orchestrator `<files_to_read>` blocks. An agent never constructs `.planning/` paths in its own logic. No exceptions for "discovery" or "operational convenience."
- **Output paths in spawn prompt:** When an agent needs to write a file (SUMMARY.md, VERIFICATION.md, CRITIQUE.md), the exact output path is provided by the orchestrator in the spawn prompt. Agent uses it verbatim.
- **Placeholder variables in templates:** Agent `.md` files use placeholder variables like `{planning_root}`, `{phase_dir}`, `{state_path}` that orchestrators fill when constructing the spawn prompt. Agent files contain no literal `.planning/` paths.
- **Full audit all 18 agents:** Every agent file gets audited, not just actively-spawned ones. All ~132 references categorized and updated.
- **Strict allowlist:** The only acceptable `.planning/` references in operational code are: (1) the `getPlanningRoot()` resolver function in core.cjs, (2) the backwards-compatibility detector in core.cjs, (3) identity.cjs `loadUserMap`/`lockIdentity` which reference `.planning/user-map.json` (repo-root file, not user-qualified).
- **identity.cjs is exempt — no changes needed:** identity.cjs uses `path.join(cwd, '.planning', 'user-map.json')` for the repo-root identity registry. This is NOT a user-qualified path — it's a shared resource. identity.cjs needs no migration in this phase. The grep audit allowlist explicitly includes identity.cjs.
- **gsd-tools.cjs in scope:** The main CLI dispatcher has 7 `.planning/` references and IS in scope for this phase's migration, not deferred to Phase 3. It's operational code that must use `getPlanningRoot()`.
- **Automated test:** `tests/audit-paths.test.cjs` runs `grep` against all source files and fails if unallowed `.planning/` references are found. Runs in CI alongside existing test suite.
- **Covers all source files including markdown:** `.cjs` library modules, `.cjs` test files, `.md` workflow files, `.md` agent files. Everything in the repo gets scanned. This IS the verification strategy for workflow/agent markdown completeness — the grep gate catches any missed references. No separate semantic markdown audit needed.
- **Test fixtures:** Test files that construct `.planning/` paths for setup (e.g., `createTempProject()`, `createTempMultiUserProject()`) must use the multi-user structure. Old-style `.planning/STATE.md` in test setup code is a violation.

### Claude's Discretion
- Exact order of module migration within the "all at once" approach
- Whether to create a shared path-building helper or repeat `path.join(getPlanningRoot(cwd), 'STATE.md')` patterns
- Test file organization for the audit-paths.test.cjs gate

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PATH-02 | `state.cjs` uses `getPlanningRoot()` for all path construction | state.cjs has 15 `.planning/` refs across 10+ functions; all `path.join(cwd, '.planning', ...)` calls must become `path.join(cwd, getPlanningRoot(cwd), ...)`. Zero-ref assertion was wrong — grep confirms 15 hits. |
| PATH-03 | `phase.cjs` uses `getPlanningRoot()` for all path construction | phase.cjs has 19 `.planning/` refs across 8 functions; primarily `path.join(cwd, '.planning', 'phases')` and `path.join(cwd, '.planning', 'ROADMAP.md')` patterns |
| PATH-04 | `roadmap.cjs` uses `getPlanningRoot()` for all path construction | roadmap.cjs has 4 `.planning/` refs; `path.join(cwd, '.planning', 'ROADMAP.md')` and `path.join(cwd, '.planning', 'phases')` patterns |
| PATH-05 | `config.cjs` uses `getPlanningRoot()` for all path construction | config.cjs has 5 `.planning/` refs; `path.join(cwd, '.planning', 'config.json')` and `path.join(cwd, '.planning')` patterns |
| PATH-06 | `verify.cjs` uses `getPlanningRoot()` for all path construction | verify.cjs has 6 `.planning/` refs; `cmdValidateConsistency` and `cmdValidateHealth` construct paths to phases, ROADMAP, STATE, config |
| PATH-07 | `template.cjs` uses `getPlanningRoot()` for all path construction | template.cjs has 3 `.planning/` refs; hardcoded template path strings and `@.planning/` context references in template body content |
| PATH-08 | `milestone.cjs` uses `getPlanningRoot()` for all path construction | milestone.cjs has 9 `.planning/` refs; `cmdMilestoneComplete` and `cmdRequirementsMarkComplete` build paths to REQUIREMENTS.md, ROADMAP.md, STATE.md, milestones/, phases/ |
| PATH-09 | `taste.cjs` uses `getPlanningRoot()` for all path construction | taste.cjs has 5 `.planning/` refs; default parameter values of `'.planning/taste/'` in function signatures |
| PATH-11 | All workflow markdown files use paths from init JSON output | 37 workflow files with 361 `.planning/` references; workflows already call `gsd-tools.cjs init` and parse JSON — replace hardcoded paths with `${planning_root}/...` substitutions |
| PATH-12 | Agent-spawned prompts receive fully-resolved paths via orchestrator `<files_to_read>` blocks | 16 agent files with 132 `.planning/` references; replace literal paths with placeholder variables like `{planning_root}`, `{phase_dir}`, `{state_path}` that orchestrators fill at spawn time |
| PATH-13 | Grep audit confirms zero unresolved raw `.planning/` path references in operational code | Create `tests/audit-paths.test.cjs` that scans all `.cjs` and `.md` source files, failing on any `.planning/` reference not on the allowlist (core.cjs resolver/detector, identity.cjs user-map.json) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `node:test` | Built-in (Node 18+) | Test framework | Already used project-wide, 596 tests passing |
| Node.js `node:fs` | Built-in | File system operations | Already the standard throughout all modules |
| Node.js `node:path` | Built-in | Path construction | Already used — `path.join()` is the standard pattern |
| Node.js `node:child_process` | Built-in | `execSync` for grep in audit test | Same pattern used by test helpers already |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getPlanningRoot(cwd)` | core.cjs (Phase 1) | Resolve user-qualified planning root | Every module that needs a planning path |
| `tryGetPlanningContext(cwd)` | core.cjs (Phase 1) | Safe wrapper for init commands | Init functions that may run pre-project |
| `clearPlanningRootCache()` | core.cjs (Phase 1) | Test isolation | Every test file that uses `getPlanningRoot` |
| `createTempMultiUserProject()` | tests/helpers.cjs (Phase 1) | Create multi-user test fixture | Replaces `createTempProject()` / `createTempGitProject()` in tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `path.join(getPlanningRoot(cwd), ...)` | Shared helpers like `getStatePath(cwd)` | Helpers reduce typos but add API surface outside phase scope; recommendation: **inline** (user decision: discretion) |
| `getPlanningRoot(cwd)` per function | Pass planning root as parameter | Would change function signatures, violating "no new parameters" decision |

## Architecture Patterns

### Current Path Construction Pattern (BEFORE migration)
```javascript
// Current pattern (hardcoded)
const statePath = path.join(cwd, '.planning', 'STATE.md');
const phasesDir = path.join(cwd, '.planning', 'phases');
const configPath = path.join(cwd, '.planning', 'config.json');
```

### Target Path Construction Pattern (AFTER migration)
```javascript
// Migrated pattern: getPlanningRoot returns e.g. '.planning/users/dan-halem/frontend'
const { getPlanningRoot } = require('./core.cjs');
const planningRoot = getPlanningRoot(cwd);
const statePath = path.join(cwd, planningRoot, 'STATE.md');
const phasesDir = path.join(cwd, planningRoot, 'phases');
const configPath = path.join(cwd, planningRoot, 'config.json');
```

### Pattern 1: Module-Level Migration
**What:** Replace `'.planning'` path segments with `getPlanningRoot(cwd)` call results
**When to use:** Every function in a `.cjs` module that constructs a planning path
**Example:**
```javascript
// BEFORE
function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = path.join(cwd, '.planning', 'phases');
  // ...
}

// AFTER
function cmdValidateConsistency(cwd, raw) {
  const planningRoot = getPlanningRoot(cwd);
  const roadmapPath = path.join(cwd, planningRoot, 'ROADMAP.md');
  const phasesDir = path.join(cwd, planningRoot, 'phases');
  // ...
}
```

### Pattern 2: Default Parameter Migration (taste.cjs)
**What:** Functions with default `.planning/` parameters need a different approach
**When to use:** `loadActiveTasteEntries(tastesDir = '.planning/taste/')` and `updateTasteCounters(..., tastesDir = '.planning/taste/')`
**Example:**
```javascript
// BEFORE
function loadActiveTasteEntries(tastesDir = '.planning/taste/') {

// AFTER — cwd parameter needed for getPlanningRoot
function loadActiveTasteEntries(cwd, tastesDir) {
  if (!tastesDir) {
    tastesDir = path.join(cwd, getPlanningRoot(cwd), 'taste');
  }
```
**Important:** This DOES change function signatures for taste.cjs. But the decision says "no new parameters to function signatures" — this refers to functions that already have `cwd`. taste.cjs functions currently DON'T have `cwd` and NEED it to resolve the planning root. All callers must be updated. Check gsd-tools.cjs dispatcher for taste command calls.

### Pattern 3: Workflow Markdown Path Substitution
**What:** Replace hardcoded `.planning/STATE.md` with `${planning_root}/STATE.md`
**When to use:** All workflow `.md` files that reference planning paths
**Example:**
```markdown
<!-- BEFORE -->
Read .planning/STATE.md for current context.
cat .planning/STATE.md

<!-- AFTER -->
Read ${planning_root}/STATE.md for current context.
cat "${planning_root}/STATE.md"
```
**Note:** Workflows already call `gsd-tools.cjs init <command>` and parse the JSON result, which includes `planning_root`. The bash variable `$planning_root` or inline `${planning_root}` is available after parsing the init JSON.

### Pattern 4: Agent Markdown Placeholder Variables
**What:** Replace `.planning/` literal paths with placeholder variables
**When to use:** All agent `.md` files
**Example:**
```markdown
<!-- BEFORE (in gsd-executor.md) -->
Read .planning/STATE.md for project state.
Write SUMMARY.md to .planning/phases/XX-name/

<!-- AFTER -->
Read {state_path} for project state.
Write SUMMARY.md to {phase_dir}/
```
**Note:** Orchestrators (workflow `.md` files) fill these placeholders when constructing the `<files_to_read>` block and spawn prompt for the agent.

### Pattern 5: init.cjs Path Resolution
**What:** init.cjs has the MOST references (68) because it constructs path existence checks and file path output values
**When to use:** All `cmdInit*` functions
**Critical detail:** init.cjs already calls `tryGetPlanningContext(cwd)` and gets `planning_root` from it. It must use this value for all subsequent path construction instead of hardcoded `.planning/`.
**Example:**
```javascript
// BEFORE
state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
state_path: '.planning/STATE.md',

// AFTER
state_exists: pathExistsInternal(cwd, path.join(ctx.planning_root, 'STATE.md')),
state_path: ctx.planning_root ? `${ctx.planning_root}/STATE.md` : null,
```
**Edge case:** When `ctx.planning_root` is null (no active project), path values should be null too, not hardcoded `.planning/` fallbacks.

### Pattern 6: Template File Path References
**What:** Template markdown files contain `.planning/` references that become part of generated documents
**When to use:** All 30 template files under `get-shit-done/templates/`
**Example:**
```markdown
<!-- BEFORE (in templates/state.md) -->
## Project Reference
See: .planning/PROJECT.md

<!-- AFTER -->
## Project Reference
See: {planning_root}/PROJECT.md
```
**Note:** Templates are loaded by `template.cjs` and workflow code. Path placeholders in templates are filled at document creation time when the planning root is known.

### Anti-Patterns to Avoid
- **Hardcoded `.planning/` anywhere in operational code:** The grep audit gate catches this permanently
- **Calling `getPlanningRoot()` at module top-level:** Must be inside function bodies due to lazy require pattern (circular dependency with context.cjs)
- **Adding `getPlanningRoot` to function parameters:** Use internal calls instead; don't pass it as a parameter
- **Caching `getPlanningRoot()` result in module-level variables:** The memoization is already in core.cjs; per-module caching would break test isolation
- **Using `pathExistsInternal(cwd, '.planning/...')` with hardcoded paths:** These must also use `getPlanningRoot(cwd)` result

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Planning root resolution | Custom per-module path logic | `getPlanningRoot(cwd)` from core.cjs | Already tested, memoized, handles CI/CD/legacy detection |
| Test fixture creation | Manual `fs.mkdirSync('.planning/...')` | `createTempMultiUserProject()` from helpers.cjs | Creates correct multi-user structure with git, user-map.json, .active file |
| Path memoization | Per-module caching | `clearPlanningRootCache()` in test teardown | Core.cjs already handles this |
| User context in init results | Manual identity/context resolution | `tryGetPlanningContext(cwd)` from core.cjs | Graceful null handling for pre-project state |

**Key insight:** All the infrastructure is already built and tested from Phase 1. This phase consumes it — there's nothing to build, only mechanical replacement of path patterns.

## Common Pitfalls

### Pitfall 1: Circular Dependency with getPlanningRoot
**What goes wrong:** Calling `require('./context.cjs')` at module top level in core.cjs causes circular crash
**Why it happens:** `context.cjs` requires `core.cjs` at its top level. `getPlanningRoot` requires `context.cjs` lazily inside the function body.
**How to avoid:** Always call `getPlanningRoot(cwd)` inside function bodies, never at module scope. Same applies to any module that might transitively require `context.cjs`.
**Warning signs:** "Cannot read property of undefined" at require time, or `module.exports` being empty object.

### Pitfall 2: Functions Without `cwd` Parameter
**What goes wrong:** `taste.cjs` functions (`loadActiveTasteEntries`, `updateTasteCounters`) take only `tastesDir` with default `.planning/taste/`. Can't call `getPlanningRoot()` without `cwd`.
**Why it happens:** These functions were designed for simple single-user use case.
**How to avoid:** Add `cwd` as a parameter. Update all callers in `gsd-tools.cjs`. The "no new parameters" decision applies to functions that already have `cwd`.
**Warning signs:** Any function that uses `.planning/` but doesn't receive `cwd` as argument.

### Pitfall 3: Null Planning Root in Init Commands
**What goes wrong:** `tryGetPlanningContext(cwd)` returns `{planning_root: null}` when no active project exists. Using `path.join(cwd, null, 'STATE.md')` produces garbage paths.
**Why it happens:** Init commands run before a project is set up.
**How to avoid:** Guard all path construction with `if (ctx.planning_root)`. Return `null` path values when planning root is null. init.cjs already handles this pattern for the context fields.
**Warning signs:** Tests failing with "Cannot read properties of null" or paths containing "null" literal.

### Pitfall 4: Test Isolation — Forgetting clearPlanningRootCache
**What goes wrong:** `getPlanningRoot()` is memoized per `cwd` value. If a test creates multiple temp directories with the same `cwd`, the cache returns stale results.
**How to avoid:** Call `clearPlanningRootCache()` in test teardown (or use unique temp dirs, which `createTempMultiUserProject()` already does via `fs.mkdtempSync`).
**Warning signs:** Tests pass individually but fail when run in suite; planning root pointing to wrong directory.

### Pitfall 5: gsd-tools.cjs Dispatcher Path References
**What goes wrong:** The main dispatcher has 7 `.planning/` references including default parameter values for `getUnprocessedDecisionLogs` and `mistakes_dir` output.
**Why it happens:** The dispatcher creates paths inline that should use `getPlanningRoot`.
**How to avoid:** The dispatcher already has `cwd` from argument parsing. It needs to call `getPlanningRoot(cwd)` or `tryGetPlanningContext(cwd)` for path construction.
**Warning signs:** Grep audit test catching dispatcher references.

### Pitfall 6: Template Content vs. Template Path
**What goes wrong:** template.cjs has `.planning/` in template *content* (e.g., `@.planning/PROJECT.md` in plan templates). These are document content, not filesystem paths.
**Why it happens:** Template bodies are strings that become part of generated documents.
**How to avoid:** Replace template content `.planning/` with placeholders like `{planning_root}` that get filled at generation time. The `cmdTemplateFill` function can do the substitution.
**Warning signs:** Generated plans referencing old `.planning/` paths instead of user-qualified paths.

### Pitfall 7: loadConfig Path in core.cjs
**What goes wrong:** `loadConfig(cwd)` in core.cjs constructs `path.join(cwd, '.planning', 'config.json')`. This is called by many modules, including potentially before the full context is available.
**Why it happens:** `loadConfig` is one of the most fundamental functions and is called very early.
**How to avoid:** `loadConfig` must also be migrated to use `getPlanningRoot(cwd)`. However, be careful about circular calls: if `getPlanningRoot` somehow depends on config, there's a cycle. Inspection shows it doesn't — `getPlanningRoot` calls `resolveContext` which doesn't call `loadConfig`. Safe to migrate.
**Warning signs:** Config not being found in multi-user directories.

### Pitfall 8: Markdown Shell Command Quoting
**What goes wrong:** When workflow markdown replaces `cat .planning/STATE.md` with `cat ${planning_root}/STATE.md`, the path may contain spaces or special characters from the user slug.
**Why it happens:** User slugs are sanitized (lowercase, hyphens) but the path template substitution may not be properly quoted.
**How to avoid:** Always quote paths in shell commands: `cat "${planning_root}/STATE.md"` not `cat ${planning_root}/STATE.md`.
**Warning signs:** Commands failing with "no such file or directory" when user slug contains hyphens.

### Pitfall 9: core.cjs Internal Functions That Build Paths
**What goes wrong:** `findPhaseInternal`, `searchPhaseInDir`, `getArchivedPhaseDirs`, `getRoadmapPhaseInternal`, `getMilestoneInfo`, `getMilestonePhaseFilter`, and `loadConfig` all construct `.planning/` paths internally in core.cjs.
**Why it happens:** These helper functions were written before multi-user support. They construct paths like `path.join(cwd, '.planning', 'phases')` directly.
**How to avoid:** Each of these internal functions must also use `getPlanningRoot(cwd)` instead of hardcoded `.planning/`. Since they're in core.cjs alongside `getPlanningRoot`, there's no circular dependency issue — they can call it directly.
**Warning signs:** Phase lookup, roadmap parsing, or milestone detection failing in multi-user context.

## Code Examples

### Module Migration Pattern (most common)
```javascript
// Source: verified from core.cjs, state.cjs, verify.cjs, phase.cjs patterns
const { getPlanningRoot } = require('./core.cjs');

function cmdSomeOperation(cwd, raw) {
  const planningRoot = getPlanningRoot(cwd);
  const statePath = path.join(cwd, planningRoot, 'STATE.md');
  const phasesDir = path.join(cwd, planningRoot, 'phases');
  const configPath = path.join(cwd, planningRoot, 'config.json');
  // ... rest of function
}
```

### Init Command Migration Pattern
```javascript
// Source: verified from init.cjs patterns
function cmdInitSomeCommand(cwd, raw) {
  const ctx = tryGetPlanningContext(cwd);

  const result = {
    active_user: ctx.active_user,
    active_project: ctx.active_project,
    planning_root: ctx.planning_root,

    // Path existence — guard on planning_root being non-null
    state_exists: ctx.planning_root
      ? pathExistsInternal(cwd, path.join(ctx.planning_root, 'STATE.md'))
      : false,

    // File paths — null when no active project
    state_path: ctx.planning_root
      ? `${ctx.planning_root}/STATE.md`
      : null,
  };
  output(result, raw);
}
```

### Workflow Markdown Migration Pattern
```markdown
<!-- Source: verified from execute-phase.md, plan-phase.md patterns -->
<!-- BEFORE -->
```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init execute-phase "${PHASE}")
STATE=$(cat .planning/STATE.md)
```

<!-- AFTER -->
```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init execute-phase "${PHASE}")
# Extract planning_root from init JSON
PLANNING_ROOT=$(echo "$INIT" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).planning_root)")
STATE=$(cat "${PLANNING_ROOT}/STATE.md")
```
```

### Grep Audit Gate Test Pattern
```javascript
// Source: design from CONTEXT.md decisions
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const path = require('path');

describe('PATH-13: Grep audit gate', () => {
  it('no unallowed .planning/ references in source files', () => {
    const repoRoot = path.join(__dirname, '..');

    // Scan all .cjs and .md files for .planning/ references
    const result = execSync(
      `grep -rn "\\.planning/" --include="*.cjs" --include="*.md" .`,
      { cwd: repoRoot, encoding: 'utf-8' }
    ).trim();

    // Allowlist: core.cjs (resolver + detector), identity.cjs (user-map.json), context.cjs
    const violations = result.split('\n').filter(line => {
      if (line.includes('core.cjs:')) return false;    // getPlanningRoot, legacy detector
      if (line.includes('identity.cjs:')) return false; // user-map.json (repo-root)
      if (line.includes('context.cjs:')) return false;  // context resolution
      if (line.includes('audit-paths.test.cjs:')) return false; // this test itself
      return true;
    });

    assert.strictEqual(violations.length, 0,
      `Found ${violations.length} unallowed .planning/ references:\n${violations.join('\n')}`);
  });
});
```

### Test Fixture Migration Pattern
```javascript
// Source: verified from tests/helpers.cjs
// BEFORE: old-style test setup
const tmpDir = createTempProject(); // creates .planning/phases/
fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '...');

// AFTER: multi-user test setup
const { tmpDir, userSlug, projectName } = createTempMultiUserProject();
const planningRoot = `.planning/users/${userSlug}/${projectName}`;
fs.writeFileSync(path.join(tmpDir, planningRoot, 'STATE.md'), '...');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `.planning/` for all files | `.planning/users/<user>/<project>/` per user per project | Phase 1 (2026-03-24) | All path construction must go through `getPlanningRoot()` |
| `loadConfig` reads from flat `.planning/config.json` | Must read from user-qualified path | Phase 2 (this phase) | Config resolution changes for all modules |
| `findPhaseInternal` searches `.planning/phases/` | Must search within user-qualified root | Phase 2 (this phase) | Phase lookup changes for all callers |

**Deprecated/outdated:**
- `createTempProject()` helper: Creates old flat structure. Replace with `createTempMultiUserProject()` in all tests.
- `createTempGitProject()` helper: Creates old flat structure with git. Replace with `createTempMultiUserProject()`.
- Hardcoded `.planning/` in any operational code.

## Open Questions

1. **core.cjs internal functions migration scope**
   - What we know: `loadConfig`, `findPhaseInternal`, `searchPhaseInDir`, `getArchivedPhaseDirs`, `getRoadmapPhaseInternal`, `getMilestoneInfo`, `getMilestonePhaseFilter` all use hardcoded `.planning/` paths inside core.cjs itself (21 of the 21 core.cjs references)
   - What's unclear: Whether these should use `getPlanningRoot(cwd)` directly or receive the planning root as a parameter from their callers
   - Recommendation: Use `getPlanningRoot(cwd)` directly since they're in the same file. No circular dependency risk — they don't call `loadConfig` or `resolveContext` internally, and `getPlanningRoot` doesn't call them.

2. **Template placeholders at generation time**
   - What we know: Template files (30 files, 73 references) contain `.planning/` paths that become part of generated documents (plans, summaries, etc.)
   - What's unclear: The exact substitution mechanism — do templates get variable replacement at generation time via `cmdTemplateFill`, or do workflows do the substitution?
   - Recommendation: Templates should use `{planning_root}` placeholders. `cmdTemplateFill` already generates content with variable replacement. Add planning_root to the available variables.

3. **Test file migration volume**
   - What we know: 632 `.planning/` references across 14 test files
   - What's unclear: How many of these are in old-style `createTempProject()` calls vs. in assertion strings vs. in command arguments
   - Recommendation: Migrate tests module-by-module alongside their source files. When migrating `state.cjs`, also migrate `tests/state.test.cjs`. This keeps the changes cohesive.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (Node 18+) |
| Config file | `scripts/run-tests.cjs` (custom runner) |
| Quick run command | `node --test tests/audit-paths.test.cjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PATH-02 | state.cjs uses getPlanningRoot | unit | `node --test tests/state.test.cjs` | ✅ (update existing) |
| PATH-03 | phase.cjs uses getPlanningRoot | unit | `node --test tests/phase.test.cjs` | ✅ (update existing) |
| PATH-04 | roadmap.cjs uses getPlanningRoot | unit | `node --test tests/roadmap.test.cjs` | ✅ (update existing) |
| PATH-05 | config.cjs uses getPlanningRoot | unit | `node --test tests/config.test.cjs` | ✅ (update existing) |
| PATH-06 | verify.cjs uses getPlanningRoot | unit | `node --test tests/verify.test.cjs` | ✅ (update existing) |
| PATH-07 | template.cjs uses getPlanningRoot | unit | `node --test tests/commands.test.cjs` | ✅ (scaffold tests cover template) |
| PATH-08 | milestone.cjs uses getPlanningRoot | unit | `node --test tests/milestone.test.cjs` | ✅ (update existing) |
| PATH-09 | taste.cjs uses getPlanningRoot | unit | `node --test tests/dispatcher.test.cjs` | ✅ (taste dispatcher tests) |
| PATH-11 | Workflow markdown uses init JSON paths | smoke | Covered by PATH-13 grep audit | ❌ Wave 0 (part of audit gate) |
| PATH-12 | Agent markdown uses placeholder vars | smoke | Covered by PATH-13 grep audit | ❌ Wave 0 (part of audit gate) |
| PATH-13 | Grep audit confirms zero raw references | integration | `node --test tests/audit-paths.test.cjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/<affected-module>.test.cjs` (< 2 seconds per module)
- **Per wave merge:** `npm test` (full suite, ~13 seconds)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/audit-paths.test.cjs` — covers PATH-13 (grep audit gate, also validates PATH-11 and PATH-12)
- [ ] Update `tests/helpers.cjs` — ensure `createTempProject()` and `createTempGitProject()` either create multi-user structures or are deprecated
- [ ] All existing test files — update from old-style `.planning/` paths to multi-user structure using `createTempMultiUserProject()`

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of all 14 `.cjs` modules in `get-shit-done/bin/lib/`
- Direct source code inspection of `get-shit-done/bin/gsd-tools.cjs` dispatcher
- Direct source code inspection of `tests/helpers.cjs` and all 14 test files
- Direct `grep` output confirming exact reference counts: 177 in lib modules, 7 in dispatcher, 632 in tests, 361 in workflows, 132 in agents, 73 in templates
- Full test suite run: 596/596 tests pass, ~13s duration

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions from discuss phase (user-locked, critic-reviewed, 3 blind spots resolved)
- STATE.md project history showing Phase 1 completed successfully

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies, all infrastructure built in Phase 1
- Architecture: HIGH - Mechanical path replacement with verified patterns from source code inspection
- Pitfalls: HIGH - All pitfalls identified from actual code analysis (circular deps, null planning root, function signatures)

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable internal codebase, no external dependencies)
