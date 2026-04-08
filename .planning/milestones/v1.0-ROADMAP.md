# Roadmap: GSD Multi-User Monorepo Support

**Created:** 2026-03-17
**Core Value:** Multiple users can run independent GSD projects in the same monorepo without conflicting on planning artifacts, state, or git history

## Phase 1: Identity and Path Resolution Core

**Status:** Complete (3/3 plans complete, 2026-03-24)

**Goal:** Establish user identity resolution, active context management, and the central `getPlanningRoot()` function so that all downstream modules and commands can resolve user-qualified paths.

### Requirements

| Requirement | Description |
|-------------|-------------|
| IDEN-01 | User identity resolved from `git config user.name`, sanitized to filesystem-safe slug |
| IDEN-02 | Fallback chain: user.name -> email local-part -> OS username |
| IDEN-03 | Identity slug locked in `.planning/user-map.json` on first use |
| IDEN-04 | Active project context stored per-user at `.planning/users/<user>/.active` (gitignored) |
| IDEN-05 | Active context overridable via `GSD_USER` and `GSD_PROJECT` env vars |
| IDEN-06 | Old flat `.planning/PROJECT.md` detected with clear error directing re-initialization |
| IDEN-07 | CI/CD environments detected; refuse to auto-create user directories |
| PATH-01 | `getPlanningRoot(cwd)` in `core.cjs` returns user-qualified planning directory |
| PATH-10 | `init.cjs` includes `active_user`, `active_project`, `planning_root` in all init JSON output |

### Success Criteria

1. Running `gsd-tools.cjs init` in a repo returns JSON containing `active_user`, `active_project`, and `planning_root` fields that resolve to `.planning/users/<user>/<project>/`
2. A user with no `git config user.name` set still gets a resolved identity via email or OS username fallback
3. Running GSD in a repo with an old flat `.planning/PROJECT.md` at root produces an error message (not silent misbehavior)
4. Setting `GSD_USER=alice GSD_PROJECT=frontend` overrides the `.active` file and resolves paths accordingly
5. Running with `CI=true` set does not create any new user directories under `.planning/users/`

### Key Deliverables

- `identity.cjs` module (~100 LOC): git identity resolution + sanitization + user-map.json management
- `context.cjs` module (~300 LOC): active context reader/writer, `.active` file I/O, env var overrides
- `getPlanningRoot()` function in `core.cjs` (~30 LOC): single chokepoint for path resolution
- `init.cjs` enhancement: context fields in all init command outputs
- Backwards-incompatibility detection for old flat structure

---

## Phase 2: Module Path Migration

**Goal:** Migrate all existing GSD modules from hardcoded `.planning/` paths to use `getPlanningRoot()`, and update workflow/agent markdown to use resolved paths from init output. At the end of this phase, zero operational code references raw `.planning/` paths.

**Plans:** 5 plans

Plans:
- [x] 02-01-PLAN.md — Core.cjs internal function migration + test helpers + audit gate scaffold
- [x] 02-02-PLAN.md — state.cjs + phase.cjs + roadmap.cjs + config.cjs migration
- [x] 02-03-PLAN.md — verify.cjs + template.cjs + milestone.cjs + taste.cjs + commands.cjs migration
- [x] 02-04-PLAN.md — init.cjs + gsd-tools.cjs dispatcher migration
- [x] 02-05-PLAN.md — Workflow + agent + template markdown migration + grep audit gate activation

### Requirements

