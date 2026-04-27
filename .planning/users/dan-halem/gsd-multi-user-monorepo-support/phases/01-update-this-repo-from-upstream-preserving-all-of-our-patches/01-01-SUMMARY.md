---
phase: 01
plan: 01
status: complete
started: 2026-04-12
completed: 2026-04-14
---

## Summary

Set up the upstream merge on feature branch `recovery/upstream-sync` and resolved core.cjs — the path resolution foundation that all other files depend on.

## What Was Built

- Safety tag `pre-upstream-sync` created pointing to pre-merge main HEAD
- Feature branch with merge of 714 upstream commits
- core.cjs resolved: `planningPaths()` delegates to `getPlanningRoot()` for multi-user path resolution
- `atomicWriteFileSync` adopted from upstream for crash-safe writes
- All existing `getPlanningRoot` exports preserved

## Key Decisions

- planningPaths() delegates to getPlanningRoot() — our multi-user path resolution is primary
- atomicWriteFileSync adopted from upstream (crash-safe writes)
- getPlanningRoot falls back to flat .planning/ when no users/ dir exists (upstream test compat)

## Self-Check: PASSED

All must_haves verified:
- ✓ Safety tag pre-upstream-sync exists
- ✓ Feature branch exists with merge commit
- ✓ core.cjs has zero conflict markers
- ✓ planningPaths() delegates to getPlanningRoot()
- ✓ atomicWriteFileSync is exported

## Key Files

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/core.cjs
