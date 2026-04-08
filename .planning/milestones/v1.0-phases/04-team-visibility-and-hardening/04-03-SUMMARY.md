---
phase: 04-team-visibility-and-hardening
plan: 03
subsystem: commands, core, migration
tags: [git-attribution, legacy-migration, path-audit]

requires:
  - phase: 04-team-visibility-and-hardening
    provides: "scanAllUsers, cmdTeamStatus, config resolve"
provides:
  - "cmdCommit user/project scope prefix for planning commits"
  - "cmdMigrate legacy .planning/ structure migration"
  - "bootstrap_path in cmdInitProjectSetup output"
affects: [new-project workflow, commit messages, legacy detection]

tech-stack:
  added: []
  patterns:
    - "try/catch guard in cmdCommit for legacy detection fallback"
    - "copy-then-delete migration pattern in cmdMigrate"

key-files:
  created:
    - tests/migration.test.cjs
  modified:
    - get-shit-done/bin/lib/commands.cjs
    - get-shit-done/bin/lib/core.cjs
    - get-shit-done/bin/gsd-tools.cjs
    - get-shit-done/bin/lib/init.cjs
    - get-shit-done/workflows/new-project.md
    - tests/commands.test.cjs
    - tests/core.test.cjs
    - tests/audit-paths.test.cjs
    - .planning/REQUIREMENTS.md

key-decisions:
  - "cmdCommit wraps tryGetPlanningContext in try/catch: prevents breakage if legacy detection throws"
  - "tryGetPlanningContext returns legacy_detected flag instead of process.exit(1): enables migration flow"
  - "cmdMigrate uses copy-then-delete pattern: ensures no data loss during migration"
  - "bootstrap_path in cmdInitProjectSetup: resolves PATH-13 chicken-and-egg cleanly"
  - "new-project.md .planning/ refs moved to allowlist: 2 remaining are documentation comments, not operational paths"

patterns-established:
  - "Planning commit attribution: docs(user/project/scope) format for multi-user git history"
  - "Migration flow: legacy_detected flag + cmdMigrate auto mode for seamless upgrades"

requirements-completed:
  - TEAM-06

duration: 7min
completed: 2026-04-07
---

# Phase 4 Plan 03: Commit Attribution + Legacy Migration + PATH-13 Fix Summary

**Git commit attribution with user/project scope prefix, legacy .planning/ structure migration flow replacing hard errors, and PATH-13 bootstrap violation fix**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-07T21:43:53Z
- **Completed:** 2026-04-07T21:51:18Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Planning commits now get user/project scope prefix (e.g., `docs(dan/frontend/phase-03): ...`) via auto-detection in cmdCommit
- Legacy `.planning/PROJECT.md` structure triggers migration flow instead of process.exit(1) — `tryGetPlanningContext` returns `legacy_detected` flag
- `cmdMigrate` safely moves files with copy-then-delete pattern, preserves `config.json` at root, handles missing `PROJECT.md` gracefully
- PATH-13 audit passes with zero violations after bootstrap_path fix in new-project.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Add commit attribution to cmdCommit()** - `6bdb397` (feat)
2. **Task 2: Replace legacy hard error with migration flow** - `ddb1e7f` (feat)
3. **Task 3: Fix PATH-13 bootstrap violation** - `8b03d71` (fix)

## Files Created/Modified
- `get-shit-done/bin/lib/commands.cjs` - cmdCommit attribution logic + cmdMigrate migration command
- `get-shit-done/bin/lib/core.cjs` - tryGetPlanningContext legacy_detected flag + getPlanningRoot migration instructions
- `get-shit-done/bin/gsd-tools.cjs` - migrate dispatcher case
- `get-shit-done/bin/lib/init.cjs` - bootstrap_path field in cmdInitProjectSetup
- `get-shit-done/workflows/new-project.md` - raw .planning/ refs replaced with ${BOOTSTRAP_PATH}
- `tests/commands.test.cjs` - 5 commit attribution tests
- `tests/migration.test.cjs` - 13 migration flow tests (NEW)
- `tests/core.test.cjs` - Updated legacy detection tests for new behavior
- `tests/audit-paths.test.cjs` - Allowlist updates for migration.test.cjs and new-project.md
- `.planning/REQUIREMENTS.md` - Migration moved from Out of Scope into Phase 4

## Decisions Made
- cmdCommit wraps tryGetPlanningContext in try/catch to prevent breakage if legacy detection throws
- tryGetPlanningContext returns `{ legacy_detected: true }` instead of hard error — enables migration flow
- cmdMigrate uses copy-then-delete pattern — ensures no data loss during migration
- bootstrap_path added to cmdInitProjectSetup output — resolves PATH-13 chicken-and-egg cleanly
- 2 remaining .planning/ refs in new-project.md are documentation comments, added to allowlist

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 complete. All 36 v1 requirements have plans completed.
- All 694 tests pass.
- Ready for milestone completion.

---
*Phase: 04-team-visibility-and-hardening*
*Completed: 2026-04-07*
