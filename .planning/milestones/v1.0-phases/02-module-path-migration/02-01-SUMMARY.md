---
phase: 02-module-path-migration
plan: "01"
subsystem: core
tags: [path-resolution, getPlanningRoot, grep-audit, testing]

requires:
  - phase: 01-identity-and-path-resolution-core
    provides: getPlanningRoot, tryGetPlanningContext, clearPlanningRootCache, createTempMultiUserProject

provides:
  - core.cjs internal functions using _resolvePlanningRootSoft(cwd) for path construction
  - Deprecated createTempProject/createTempGitProject with migration guidance
  - tests/audit-paths.test.cjs grep audit gate (PATH-13, report mode)

affects: [02-module-path-migration]

tech-stack:
  added: []
  patterns:
    - "_resolvePlanningRootSoft(cwd) — soft path resolution with '.planning' fallback"

key-files:
  created:
    - tests/audit-paths.test.cjs
  modified:
    - get-shit-done/bin/lib/core.cjs
    - tests/core.test.cjs
    - tests/helpers.cjs
    - scripts/run-tests.cjs

key-decisions:
  - "Used _resolvePlanningRootSoft (tryGetPlanningContext + '.planning' fallback) instead of getPlanningRoot in internal functions, because getPlanningRoot hard-errors via process.exit(1) which breaks not-yet-migrated test suites"
  - "Kept createTempProject/createTempGitProject as deprecated shims rather than converting them to multi-user, to avoid cascading test failures across 14 test files"
  - "Excluded audit-paths.test.cjs from run-tests.cjs runner via explicit filter, since the glob-based runner auto-includes all .test.cjs files"

patterns-established:
  - "_resolvePlanningRootSoft(cwd): soft resolution pattern for internal core.cjs functions that may be called before multi-user setup"
  - "GSD_USER/GSD_PROJECT env vars + clearPlanningRootCache() in test afterEach for in-process getPlanningRoot testing"

requirements-completed: [PATH-13]

duration: 13min
completed: 2026-03-31
---

# Phase 2 Plan 01: Core.cjs Internal Migration + Audit Gate Summary

**Migrated 7 core.cjs internal functions from hardcoded `.planning/` to `_resolvePlanningRootSoft(cwd)`, updated core.test.cjs to multi-user fixtures, and created PATH-13 grep audit gate scaffold**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-31T21:04:36Z
- **Completed:** 2026-03-31T21:17:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All 7 core.cjs internal functions (loadConfig, findPhaseInternal, getArchivedPhaseDirs, getRoadmapPhaseInternal, getMilestoneInfo, getMilestonePhaseFilter, searchPhaseInDir callers) now use resolved planning root instead of hardcoded `.planning/`
- core.test.cjs fully migrated to createTempMultiUserProject with env var setup and cache clearing
- grep audit gate test created and correctly reports 186+ violations in not-yet-migrated source files

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate core.cjs internal functions** - `67cbf5d` (feat)
2. **Task 2: Update test helpers and create audit gate scaffold** - `2b3ccba` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/core.cjs` - Added `_resolvePlanningRootSoft()` helper; migrated loadConfig, findPhaseInternal, getArchivedPhaseDirs, getRoadmapPhaseInternal, getMilestoneInfo, getMilestonePhaseFilter
- `tests/core.test.cjs` - All test suites for migrated functions now use createTempMultiUserProject with GSD_USER/GSD_PROJECT env vars
- `tests/helpers.cjs` - Deprecated createTempProject/createTempGitProject with JSDoc; createTempGitProject now creates .planning/users/
- `tests/audit-paths.test.cjs` - New PATH-13 grep audit gate with 3 subtests (source .cjs, workflow .md, test .cjs)
- `scripts/run-tests.cjs` - Excluded audit-paths.test.cjs from main runner until Plan 05

## Decisions Made
- Used `_resolvePlanningRootSoft` (tryGetPlanningContext + `.planning` fallback) instead of `getPlanningRoot` directly, because `getPlanningRoot` calls `error()` which does `process.exit(1)` and is not catchable — would break all 93+ tests in not-yet-migrated suites
- Kept `createTempProject()` and `createTempGitProject()` functional with deprecation notices rather than breaking them — actual migration of 14 test files happens in Plans 02-04
- Added `.planning/users/` directory creation to `createTempGitProject()` to prevent legacy structure detection errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used _resolvePlanningRootSoft instead of getPlanningRoot**
- **Found during:** Task 1 (core.cjs migration)
- **Issue:** getPlanningRoot calls error() which does process.exit(1) — not catchable with try/catch. Using it directly in loadConfig, getMilestoneInfo, etc. caused 118 test failures across non-migrated test suites
- **Fix:** Created _resolvePlanningRootSoft() using tryGetPlanningContext (returns null gracefully) with '.planning' fallback for backward compat
- **Files modified:** get-shit-done/bin/lib/core.cjs
- **Verification:** Full test suite 596/596 pass
- **Committed in:** 67cbf5d (Task 1 commit)

**2. [Rule 3 - Blocking] Excluded audit-paths.test.cjs from main test runner**
- **Found during:** Task 2 (audit gate creation)
- **Issue:** scripts/run-tests.cjs uses glob `*.test.cjs` which automatically included the new audit gate test, causing 3 expected failures in the main suite
- **Fix:** Added explicit exclusion filter for audit-paths.test.cjs in the runner
- **Files modified:** scripts/run-tests.cjs
- **Verification:** Full test suite 596/596 pass; audit gate runnable via explicit `node --test tests/audit-paths.test.cjs`
- **Committed in:** 2b3ccba (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for test suite stability during incremental migration. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core internal functions migrated; ready for Plan 02-02 (state.cjs + phase.cjs + roadmap.cjs + config.cjs migration)
- Grep audit gate scaffold ready; will be activated in Plan 05 after all migrations complete
- `_resolvePlanningRootSoft` pattern established for use by other modules in subsequent plans

---
*Phase: 02-module-path-migration*
*Completed: 2026-03-31*