| Requirement | Description |
|-------------|-------------|
| PATH-02 | `state.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-03 | `phase.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-04 | `roadmap.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-05 | `config.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-06 | `verify.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-07 | `template.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-08 | `milestone.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-09 | `taste.cjs` uses `getPlanningRoot()` for all path construction |
| PATH-11 | All workflow markdown files use paths from init JSON output, not hardcoded `.planning/` |
| PATH-12 | Agent-spawned prompts receive fully-resolved paths via orchestrator blocks |
| PATH-13 | Grep audit confirms zero unresolved raw `.planning/` path references in operational code |

### Success Criteria

1. Each of the 8 modules (state, phase, roadmap, config, verify, template, milestone, taste) resolves its file paths through `getPlanningRoot()` — verified by running each module's operations against a user-qualified directory
2. Workflow markdown files pass a grep audit: no raw `.planning/` path references remain in operational (non-documentation) contexts
3. Agent markdown prompts contain only resolved paths received from orchestrator `<files_to_read>` blocks — agents never construct `.planning/` paths themselves
4. A full `grep -r '\.planning/' --include='*.cjs'` against operational code returns only the resolver function itself, documentation comments, and the backwards-compatibility detector

### Key Deliverables

- 8 module refactors (state.cjs, phase.cjs, roadmap.cjs, config.cjs, verify.cjs, template.cjs, milestone.cjs, taste.cjs)
- Workflow markdown path updates (~37 files, 335 references)
- Agent markdown semantic audit (~132 references — categorize operational vs. illustrative)
- Automated grep audit gate script

---

## Phase 3: Project Lifecycle Commands

**Goal:** Implement user-facing commands for creating projects in the multi-user structure, switching between projects, and ensuring all existing GSD commands transparently operate on the active project context.

**Plans:** 5 plans

Plans:
- [x] 03-01-PLAN.md — Core module changes: resolveContext auto-select, listProjects redesign, loadConfig two-file merge
- [x] 03-02-PLAN.md — Switch, archive, restore CLI commands + dispatcher wiring
- [x] 03-03-PLAN.md — New-project workflow rewrite with two-step bootstrap
- [x] 03-04-PLAN.md — Workflow files: switch/archive/restore commands, progress enhancement, decision logging
- [x] 03-05-PLAN.md — Command transparency integration tests

### Requirements

| Requirement | Description |
|-------------|-------------|
| LIFE-01 | `/gsd:new-project` creates artifacts under `.planning/users/<user>/<project>/` and sets active |
| LIFE-02 | `/gsd:new-project` prompts for project name in multi-user mode |
| LIFE-03 | `/gsd:switch <project>` sets active project for current user |
| LIFE-04 | `/gsd:switch` without args lists user's projects with status and lets user choose |
| LIFE-05 | Single-project users get auto-selection without requiring `/gsd:switch` |
| LIFE-06 | Per-project config overrides global defaults |
| LIFE-07 | `/gsd:progress` shows project context and lists available projects if none active |
| LIFE-08 | All existing GSD commands operate transparently on the active project context |
| LIFE-09 | Completed projects archivable to `_archived/` and excluded from listings; restorable via `/gsd:restore-project` |
| LIFE-10 | Decision logging wired into context-gathering workflows via `log-decision-init` and `log-decision` |

### Success Criteria

1. Running `/gsd:new-project` with a project name creates the full planning artifact tree under `.planning/users/<resolved-user>/<project>/` and the `.active` file points to it
2. Running `/gsd:switch frontend` changes the active project, and subsequent `/gsd:progress` reports against the `frontend` project's STATE.md
3. A user with only one project never sees a "no active project" error — it auto-selects
4. Running `/gsd:plan-phase`, `/gsd:execute-phase`, `/gsd:verify-work` all operate on the active project's directory without any user-visible path management
5. Archiving a completed project moves it to `_archived/` and it no longer appears in `/gsd:switch` listings

### Key Deliverables

- Modified `new-project` workflow: user-scoped artifact creation + active context setting
- `/gsd:switch` command implementation (with-args and without-args modes)
- `/gsd:progress` enhancement: project context display, project listing
- Auto-selection logic for single-project users
- Project archival command and `_archived/` directory support
- Per-project `config.json` override resolution

---

## Phase 4: Team Visibility and Hardening

**Goal:** Enable cross-user visibility via `/gsd:team-status`, implement config layering with debug tooling, refine git commit attribution, and harden edge cases (identity stability, CI/CD, performance).

**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md — Config env var layer (4-tier precedence) + config resolve debug command
- [x] 04-02-PLAN.md — Team-status command: cross-user scanning, STATE.md frontmatter parsing, workflow + CLI
- [x] 04-03-PLAN.md — Commit attribution + legacy migration flow + PATH-13 bootstrap fix

### Requirements

| Requirement | Description |
|-------------|-------------|
| TEAM-01 | `/gsd:team-status` scans all user directories, displays active projects/phase/last activity |
| TEAM-02 | `/gsd:team-status` reads only STATE.md frontmatter (machine-readable) |
| TEAM-03 | Path resolver supports cross-user read scope for team-status without breaking isolation |
| TEAM-04 | Config precedence: hardcoded < shared config < per-project config < env vars |
| TEAM-05 | `gsd-tools.cjs config resolve <key>` shows which layer a value came from |
| TEAM-06 | Git commit messages include user/project context (e.g., `docs(dan/frontend): ...`) |

### Success Criteria

1. Running `/gsd:team-status` in a repo with two users shows each user's active project, current phase, and last activity — without modifying any other user's files
2. `gsd-tools.cjs config resolve model_profile` shows the resolved value and its source layer (e.g., "per-project config: .planning/users/dan/frontend/config.json")
3. Git commits for planning artifact changes include the user/project prefix in the commit message
4. Config values set in per-project `config.json` correctly override the shared `.planning/config.json` values, and environment variables override both

### Key Deliverables

- `/gsd:team-status` command: cross-user directory scanning, STATE.md frontmatter parsing
- Cross-user read scope in path resolver (read-only, does not break write isolation)
- Config layering engine with 4-tier precedence
- `config resolve` debug command
- Git commit message attribution with user/project context
- Standardized STATE.md frontmatter schema for team-status consumption

---

## Coverage Validation

| Category | Requirements | Count | Phase |
|----------|-------------|-------|-------|
| Identity & Context | IDEN-01, IDEN-02, IDEN-03, IDEN-04, IDEN-05, IDEN-06, IDEN-07 | 7 | Phase 1 |
| Path Resolution (core) | PATH-01, PATH-10 | 2 | Phase 1 |
| Path Resolution (migration) | PATH-02, PATH-03, PATH-04, PATH-05, PATH-06, PATH-07, PATH-08, PATH-09, PATH-11, PATH-12, PATH-13 | 11 | Phase 2 |
| Project Lifecycle | LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08, LIFE-09, LIFE-10 | 10 | Phase 3 |
| Team Features | TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05, TEAM-06 | 6 | Phase 4 |
| **Total** | | **36** | |

**All 36 v1 requirements mapped. 0 unmapped. Coverage: 100%.**

---

## Phase Dependencies

```
Phase 1 (Identity + Path Core)
    |
    v
Phase 2 (Module Migration)  <-- depends on getPlanningRoot() from Phase 1
    |
    v
Phase 3 (Lifecycle Commands)  <-- depends on all modules using resolved paths from Phase 2
    |
    v
Phase 4 (Team + Hardening)  <-- depends on stable multi-user structure from Phase 3
```

Phases are strictly sequential. Phase 2 cannot begin until Phase 1's `getPlanningRoot()` is functional. Phase 3's commands rely on all modules correctly resolving paths. Phase 4's team features rely on the multi-user directory structure being populated by real project lifecycle operations.

---
*Roadmap created: 2026-03-17*
*Derived from: REQUIREMENTS.md (35 v1 requirements), research/SUMMARY.md*
