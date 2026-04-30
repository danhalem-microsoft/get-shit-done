---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 09
subsystem: migration-table-and-phase-exit-gate
tags:
  - cull
  - migration-table
  - changelog
  - bazel-tag
  - phase-1-exit-gate
  - checkpoint-pending
dependency-graph:
  requires:
    - 01-08 (the-actual-cull) — Wave 1 deletions; INVENTORY restructured per D-02; orphan-reference test GREEN
    - tests/fixtures/cull-deletion-list.cjs — single source of truth for migration-table assertions
  provides:
    - Phase 1 migration table populated in 3 places (help workflow, CHANGELOG, command file delegates)
    - tests/migration-table-present.test.cjs (80 named cases) — CULL-07 + D-01 enforcement
    - phase-1-cull Bazel tag on //integration:gsd-lifecycle — XCUT-02 invocation now resolves
  affects:
    - Phase 1 EXIT GATE (gsd-slim-phase-1-cull tag) — pending user-verification checkpoint
    - All downstream phases (2-6) — XCUT-02 tag-filtering pattern is now established
tech-stack:
  added: []
  patterns:
    - migration-table-in-workflow-body (commands/gsd/help.md delegates; table lives in get-shit-done/workflows/help.md per PATTERNS.md line 57)
    - D-01 OLD-vs-NEW /gsd-review disambiguation (regex-anchored row + literal phrase "different functionality, same name")
    - phase-N-cull Bazel tag pattern on lifecycle target (preserves existing "lifecycle" tag; adds phase-specific tag)
