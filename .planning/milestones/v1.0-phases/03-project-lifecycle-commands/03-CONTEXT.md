# Phase 3: Project Lifecycle Commands - Context

**Gathered:** 2026-04-06 (updated 2026-04-07 — 7 critic blind spots addressed)
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement user-facing commands for creating projects in the multi-user structure, switching between projects, and ensuring all existing GSD commands transparently operate on the active project context. Also wire the restored `log-decision` pipeline into workflows.

Phase 1 built identity resolution, context management, and `getPlanningRoot()`. Phase 2 migrated all modules to use resolved paths. This phase builds the user-facing commands that create and manage projects within that structure. Phase 4 handles team visibility and hardening.

</domain>

<decisions>
## Implementation Decisions

### /gsd:new-project changes (LIFE-01, LIFE-02)
- **Project name asked upfront** — "What should this project be called?" is the first question before any context gathering
- **Slugify + confirm** — user types a human name (e.g., "My Auth Service"), we slugify it (`my-auth-service`) using existing `generateSlugInternal()`, show the slug and confirm before proceeding
- **Always multi-user path** — no special-casing for first-time users. Every project is created under `.planning/users/<user>/<project>/`. First-time users get the user directory bootstrapped as part of the normal flow
- **List + confirm when existing projects** — if the user already has projects, show them with status before creating a new one: "You have 2 projects. Create a new one?"
- **Auto-switch** — the new project becomes the active context immediately after creation. `.active` file updated via `writeActiveContext()`
- **Block duplicate names** — hard error if project slug already exists: "Project my-api already exists. Use /gsd:switch my-api to work on it."
- **Copy global defaults** — new project's `config.json` is seeded by copying `.planning/config.json` defaults. Changes go into the per-project copy
- **Ask scope during creation** — prompt which monorepo subdirectory or Bazel target the project is scoped to. Store in project `config.json` as `scope_path`. This is informational metadata for now — no downstream consumer yet. Future phases may use it for scoped codebase mapping or command filtering.
- **Two-step workflow bootstrap (critic blind spot discuss-W02 resolved):** The new-project workflow uses a two-step bootstrap. Step 1: call identity resolution + `listProjects()` directly via gsd-tools.cjs (before any init command) to get user slug and existing projects. Step 2: after user names the project and the directory is created, call the normal `init new-project` which now has a valid planning root. This avoids the chicken-and-egg problem where init needs a resolved project that doesn't exist yet.

### /gsd:switch command (LIFE-03, LIFE-04, LIFE-05)
- **With args — flexible match** — try exact slug match first, then fuzzy match against project directory names. Error with suggestions if no match
- **Without args — numbered list + pick** — show numbered list of the user's projects with status summary. User picks a number
- **Status fields per project in listing:**
  - Current phase and its status
  - Last activity timestamp (STATE.md mtime)
  - Progress (X of Y phases complete)
  - Project description (Core Value line from PROJECT.md)
- **Single-project auto-select (LIFE-05)** — runtime auto-select. If user has exactly one project, resolve it without requiring `.active` file. No persistence needed — `resolveContext()` handles it transparently

### /gsd:progress enhancements (LIFE-07)
- **Always show context header** — every progress output starts with "User: dan | Project: frontend | Phase 2 of 4" regardless of how many projects exist
- **No active project → list + prompt** — instead of a bare error, list available projects and prompt user to switch or create one

