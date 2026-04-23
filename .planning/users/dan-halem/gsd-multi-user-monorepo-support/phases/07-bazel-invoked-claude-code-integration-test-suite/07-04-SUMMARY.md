---
phase: 07-bazel-invoked-claude-code-integration-test-suite
plan: 04
subsystem: ci
tags: [github-actions, bazel, ci, integration-tests]

requires:
  - phase: 07-03
    provides: Integration test files auto-discovered by Bazel BUILD glob
provides:
  - GitHub Actions job running Bazel integration tests on every PR
affects: []

tech-stack:
  added: [bazelbuild/setup-bazelisk@v3, actions/cache@v4]
  patterns: [API key guard for fork PR safety, Bazel disk cache]

key-files:
  created: []
  modified: [.github/workflows/test.yml]

key-decisions:
  - "None - followed plan as specified"

patterns-established:
  - "CI pattern: if guard on env var to skip jobs gracefully when secrets unavailable (fork PRs)"

requirements-completed: [D-05, D-09]

duration: 1 min
completed: 2026-04-23
---

# Phase 07 Plan 04: CI Pipeline — Bazel Integration Test Job Summary

**GitHub Actions job running Bazel integration tests with API key guard, disk cache, and Claude Code CLI**

## Performance

- **Duration:** 1 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- bazel-integration-tests job added to .github/workflows/test.yml
- API key guard (`if: env.ANTHROPIC_API_KEY != ''`) for fork PR safety
- Bazel disk cache via actions/cache@v4 keyed on MODULE.bazel + .bazelversion
- Claude Code CLI installed via npm before test run
- 45-minute timeout for API call tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bazel-integration-tests job** - `2399704` (feat)

## Files Created/Modified
- `.github/workflows/test.yml` - Added bazel-integration-tests job alongside existing test job

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
- `ANTHROPIC_API_KEY` must be configured as a repository secret in GitHub Actions for the job to run

## Next Phase Readiness
- Phase 07 complete: all 4 plans executed
- Bazel infrastructure, test helpers, test files, and CI pipeline all in place

---
*Phase: 07-bazel-invoked-claude-code-integration-test-suite*
*Completed: 2026-04-23*
