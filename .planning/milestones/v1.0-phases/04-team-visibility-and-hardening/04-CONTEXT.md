# Phase 4: Team Visibility and Hardening - Context

**Gathered:** 2026-04-07 (updated — 3 critic blind spots resolved)
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable cross-user visibility via `/gsd:team-status`, implement config layering with env var support and debug tooling, add git commit attribution for planning artifacts, and harden edge cases including PATH-13 regression, STATE.md schema enforcement, and migration from old single-project structure.

Phase 1 built identity resolution and `getPlanningRoot()`. Phase 2 migrated all modules to resolved paths. Phase 3 built project lifecycle commands (new-project, switch, archive, restore) and the multi-user directory structure. This phase adds team-level visibility across users, config debugging, commit traceability, and migration/hardening so the system is production-ready for teams.

</domain>

<decisions>
## Implementation Decisions

### /gsd:team-status command (TEAM-01, TEAM-02, TEAM-03)
- **Summary table output** — compact table with one row per user's active project: User, Project, Phase, Progress, Last Active
- **Show all users** — display every user with a directory under `.planning/users/` regardless of activity recency. No dimming or hiding of stale users
- **Active project only** — show only each user's currently active project (from `.active` file). Users with multiple projects just show their active one
- **CLI command + thin workflow** — a new `gsd-tools.cjs team-status` command does the directory scanning and STATE.md frontmatter parsing. The workflow markdown file (`team-status.md`) calls this and formats output
- **Read-only cross-user scope** — path resolver supports reading other users' STATE.md frontmatter for team-status without modifying any files or breaking write isolation (TEAM-03)
- **STATE.md frontmatter only** — team-status reads only YAML frontmatter fields (machine-readable), never parses full document body (TEAM-02)

### Config resolve command (TEAM-04, TEAM-05)
- **Single key + source display** — `gsd-tools.cjs config resolve <key>` shows: resolved value, which layer it came from (file path), and the full chain of layers checked (env var, per-project, global, default) with which value each had
- **GSD_* prefix env vars** — support environment variable overrides with `GSD_` prefix (e.g., `GSD_MODEL_PROFILE`, `GSD_PARALLELIZATION`). Env vars are the top priority in the 4-tier precedence chain
- **Explicit key-to-env mapping** — each config key maps to a specific env var name via an explicit mapping table in code. Only recognized keys have env var support. No auto-derivation from key names
- **4-tier precedence chain** — hardcoded defaults < shared `.planning/config.json` < per-project `config.json` < `GSD_*` environment variables (TEAM-04)
- **`_sources` tracking from Phase 3** — `loadConfig()` already tracks which layer each value came from. The `config resolve` command surfaces this existing data

### Git commit attribution (TEAM-06)
- **Scope prefix format** — user/project context appears in the conventional commit scope: `docs(dan/frontend/phase-03): complete execution` instead of `docs(phase-03): complete execution`
- **Planning commits only** — only commits for planning artifacts (docs, STATE.md, ROADMAP.md, VERIFICATION.md, etc.) get the user/project prefix. Code commits from plan execution stay clean with just the phase/plan scope
- **Auto-detect in cmdCommit** — `cmdCommit()` auto-detects when active project context exists and prepends `user/project/` to the scope. No changes needed in callers. Falls back to current behavior when no active context

### Hardening: PATH-13 bootstrap path (critic blind spot discuss-C01 resolved)
- **This is a bootstrap chicken-and-egg, not a simple grep fix** — the new-project workflow's `mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"` is BEFORE `getPlanningRoot()` can resolve because the directory doesn't exist yet. Can't "replace with resolved path from init output" — init needs the directory to exist first.
- **Solution approach** — either: (1) add a new `init new-project-bootstrap` command that returns the target path WITHOUT requiring the directory to exist (computes it from identity + project slug), or (2) add the bootstrap mkdir path to the PATH-13 audit gate allowlist as a documented exception, or (3) restructure so `cmdInitProjectSetup` returns the full target path as `bootstrap_path` field. Claude has discretion on which approach works best.
- **Re-run PATH-13 grep audit** — confirm zero unresolved raw `.planning/` path references after fix (excluding any documented bootstrap exceptions)

