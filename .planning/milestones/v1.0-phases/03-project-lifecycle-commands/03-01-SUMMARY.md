---
phase: 03-project-lifecycle-commands
plan: 01
subsystem: core
tags: [context-resolution, config-layering, project-listing]

requires:
  - phase: 01-identity-and-path-resolution-core
    provides: resolveIdentity, readActiveContext, writeActiveContext, getPlanningRoot
  - phase: 02-module-path-migration
    provides: All modules using getPlanningRoot for resolved paths
provides:
  - listProjects() structured array with project metadata
  - resolveContext() auto-select for single-project users
  - resolveContext() null return for 0 or N projects (no hard-error)
  - loadConfig() two-file merge (global + per-project) with source tracking
affects: [03-project-lifecycle-commands, 04-team-visibility-and-hardening]

tech-stack:
  added: []
  patterns:
    - "Two-file config merge with per-key source tracking via _sources"
    - "scanProjects() internal helper for directory listing with _archived/dotfile filter"
    - "resolveContext returns null instead of hard-error for missing project"

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/context.cjs
    - get-shit-done/bin/lib/core.cjs
    - tests/context.test.cjs
    - tests/core.test.cjs

key-decisions:
  - "resolveContext returns null project/planning_root for 0 or N projects — workflow layer handles prompting"
  - "getPlanningRoot checks null and hard-errors for commands that require active project"
  - "loadConfig reads global .planning/config.json and per-project ${planningRoot}/config.json with per-project > global > defaults precedence"
  - "_sources tracks per-key config source for Phase 4 config resolve command"
  - "scanProjects is internal helper (dir names only); listProjects is exported (rich metadata)"

patterns-established:
  - "Two-layer config merge: global + per-project with _sources tracking"
  - "Null-return pattern in resolveContext for graceful context resolution"

requirements-completed: [LIFE-04, LIFE-05, LIFE-06]

duration: 9 min
completed: 2026-04-07
---

# Phase 3 Plan 01: Core Module Changes Summary

**Redesigned listProjects() with structured metadata, added resolveContext() auto-select and null return, rebuilt loadConfig() with global + per-project merge and per-key source tracking**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-07T17:51:07Z
- **Completed:** 2026-04-07T17:59:42Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- listProjects() exported and returns structured array with name, current_phase, progress, last_activity, description
- resolveContext() handles 0, 1, and N projects without hard-erroring — auto-selects single project
- getPlanningRoot() preserves hard-error behavior for commands needing active project
- loadConfig() merges global + per-project configs with _sources tracking per key

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Redesign listProjects() and modify resolveContext()** - `21ea794` (test) + `cac9066` (feat)
2. **Task 2: Rebuild loadConfig() for global + per-project merge** - `a74b5a5` (test) + `3916b4b` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/context.cjs` - Redesigned listProjects(), scanProjects() helper, resolveContext() auto-select + null return, extractCoreValue() helper, frontmatter.cjs import
- `get-shit-done/bin/lib/core.cjs` - Rebuilt loadConfig() with two-file merge and _sources tracking, getPlanningRoot() null check
- `tests/context.test.cjs` - 15 new tests: listProjects structured return, resolveContext auto-select, null return, getPlanningRoot null handling
- `tests/core.test.cjs` - 11 new tests: loadConfig two-file merge, _sources tracking, depth migration, model_overrides, nested keys

## Decisions Made
- resolveContext returns null instead of calling error() — lets workflow layer decide how to handle missing projects
- getPlanningRoot is the hard-error boundary — commands that require active project fail here with actionable message
- scanProjects is kept internal (just dir names) while listProjects is exported (rich metadata objects)
- loadConfig uses _sources to track which layer each value came from, preparing for Phase 4's config resolve command
- Depth migration in loadConfig checks both files, migrates whichever contains the deprecated key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing test for behavioral change**
- **Found during:** Task 1 (resolveContext modifications)
- **Issue:** Existing test "error on missing .active (subprocess)" expected hard-error, but with single-project auto-select, resolveContext now succeeds instead of erroring
- **Fix:** Updated test to verify auto-select behavior instead of expecting error
- **Files modified:** tests/context.test.cjs
- **Verification:** Test passes with new behavior
- **Committed in:** cac9066 (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test accurately reflects new behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core module changes complete; listProjects, resolveContext, and loadConfig ready for downstream commands
- Ready for 03-02: Switch, archive, restore CLI commands

---
*Phase: 03-project-lifecycle-commands*
*Completed: 2026-04-07*
