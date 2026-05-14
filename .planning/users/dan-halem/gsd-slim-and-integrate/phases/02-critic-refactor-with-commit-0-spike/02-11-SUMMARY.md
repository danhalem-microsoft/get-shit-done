---
phase: "02-critic-refactor-with-commit-0-spike"
plan: "11"
subsystem: bazel sandbox data deps + Azure env propagation
tags: [phase-2-critic, wave-5, gap_closure]
requirements: [CRIT-03, CRIT-04, CRIT-05, XCUT-03]
provides:
  - //:project_sources converted from filegroup to js_library (aspect_rules_js requirement) + bin/** + package.json
  - //integration:walltime-ledger js_library for the live ledger snapshot
  - Phase 2 list-comp js_test `data` includes //:project_sources + //integration:walltime-ledger
  - .bazelrc: AZURE_OPENAI_* --test_env entries + try-import %workspace%/user.bazelrc
  - .gitignore: user.bazelrc
affects:
  - bazel test //integration/... //tests/... --test_tag_filters=phase-2-critic,-requires-api-key — 9/9 PASS (was 1/7)
  - Plan 02-08 exit-gate static surface
status: complete
completed: "2026-05-14"
---

# Plan 02-11 — Fix js_test data attrs + bazel env propagation

## Problem (two layered)

**1. Bazel sandbox vs Phase 2 static tests.** The Phase 2 list-comprehension `data = ["//integration/helpers:test_helpers"]` was the only data dep — but the tests read agent files, `bin/install.js`, workflow files, SDK sources, and the walltime ledger. In bazel's hermetic sandbox these were missing, so 6 of 7 tagged-`phase-2-critic` static tests FAILed with ENOENT (or `Cannot find module`) despite `node --test` passing 30/30.

**2. Azure env vars don't reach bazel tests.** `.bazelrc` only forwarded `ANTHROPIC_API_KEY`. The embedding-cosine parity comparator (Plan 02.1-02) needs `AZURE_OPENAI_*`. Per bazel docs ([Issue #955](https://github.com/bazelbuild/bazel/issues/955) — open since 2016, P3 "not considering") there's no native `.env` ingestion; the canonical patterns are `--test_env=VARNAME` (inherit from shell) and `try-import %workspace%/user.bazelrc` (gitignored escape hatch).

## Action — five small edits

### 1. `BUILD.bazel` — `filegroup` → `js_library`; add `bin/**` + `package.json`

aspect_rules_js's `data` attr on `js_test` requires sibling-package source files to be wrapped in `js_library` (not bare `filegroup`) so they're copied into the sandbox. Extended the glob to cover `bin/**` (for `tests/install-shared-dir.test.cjs` → `require('bin/install.js')`) and `package.json` (for `bin/install.js` → `require('../package.json')` at line 146).

### 2. `integration/BUILD.bazel` — new `walltime-ledger` `js_library`

Exposes `integration/test-fixtures/walltime-ledger.jsonl` to `//tests:__pkg__` so `walltime-ledger-schema.test.cjs` can read the committed snapshot in the sandbox.

### 3. `tests/BUILD.bazel` — Phase 2 list-comp `data` broadened

Added `//:project_sources` + `//integration:walltime-ledger` to the existing list-comprehension's `data` attribute. The two gap-closure entries from Plan 02-10 (`cull-no-orphan-references`, `gsd-sdk-query-registry-integration`) already had `//:project_sources` so they pick up the upgrade-to-js_library automatically.

### 4. `.bazelrc` — Azure `--test_env` lines + `try-import`

Added 5 `--test_env=AZURE_OPENAI_*` lines (inherit-from-shell pattern, matching existing `ANTHROPIC_API_KEY`) plus `try-import %workspace%/user.bazelrc` (the canonical escape hatch documented in [bazel.build/run/bazelrc](https://bazel.build/run/bazelrc) for per-developer overrides with explicit values).

### 5. `.gitignore` — `user.bazelrc`

The escape-hatch file holds explicit values (potentially secrets); must never be committed.

## Verification

```
$ set -a; source ~/.env 2>/dev/null; set +a
$ bazel test //integration/... //tests/... --test_tag_filters=phase-2-critic,-requires-api-key
//tests:critic-aggregate-shape                  PASSED
//tests:critic-findings-delta-shape             PASSED
//tests:critic-line-budget                      PASSED
//tests:critic-no-base-shadowing                PASSED
//tests:critique-workflow-structure             PASSED
//tests:cull-no-orphan-references               PASSED
//tests:gsd-sdk-query-registry-integration      PASSED
//tests:install-shared-dir                      PASSED
//tests:walltime-ledger-schema                  PASSED

Executed 9 out of 9 tests: 9 tests pass.
```

Was 1/7. Now 9/9 — including the 2 new entries from Plan 02-10.

## Result

Phase 2 static-surface test contract holds end-to-end inside bazel. The Azure env-propagation pipe is in place for live tests (`requires-api-key` tag); developer sources `~/.env`, bazel forwards via `--test_env`, comparator reaches Azure embeddings.

## What this DOES NOT verify

- **Live tests** (`critic-spike-passes`, `critic-spike-inverse`, `critic-batch-walltime`, `critic-fault-injection`, `critic-parity`) — these require `ANTHROPIC_API_KEY`, which this orchestrator doesn't have access to. Plan 02-08 will run them from the user's shell.
- **Behavior parity** — Phase 2.1's 5/6 sub-threshold finding is unchanged by this plan. Plan 02-08 will surface it at the exit-gate checkpoint per the user's "expect parity fail" pre-authorization.

## Follow-ups

- Plan 02-08: re-attempt the exit gate from the user's shell with `set -a; source ~/.env; set +a` (and `ANTHROPIC_API_KEY` exported separately) so all live tests can spawn critics.