### Hardening: STATE.md schema enforcement (critic blind spot discuss-C02 resolved)
- **Validation on read, not write** — team-status handles missing frontmatter fields gracefully with defaults (e.g., "unknown" for status, 0 for progress). `writeStateMd()` continues auto-syncing as before without adding required-field enforcement
- **Standardized frontmatter fields** — define the fields team-status expects: `milestone`, `status`, `last_updated`, `progress.total_phases`, `progress.completed_phases`, `progress.total_plans`, `progress.completed_plans`. These are documented as the "team-status contract" but not enforced on write
- **Best-effort reads** — team-status reads whatever frontmatter exists and fills gaps with sensible defaults. Corrupted or missing STATE.md → show user with "(no data)" instead of crashing

### Hardening: Migration from old single-project structure (critic blind spot discuss-C03 resolved — user overrides REQUIREMENTS.md "Out of Scope")
- **Explicitly added to scope** — REQUIREMENTS.md originally listed migration as "Out of Scope" with rationale "clean break is simpler." User has now decided migration IS in scope for Phase 4. REQUIREMENTS.md should be updated to reflect this change.
- **Detect on all commands** — any GSD command that detects old flat `.planning/PROJECT.md` at root triggers migration flow instead of the current IDEN-06 hard error
- **Offer both paths** — detection presents: (1) auto-migrate command that moves files automatically, or (2) manual instructions explaining what to do
- **Auto-migrate behavior** — moves all files from `.planning/` into `.planning/users/<detected-user>/<project-name>/`. Keeps `.planning/config.json` at root as global config. Git commits the migration
- **Project name from existing PROJECT.md** — reads the project name from existing `PROJECT.md` to derive the project slug for the new directory path

### Claude's Discretion
- Exact team-status table formatting (column widths, "Last Active" relative time format)
- STATE.md frontmatter field names and defaults for schema enforcement
- Which config keys get GSD_* env var mapping (start with the most commonly overridden)
- Internal implementation of cross-user directory scanning (how to handle permission errors, missing dirs)
- Migration error handling (what happens if move fails partway through)
- How `config resolve` formats the "layers checked" section (exact output formatting)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `loadConfig(cwd)` in `core.cjs`: already rebuilt with `_sources` tracking from Phase 3 — tracks which layer each config value came from. Direct foundation for TEAM-05
- `resolveContext(cwd)` in `context.cjs`: resolves user identity + active project. Used by cmdCommit for attribution auto-detect
- `listProjects(cwd, user)` in `context.cjs`: returns structured project metadata — reusable for team-status per-user project info
- `writeStateMd(statePath, content, cwd)` in `state.cjs`: auto-syncs YAML frontmatter on every write — natural place for schema enforcement
- `cmdCommit()` in `commands.cjs`/`gsd-tools.cjs`: existing git commit wrapper — needs attribution prefix injection
- `extractFrontmatter()` in `frontmatter.cjs`: YAML frontmatter parser — used by team-status to read STATE.md
- `tryGetPlanningContext(cwd)` in `core.cjs`: soft resolution that returns null gracefully — used for migration detection

### Established Patterns
- CLI commands follow `cmd*` prefix, take `cwd` as first arg
- `output(result, raw)` for JSON, `error(msg)` for fatal errors
- STATE.md YAML frontmatter auto-synced via `writeStateMd()`
- `_resolvePlanningRootSoft` for cases that need graceful failure
- Env var overrides already exist for `GSD_USER` and `GSD_PROJECT` in `resolveContext()`

### Integration Points
- `core.cjs` — `loadConfig()` needs env var layer added to existing merge
- `commands.cjs` or `gsd-tools.cjs` — `cmdCommit()` needs scope prefix injection
- `state.cjs` — `writeStateMd()` needs schema enforcement
- `context.cjs` — cross-user scanning for team-status (read other users' STATE.md)
- `init.cjs` — `cmdInitTeamStatus()` new init function for team-status workflow
- `core.cjs` — `tryGetPlanningContext()` currently errors on legacy detection (IDEN-06) — needs migration flow instead

</code_context>

<specifics>
## Specific Ideas

- Migration should work seamlessly for the common case: someone was using GSD solo, now wants to upgrade to multi-user. One command, everything moves, they keep going where they left off.
- Team-status should feel lightweight — "who's working on what?" at a glance, not a dashboard.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-team-visibility-and-hardening*
*Context gathered: 2026-04-07*
