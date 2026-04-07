---
phase: 03-project-lifecycle-commands
plan: 03
subsystem: lifecycle
tags: [new-project, bootstrap, workflow, init, multi-user]

# Dependency graph
requires:
  - phase: 03-project-lifecycle-commands (plan 01)
    provides: resolveContext, listProjects, loadConfig two-file merge
  - phase: 03-project-lifecycle-commands (plan 02)
    provides: switch, archive, restore, project-setup CLI commands
provides:
  - Two-step bootstrap new-project workflow (project-setup -> create dir -> switch -> init)
  - Enhanced cmdInitNewProject with project_name, scope_path, config_path fields
affects: [03-04, 03-05, 04-team-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-step-bootstrap, pre-init-project-setup]

key-files:
  created: []
  modified:
    - get-shit-done/workflows/new-project.md
    - commands/gsd/new-project.md
    - get-shit-done/bin/lib/init.cjs
    - tests/init.test.cjs

key-decisions:
  - "Two-step bootstrap pattern: project-setup pre-init -> directory creation -> switch -> normal init"
  - "Project name is the first question asked before any context gathering"
  - "Global config.json seeded into per-project config on creation"

patterns-established:
  - "Pre-init bootstrap: use init project-setup when no active project exists yet"
  - "Workflow two-step: lightweight pre-init for context, then full init after directory setup"

requirements-completed: [LIFE-01, LIFE-02]

# Metrics
duration: 8min
completed: 2026-04-07
---

# Phase 3 Plan 03: New-Project Workflow Rewrite Summary

**Two-step bootstrap new-project workflow with project-setup pre-init, name-first prompting, config seeding, and enhanced init output**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-07T18:14:03Z
- **Completed:** 2026-04-07T18:22:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint approved)
- **Files modified:** 4

## Accomplishments
- Rewrote new-project.md workflow with two-step bootstrap pattern solving the chicken-and-egg problem where init needs an active project that doesn't exist yet
- Project name is now the first question asked, slugified and confirmed before any context gathering
- Enhanced cmdInitNewProject to return project_name, scope_path, and config_path fields for downstream workflow use

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite new-project.md workflow with two-step bootstrap** - `6fb3d5b` (feat)
2. **Task 2: Enhance cmdInitNewProject with project_name, scope_path, config_path** - `72e6d57` (feat)
3. **Task 3: Verify new-project end-to-end workflow (checkpoint)** - Approved (skipped verification)

## Files Created/Modified
- `get-shit-done/workflows/new-project.md` - Rewritten with two-step bootstrap: project-setup pre-init, name prompting, directory creation, switch, then normal init
- `commands/gsd/new-project.md` - Updated command definition for multi-user project creation
- `get-shit-done/bin/lib/init.cjs` - Enhanced cmdInitNewProject with project_name, scope_path, config_path fields
- `tests/init.test.cjs` - Tests for enhanced init output fields

## Decisions Made
- Two-step bootstrap pattern: project-setup pre-init for context when no active project exists, then normal init after directory creation and switch
- Project name asked first (before any context gathering questions) to establish directory structure early
- Global config.json seeded into per-project config on creation, with scope_path added if provided

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 03-04 (workflow files: switch/archive/restore commands, progress enhancement, decision logging)
- Two-step bootstrap pattern established and available for use by subsequent workflows
- init output now includes project_name, scope_path, config_path for workflow consumption

---
*Phase: 03-project-lifecycle-commands*
*Completed: 2026-04-07*
