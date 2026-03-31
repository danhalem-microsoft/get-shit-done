# Phase 2: Module Path Migration - Context

**Gathered:** 2026-03-31 (updated 2026-03-31 — 3 critic blind spots addressed)
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate all existing GSD modules from hardcoded `.planning/` paths to use `getPlanningRoot()`, and update all workflow markdown and agent markdown to use resolved paths from init output. At completion, zero operational code references raw `.planning/` paths. The grep audit gate test enforces this permanently.

This phase does NOT add new features or change behavior. It is a pure path resolution refactor. The identity system, context management, and `getPlanningRoot()` function are already built (Phase 1). This phase consumes them.

</domain>

<decisions>
## Implementation Decisions

### Module migration strategy
- **Internal resolution:** Each module calls `getPlanningRoot(cwd)` itself when it needs a planning path. No new parameters added to function signatures.
- **All-at-once migration:** All 8 modules with hardcoded `.planning/` references are migrated in a single phase sweep, not incrementally by dependency order or reference density.
- **Audit zero-ref modules too:** `state.cjs` and `roadmap.cjs` show 0 grep hits but must still be audited for implicit path assumptions (e.g., paths received from callers that assume `.planning/` root). Fix if needed.
- **Rely on existing memoization:** `getPlanningRoot()` already has a memoization cache with `clearPlanningRootCache()` for test isolation. No per-module caching needed — repeated calls within one process are fast.

### Workflow markdown path handling
- **Use `planning_root` from init JSON:** Workflows already call `gsd-tools.cjs init` and parse JSON. Replace all hardcoded `.planning/STATE.md` references with `${planning_root}/STATE.md` (inline substitution).
- **Always construct from `planning_root`:** Even when init JSON provides pre-resolved paths like `state_path`, workflows should construct paths from `planning_root` for consistency. Example: `${planning_root}/STATE.md` not `${state_path}`.
- **Update documentation too:** Both operational path references AND documentation/example references within workflow markdown get updated. Docs should reflect the new `.planning/users/<user>/<project>/` structure, not the old flat structure.
- **Scope:** ~37 workflow files with `.planning/` references, ~335 total references to audit and update.

### Agent path isolation
- **Strict isolation (PATH-12):** Agents receive ALL file paths via orchestrator `<files_to_read>` blocks. An agent never constructs `.planning/` paths in its own logic. No exceptions for "discovery" or "operational convenience."
- **Output paths in spawn prompt:** When an agent needs to write a file (SUMMARY.md, VERIFICATION.md, CRITIQUE.md), the exact output path is provided by the orchestrator in the spawn prompt. Agent uses it verbatim.
- **Placeholder variables in templates:** Agent `.md` files use placeholder variables like `{planning_root}`, `{phase_dir}`, `{state_path}` that orchestrators fill when constructing the spawn prompt. Agent files contain no literal `.planning/` paths.
- **Full audit all 18 agents:** Every agent file gets audited, not just actively-spawned ones. All ~132 references categorized and updated.

### Grep audit gate
- **Strict allowlist:** The only acceptable `.planning/` references in operational code are: (1) the `getPlanningRoot()` resolver function in core.cjs, (2) the backwards-compatibility detector in core.cjs, and (3) identity.cjs `loadUserMap`/`lockIdentity` which reference `.planning/user-map.json` (repo-root file, not user-qualified).
- **identity.cjs is exempt — no changes needed:** identity.cjs uses `path.join(cwd, '.planning', 'user-map.json')` for the repo-root identity registry. This is NOT a user-qualified path — it's a shared resource. identity.cjs needs no migration in this phase. The grep audit allowlist explicitly includes identity.cjs. (Critic blind spot discuss-001 resolved)
- **gsd-tools.cjs in scope:** The main CLI dispatcher has 7 `.planning/` references and IS in scope for this phase's migration, not deferred to Phase 3. It's operational code that must use `getPlanningRoot()`. (Critic blind spot discuss-002 resolved)
- **Automated test:** `tests/audit-paths.test.cjs` runs `grep` against all source files and fails if unallowed `.planning/` references are found. Runs in CI alongside existing test suite.
- **Covers all source files including markdown:** `.cjs` library modules, `.cjs` test files, `.md` workflow files, `.md` agent files. Everything in the repo gets scanned. This IS the verification strategy for workflow/agent markdown completeness — the grep gate catches any missed references. No separate semantic markdown audit needed. (Critic blind spot discuss-003 resolved)
- **Test fixtures:** Test files that construct `.planning/` paths for setup (e.g., `createTempProject()`, `createTempMultiUserProject()`) must use the multi-user structure. Old-style `.planning/STATE.md` in test setup code is a violation.

### Claude's Discretion
- Exact order of module migration within the "all at once" approach
- Whether to create a shared path-building helper or repeat `path.join(getPlanningRoot(cwd), 'STATE.md')` patterns
- Test file organization for the audit-paths.test.cjs gate

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getPlanningRoot(cwd)` in `core.cjs`: The single chokepoint built in Phase 1 — returns `.planning/users/<user>/<project>/`
- `tryGetPlanningContext(cwd)` in `core.cjs`: Safe wrapper returning `{active_user, active_project, planning_root}` with null fallback
- `clearPlanningRootCache()` in `core.cjs`: Test isolation for memoized planning root
- `createTempMultiUserProject()` in `tests/helpers.cjs`: Creates full multi-user directory structure for testing
- `GSD_USER` / `GSD_PROJECT` env vars: Can be used in tests for path isolation without .active files

### Established Patterns
- All init commands already return `active_user`, `active_project`, `planning_root` (Phase 1)
- Modules use `require('./core.cjs')` for shared utilities — `getPlanningRoot` is already there
- `cmd*` functions take `cwd` as first parameter — `getPlanningRoot(cwd)` call pattern is natural
- `safeReadFile()` returns null on missing files — graceful handling when paths don't exist yet

### Integration Points
- **8 modules to migrate:** init.cjs (53 refs), taste.cjs (5), verify.cjs (3), template.cjs (3), phase.cjs (2), commands.cjs (2), milestone.cjs (1), config.cjs (1)
- **2 modules to audit:** state.cjs (0 refs), roadmap.cjs (0 refs) — may have implicit assumptions
- **gsd-tools.cjs:** Main dispatcher has 7 `.planning/` references — in scope for migration
- **~37 workflow .md files:** ~335 references to update
- **~18 agent .md files:** ~132 references to audit/update
- **Test files:** Must use multi-user structure, not old flat `.planning/`

### Reference counts (from grep)
| Module | `.planning/` refs |
|--------|------------------|
| init.cjs | 53 |
| taste.cjs | 5 |
| gsd-tools.cjs | 7 (in scope for migration) |
| core.cjs | 6 (resolver + detector — allowed) |
| verify.cjs | 3 |
| template.cjs | 3 |
| phase.cjs | 2 |
| commands.cjs | 2 |
| milestone.cjs | 1 |
| config.cjs | 1 |
| state.cjs | 0 (audit) |
| roadmap.cjs | 0 (audit) |

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-module-path-migration*
*Context gathered: 2026-03-31*
*Updated: 2026-03-31 — 3 critic blind spots resolved (identity.cjs exemption, gsd-tools.cjs scope, markdown verification strategy)*