key-files:
  created:
    - tests/migration-table-present.test.cjs
  modified:
    - get-shit-done/workflows/help.md (appended "## Command Migration (Phase 1 Cull)" + "## Agent Removals (Phase 1 Cull)" sections, 75 rows)
    - CHANGELOG.md (replaced empty [Unreleased] block with BREAKING CHANGES + Added + Changed + Migration table sections)
    - integration/BUILD.bazel (added "phase-1-cull" to //integration:gsd-lifecycle tags)
decisions:
  - id: D-01-09-01
    text: "Per CONTEXT.md D-01 LOCKED: the OLD /gsd-review row uses the literal '(old)' qualifier and explicit Removed wording, regex-anchored as ^\\|.*\\bgsd-review\\b.*\\(old\\).*Removed.*\\|$. The disambiguation phrase 'different functionality, same name' appears verbatim in BOTH the help workflow and the CHANGELOG [Unreleased] block."
    impact: "tests/migration-table-present.test.cjs has dedicated D-01 regex assertions in both describe blocks (help workflow AND CHANGELOG); a future edit that drops the qualifier or the phrase will fail the static test."
  - id: D-01-09-02
    text: "Per CONTEXT.md D-04 LOCKED: tests/migration-table-present.test.cjs uses ONLY fs.readFileSync (read-only) and own-scope local variables; no process.chdir, no shared-cache mutation."
    impact: "Test is concurrency-safe under TEST_CONCURRENCY=8 (verified at the Phase 1 exit-gate checkpoint per Task 4)."
  - id: D-01-09-03
    text: "commands/gsd/help.md required no edit — its <execution_context> already imports @~/.claude/get-shit-done/workflows/help.md and the <process> body delegates output to that workflow file (per PATTERNS.md line 57). The migration table lives in the workflow body, not in the command file."
    impact: "Subtask 1c verified existing delegation; no commit needed for that file. The migration-table test reads BOTH files (concatenated) so the assertion succeeds regardless of which file holds the table."
metrics:
  duration: 0h25m (Tasks 1-3; Task 4 checkpoint duration excluded)
  tasks: 3 of 4 (Task 4 is checkpoint:human-verify; gate=blocking)
  files_changed: 4
  files_created: 1
  files_deleted: 0
  commits: 3
  completed_at: 2026-04-30T01:30:00Z (Tasks 1-3 only; Task 4 pending)
---

# Phase 01 Plan 09: Migration Table + Phase 1 Exit Gate Summary

Final plan of Phase 1. Populates the user-facing migration table in three places (help workflow body + CHANGELOG `[Unreleased]` block; commands/gsd/help.md already delegates), wires up the static `migration-table-present` test that enforces it (CULL-07 + the D-01 OLD-vs-NEW `/gsd-review` disambiguation), and adds the `phase-1-cull` Bazel tag to the lifecycle target so `bazel test //integration/... --test_tag_filters=phase-1-cull` resolves (XCUT-02).

**Status: PARTIAL — Tasks 1-3 of 4 complete and committed.** Task 4 is a `checkpoint:human-verify` with `gate="blocking"` — it requires running four test invocations (`npm test`, `TEST_CONCURRENCY=8 npm test`, `bazel test //integration/... --test_tag_filters=phase-1-cull`, `bazel test //integration:gsd-lifecycle`) and applying the `gsd-slim-phase-1-cull` git tag only after all four are GREEN. Per the orchestrator's `<git_tag_warning>`, the tag CANNOT be applied from inside this worktree — the orchestrator merges the worktree to main first, then applies the tag on main.

## What Was Built

### Task 1 — Migration tables populated (commit `ecc524c4`)

- **`get-shit-done/workflows/help.md`** — appended two new sections at the bottom (after "## Getting Help"):
  - `## Command Migration (Phase 1 Cull)` with two sub-tables:
    - **49 commands removed outright** — one row per LOCKED entry in `tests/fixtures/cull-deletion-list.cjs#deletedCommands`. The `/gsd-review` row uses the literal `(old)` qualifier and the wording `Removed (the old /gsd-review git/PR helper; the new /gsd-review is the consolidated quality-gate review entry point — different functionality, same name).` per CONTEXT.md D-01.
    - **9 commands consolidated** — one row per entry in `consolidatedCommands`, listing the new dispatch target (`/gsd-review --code` etc., or `/gsd-phase add` etc.). The 6 quality-gate consolidations note "**Stub kept** for one milestone" (CULL-05); the 3 phase-manip consolidations note "Old command removed; no stub" (per CONTEXT.md decisions, no stubs for phase-manip).
  - `## Agent Removals (Phase 1 Cull)` — 17 rows, one per entry in `deletedAgents`.
- **`CHANGELOG.md`** — replaced the empty `## [Unreleased]` block with a populated Keep-a-Changelog block:
  - `### BREAKING CHANGES` — counts and full lists of removed/consolidated/agent items, including the parenthetical "(old — see migration table for OLD-vs-NEW /gsd-review disambiguation)" on the OLD `review` entry.
  - `### Added` — the new `/gsd-review` and `/gsd-phase` consolidated commands; the 9 new static tests added across Phase 1; the parity infrastructure (helper, baselines, walltime ledger, lifecycle decomposition).
  - `### Changed` — the lifecycle composer transformation.
  - `### Migration table` — pointer to the help workflow.
  - The phrase **"different functionality, same name"** appears verbatim in both BREAKING CHANGES and Added blocks (both surface the OLD-vs-NEW /gsd-review distinction).
- **`commands/gsd/help.md`** — required no edit. Its `<execution_context>` already imports `@~/.claude/get-shit-done/workflows/help.md` and the `<process>` body says "Output the complete GSD command reference from @~/.claude/get-shit-done/workflows/help.md. Display the reference content directly — no additions or modifications." Subtask 1c verified the existing delegation (per PATTERNS.md line 57).

Verification (all GREEN):

```bash
$ for cmd in audit-fix audit-uat ... cleanup secure-phase ... remove-phase; do grep -q "/gsd-${cmd}" get-shit-done/workflows/help.md; done; echo "OK"
OK help workflow has all command rows
$ grep -E '^\|.*\bgsd-review\b.*\(old\).*Removed.*\|' get-shit-done/workflows/help.md
| `/gsd-review` (old)            | _(none)_                       | Removed (the old `/gsd-review` git/PR helper; ... different functionality, same name). |
$ grep -c "different functionality, same name" CHANGELOG.md get-shit-done/workflows/help.md
CHANGELOG.md:1
get-shit-done/workflows/help.md:1
```

### Task 2 — `tests/migration-table-present.test.cjs` (commit `e567ed9b`)

New static test, 80 named cases, all GREEN:

- **Help workflow describe block (77 cases):**
  - 1 case asserts the help content mentions "migration".
  - 49 cases iterate `deletedCommands` and assert each `/gsd-${cmd}` slash mention appears in the concatenated help content (workflow body OR command file).
  - 9 cases iterate `consolidatedCommands` and assert both the old slash mention AND the replacement string appear.
  - 17 cases iterate `deletedAgents` and assert each agent name appears in the help content.
  - 1 case is the **D-01 OLD /gsd-review row regex assertion**: filters help-content lines that start with `|` and contain `gsd-review`, then asserts at least one matches `^\|.*\bgsd-review\b.*\(old\).*Removed.*\|$`. Also asserts the literal phrase `different functionality, same name` appears in the help content.
- **CHANGELOG describe block (3 cases):**
  - 1 case asserts the BREAKING CHANGES headers and the literal counts ("49 commands removed", "17 agents removed", "9 commands consolidated").
  - 1 case isolates the `[Unreleased]` block (`## [Unreleased]` → next `## [`) and spot-checks 5 deleted-command names appear inside it.
  - 1 case is the **D-01 CHANGELOG disambiguation assertion**: asserts the literal phrase `different functionality, same name` appears in the CHANGELOG.

Per CONTEXT.md D-04 LOCKED: the test uses ONLY `fs.readFileSync` (read-only) + own-scope local variables; no `process.chdir`, no shared-cache mutation. Concurrency-safe under `TEST_CONCURRENCY=8`.

Verification:

```
$ node --test tests/migration-table-present.test.cjs
# tests 80
# pass 80
# fail 0
```

### Task 3 — phase-1-cull Bazel tag (commit `805952b2`)

`integration/BUILD.bazel` line for `//integration:gsd-lifecycle`:

```python
# BEFORE
tags = ["integration", "local", "requires-api-key", "lifecycle"],

# AFTER
tags = ["integration", "local", "requires-api-key", "lifecycle", "phase-1-cull"],
```

Verification:

```
$ bazel query 'attr(tags, "phase-1-cull", //integration/...)'
//integration:gsd-lifecycle
$ command -v bazel && bazel --version
bazel 7.6.1
```

The XCUT-02 invocation `bazel test //integration/... --test_tag_filters=phase-1-cull` is now wired to the lifecycle target.

### Task 4 (CHECKPOINT — pending) — Phase 1 exit gate

**Status: NOT EXECUTED in this worktree.**

Task 4 is `type="checkpoint:human-verify"` with `gate="blocking"`. It requires:

1. `npm test` GREEN (full static suite, default concurrency).
2. `TEST_CONCURRENCY=8 npm test` GREEN (per CONTEXT.md D-04 — concurrency contract verified).
3. `bazel test //integration/... --test_tag_filters=phase-1-cull` GREEN.
4. `bazel test //integration:gsd-lifecycle` GREEN (full live spine, real Claude API, expensive).

After all four are GREEN, the orchestrator (post-merge to main) applies the annotated tag:

```bash
git tag -a gsd-slim-phase-1-cull -m "Phase 1 complete: cull (49 + 17 deletions; 9 consolidations) + Wave 0 test infrastructure (orphan test, parity helper, 22 baselines per D-03, lifecycle decomposition, staleness guard); concurrency-safe per D-04"
```

Per the orchestrator's `<git_tag_warning>`, the git tag CANNOT be applied from inside this worktree branch — the orchestrator must merge the worktree to main first, then apply tags on main. This worktree returns the `human-action` portion of the checkpoint to the orchestrator with the tag command and message text.

## Why It Works

The migration table lives in the workflow body (not the command file) per PATTERNS.md line 57 — the command file's job is to delegate to the workflow. The static test reads BOTH files concatenated, so the assertion succeeds regardless of where the table physically lives; this also makes the test robust to a future move from workflow → command body.

The D-01 disambiguation is enforced at three layers:

1. **Migration row regex** (`^\|.*\bgsd-review\b.*\(old\).*Removed.*\|$`) — anchored to the table-row format. A future edit that drops the `(old)` qualifier OR the `Removed` outcome on the old-`/gsd-review` row fails the test.
2. **Literal phrase assertion** in the help content — `different functionality, same name`. Catches reword-attempts that preserve the row format but lose the disambiguating prose.
3. **Literal phrase assertion** in the CHANGELOG — same phrase, separate assertion. Catches drift between the two surfaces.

The phase-1-cull Bazel tag preserves the existing `lifecycle` tag because the lifecycle test is still the only "enormous" target in `//integration/`, and other Phase 2-6 plans will eventually add their own per-phase tags (`phase-2-critic-refactor`, etc.) to the same target. Stacking phase-tags on the lifecycle target lets a single tag-filter narrow the run to just the phase under test.

## Verification

| Verification | Command | Status |
|---|---|---|
| Help workflow has all 49 deletion-list slash mentions | spot-grep loop | OK |
| Help workflow has all 9 consolidation entries | spot-grep loop | OK |
| Help workflow has all 17 deleted-agent names | spot-grep loop | OK |
| D-01 OLD `/gsd-review` row regex matches | grep -E pattern | OK |
| D-01 disambiguation phrase in workflow | grep -F | OK (1 occurrence) |
| D-01 disambiguation phrase in CHANGELOG | grep -F | OK (1 occurrence) |
| CHANGELOG `[Unreleased]` has BREAKING CHANGES + 49/17/9 counts | grep | OK |
| `tests/migration-table-present.test.cjs` GREEN | `node --test` | OK (80/80 pass) |
| `phase-1-cull` tag in BUILD.bazel | grep -F | OK |
| `lifecycle` tag still in BUILD.bazel (preserved) | grep -F | OK |
| Bazel installed | `command -v bazel` | OK (bazel 7.6.1) |
| Bazel query resolves phase-1-cull-tagged target | `bazel query attr(tags, ...)` | OK (`//integration:gsd-lifecycle`) |
| Three Wave 1 commits on worktree branch | `git log --oneline -5` | OK (`ecc524c4`, `e567ed9b`, `805952b2`) |
| Task 4 (checkpoint) pending user/orchestrator action | n/a | PENDING |
| `gsd-slim-phase-1-cull` git tag applied | `git tag -l` | NOT APPLIED (must run on main post-merge) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] CHANGELOG disambiguation phrase was reversed**