### Zero-project handling (critic blind spot discuss-W03 resolved)
- **`resolveContext()` returns null for zero projects** — instead of hard-erroring, `resolveContext()` returns `{ user, project: null, planning_root: null }` when the user has zero projects and no `.active` file. The workflow layer (progress.md, etc.) checks for null and handles the prompting/listing. `getPlanningRoot()` still hard-errors (it's for commands that REQUIRE an active project). `tryGetPlanningContext()` already returns null gracefully and handles this case.
- **Single-project auto-select** lives in `resolveContext()`: scan user dir, if exactly one non-`_archived` subdirectory exists, use it. Zero projects → return null. Multiple projects + no `.active` → return null (force explicit selection).

### Command transparency audit (LIFE-08)
- **Targeted integration tests (critic blind spot discuss-W04 resolved):** Add integration tests for the 5-6 highest-risk commands: execute-phase, plan-phase, verify-work, discuss-phase, quick, debug. Each test creates a multi-user directory structure and runs the command's init path. Not an exhaustive test matrix — focused on commands most likely to break.
- All commands should work identically whether the user got there via `.active`, `GSD_USER`/`GSD_PROJECT` env vars, or single-project auto-select

### Per-project config (LIFE-06)
- **Config created at project creation time** — seeded from `.planning/config.json`
- **Build merge, design for Phase 4 (critic blind spot scope-W01 resolved):** `loadConfig()` is rebuilt to read both `.planning/config.json` (global) and `${planning_root}/config.json` (per-project), merging with `Object.assign(defaults, globalConfig, projectConfig)`. The implementation tracks which layer each value came from (e.g., `{ value, source }` internally) so Phase 4's `config resolve` debug command (TEAM-05) can surface it without rework. Phase 3 implements the merge. Phase 4 adds the debug/resolve CLI command.
- **`loadConfig()` needs real work (critic blind spot discuss-C02 resolved):** The current `loadConfig()` reads ONE config file. The per-project layering must be built from scratch — read global config, read per-project config, merge with precedence. This is not a wiring change, it's a redesign of the function.

### Project archival (LIFE-09, expanded to include restore)
- **Move directory** — `.planning/users/<user>/<project>/` → `.planning/users/<user>/_archived/<project>/`
- **Explicit command** — dedicated `/gsd:archive-project` command (not automatic)
- **Restore command** — `/gsd:restore-project` reverses the move from `_archived/` back to active. LIFE-09 expanded to cover this.
- **Archive active project → clear + auto-select** — if the archived project was the active one, clear `.active` and auto-select another project (or prompt if multiple remain)
- **Excluded from listings** — `_archived/` projects don't appear in `/gsd:switch` or `/gsd:progress` listings. Separate `/gsd:switch --archived` or similar to see them

### Decision logging restoration (LIFE-10 — formalized per critic blind spot scope-C01)
- **`log-decision-init` and `log-decision` commands restored** — already added to `gsd-tools.cjs` in the repo working tree (this session)
- **Wire into workflows** — `discuss-phase.md`, `new-project.md`, `new-milestone.md`, and `plan-phase.md` all get `<decision_logging>` integration sections
- Workflows call `log-decision-init` at session start, then `log-decision` after every user response
- Silent failure — logging never breaks workflows
- Formalized as LIFE-10 requirement to maintain traceability (scope-C01 resolution)

### `listProjects()` redesign (critic blind spot discuss-C01 resolved)
- **Current state:** `listProjects()` in `context.cjs` is NOT exported and returns a comma-joined string. It's an internal helper for one error message.
- **Required:** Export it, refactor to return an array of project objects with metadata (name, phase, progress, last_activity, description). This is a redesign, not an enhancement. The switch command, progress display, and new-project listing all depend on structured project data.

### Claude's Discretion
- Exact error message wording (within the "short + actionable" style)
- Internal function organization (whether switch/archive go in context.cjs or a new module)
- Test file organization for new commands
- Exact format of the numbered project listing in `/gsd:switch`
- How fuzzy matching works internally (substring, prefix, Levenshtein, etc.)
- How `loadConfig()` tracks source layers internally (simple object annotation vs. separate metadata)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `writeActiveContext(cwd, user, project)` in `context.cjs`: writes `.active` file + ensures gitignored — direct use for switch and new-project
- `readActiveContext(cwd, user)` in `context.cjs`: reads `.active` file — used by switch listing
- `resolveContext(cwd)` in `context.cjs`: full resolution chain (identity → env → .active) — needs modification for single-project auto-select and zero-project null return
- `listProjects(cwd, user)` in `context.cjs`: **NOT exported, returns string** — must be redesigned to return structured array and exported (see discuss-C01 resolution)
- `generateSlugInternal()` in `core.cjs`: slug generation for project names
- `loadConfig(cwd)` in `core.cjs`: **reads ONE config file only** — must be rebuilt for global+per-project merge with source tracking (see discuss-C02 resolution)
- `cmdInitNewProject(cwd, raw)` in `init.cjs`: existing init for new-project workflow — needs project name + scope fields added
- `cmdLogDecisionInit()` and `cmdLogDecision()` in `gsd-tools.cjs`: decision logging commands (restored this session)
- `getUnprocessedDecisionLogs()` in `gsd-tools.cjs`: reads decision logs for extract-taste pipeline

### Established Patterns
- CLI commands follow `cmd*` prefix, take `cwd` as first arg
- `output(result, raw)` for JSON output, `error(msg)` for fatal errors
- Workflows call `gsd-tools.cjs init <workflow>` for context, parse JSON
- `tryGetPlanningContext(cwd)` returns null gracefully; `getPlanningRoot(cwd)` hard-errors
- Two-step workflow bootstrap: identity/listing first, then init after project exists

### Integration Points
- `context.cjs` — single-project auto-select + zero-project null return in `resolveContext()`, `listProjects()` export + redesign
- `init.cjs` — `cmdInitNewProject()` needs project name, scope fields, existing-projects list
- `core.cjs` — `loadConfig()` rebuilt for global+per-project merge with source tracking
- `new-project.md` workflow — two-step bootstrap: identity+listing, then init after directory created
- `progress.md` workflow — context header, no-active-project handling
- `discuss-phase.md`, `new-project.md`, `new-milestone.md`, `plan-phase.md` — decision logging integration (LIFE-10)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

- `/gsd:team-status` and cross-user visibility — Phase 4
- Config `resolve` debug command showing which layer a value came from — Phase 4 (TEAM-05). Phase 3 builds the source-tracking internals.
- Git commit message user/project attribution — Phase 4 (TEAM-06)
- `scope_path` consumers (scoped codebase mapping, command filtering) — future phases. Phase 3 stores the metadata only.

</deferred>

---

*Phase: 03-project-lifecycle-commands*
*Context gathered: 2026-04-06*
*Updated: 2026-04-07 — 7 critic blind spots resolved (listProjects redesign, loadConfig rebuild, scope_path formalized as LIFE-10, restore-project via LIFE-09 expansion, zero-project null return, new-project bootstrap, command audit scoping)*
