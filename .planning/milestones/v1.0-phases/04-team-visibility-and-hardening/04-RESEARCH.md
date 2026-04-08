# Phase 4: Team Visibility and Hardening - Research

**Researched:** 2026-04-07
**Domain:** GSD internal CLI tooling — cross-user visibility, config layering, commit attribution, migration/hardening
**Confidence:** HIGH

## Summary

Phase 4 is entirely internal to the GSD codebase with zero external dependencies. The implementation involves: (1) a new `team-status` command that scans `.planning/users/*/` directories and reads STATE.md frontmatter, (2) adding env var overrides to the existing `loadConfig()` with a new `config resolve` debug command, (3) injecting user/project scope prefixes into `cmdCommit()`, (4) replacing the legacy structure hard-error with a migration flow, and (5) fixing the PATH-13 bootstrap violation in `new-project.md`.

All patterns are well-established from Phases 1–3. The codebase already has `_sources` tracking in `loadConfig()`, `extractFrontmatter()` for YAML parsing, `tryGetPlanningContext()` for graceful resolution, and `resolveContext()` for user/project identification. The work is primarily wiring existing capabilities into new commands and hardening edge cases.

**Primary recommendation:** Structure work around dependency chains: (1) config env var layer + resolve command first (foundation for everything), (2) cross-user scanning + team-status, (3) commit attribution, (4) migration flow + PATH-13 fix. The migration flow is the riskiest piece because it modifies `tryGetPlanningContext()` behavior and touches the legacy detection code path used by `getPlanningRoot()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **team-status:** Summary table output with one row per user: User, Project, Phase, Progress, Last Active
- **team-status:** Show ALL users under `.planning/users/` regardless of activity recency — no dimming or hiding
- **team-status:** Show only each user's active project (from `.active` file)
- **team-status:** CLI command `gsd-tools.cjs team-status` + thin workflow markdown
- **team-status:** Read-only cross-user scope — path resolver supports reading other users' STATE.md without modifying files (TEAM-03)
- **team-status:** STATE.md frontmatter only — never parse full document body (TEAM-02)
- **config resolve:** Single key + source display — `gsd-tools.cjs config resolve <key>` shows resolved value, source layer, and full chain checked
- **config resolve:** `GSD_*` prefix env vars with explicit key-to-env mapping table
- **config resolve:** 4-tier precedence: hardcoded defaults < shared config < per-project config < `GSD_*` env vars (TEAM-04)
- **config resolve:** Leverages existing `_sources` tracking from Phase 3
- **commit attribution:** Scope prefix format: `docs(dan/frontend/phase-03): complete execution`
- **commit attribution:** Planning commits only — code commits stay clean
- **commit attribution:** Auto-detect in `cmdCommit()` — no caller changes needed
- **PATH-13 bootstrap:** This is a chicken-and-egg problem, not a simple grep fix. `mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"` in new-project.md happens BEFORE `getPlanningRoot()` can resolve.
- **PATH-13 bootstrap:** Claude has discretion on approach: (1) new init bootstrap command, (2) allowlist exception, or (3) restructure cmdInitProjectSetup output
- **PATH-13 bootstrap:** Re-run PATH-13 grep audit after fix
- **STATE.md schema:** Validation on read, not write — team-status handles missing fields gracefully with defaults
- **STATE.md schema:** Standardized fields: `milestone`, `status`, `last_updated`, `progress.total_phases`, `progress.completed_phases`, `progress.total_plans`, `progress.completed_plans`
- **STATE.md schema:** Best-effort reads — corrupted/missing STATE.md shows "(no data)" instead of crashing
- **Migration:** Explicitly added to scope (overrides REQUIREMENTS.md "Out of Scope")
- **Migration:** Detect on all commands — old flat `.planning/PROJECT.md` triggers migration instead of hard error
- **Migration:** Offer both paths: auto-migrate command or manual instructions
- **Migration:** Auto-migrate moves files from `.planning/` into `.planning/users/<detected-user>/<project-name>/`, keeps `.planning/config.json` at root
- **Migration:** Project name from existing PROJECT.md

