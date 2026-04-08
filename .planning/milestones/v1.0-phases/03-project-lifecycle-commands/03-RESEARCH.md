# Phase 3: Project Lifecycle Commands - Research

**Researched:** 2026-04-07
**Domain:** GSD internal CLI commands and workflow modification
**Confidence:** HIGH

## Summary

Phase 3 is entirely internal to the GSD codebase — no external libraries, no new dependencies. The implementation involves modifying existing Node.js modules (`context.cjs`, `core.cjs`, `init.cjs`), creating new CLI dispatcher cases, modifying workflow markdown files, and adding tests. All patterns are well-established from Phase 1 and Phase 2.

**Primary recommendation:** Structure work around the dependency chain: (1) core module changes first (`loadConfig`, `resolveContext`, `listProjects`), (2) new CLI commands and init changes, (3) workflow modifications, (4) integration testing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Project name asked upfront in new-project workflow
- Slugify + confirm for project naming
- Always multi-user path (no special-casing for first project)
- List + confirm when existing projects exist
- Auto-switch to new project after creation
- Block duplicate project names
- Copy global config defaults to new project config
- Ask scope (monorepo subdirectory/Bazel target) during creation
- Two-step workflow bootstrap for new-project
- Flexible match for /gsd:switch with args
- Numbered list + pick for /gsd:switch without args
- All four status fields in project listing
- Runtime auto-select for single-project users
- Always show user/project context header in progress
- No active project → list + prompt
- resolveContext() returns null for zero projects
- Targeted integration tests for 5-6 highest-risk commands
- Build config merge with source tracking, design for Phase 4
- loadConfig() needs full rebuild for global+per-project merge
- Move directory for archival, explicit command, restore command
- Clear + auto-select when archiving active project
- Decision logging formalized as LIFE-10, wire into 4 workflows

### Claude's Discretion
- Exact error message wording
- Internal function organization (context.cjs vs new module)
- Test file organization
- Numbered listing format for /gsd:switch
- Fuzzy matching implementation details
- loadConfig() source tracking internals

### Deferred Ideas (OUT OF SCOPE)
- /gsd:team-status and cross-user visibility — Phase 4
- Config resolve debug command — Phase 4 (TEAM-05)
- Git commit message user/project attribution — Phase 4 (TEAM-06)
- scope_path consumers — future phases
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIFE-01 | /gsd:new-project creates artifacts under user-qualified path | new-project.md workflow modification + cmdInitNewProject enhancement |
| LIFE-02 | /gsd:new-project prompts for project name | Two-step bootstrap: identity first, then init after dir creation |
| LIFE-03 | /gsd:switch with args sets active project | New CLI command using writeActiveContext + flexible match |
| LIFE-04 | /gsd:switch without args lists projects with status | listProjects() redesign + STATE.md/PROJECT.md metadata reading |
| LIFE-05 | Single-project auto-selection | resolveContext() modification to scan user dir |
| LIFE-06 | Per-project config overrides global | loadConfig() rebuild with two-file merge + source tracking |
| LIFE-07 | /gsd:progress shows project context | progress.md workflow modification + init enhancement |
| LIFE-08 | All commands operate on active project | Targeted integration tests for 6 high-risk commands |
| LIFE-09 | Archive/restore projects | New archive/restore CLI commands + _archived/ directory handling |
| LIFE-10 | Decision logging wired into workflows | log-decision-init/log-decision integration in 4 workflow files |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | 16.7+ | fs, path, child_process, os | Zero-dependency constraint |
| node:test | built-in | Testing framework | Established pattern |
| node:assert | built-in | Assertions | Established pattern |

No external libraries needed. This is pure internal tooling work.

## Architecture Patterns

### Pattern 1: CLI Command with Init Bootstrap
**What:** Every user-facing GSD command follows: command.md → workflow.md → gsd-tools.cjs init → parse JSON → execute
**When to use:** All new commands (/gsd:switch, /gsd:archive-project, /gsd:restore-project)
**Implementation:**
1. `commands/gsd/switch.md` — command definition with frontmatter
2. `get-shit-done/workflows/switch.md` — orchestration logic
3. `init.cjs` — `cmdInitSwitch()` returns context JSON
4. `gsd-tools.cjs` — dispatcher wiring

### Pattern 2: Two-Step Workflow Bootstrap (for new-project)
**What:** When a command needs to create the thing it would normally resolve through init
**Problem:** `cmdInitNewProject()` calls `tryGetPlanningContext()` which needs an active project to resolve paths. But for a NEW project, the directory doesn't exist yet.
**Solution:**
1. Step 1: Call a lightweight pre-init command that resolves identity + lists existing projects without requiring an active project. New `cmdInitProjectSetup(cwd, raw)` in init.cjs:
   - Calls `resolveIdentity(cwd)` directly
   - Scans `.planning/users/<user>/` for existing projects
   - Returns: `{ user, projects: [...], global_config: {...} }`
   - Does NOT call `tryGetPlanningContext()` or `getPlanningRoot()`
