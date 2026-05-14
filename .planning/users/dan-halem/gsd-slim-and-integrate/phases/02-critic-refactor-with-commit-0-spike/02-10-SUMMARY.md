---
phase: "02-critic-refactor-with-commit-0-spike"
plan: "10"
subsystem: tests/BUILD.bazel registration
tags: [phase-2-critic, wave-5, gap_closure]
requirements: [CRIT-03, XCUT-03]
provides:
  - //tests:cull-no-orphan-references (dual-tagged phase-1-cull + phase-2-critic)
  - //tests:gsd-sdk-query-registry-integration
affects:
  - bazel target count for `--test_tag_filters=phase-2-critic`: 7 → 9
  - Plan 02-08 exit gate coverage
status: complete
completed: "2026-05-14"
---

# Plan 02-10 — Add BUILD entries for 2 missing static tests

## Problem

Two static test files were shipped on disk by prior Phase 2 plans but never registered in `tests/BUILD.bazel`:

| Test file | Source | Shipped via |
|-----------|--------|-------------|
| `cull-no-orphan-references.test.cjs` | Phase 1 cull primary gate; extended in Plan 02-03 to scan `agents/_shared/` | Plan 02-03 SUMMARY |
| `gsd-sdk-query-registry-integration.test.cjs` | Drift-guard for Plan 02-06's `critic-aggregate` SDK registration | Plan 02-06 SUMMARY |

Both were callable via `node --test ...` but invisible to `bazel query` and `bazel test`. Plan 02-08's exit-gate suite (`--test_tag_filters=phase-2-critic`) skipped them.

## Action

Added two explicit `js_test` blocks (not list-comprehension) in `tests/BUILD.bazel`:

- `cull-no-orphan-references`: dual-tagged `phase-1-cull` AND `phase-2-critic`. Data includes the same-package fixture file plus `//:project_sources` (the existing root filegroup with agents/commands/get-shit-done/hooks/scripts/sdk).
- `gsd-sdk-query-registry-integration`: tagged `phase-2-critic`. Data includes `//:project_sources` to reach `sdk/src/query/index.ts` and the scan roots.

## Verification

```
$ bazel query 'attr(tags, "phase-2-critic", //tests/...)' | wc -l
9       # was 7

$ bazel query '//tests:cull-no-orphan-references' '//tests:gsd-sdk-query-registry-integration'
//tests:cull-no-orphan-references
//tests:gsd-sdk-query-registry-integration

$ bazel query 'attr(tags, "phase-1-cull", //tests/...)' | grep cull-no-orphan
//tests:cull-no-orphan-references
```

## Result

Phase 2 exit-gate `--test_tag_filters=phase-2-critic` now picks up 9 static targets instead of 7. Phase 1 cull's gate test is also addressable via `--test_tag_filters=phase-1-cull` (was hidden).

## What this DOES NOT verify

- The tests pass at runtime in the bazel sandbox. They still read files from `//:project_sources` and other locations. Plan 02-11 ensures the data attrs are complete for runtime success across all Phase 2 static tests.

## Follow-ups

- Plan 02-11 (next): fix data attrs for all Phase 2 static tests so the sandbox has the files they read.
- Plan 02-08 (Phase 2 exit): runs after user provides API keys.
