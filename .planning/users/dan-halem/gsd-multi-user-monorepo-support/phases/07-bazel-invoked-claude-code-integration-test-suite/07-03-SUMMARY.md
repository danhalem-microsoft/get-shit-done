---
phase: 07-bazel-invoked-claude-code-integration-test-suite
plan: 03
subsystem: testing
tags: [integration-tests, gsd-tools, multi-user, fork-preservation]

requires:
  - phase: 07-02
    provides: claude-runner.cjs helper with createTestProject and getRepoRoot
provides:
  - runGsdTools helper for direct gsd-tools.cjs subprocess testing
  - gsd-tools workflow integration tests (init, phase-plan-index, find-phase, state)
  - Multi-user resolution tests (alice/bob isolation, GSD_PROJECT override)
  - Fork preservation tests (6 feature areas, patch survival, installed-vs-repo drift)
affects: [07-04]

tech-stack:
  added: []
  patterns: [subprocess JSON assertion pattern via runGsdTools, multi-user fixture creation]

key-files:
  created: [integration/gsd-tools-workflow.test.cjs, integration/multi-user-resolution.test.cjs, integration/fork-preservation.test.cjs]
  modified: [integration/helpers/claude-runner.cjs]

key-decisions:
  - "runGsdTools calls node directly (not claude CLI) to test tooling layer without API dependency"
  - "Wrong-CWD test uses mkdtemp instead of /tmp to avoid cross-platform issues"

patterns-established:
  - "Integration test pattern: runGsdTools returns {success, output, error, json} for structured assertions"
  - "Multi-user fixture pattern: createTestProject + manual bob user setup for two-user scenarios"

requirements-completed: [D-03, D-06, D-07, D-08]

duration: 3min
completed: 2026-04-23
---

# Phase 07 Plan 03: Integration Test Files (v2) Summary

**Real gsd-tools.cjs integration tests replacing weak claude --print smoke tests, covering workflow commands, multi-user resolution, and fork patch preservation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-23T17:00:00Z
- **Completed:** 2026-04-23T17:03:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Added `runGsdTools` helper that calls gsd-tools.cjs as subprocess and returns parsed JSON
- Created workflow integration tests exercising init execute-phase, phase-plan-index, find-phase, state begin-phase
- Created multi-user resolution tests proving alice/bob isolation and GSD_PROJECT env var override
- Created fork preservation tests validating all 6 fork feature areas and installed-vs-repo drift detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Add runGsdTools helper** - `a2eb4c9` (feat)
2. **Task 2: gsd-tools-workflow.test.cjs** - `9c54d4e` (test)
3. **Task 3: multi-user-resolution.test.cjs** - `051ea28` (test)
4. **Task 4: fork-preservation.test.cjs** - `54f68de` (test)

## Files Created/Modified
- `integration/helpers/claude-runner.cjs` - Added runGsdTools helper with JSON parsing
- `integration/gsd-tools-workflow.test.cjs` - 6 tests for gsd-tools CLI commands
- `integration/multi-user-resolution.test.cjs` - 5 tests for multi-user path isolation
- `integration/fork-preservation.test.cjs` - 10 tests for fork feature survival

## Decisions Made
- Used `runGsdTools` (node subprocess) instead of `runClaude` for all core assertions — tests the tooling layer directly
- Wrong-CWD test uses mkdtemp instead of hardcoded /tmp for cross-platform safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 integration test files created and syntax-verified
- Ready for CI pipeline integration (plan 07-04)

---
*Phase: 07-bazel-invoked-claude-code-integration-test-suite*
*Completed: 2026-04-23*