2. Step 2: Workflow asks for project name, creates directory, writes .active
3. Step 3: Call normal `init new-project` which now resolves correctly

### Pattern 3: Layered Config Merge
**What:** `loadConfig()` reads global + per-project configs and merges with precedence
**Current state:** Reads ONE file from `_resolvePlanningRootSoft(cwd)` + hardcoded defaults
**Required change:**
```javascript
function loadConfig(cwd) {
  const defaults = { /* existing defaults */ };
  
  // Layer 1: Global config
  const globalPath = path.join(cwd, '.planning', 'config.json');
  const globalConfig = safeReadJson(globalPath) || {};
  
  // Layer 2: Per-project config (if active project exists)
  const planningRoot = _resolvePlanningRootSoft(cwd);
  const projectPath = planningRoot !== '.planning' 
    ? path.join(cwd, planningRoot, 'config.json') 
    : null;
  const projectConfig = projectPath ? (safeReadJson(projectPath) || {}) : {};
  
  // Merge with precedence + source tracking
  const merged = {};
  const sources = {};
  for (const key of Object.keys(defaults)) {
    if (projectConfig[key] !== undefined) {
      merged[key] = projectConfig[key];
      sources[key] = projectPath;
    } else if (globalConfig[key] !== undefined) {
      merged[key] = globalConfig[key];
      sources[key] = globalPath;
    } else {
      merged[key] = defaults[key];
      sources[key] = 'default';
    }
  }
  merged._sources = sources; // Phase 4's config resolve uses this
  return merged;
}
```
**Key constraint:** The `get()` helper for nested keys (e.g., `workflow.plan_check`) must work across both config files. Apply same logic per-key.

### Pattern 4: resolveContext() with Auto-Select and Null Return
**Current:** Hard-errors on no `.active` file (line 76: `error('GSD Error: No active project...')`)
**Required change:**
```javascript
function resolveContext(cwd) {
  // ... identity resolution (unchanged) ...
  
  // Check GSD_PROJECT env var (unchanged) ...
  
  // Auto-select: scan for projects
  const userDir = path.join(cwd, '.planning', 'users', user);
  const projects = scanProjects(userDir); // new helper
  
  if (projects.length === 1) {
    // LIFE-05: auto-select single project
    const planning_root = toPosixPath(path.join('.planning', 'users', user, projects[0]));
    return { user, project: projects[0], planning_root };
  }
  
  // Read .active file
  const active = readActiveContext(cwd, user);
  if (active) {
    // validate and return (existing logic)
  }
  
  // Zero or multiple projects with no .active → return null
  return { user, project: null, planning_root: null };
}
```
**Key constraint:** `getPlanningRoot()` must still hard-error for commands that require an active project. `tryGetPlanningContext()` already handles null returns. The change is only in `resolveContext()`.

