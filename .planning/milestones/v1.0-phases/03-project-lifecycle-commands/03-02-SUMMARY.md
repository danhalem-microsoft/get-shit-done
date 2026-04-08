---
phase: 03-project-lifecycle-commands
plan: 02
subsystem: cli
tags: [switch, archive, restore, project-setup, init-commands, dispatcher]

requires:
  - phase: 03-project-lifecycle-commands
    provides: listProjects() structured array, resolveContext() auto-select, writeActiveContext()
  - phase: 01-identity-and-path-resolution-core
    provides: resolveIdentity, readActiveContext, writeActiveContext
provides:
  - cmdInitSwitch with exact/fuzzy match and listing mode
  - cmdInitProjectSetup for new-project bootstrap without active project
  - cmdArchiveProject moves to _archived/ with .active cleanup
  - cmdRestoreProject from _archived/ with active-set
  - Dispatcher wiring for switch, archive-project, restore-project, init project-setup
affects: [03-project-lifecycle-commands, 04-team-visibility-and-hardening]

tech-stack:
  added: []
  patterns:
    - "Fuzzy substring matching for project name resolution"
    - "Archive/restore via fs.renameSync to _archived/ subdirectory"
    - "Top-level dispatcher cases for project lifecycle commands (not under init)"

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/init.cjs
    - get-shit-done/bin/gsd-tools.cjs
    - tests/init.test.cjs
    - tests/dispatcher.test.cjs

key-decisions:
  - "switch/archive-project/restore-project are top-level dispatcher commands, not init sub-commands"
  - "project-setup is an init sub-command since it bootstraps workflow context"
  - "Fuzzy matching uses simple substring includes() - sufficient for project name matching"
  - "Archive auto-selects remaining project when exactly one exists after archiving active"

patterns-established:
  - "Top-level dispatcher routes for user-facing project lifecycle commands"
  - "Lightweight pre-init pattern: cmdInitProjectSetup resolves identity without needing active project"

requirements-completed: [LIFE-03, LIFE-04, LIFE-09]

duration: 5 min
completed: 2026-04-07
---

# Phase 3 Plan 02: Switch/Archive/Restore CLI Commands Summary

**CLI commands for switching projects (exact/fuzzy match), archiving to _archived/, restoring with active-set, and project-setup bootstrap init**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T18:08:05Z
- **Completed:** 2026-04-07T18:14:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- cmdInitSwitch handles exact match, fuzzy substring match, ambiguous error, and listing mode
- cmdInitProjectSetup provides lightweight bootstrap data for new-project workflow without requiring active project
- cmdArchiveProject moves project to _archived/, clears .active for archived project, auto-selects remaining
- cmdRestoreProject moves from _archived/ back, errors on duplicate names, sets restored as active
- Full dispatcher wiring with 5 new dispatcher tests

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Create init commands (TDD)** - `a3e0b2a` (test) + `564fa65` (feat)
2. **Task 2: Wire dispatcher routes** - `33fffd2` (feat)

## Files Created/Modified
- `get-shit-done/bin/lib/init.cjs` - Added cmdInitSwitch, cmdInitProjectSetup, cmdArchiveProject, cmdRestoreProject with imports for resolveIdentity, readActiveContext, writeActiveContext, listProjects
- `get-shit-done/bin/gsd-tools.cjs` - Added switch, archive-project, restore-project top-level cases + init project-setup sub-case
- `tests/init.test.cjs` - 16 new tests: switch (6), project-setup (3), archive (3), restore (4)
- `tests/dispatcher.test.cjs` - 5 new tests: switch routing (2), archive routing (1), restore routing (1), project-setup routing (1)

## Decisions Made
- switch, archive-project, restore-project are top-level dispatcher commands (not `init` sub-commands) because they are direct user actions, not workflow bootstrap
- project-setup is an `init` sub-command because it bootstraps context for the new-project workflow
- Fuzzy matching uses simple `includes()` substring — adequate for project slugs, no need for Levenshtein
- Archive auto-selects if exactly one project remains after archiving the active one

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Switch/archive/restore commands ready for workflow integration
- Ready for 03-03: New-project workflow and progress enhancements

---
*Phase: 03-project-lifecycle-commands*
*Completed: 2026-04-07*