### Claude's Discretion
- Exact team-status table formatting (column widths, "Last Active" relative time format)
- STATE.md frontmatter field names and defaults for schema enforcement
- Which config keys get GSD_* env var mapping (start with most commonly overridden)
- Internal implementation of cross-user directory scanning (permission error handling, missing dirs)
- Migration error handling (what happens if move fails partway through)
- How `config resolve` formats the "layers checked" section

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEAM-01 | `/gsd:team-status` scans `.planning/users/*/` and displays each user's active projects, current phase, last activity | New `cmdTeamStatus()` function scanning user dirs, reading STATE.md frontmatter via `extractFrontmatter()`, and formatting summary table |
| TEAM-02 | `/gsd:team-status` reads only STATE.md frontmatter (machine-readable) | Existing `extractFrontmatter()` from `frontmatter.cjs` parses YAML frontmatter without touching document body |
| TEAM-03 | Path resolver supports cross-user read scope for team-status without breaking isolation | New `scanAllUsers()` function reads `.planning/users/*/` directories; does NOT use `getPlanningRoot()` (which is single-user scoped) |
| TEAM-04 | Config precedence: hardcoded defaults < shared config < per-project config < env vars | Modify `loadConfig()` to add env var layer on top of existing two-layer merge; explicit `ENV_KEY_MAP` constant |
| TEAM-05 | `gsd-tools.cjs config resolve <key>` shows which layer a value came from | New `cmdConfigResolve()` command leveraging `_sources` tracking already in `loadConfig()` |
| TEAM-06 | Git commit messages include user/project context | Modify `cmdCommit()` to auto-detect active context via `tryGetPlanningContext()` and prepend `user/project/` to scope prefix |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | 16.7+ | fs, path, child_process, os | Zero-dependency constraint (project convention) |
| node:test | built-in | Testing framework | Established codebase pattern |
| node:assert | built-in | Assertions | Established codebase pattern |

No external libraries needed. This is pure internal tooling work.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `extractFrontmatter()` | internal | Parse STATE.md YAML frontmatter | team-status reads, schema validation |
| `tryGetPlanningContext()` | internal | Soft identity/context resolution | Migration detection, commit attribution |
| `resolveIdentity()` | internal | User slug resolution | Cross-user scanning identity |
| `loadConfig()` | internal | Config merge with `_sources` | Config resolve command, env var layer |

## Architecture Patterns

### Recommended Project Structure Changes

```
get-shit-done/bin/lib/
├── core.cjs             # + env var layer in loadConfig(), migration flow in tryGetPlanningContext()
├── commands.cjs         # + cmdCommit() attribution prefix, + cmdTeamStatus(), + cmdConfigResolve()
├── context.cjs          # + scanAllUsers() for cross-user visibility
├── init.cjs             # + cmdInitTeamStatus(), + cmdInitProjectSetup bootstrap_path
└── gsd-tools.cjs        # + team-status, config resolve, migrate dispatcher cases

get-shit-done/workflows/
├── team-status.md       # NEW — thin wrapper calling gsd-tools team-status
├── new-project.md       # MODIFIED — fix PATH-13 bootstrap references
└── ... existing files

tests/
├── team-status.test.cjs # NEW — cross-user scanning tests
├── config.test.cjs      # MODIFIED — env var override tests
├── commands.test.cjs    # MODIFIED — commit attribution tests
└── migration.test.cjs   # NEW — legacy migration flow tests
```