- **Found during:** Task 1 verification.
- **Issue:** Initial CHANGELOG draft used "same name, different functionality" (reversed word order), but the static test's literal-phrase assertion (`/different functionality, same name/`) requires the exact ordering "different functionality, same name". Without this fix, the D-01 CHANGELOG assertion in Task 2's test would fail.
- **Fix:** Edited the consolidation-bullet in `### BREAKING CHANGES` to use the canonical phrase order: "— different functionality, same name."
- **Files modified:** `CHANGELOG.md` (1 line within the same Task 1 commit; the edit landed before commit).
- **Commit:** Folded into `ecc524c4` (Task 1 single commit).

### Auth Gates

None — no auth required for any of the three completed tasks.

## Deferred Issues

### Task 4 verification not run from worktree

The four test invocations (`npm test`, `TEST_CONCURRENCY=8 npm test`, `bazel test //integration/... --test_tag_filters=phase-1-cull`, `bazel test //integration:gsd-lifecycle`) and the `gsd-slim-phase-1-cull` annotated tag application are all deferred to the orchestrator's post-merge flow. Reasons:

- The git tag CANNOT be applied from a worktree branch (per the explicit `<git_tag_warning>` in the executor prompt). Tags live on the main branch's history; applying them from a worktree branch points the tag at a transient commit that disappears on merge.
- The full `bazel test //integration:gsd-lifecycle` run uses the real Claude API and is long-running (multi-minute); it is appropriate for the orchestrator to run after merge, in the main repo's working directory, before applying the tag.
- The orchestrator is the agent with authority to merge the worktree, run the four test invocations on the merged tree, and apply the exit-gate tag.

