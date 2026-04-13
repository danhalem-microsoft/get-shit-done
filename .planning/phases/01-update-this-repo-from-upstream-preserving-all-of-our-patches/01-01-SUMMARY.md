---
phase: 01-update-this-repo-from-upstream-preserving-all-of-our-patches
plan: 01
subsystem: infra
tags: [git-merge, upstream-sync, path-resolution, core-lib]

requires:
  - phase: none
    provides: clean main branch with 102 local patches

provides:
  - upstream-sync branch with merge in progress
  - core.cjs resolved with planningPaths delegating to getPlanningRoot
  - atomicWriteFileSync adopted from upstream
  - CONFIG_DEFAULTS constant adopted from upstream
  - Path resolution pattern established for all downstream plans

affects: [01-02, 01-03, 01-04, 01-05]

tech-stack:
  added: []
  patterns:
    - "planningPaths delegates to getPlanningRoot for multi-user path resolution"
    - "CONFIG_DEFAULTS as canonical constant for config defaults"
    - "atomicWriteFileSync for crash-safe file writes"

key-files:
  created:
    - ".planning/phases/01-.../upstream-sync-hash.txt"
    - ".planning/phases/01-.../pre-merge-test-baseline.txt"
  modified:
    - "get-shit-done/bin/lib/core.cjs"

key-decisions:
  - "Adopted upstream findProjectRoot (our duplicate MODEL_PROFILES already imported from model-profiles.cjs)"
  - "Created planningPaths that delegates to getPlanningRoot instead of upstream planningDir"
  - "Kept our two-layer loadConfig (global + per-project) with upstream CONFIG_DEFAULTS constant"
  - "Adopted upstream extractCurrentMilestone usage and improved regex in getMilestonePhaseFilter"
  - "Adopted all upstream new functions (filterPlanFiles, filterSummaryFiles, getPhaseFileStats, readSubdirectories, atomicWriteFileSync, timeAgo)"
  - "Kept upstream planningDir and planningRoot functions for upstream code compatibility"

patterns-established:
  - "Conflict resolution pattern: keep our path resolution (getPlanningRoot/_resolvePlanningRootSoft), adopt upstream improvements, union imports and exports"

requirements-completed: [MERGE-01, MERGE-02]

duration: 10 min
completed: 2026-04-13
---

# Phase 01 Plan 01: Pre-merge Setup + core.cjs Path Resolution Foundation Summary

**Feature branch upstream-sync created with 61-file merge in progress; core.cjs fully resolved with planningPaths delegating to getPlanningRoot, atomicWriteFileSync adopted, and unified exports block**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-13T17:16:04Z
- **Completed:** 2026-04-13T17:26:47Z
- **Tasks:** 2
- **Files modified:** 3 (core.cjs + 2 new planning metadata files)

## Accomplishments

- Tagged pre-upstream-sync as safety checkpoint at 3003b70
- Captured test baseline: 694 tests, 693 pass, 1 known fail
- Fetched upstream/main at e6e33602c314ffbf62b9f72017aa0b868a6e94ff
- Created upstream-sync branch with merge in progress (61 conflicting files, 250 markers)
- Resolved all 9 conflict blocks in core.cjs establishing the path resolution pattern
- Adopted upstream improvements: findProjectRoot, CONFIG_DEFAULTS, atomicWriteFileSync, timeAgo, filterPlanFiles, filterSummaryFiles, getPhaseFileStats, readSubdirectories
- Created planningPaths wrapper that delegates to getPlanningRoot for multi-user path resolution

## Task Commits

Note: Individual task commits are not possible during an active merge with unresolved files. Both tasks are staged; the merge commit will be created in Plan 05 after all 61 files are resolved.

1. **Task 1: Pre-merge setup and execute merge** - staged (feat)
2. **Task 2: Resolve core.cjs path resolution foundation** - staged (feat)

## Files Created/Modified

- `.planning/phases/01-.../upstream-sync-hash.txt` - Locked upstream commit hash for reproducibility
- `.planning/phases/01-.../pre-merge-test-baseline.txt` - Pre-merge test counts (694 tests, 693 pass)
- `get-shit-done/bin/lib/core.cjs` - Resolved 9 conflict blocks, established path resolution pattern

## Decisions Made

1. **Dropped duplicate MODEL_PROFILES from core.cjs** - Already imported from model-profiles.cjs (line 10); took upstream's `findProjectRoot` instead
2. **Created planningPaths delegating to getPlanningRoot** - Upstream code calls planningPaths extensively; our version routes through multi-user resolution instead of upstream's planningDir
3. **Kept our two-layer loadConfig** - Our loadConfig (global + per-project config merge) is more sophisticated than upstream's single-layer; adopted upstream's CONFIG_DEFAULTS constant as the defaults source
4. **Adopted upstream's improved regex in getMilestonePhaseFilter** - Supports custom phase IDs (PROJ-42) in addition to numeric
5. **Adopted upstream's extractCurrentMilestone** - Used in getMilestonePhaseFilter for proper milestone scoping
6. **Removed upstream's original planningPaths** - Was auto-merged from non-conflict region but conflicts with our multi-user version; removed the duplicate
7. **Kept planningDir and planningRoot functions** - Upstream code uses these; they provide raw .planning/ path resolution for upstream features (workstreams, etc.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate planningPaths function**
- **Found during:** Task 2 (core.cjs resolution)
- **Issue:** Upstream's original planningPaths (using planningDir) was auto-merged from a non-conflict region. After adding our planningPaths (delegating to getPlanningRoot), there were two definitions.
- **Fix:** Removed upstream's original planningPaths, kept our multi-user-aware version
- **Files modified:** get-shit-done/bin/lib/core.cjs
- **Verification:** node -e "require('./get-shit-done/bin/lib/core.cjs')" succeeds, single planningPaths function present
- **Committed in:** Part of staged merge

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to prevent duplicate function definition. No scope creep.

## Issues Encountered

- Cannot commit individual tasks during an active git merge with unresolved files. This is expected behavior per the merge workflow. Task commits will be part of the merge commit in Plan 05.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- core.cjs path resolution pattern is established for all downstream plans
- 60 conflicting files remain (core.cjs resolved, 60 to go)
- Ready for Plan 02: init.cjs, state.cjs, phase.cjs (54 conflict markers)

---
*Phase: 01-update-this-repo-from-upstream-preserving-all-of-our-patches*
*Completed: 2026-04-13*