### Pattern 1: Cross-User Directory Scanning (team-status)
**What:** Read-only traversal of ALL user directories under `.planning/users/` to aggregate status
**When to use:** team-status command
**Key insight:** This deliberately does NOT use `getPlanningRoot()` (which resolves to the CURRENT user's active project). Instead, it directly scans the filesystem.
**Implementation:**

```javascript
// Source: Direct implementation based on existing directory conventions
function scanAllUsers(cwd) {
  const usersDir = path.join(cwd, '.planning', 'users');
  const results = [];
  
  try {
    const entries = fs.readdirSync(usersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '_archived') continue;
      
      const userSlug = entry.name;
      const userDir = path.join(usersDir, userSlug);
      
      // Read .active file for active project
      let activeProject = null;
      try {
        const active = JSON.parse(fs.readFileSync(path.join(userDir, '.active'), 'utf-8'));
        activeProject = active.project;
      } catch { /* no active project */ }
      
      // Read STATE.md frontmatter from active project
      let stateFm = {};
      let lastActivity = null;
      if (activeProject) {
        const statePath = path.join(userDir, activeProject, 'STATE.md');
        try {
          const content = fs.readFileSync(statePath, 'utf-8');
          stateFm = extractFrontmatter(content);
          const stat = fs.statSync(statePath);
          lastActivity = stat.mtime.toISOString();
        } catch { /* corrupted or missing */ }
      }
      
      results.push({
        user: userSlug,
        project: activeProject || '(none)',
        phase: stateFm.current_phase || stateFm.status || 'unknown',
        progress: formatProgress(stateFm.progress),
        last_active: lastActivity,
      });
    }
  } catch { /* users dir doesn't exist */ }
  
  return results;
}
```

### Pattern 2: Env Var Layer in Config Resolution
**What:** Add `GSD_*` environment variables as highest-priority config override
**When to use:** Config resolution chain (TEAM-04)
**Key insight:** The existing `loadConfig()` already has `_sources` tracking. Adding a third layer (env vars) slots naturally on top.
**Implementation:**

```javascript
// Source: Extension of existing loadConfig() pattern in core.cjs
// Explicit mapping — only recognized keys have env var support
const ENV_KEY_MAP = {
  model_profile:    'GSD_MODEL_PROFILE',
  commit_docs:      'GSD_COMMIT_DOCS',
  parallelization:  'GSD_PARALLELIZATION',
  granularity:      'GSD_GRANULARITY',
  brave_search:     'GSD_BRAVE_SEARCH',
  // workflow keys
  research:         'GSD_RESEARCH',
  plan_checker:     'GSD_PLAN_CHECKER',
  verifier:         'GSD_VERIFIER',
  nyquist_validation: 'GSD_NYQUIST_VALIDATION',
};

// In loadConfig(), after per-project merge, check env vars:
for (const [key, envName] of Object.entries(ENV_KEY_MAP)) {
  const envVal = process.env[envName];
  if (envVal !== undefined) {
    // Parse booleans and numbers
    result[key] = envVal === 'true' ? true : envVal === 'false' ? false : envVal;
    sources[key] = `env:${envName}`;
  }
}
```

### Pattern 3: Commit Attribution Auto-Detect
**What:** Auto-prepend user/project scope prefix to planning commit messages
**When to use:** `cmdCommit()` in commands.cjs
**Key insight:** `tryGetPlanningContext()` returns null fields gracefully — perfect for auto-detection. Only planning commits (those staging `.planning/` paths) get the prefix.
**Implementation:**

```javascript
// Source: Extension of existing cmdCommit() in commands.cjs
function cmdCommit(cwd, message, files, raw, amend) {
  // ... existing validation and staging ...
  
  // Auto-detect user/project for attribution
  if (message && !amend) {
    const ctx = tryGetPlanningContext(cwd);
    if (ctx && ctx.active_user && ctx.active_project) {
      // Only add prefix for planning commits (scope format: "type(scope): msg")
      const scopeMatch = message.match(/^(\w+)\(([^)]+)\):\s*/);
      if (scopeMatch) {
        const prefix = `${ctx.active_user}/${ctx.active_project}/`;
        const existingScope = scopeMatch[2];
        // Don't double-prefix if already has user/project
        if (!existingScope.startsWith(prefix)) {
          message = message.replace(
            scopeMatch[0],
            `${scopeMatch[1]}(${prefix}${existingScope}): `
          );
        }
      }
    }
  }
  
  // ... existing commit logic ...
}
```

### Pattern 4: Legacy Migration Flow
**What:** Replace hard error on legacy `.planning/PROJECT.md` with migration offer
**When to use:** `tryGetPlanningContext()` and `getPlanningRoot()` in core.cjs
**Key insight:** The current code in both functions has identical legacy detection: `if (fs.existsSync(PROJECT.md) && !fs.existsSync(users/))`. Replace the `error()` call with migration logic.
**Implementation approach:**

```javascript
// In tryGetPlanningContext() — soft detection for init commands
if (isLegacyStructure) {
  return { active_user: null, active_project: null, planning_root: null, legacy_detected: true };
}

// In getPlanningRoot() — interactive detection for user-facing commands
// New cmdMigrate() in commands.cjs handles the actual file moves:
// 1. Read project name from .planning/PROJECT.md
// 2. Resolve current user identity
// 3. Move all files from .planning/* to .planning/users/<user>/<project>/
//    EXCEPT: config.json, user-map.json, users/ dir itself
// 4. Create .active pointing to new location
// 5. Git commit the migration
```

### Anti-Patterns to Avoid
- **Using `getPlanningRoot()` for cross-user reads:** This resolves to CURRENT user's active project. Team-status must scan ALL users.
- **Modifying other users' files in team-status:** Read-only cross-user access. Never write to another user's directory.
- **Auto-deriving env var names from config keys:** Use explicit mapping table. `GSD_PLAN_CHECKER` not `GSD_PLAN_CHECK` — the config key and env var name may differ.
- **Adding migration logic to every command individually:** Handle it once in `getPlanningRoot()` / `tryGetPlanningContext()`.
- **Writing migration logic as a workflow:** This should be a CLI command (`gsd-tools.cjs migrate`) that the workflow/error message invokes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom parser for STATE.md | `extractFrontmatter()` from `frontmatter.cjs` | Already handles nested objects, arrays, edge cases |
| Config source tracking | New tracking mechanism | `_sources` object from `loadConfig()` | Phase 3 already built this — just surface it |
| User identity resolution | Read git config directly | `resolveIdentity()` from `identity.cjs` | Handles GSD_USER env var, email fallback, user-map.json locking |
| Active project detection | Parse `.active` files manually | `readActiveContext()` from `context.cjs` | Handles missing files, JSON parsing gracefully |
| Relative time formatting | Complex date diff library | Simple helper: days/hours ago | No external dep needed for approximate recency |

**Key insight:** Phase 4 is primarily WIRING existing capabilities, not building new ones. The hard work of identity resolution, frontmatter parsing, config loading, and context management was done in Phases 1-3.

## Common Pitfalls

### Pitfall 1: Cross-User Permission Errors
**What goes wrong:** Reading another user's `.active` file or STATE.md fails due to filesystem permissions
**Why it happens:** On shared machines, user directories may have restricted permissions
**How to avoid:** Wrap ALL cross-user reads in try/catch. Return "(no data)" for any user whose files can't be read. Never let one user's permission error crash the whole team-status.
**Warning signs:** Tests passing locally but failing on shared dev machines

### Pitfall 2: .active File Is Gitignored
**What goes wrong:** team-status can't read other users' `.active` files because they're gitignored and only exist locally
**Why it happens:** `.active` files are intentionally gitignored (machine-specific). On a freshly-cloned repo, no `.active` files exist for other users.
**How to avoid:** For team-status, fall back to showing the user's most recently modified project (by STATE.md mtime) when no `.active` file exists. Or show "(no active project)" and list their projects.
**Warning signs:** team-status works locally but shows no data for teammates after git clone

### Pitfall 3: Migration Partial Failure
**What goes wrong:** File move fails partway through (e.g., disk full, permission denied), leaving files split between old and new locations
**Why it happens:** `fs.renameSync` is atomic per-file but not across multiple files
**How to avoid:** (1) Create target directory first, (2) Copy files rather than move, (3) Verify all copies succeeded, (4) Only then delete originals. OR: use `fs.cpSync` (Node 16.7+) for recursive copy, then `fs.rmSync` for cleanup.
**Warning signs:** Interrupted migration leaves both `.planning/PROJECT.md` and `.planning/users/` existing simultaneously

### Pitfall 4: Env Var Type Coercion
**What goes wrong:** `GSD_COMMIT_DOCS=false` is read as string `"false"` (truthy!) instead of boolean `false`
**Why it happens:** `process.env` values are always strings
**How to avoid:** Explicit type parsing: `'true' → true`, `'false' → false`, numeric strings → numbers. The `ENV_KEY_MAP` approach with a parsing helper solves this.
**Warning signs:** Setting env vars to "false" doesn't actually disable features

### Pitfall 5: Commit Attribution Breaking Non-Planning Commits
**What goes wrong:** Code commits get user/project prefix: `feat(dan/frontend/auth): add login` — ugly and confusing
**Why it happens:** `cmdCommit()` doesn't distinguish planning vs. code commits
**How to avoid:** Only apply attribution when the commit message already has a planning-like scope (e.g., `docs(...)`) or when files being committed are under `.planning/`. The safest heuristic: check if any staged file path contains `.planning/`.
**Warning signs:** Reviewing git log shows user/project prefix on non-planning commits

### Pitfall 6: PATH-13 Audit Regression
**What goes wrong:** New code or workflow files introduce raw `.planning/` references that bypass path resolution
**Why it happens:** Easy to write `.planning/` directly when building team-status or migration logic, since these features inherently work with the `.planning/` container directory
**How to avoid:** (1) Add new files to audit allowlist where legitimate, (2) Use path variables from init JSON in workflow files, (3) Run audit after every change
**Warning signs:** `audit-paths.test.cjs` fails with new violations

## Code Examples

Verified patterns from the existing codebase:

### Reading STATE.md Frontmatter for Team-Status
```javascript
// Source: context.cjs listProjects() — existing pattern for reading project metadata
const { extractFrontmatter } = require('./frontmatter.cjs');
const { safeReadFile } = require('./core.cjs');

const stateMd = safeReadFile(path.join(projectDir, 'STATE.md'));
const stateFm = stateMd ? extractFrontmatter(stateMd) : {};

// Safe field access with defaults (TEAM-02 contract)
const status = stateFm.status || 'unknown';
const milestone = stateFm.milestone || null;
const lastUpdated = stateFm.last_updated || null;
const totalPhases = stateFm.progress?.total_phases || 0;
const completedPhases = stateFm.progress?.completed_phases || 0;
const totalPlans = stateFm.progress?.total_plans || 0;
const completedPlans = stateFm.progress?.completed_plans || 0;
```

### Existing _sources Tracking (Foundation for TEAM-05)
```javascript
// Source: core.cjs loadConfig() — already returns _sources
const config = loadConfig(cwd);
// config._sources = {
//   model_profile: '.planning/config.json',       // or 'default'
//   commit_docs: '.planning/users/dan/frontend/config.json',
//   // ...
// }

// config resolve just surfaces this:
function cmdConfigResolve(cwd, key, raw) {
  const config = loadConfig(cwd);
  const value = config[key];
  const source = config._sources?.[key] || 'unknown';
  
  // Build layer chain showing what each layer had
  // ...
  output({ key, value, source, layers }, raw);
}
```

### CLI Command Pattern (for new commands)
```javascript
// Source: Established pattern from commands.cjs / init.cjs
function cmdTeamStatus(cwd, raw) {
  const users = scanAllUsers(cwd);
  output({
    users,
    count: users.length,
    timestamp: new Date().toISOString(),
  }, raw);
}
```

### Test Helper for Multi-User Scenarios
```javascript
// Source: tests/helpers.cjs createTempMultiUserProject()
// For team-status tests, create multiple users:
function createTempTeamProject(users) {
  const tmpDir = createTempMultiUserProject();
  for (const { slug, project } of users) {
    const projectDir = path.join(tmpDir.tmpDir, '.planning', 'users', slug, project);
    fs.mkdirSync(path.join(projectDir, 'phases'), { recursive: true });
    // Create STATE.md with frontmatter, .active file, etc.
  }
  return tmpDir;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard error on legacy structure (IDEN-06) | Migration offer with auto-migrate option | Phase 4 | Users with old `.planning/` can upgrade in-place |
| 2-layer config (global + per-project) | 4-layer config (defaults + global + per-project + env) | Phase 4 | CI/CD and scripting can override config without file changes |
| No team visibility | team-status cross-user scanning | Phase 4 | Multi-user teams can see who's working on what |
| Generic commit messages | User/project-scoped commit messages | Phase 4 | Git history clearly shows which user/project each planning commit belongs to |

**Note on existing test failure:** The PATH-13 audit test (`audit-paths.test.cjs`, subtest 2) currently fails with 3 violations in `new-project.md` lines 110, 126, 1528 — these are exactly the bootstrap `.planning/` references that this phase fixes.

## Open Questions

1. **How should team-status handle users with no `.active` file?**
   - What we know: `.active` files are gitignored and machine-specific. After `git clone`, only the current user has one.
   - What's unclear: Should we attempt to infer active project from most-recently-modified STATE.md, or show "(no active project)"?
   - Recommendation: Show "(no active project)" — simpler and honest. Users without `.active` either haven't run GSD on this machine or only have stale data.

2. **Should `cmdCommit()` attribution be opt-out via config?**
   - What we know: The user wants auto-detect in cmdCommit with no caller changes needed.
   - What's unclear: Whether some users might NOT want user/project prefix on their commits.
   - Recommendation: Always-on for planning commits (matches user's decision). No config toggle needed for v1. Can add `commit_attribution: false` later if requested.

3. **Should migration update REQUIREMENTS.md to remove "Out of Scope" line?**
   - What we know: User explicitly overrode REQUIREMENTS.md "Out of Scope" for migration. CONTEXT.md says "REQUIREMENTS.md should be updated to reflect this change."
   - Recommendation: Yes, update REQUIREMENTS.md as part of migration implementation to remove migration from "Out of Scope" table.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert` |
| Config file | None — uses `scripts/run-tests.cjs` cross-platform runner |
| Quick run command | `node --test tests/<specific>.test.cjs` |
| Full suite command | `node scripts/run-tests.cjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEAM-01 | team-status scans all users, shows active projects/phase/activity | unit + integration | `node --test tests/team-status.test.cjs` | ❌ Wave 0 |
| TEAM-02 | team-status reads only STATE.md frontmatter | unit | `node --test tests/team-status.test.cjs` | ❌ Wave 0 |
| TEAM-03 | Cross-user read scope without breaking isolation | unit | `node --test tests/team-status.test.cjs` | ❌ Wave 0 |
| TEAM-04 | 4-tier config precedence (defaults < global < project < env) | unit | `node --test tests/config.test.cjs` | ✅ (needs new tests) |
| TEAM-05 | `config resolve <key>` shows source layer | unit | `node --test tests/config.test.cjs` | ✅ (needs new tests) |
| TEAM-06 | Commit messages include user/project context | unit | `node --test tests/commands.test.cjs` | ✅ (needs new tests) |
| PATH-13 | Zero unresolved .planning/ references (bootstrap fix) | integration | `node --test tests/audit-paths.test.cjs` | ✅ (currently failing — 3 violations) |
| MIGRATE | Legacy detection triggers migration flow | unit + integration | `node --test tests/migration.test.cjs` | ❌ Wave 0 |
| SCHEMA | STATE.md frontmatter defaults for missing fields | unit | `node --test tests/team-status.test.cjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/<affected-module>.test.cjs`
- **Per wave merge:** `node scripts/run-tests.cjs`
- **Phase gate:** Full suite green (including currently-failing audit-paths) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/team-status.test.cjs` — covers TEAM-01, TEAM-02, TEAM-03, STATE.md schema defaults
- [ ] `tests/migration.test.cjs` — covers legacy detection, auto-migrate, partial failure recovery
- [ ] New tests in `tests/config.test.cjs` — env var override tests for TEAM-04, TEAM-05
- [ ] New tests in `tests/commands.test.cjs` — commit attribution tests for TEAM-06
- [ ] Fix existing `audit-paths.test.cjs` failure (PATH-13 bootstrap) — currently 1 subtest failing

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** — Direct reading of all `.cjs` source files in `get-shit-done/bin/lib/`
- **Existing tests** — Full test suite review (`tests/*.test.cjs`), current state: 668 passing, 1 failing
- **CONTEXT.md** — User decisions from `/gsd:discuss-phase` with 3 critic blind spots resolved
- **REQUIREMENTS.md** — TEAM-01 through TEAM-06 requirement definitions
- **STATE.md** — Phase 1-3 completion history and key decisions
- **CONVENTIONS.md** — Coding patterns, file organization, testing conventions

### Secondary (MEDIUM confidence)
- **Phase 3 RESEARCH.md** — Architecture patterns for CLI commands, two-step bootstrap
- **ROADMAP.md** — Phase 4 success criteria and key deliverables

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero external dependencies, all internal Node.js tooling
- Architecture: HIGH — all patterns established in Phases 1-3, direct codebase inspection
- Pitfalls: HIGH — based on actual code reading (e.g., `.active` gitignore, type coercion, partial migration)
- Migration: MEDIUM — migration is new territory with filesystem mutation; tested approach but more complex than other features

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable internal tooling, no external dependency drift)