This is the documented checkpoint flow per `01-09-PLAN.md` Task 4 (`type="checkpoint:human-verify"`, `gate="blocking"`) and the orchestrator's `<git_tag_warning>`.

### Pre-existing test-suite failures from earlier Phase 1 plans

Plan `01-08-SUMMARY.md` documents two categories of pre-existing test failures that are likely to surface during Task 4 verification step 1 (`npm test`):

1. **~12 RED subtests** in `tests/code-review.test.cjs`, `tests/secure-phase.test.cjs`, `tests/plan-review-convergence.test.cjs` (Plan 07 SUMMARY's deferred-issues — RED subtests target OLD workflow content that Plan 07 changed).
2. **~50 subtests across ~15 files** that hardcode references to deleted agents/commands (Plan 08 SUMMARY's deferred-issues — paired-test concerns the WARNING-fix #7 enumeration regex didn't catch).

Plan 09 does NOT fix these (out of scope per the SCOPE BOUNDARY rule — they were not introduced by Plan 09 changes). The Task 4 checkpoint protocol covers the disposition: if `npm test` is RED at the checkpoint, the orchestrator routes to a follow-up plan rather than applying the exit-gate tag.

The Task 4 verification protocol explicitly says: "If ANY of the four test runs fails: Do NOT apply the tag. Diagnose the failure. File a follow-up plan ... Re-run all four test invocations. Apply the tag only after all four are GREEN."

## Self-Check

| Claim                                                                          | Status   |
| ------------------------------------------------------------------------------ | -------- |
| `get-shit-done/workflows/help.md` modified (migration table appended)          | PASSED   |
| `CHANGELOG.md` modified ([Unreleased] block populated)                         | PASSED   |
| `tests/migration-table-present.test.cjs` exists and is GREEN (80/80)           | PASSED   |
| `integration/BUILD.bazel` has `phase-1-cull` tag                               | PASSED   |
| `integration/BUILD.bazel` still has `lifecycle` tag                            | PASSED   |
| Bazel is installed (bazel 7.6.1)                                               | PASSED   |
| `bazel query 'attr(tags, "phase-1-cull", //integration/...)'` returns target   | PASSED   |
| D-01 OLD /gsd-review row matches anchored regex                                | PASSED   |
| D-01 disambiguation phrase in CHANGELOG (1 occurrence)                         | PASSED   |
| D-01 disambiguation phrase in workflow help (1 occurrence)                     | PASSED   |
| commit `ecc524c4` (Task 1) exists                                              | FOUND    |
| commit `e567ed9b` (Task 2) exists                                              | FOUND    |
| commit `805952b2` (Task 3) exists                                              | FOUND    |
| Task 4 (checkpoint:human-verify) returned to orchestrator                      | PENDING  |
| `gsd-slim-phase-1-cull` git tag applied                                        | DEFERRED (orchestrator post-merge) |

## Self-Check: PASSED (Tasks 1-3); Task 4 returned as checkpoint per plan