### Pattern 5: listProjects() Redesign
**Current:** Internal helper, returns string, not exported
**Required:** Exported function returning structured array
```javascript
function listProjects(cwd, user) {
  const userDir = path.join(cwd, '.planning', 'users', user);
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && e.name !== '_archived' && e.name !== '.active')
      .map(e => {
        const projectDir = path.join(userDir, e.name);
        const projectMd = safeReadFile(path.join(projectDir, 'PROJECT.md'));
        const stateMd = safeReadFile(path.join(projectDir, 'STATE.md'));
        const statFm = stateMd ? extractFrontmatter(stateMd) : {};
        const coreValue = projectMd ? extractCoreValue(projectMd) : null;
        const stat = fs.statSync(path.join(projectDir, 'STATE.md')).mtime;
        return {
          name: e.name,
          current_phase: statFm.current_phase || null,
          progress: `${statFm.progress?.completed_phases || 0}/${statFm.progress?.total_phases || 0}`,
          last_activity: stat.toISOString(),
          description: coreValue,
        };
      });
  } catch { return []; }
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom parser | `extractFrontmatter()` from frontmatter.cjs | Already handles all GSD YAML patterns |
| Slug generation | Custom regex | `generateSlugInternal()` from core.cjs | Already used for phase slugs, tested |
| Identity resolution | Git parsing | `resolveIdentity()` from identity.cjs | Phase 1 built this, handles all fallbacks |
| Active context I/O | File manipulation | `writeActiveContext()`/`readActiveContext()` | Phase 1 built this, handles gitignore |
| Path resolution | Manual path building | `getPlanningRoot()` / `tryGetPlanningContext()` | Phase 1+2 established this as the chokepoint |
| Safe file reading | try/catch everywhere | `safeReadFile()` from core.cjs | Returns null on error, established pattern |

## Common Pitfalls

### Pitfall 1: Breaking resolveContext() for existing commands
**What goes wrong:** Changing `resolveContext()` to return null breaks all commands that depend on it hard-erroring
**Why it happens:** `getPlanningRoot()` calls `resolveContext()` and depends on it to error on no project
**How to avoid:** `getPlanningRoot()` must check the null return and hard-error itself. Only `tryGetPlanningContext()` should propagate null.
**Warning signs:** Existing tests failing with "Cannot read property of null" errors

### Pitfall 2: loadConfig() circular dependency
**What goes wrong:** `loadConfig()` needs `_resolvePlanningRootSoft()` which may call `tryGetPlanningContext()` which loads config...
**Why it happens:** Adding global config path requires knowing the repo root, not just the planning root
**How to avoid:** Global config path is always `.planning/config.json` relative to cwd — no resolution needed. Only per-project path needs `_resolvePlanningRootSoft()`.

### Pitfall 3: new-project workflow init ordering
**What goes wrong:** Calling `init new-project` before the project directory exists → `tryGetPlanningContext()` returns null for everything
**Why it happens:** Existing workflow assumes init always works because it uses `tryGetPlanningContext()` soft fallback
**How to avoid:** Two-step bootstrap. Step 1 uses the new `init project-setup` command (no project needed). Step 2 creates directory + .active. Step 3 calls existing `init new-project`.

### Pitfall 4: Config migration during loadConfig rebuild
**What goes wrong:** The `depth` → `granularity` migration in `loadConfig()` currently writes to the config file. With two-file merge, which file gets the migration write?
**Why it happens:** Migration logic assumes one config file
**How to avoid:** Migrate in whichever file contains the deprecated key. If both have it, migrate in per-project (higher precedence).

### Pitfall 5: _archived/ directory showing up as a project
**What goes wrong:** `listProjects()` or `resolveContext()` auto-select picks `_archived` as a project name
**Why it happens:** `_archived` is a directory inside the user's project directory
**How to avoid:** Filter it out explicitly in all directory scans (already done in current `listProjects()` which checks `e.name !== '_archived'`)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (native, no external framework) |
| Config file | None (native runner) |
| Quick run command | `node --test tests/context.test.cjs` |
| Full suite command | `node scripts/run-tests.cjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIFE-01 | new-project creates under user path | integration | `node --test tests/init.test.cjs` | ✅ (extend) |
| LIFE-02 | new-project prompts for name | workflow | Manual (workflow interaction) | ❌ manual-only |
| LIFE-03 | switch with args sets active | unit | `node --test tests/context.test.cjs` | ✅ (extend) |
| LIFE-04 | switch without args lists projects | unit | `node --test tests/context.test.cjs` | ✅ (extend) |
| LIFE-05 | single-project auto-select | unit | `node --test tests/context.test.cjs` | ✅ (extend) |
| LIFE-06 | per-project config overrides global | unit | `node --test tests/config.test.cjs` | ✅ (extend) |
| LIFE-07 | progress shows project context | integration | `node --test tests/init.test.cjs` | ✅ (extend) |
| LIFE-08 | commands work on active project | integration | `node --test tests/dispatcher.test.cjs` | ✅ (extend) |
| LIFE-09 | archive/restore projects | unit | `node --test tests/context.test.cjs` | ❌ Wave 0 |
| LIFE-10 | decision logging wired | unit | `node --test tests/dispatcher.test.cjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/context.test.cjs tests/core.test.cjs`
- **Per wave merge:** `node scripts/run-tests.cjs` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/context.test.cjs` — extend with: listProjects structured return, resolveContext auto-select, resolveContext null return, archive/restore
- [ ] `tests/core.test.cjs` — extend with: loadConfig two-file merge, loadConfig source tracking
- [ ] `tests/dispatcher.test.cjs` — extend with: log-decision-init, log-decision, switch, archive, restore commands

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of context.cjs, core.cjs, init.cjs, gsd-tools.cjs
- Phase 1 and Phase 2 execution history in STATE.md
- Prior phase CONTEXT.md files (01-CONTEXT.md, 02-CONTEXT.md)
- Existing test files (context.test.cjs, core.test.cjs, init.test.cjs)

### Secondary
- None needed — all implementation is internal to the existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external dependencies, pure Node.js built-ins
- Architecture: HIGH — all patterns established in Phase 1/2, well-documented
- Pitfalls: HIGH — identified from direct code analysis of current implementations

**Research date:** 2026-04-07
**Valid until:** N/A — internal codebase, no external dependencies to go stale
