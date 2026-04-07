---
phase: 03-project-lifecycle-commands
plan: 04
subsystem: workflows
tags: [switch, archive, restore, progress, decision-logging, workflows, commands]

requires:
  - phase: 03-project-lifecycle-commands
    provides: cmdInitSwitch, cmdArchiveProject, cmdRestoreProject dispatcher wiring
provides:
  - /gsd:switch command with both with-args and without-args modes
  - /gsd:archive-project command with confirmation flow
  - /gsd:restore-project command
  - Enhanced progress.md with user/project/phase context header
  - Progress handles no-active-project gracefully
  - Decision logging wired into discuss-phase, new-project, new-milestone, plan-phase workflows
affects: [03-project-lifecycle-commands, 04-team-visibility-and-hardening]

tech-stack:
  added: []
  patterns:
    - "Command + workflow pair pattern for user-facing project lifecycle actions"
    - "Decision logging integration via log-decision-init and log-decision with silent failure"
    - "Context header pattern in progress output"

key-files:
  created:
    - commands/gsd/switch.md
    - commands/gsd/archive-project.md
    - commands/gsd/restore-project.md
    - get-shit-done/workflows/switch.md
    - get-shit-done/workflows/archive-project.md
    - get-shit-done/workflows/restore-project.md
  modified:
    - get-shit-done/workflows/progress.md
    - get-shit-done/workflows/discuss-phase.md
    - get-shit-done/workflows/new-project.md
    - get-shit-done/workflows/new-milestone.md
    - get-shit-done/workflows/plan-phase.md

key-decisions:
  - "Switch workflow uses gsd-tools.cjs switch with both direct and listing modes"
  - "Archive workflow requires user confirmation before proceeding"
  - "Progress context header shows User | Project | Phase at top of all output"
  - "No-active-project in progress calls gsd-tools.cjs switch for project listing"
  - "Decision logging uses <decision_logging> XML section pattern across all 4 workflows"
  - "All decision logging calls use 2>/dev/null || true for mandatory silent failure"

patterns-established:
  - "Command.md + workflow.md pair pattern for lifecycle commands"
  - "<decision_logging> section pattern for workflow integration"

requirements-completed: [LIFE-07, LIFE-10]

duration: 6 min
completed: 2026-04-07
---

# Phase 3 Plan 04: Workflow Files for Switch/Archive/Restore, Progress Enhancement, Decision Logging Summary

**6 new command+workflow files for switch/archive/restore, progress.md enhanced with context header and no-project handling, decision logging wired into 4 context-gathering workflows with silent failure**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-07T18:42:42Z
- **Completed:** 2026-04-07T18:48:28Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Created 3 command definitions (switch.md, archive-project.md, restore-project.md) with proper frontmatter, @-references, and execution context
- Created 3 workflow files (switch.md, archive-project.md, restore-project.md) that orchestrate gsd-tools.cjs CLI commands with proper JSON parsing and error handling
- Enhanced progress.md with user/project/phase context header at top of all output
- Added no-active-project handling in progress.md that lists available projects and prompts to switch or create
- Wired decision logging into discuss-phase.md, new-project.md, new-milestone.md, and plan-phase.md via `<decision_logging>` sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Create switch, archive, restore command + workflow files** - `a81976a` (feat)
2. **Task 2: Enhance progress.md + wire decision logging into 4 workflows** - `395fc6d` (feat)

## Files Created/Modified
- `commands/gsd/switch.md` - Switch command definition with argument-hint, allowed-tools, @-reference to workflow
- `commands/gsd/archive-project.md` - Archive command definition with confirmation flow reference
- `commands/gsd/restore-project.md` - Restore command definition
- `get-shit-done/workflows/switch.md` - Switch workflow with parse_argument, switch_direct, and list_and_pick steps
- `get-shit-done/workflows/archive-project.md` - Archive workflow with user confirmation and result display
- `get-shit-done/workflows/restore-project.md` - Restore workflow with error handling
- `get-shit-done/workflows/progress.md` - Enhanced init_context step with context header and no-project handling
- `get-shit-done/workflows/discuss-phase.md` - Added decision_logging section after initialize step
- `get-shit-done/workflows/new-project.md` - Added decision_logging section after init step
- `get-shit-done/workflows/new-milestone.md` - Added decision_logging section after init step
- `get-shit-done/workflows/plan-phase.md` - Added decision_logging section after init step

## Decisions Made
- Switch workflow uses gsd-tools.cjs switch with both direct and listing modes — consistent with CLI commands built in Plan 02
- Archive workflow requires user confirmation via AskUserQuestion before proceeding — prevents accidental archival
- Progress context header shows `User: X | Project: Y | Phase N of M` at top of all output — provides immediate context
- No-active-project handling in progress calls `gsd-tools.cjs switch` (no args) to reuse listing logic
- Decision logging uses `<decision_logging>` XML section pattern — additive only, no existing workflow behavior changed
- All decision logging calls use `2>/dev/null || true` — mandatory silent failure per LIFE-10 spec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All user-facing command + workflow pairs complete for switch, archive, restore
- Progress enhanced with context awareness
- Decision logging pipeline restored across 4 workflows
- Ready for 03-05: Command transparency integration tests

---
*Phase: 03-project-lifecycle-commands*
*Completed: 2026-04-07*
