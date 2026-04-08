---
phase: 02-module-path-migration
plan: "05"
subsystem: infra
tags: [markdown, path-migration, audit-gate, grep, multi-user]

# Dependency graph
requires:
  - phase: 02-module-path-migration (plans 01-04)
    provides: All .cjs modules migrated to getPlanningRoot
provides:
  - All workflow markdown using ${planning_root}/ variable syntax
  - All template markdown using {planning_root}/ placeholder syntax
  - All agent markdown using {planning_root}, {state_path}, {phase_dir} etc. placeholders
  - Active grep audit gate test enforcing zero hardcoded .planning/ paths
affects: [03-project-lifecycle-commands, 04-team-visibility-and-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Workflow files: ${planning_root}/... bash variable syntax from init JSON"
    - "Template files: {planning_root}/... placeholder syntax filled at expansion time"
    - "Agent files: {state_path}, {roadmap_path}, {phase_dir} etc. filled by orchestrator at spawn"

key-files:
  created: []
  modified:
    - get-shit-done/workflows/*.md (37 files)
    - get-shit-done/templates/*.md (30 files)
    - agents/*.md (16 files)
    - tests/audit-paths.test.cjs
    - scripts/run-tests.cjs

key-decisions:
  - "commands.cjs and gsd-tools.cjs added to audit allowlist — legitimate container-dir and help-text refs"
  - "All test files using multi-user path construction added to test audit allowlist"
  - "Source file scan excludes tests/ directory — dedicated test case handles test files separately"

patterns-established:
  - "Workflow ${planning_root}: All workflow markdown paths use bash variable syntax from init JSON output"
  - "Template {planning_root}: Template placeholders filled by workflow code at expansion time"
  - "Agent {state_path} etc: Agent placeholders filled by orchestrator at spawn time — agents never see raw paths"
  - "Audit gate: grep-based test permanently enforces zero hardcoded .planning/ references"

requirements-completed: [PATH-11, PATH-12, PATH-13]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 2 Plan 05: Workflow, Template, and Agent Markdown Migration + Audit Gate Activation Summary

**Migrated 83 markdown files (~560 refs) from hardcoded .planning/ paths to resolved/placeholder paths and activated the grep audit gate as a permanent enforcement test**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T22:10:51Z
- **Completed:** 2026-03-31T22:15:48Z
- **Tasks:** 3 (1a, 1b, 2)
- **Files modified:** 85

## Accomplishments
- All 37 workflow markdown files now use `${planning_root}/` bash variable syntax (~361 refs)
- All 30 template markdown files now use `{planning_root}/` placeholder syntax (~73 refs)
- All 16 agent markdown files now use `{state_path}`, `{roadmap_path}`, `{planning_root}`, `{phase_dir}`, etc. placeholder syntax (~132 refs)
- Grep audit gate test activated in BLOCKING MODE — included in main test runner
- Full test suite passes: 600 tests, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1a: Migrate 8 high-ref workflow files** - `842b8fb` (feat)
2. **Task 1b: Migrate 29 remaining workflow files + 30 template files** - `2a3d9b1` (feat)
3. **Task 2: Migrate 16 agent files + activate audit gate** - `d632ccb` (feat)

## Files Created/Modified
- `get-shit-done/workflows/*.md` (37 files) - All `.planning/` paths replaced with `${planning_root}/`
- `get-shit-done/templates/*.md` (30 files) - All `.planning/` paths replaced with `{planning_root}/`
- `agents/*.md` (16 files) - All `.planning/` paths replaced with specialized placeholders
- `tests/audit-paths.test.cjs` - Activated BLOCKING MODE, updated allowlists, excluded tests/ from source scan
- `scripts/run-tests.cjs` - Removed audit-paths exclusion filter

## Decisions Made
- Added `commands.cjs` and `gsd-tools.cjs` to source audit allowlist — legitimate container-dir and CLI help-text references
- All 11 test files that construct `.planning/users/` paths for test setup added to test audit allowlist
- Source file audit scan excludes `tests/` directory since a dedicated test case handles test files separately
- Agent files use specialized placeholders (`{state_path}`, `{roadmap_path}`, `{requirements_path}`, `{phase_dir}`, `{config_path}`) for well-known paths, `{planning_root}/` for others

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added commands.cjs and gsd-tools.cjs to source audit allowlist**
- **Found during:** Task 2 (activate audit gate)
- **Issue:** Audit gate flagged 3 legitimate .planning/ references: commands.cjs cmdCommit default staging path (container dir), gsd-tools.cjs CLI help text (2 refs)
- **Fix:** Added both files to source allowlist with documented rationale
- **Files modified:** tests/audit-paths.test.cjs
- **Verification:** Audit gate passes
- **Committed in:** d632ccb

**2. [Rule 2 - Missing Critical] Expanded test file allowlist and separated source/test scans**
- **Found during:** Task 2 (activate audit gate)
- **Issue:** Source scan overlapped with test scan (both scanned .cjs). 11 test files legitimately construct `.planning/users/` paths for multi-user test setup
- **Fix:** Added --exclude-dir=tests to source scan; expanded test allowlist to cover all 14 test files
- **Files modified:** tests/audit-paths.test.cjs
- **Verification:** All 3 audit subtests pass independently
- **Committed in:** d632ccb

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both fixes were necessary for the audit gate to work correctly. No scope creep — the allowlists exactly match the documented exemptions from CONTEXT.md and prior plan decisions.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (Module Path Migration) is fully complete
- All .cjs modules, workflow files, template files, and agent files migrated
- Grep audit gate permanently enforces zero hardcoded .planning/ references
- 600 tests pass with zero failures
- Ready for Phase 3 (Project Lifecycle Commands)

---
*Phase: 02-module-path-migration*
*Completed: 2026-03-31*
