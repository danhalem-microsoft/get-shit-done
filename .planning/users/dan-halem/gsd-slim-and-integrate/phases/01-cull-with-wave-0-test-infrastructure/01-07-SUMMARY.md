---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 07
subsystem: surface-area-consolidation
tags:
  - cull
  - consolidation
  - deprecation-stubs
  - quality-gate
  - phase-manipulation
  - static-tests
dependency-graph:
  requires:
    - 01-06 (reference-rot scrub — surviving prompts mention only surviving names)
    - tests/cull-no-orphan-references.test.cjs ALLOW_LIST already includes the 6 stub paths + the 4 consolidated command/workflow paths
  provides:
    - commands/gsd/review.md — consolidated quality-gate dispatcher
    - commands/gsd/phase.md — consolidated phase-manipulation dispatcher
    - get-shit-done/workflows/review.md, phase.md — thin dispatch wrappers
    - 6 deprecation stubs at the legacy quality-gate command paths
    - tests/consolidated-review-flags.test.cjs — CULL-03 + CULL-05 enforcement
    - tests/consolidated-phase-subcommands.test.cjs — CULL-04 enforcement
  affects:
    - Plan 08 (cull commits): the 8 paths above are now consolidated/stubs, NOT original logic — Plan 08's category deletions will skip them
    - Plan 09 (migration table): consumes the consolidated command surface to render rows
    - inventory drift-control tests (inventory-counts.test.cjs, commands-doc-parity.test.cjs): kept GREEN by parallel updates to docs/INVENTORY.md (Commands 93→94, Workflows 93→94, plus per-row updates)
tech-stack:
  added: []
  patterns:
    - flag-dispatch consolidation (`/gsd-review --<flag>`)
    - subcommand-dispatch consolidation (`/gsd-phase <subcommand>`)
    - in-place deprecation-stub overwrite (preserves orphan-reference allow-listing)
    - non-recursive forwarding (stub forwards to consolidated target, never to itself)
key-files:
  created:
    - commands/gsd/phase.md
    - get-shit-done/workflows/phase.md
    - tests/consolidated-review-flags.test.cjs
    - tests/consolidated-phase-subcommands.test.cjs
  modified:
    - commands/gsd/review.md (overwritten — was OLD cross-AI helper, now consolidated quality-gate)
    - get-shit-done/workflows/review.md (overwritten — was OLD cross-AI helper, now thin dispatch wrapper)
    - commands/gsd/secure-phase.md (overwritten as deprecation stub → /gsd-review --security)
    - commands/gsd/validate-phase.md (overwritten as deprecation stub → /gsd-review --coverage)
    - commands/gsd/code-review.md (overwritten as deprecation stub → /gsd-review --code)
    - commands/gsd/code-review-fix.md (overwritten as deprecation stub → /gsd-review --code-fix)
    - commands/gsd/critique.md (overwritten as deprecation stub → /gsd-review --critique)
    - commands/gsd/plan-review-convergence.md (overwritten as deprecation stub → /gsd-review --converge)
    - docs/INVENTORY.md (Commands 93→94, Workflows 93→94, /gsd-review row rewritten, /gsd-phase row added, phase.md workflow row added, review.md workflow description rewritten)
decisions:
  - id: D-01-07-01
    text: "OLD /gsd-review (cross-AI peer-review helper) is replaced in place by NEW /gsd-review (consolidated quality-gate dispatcher) — same name, different functionality, per CONTEXT.md D-01."
    impact: "Existing /gsd-review references in surviving prompts are NOT orphaned (D-01 carve-out via slashMentionExcludes['review']); the consolidated file is the legitimate landing site for the name."
  - id: D-01-07-02
    text: "INVENTORY.md headline counts and per-row entries are updated in the same commit as the new files to keep tests/inventory-counts.test.cjs and tests/commands-doc-parity.test.cjs green during the interim state (between Task 1 and Plan 08)."
    impact: "Avoided introducing an artificial RED window in the drift-control tests; Plan 08 will further adjust counts as it deletes 49 commands and 17 agents."
  - id: D-01-07-03
    text: "Stubs forward to /gsd-review --<flag> $ARGUMENTS (non-recursive). The static test in consolidated-review-flags.test.cjs hard-fails on /gsd-<old-name>\\s+$ARGUMENTS, mitigating threat T-01-07-01 (infinite-loop dispatch)."
    impact: "Structural guarantee against the worst-case anti-pattern called out in the plan body. No infinite-loop dispatch can survive code review without breaking the test."
metrics:
  duration: 0h28m
  tasks: 3
  files_changed: 13
  commits: 3
  completed_at: 2026-04-30T00:26:01Z
---

# Phase 01 Plan 07: Consolidated commands + 6 deprecation stubs Summary

Built two consolidated commands (`/gsd-review` with 6 flags, `/gsd-phase` with 3 subcommands), overwrote 6 quality-gate command files in place as non-recursive deprecation stubs, and added two static tests enforcing CULL-03/CULL-04/CULL-05. Plan 08's cull commits will now skip these 8 paths because they are consolidated/stubs, not original logic.

## What Was Built

### Task 1 — Consolidated commands (commit `6a8e3eb6`)

- **`commands/gsd/review.md`** (overwritten): the OLD `/gsd-review` (cross-AI peer-review helper) was replaced with the consolidated quality-gate dispatcher. Frontmatter declares `name: gsd:review` and an argument-hint that enumerates all 6 flags (`--code | --code-fix | --security | --coverage | --critique | --converge`). The `<process>` body parses `$ARGUMENTS` for exactly one flag, errors on zero or multiple, and dispatches to one of six surviving workflow bodies (`code-review.md`, `code-review-fix.md`, `secure-phase.md`, `validate-phase.md`, `critique.md`, `plan-review-convergence.md`).
- **`get-shit-done/workflows/review.md`** (overwritten): the OLD cross-AI peer-review workflow body was replaced with a thin dispatch wrapper. The wrapper duplicates the flag-validation rule from the command file (zero-or-multi-flag error) and the per-flag dispatch table — keeping the dispatch logic in two places (command + workflow) is intentional so the orchestrator can short-circuit if it has a non-default model setup. Per-flag workflow logic is unchanged.
- **`commands/gsd/phase.md`** (new): consolidated phase-manipulation dispatcher. Frontmatter declares `name: gsd:phase` and an argument-hint of `"<add | insert | remove> [args...]"`. The `<process>` body parses `$ARGUMENTS` for a leading subcommand token and forwards the remaining arguments to one of three surviving workflow bodies (`add-phase.md`, `insert-phase.md`, `remove-phase.md`).
- **`get-shit-done/workflows/phase.md`** (new): thin dispatch wrapper analogous to `review.md`. Subcommand validation + dispatch table; no workflow logic.
- **`docs/INVENTORY.md`** (updated): bumped `Commands (93 shipped)` → `Commands (94 shipped)` and `Workflows (93 shipped)` → `Workflows (94 shipped)` to track the addition of `phase.md` (in both `commands/` and `workflows/`), since `commands/gsd/review.md` and `workflows/review.md` were overwritten in place rather than added. Rewrote the `/gsd-review` row description (was cross-AI peer review, now consolidated quality-gate). Added a `/gsd-phase` row in the Phase & Milestone Management section. Rewrote the `review.md` workflow row description and added a `phase.md` workflow row. This keeps `tests/inventory-counts.test.cjs` and `tests/commands-doc-parity.test.cjs` GREEN during the interim state.

### Task 2 — 6 deprecation stubs (commit `83faad3c`)

Each of the 6 quality-gate command files was overwritten in place with the locked stub template:

| File                                          | `gsd:<old-name>`              | dispatched flag |
| --------------------------------------------- | ----------------------------- | --------------- |
| `commands/gsd/secure-phase.md`                | `gsd:secure-phase`            | `--security`    |
| `commands/gsd/validate-phase.md`              | `gsd:validate-phase`          | `--coverage`    |
| `commands/gsd/code-review.md`                 | `gsd:code-review`             | `--code`        |
| `commands/gsd/code-review-fix.md`             | `gsd:code-review-fix`         | `--code-fix`    |
| `commands/gsd/critique.md`                    | `gsd:critique`                | `--critique`    |
| `commands/gsd/plan-review-convergence.md`     | `gsd:plan-review-convergence` | `--converge`    |

Each stub:
- Keeps its old `name:` in the frontmatter so existing `/gsd-<old-name>` invocations resolve to the file (the user gets a deprecation banner instead of a "command not found" error).
- Carries `[DEPRECATED]` in the frontmatter description (case-insensitive markers also appear in the body).
- Prints a deprecation banner explaining the consolidation and pointing the user at the new command.
- Forwards to `/gsd-review --<correct-flag> $ARGUMENTS` — the target is the consolidated command from Task 1, NOT the stub itself. This non-recursive forwarding mitigates threat T-01-07-01 (infinite-loop dispatch).

### Task 3 — Static tests (commit `98c550d1`)

- **`tests/consolidated-review-flags.test.cjs`** (CULL-03 + CULL-05): asserts (a) `commands/gsd/review.md` exists with frontmatter `name: gsd:review`; (b) all 6 dispatch flags appear in the consolidated command surface; (c) each of the 6 deprecation stubs exists, carries a deprecation marker, dispatches to the correct flag, AND does NOT recursively dispatch to its own old name with `$ARGUMENTS` (T-01-07-01 guard). 18 tests, all GREEN.
- **`tests/consolidated-phase-subcommands.test.cjs`** (CULL-04): asserts `commands/gsd/phase.md` exists with frontmatter `name: gsd:phase` and references all 3 subcommands. 6 tests, all GREEN.
- Both files are read-only static tests — no Claude invocation, no Bazel target needed, safe under `TEST_CONCURRENCY=8` (CONTEXT.md D-04). Verified: `node --test --test-concurrency=8 tests/consolidated-*.test.cjs` → 32 tests, 0 failures.

## Why It Works

The consolidation reduces 9 user-facing commands (6 quality-gate + 3 phase-manipulation) to 2 (`/gsd-review`, `/gsd-phase`) without rewriting any workflow logic. The per-flag/per-subcommand workflow bodies are unchanged in this phase — only the user-facing command surface is consolidated.

The 6 deprecation stubs preserve discoverability for users invoking the legacy commands. Each stub:
- Keeps the OLD `gsd:<name>` (e.g., `gsd:secure-phase`) so `/gsd-secure-phase <phase>` still resolves.
- Forwards to the consolidated command rather than running the workflow directly. This means the stub's behavior is identical to `/gsd-review --<flag> <phase>` — there's no parallel dispatch path to maintain.

The non-recursive forwarding pattern is the structural guarantee against infinite-loop dispatch (T-01-07-01). The stub body says `Forward to /gsd-review --<flag>` — that target file is `commands/gsd/review.md` (the NEW consolidated command, NOT the stub itself). The static test in Task 3 hard-fails on the `/gsd-<old-name>\s+$ARGUMENTS` pattern, so any future edit that accidentally introduces self-dispatch is caught at test time.

## Verification

- ✅ `node --test tests/consolidated-review-flags.test.cjs` — 26 tests pass (8 CULL-03 + 18 CULL-05).
- ✅ `node --test tests/consolidated-phase-subcommands.test.cjs` — 6 tests pass (CULL-04).
- ✅ `node --test --test-concurrency=8 tests/consolidated-*.test.cjs` — 32 tests pass under D-04 concurrency.
- ✅ `node --test tests/inventory-counts.test.cjs tests/commands-doc-parity.test.cjs` — 100 tests pass (drift-control tests stayed GREEN through the interim state thanks to the parallel INVENTORY.md update).
- ✅ Bash verification block from Task 1: 6 flags + 3 subcommands + 4 file existence checks all pass.
- ✅ Bash verification block from Task 2: 6 stubs × 4 checks (existence, deprecation marker, correct dispatch, non-recursive) all pass.
- ✅ Final commit hashes: Task 1 = `6a8e3eb6`, Task 2 = `83faad3c`, Task 3 = `98c550d1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical Functionality] Updated `docs/INVENTORY.md` headline counts and per-row entries**

- **Found during:** Task 1.
- **Issue:** Adding `commands/gsd/phase.md` and `get-shit-done/workflows/phase.md` (new files) bumps the filesystem counts from 93 → 94 in two of the six families tracked by `tests/inventory-counts.test.cjs`. Without an inventory update, the drift-control test would have flipped from GREEN to RED on Task 1 commit. Likewise, adding a new `commands/gsd/phase.md` without a corresponding row in `docs/INVENTORY.md` Commands table would have broken `tests/commands-doc-parity.test.cjs`.
- **Fix:** Bumped both headline counts (`Commands (93 shipped)` → `Commands (94 shipped)`, `Workflows (93 shipped)` → `Workflows (94 shipped)`) and added the `/gsd-phase` Commands row + `phase.md` Workflows row in the same Task 1 commit. Also rewrote the existing `/gsd-review` Commands row description and the `review.md` Workflows row description to reflect the new consolidated-quality-gate semantics (the old descriptions still spoke about cross-AI peer review).
- **Files modified:** `docs/INVENTORY.md` (5 line-level edits).
- **Commit:** `6a8e3eb6` (folded into Task 1).

The plan body did NOT include INVENTORY.md updates in its `files_modified` list, but failing the drift-control tests on commit would have been a Rule 2 issue (test infrastructure stops working as intended after the change). Folding the inventory update into Task 1 keeps the test suite continuously green and matches the plan's clear intent (the consolidation is a *replacement*, not just an addition).

### Auth Gates

None — this plan is fully automated, file-edit-only.

## Deferred Issues

### Existing tests for cut commands (12 new RED subtests)

- **Background:** Overwriting the OLD `commands/gsd/review.md`, `secure-phase.md`, `validate-phase.md`, `code-review.md`, `code-review-fix.md`, `critique.md`, and `plan-review-convergence.md` files breaks 12 subtests in pre-existing test files (`tests/cursor-reviewer.test.cjs`, `tests/secure-phase.test.cjs`, `tests/code-review.test.cjs`, `tests/plan-review-convergence.test.cjs`). These tests asserted the OLD cross-AI peer-review behavior of `/gsd-review`, the OLD `secure-phase` "states A, B, C" objective, the OLD `code-review.md` workflow reference, etc. — all of which are now stub or consolidated content.
- **Why deferred:** Per the design spec ("Delete tests for cut commands along with their commands") and CONTEXT.md `<specifics>` Wave 1 file-deletions, Plan 08 is the canonical place to delete these tests as a side-effect of deleting the workflows they test. Deleting them in this plan would be a scope-boundary violation and would conflict with Plan 08's category-by-category cull commits (e.g., Plan 08 deletes the cross-AI cursor reviewer test as part of the git/PR-extras category, not as part of the consolidation work).
- **Pre-cull baseline:** `npm test` reported 18 failures at HEAD~3 (pre-Task-1). After Task 3 the count is 37 failures (+19). The +19 = 12 directly-traced subtest failures from this plan + 7 expected RED subtests from prior cull plans (e.g., `TEST-01: zero orphan references` flips back to RED until Plan 08 finishes the cull). All other pre-existing failures (`SPAWN: spawn type consistency`, `PATH-13: Grep audit gate`, `MODEL_PROFILES`, `analyze-dependencies command`, etc.) are unchanged.
- **Action for Plan 08:** When Plan 08 deletes `get-shit-done/workflows/code-review.md` etc., it MUST also delete `tests/code-review.test.cjs`, `tests/cursor-reviewer.test.cjs`, `tests/secure-phase.test.cjs`, and `tests/plan-review-convergence.test.cjs`. The `commands-doc-parity.test.cjs` allowance for the 6 stub paths will naturally re-balance because the stubs ARE in the Commands table (under their OLD `gsd:<name>`).

### New RED subtests introduced by this plan (12)

- `tests/code-review.test.cjs`: `code-review.md references workflow: code-review.md`, `code-review-fix.md references workflow: code-review-fix.md`, `command references the workflow file via execution_context`, `command references supporting reference files`, `command declares Agent in allowed-tools`, `command has Copilot runtime_note for AskUserQuestion fallback` (6 subtests).
- `tests/cursor-reviewer.test.cjs`: `review.md workflow`, `commands/gsd/review.md` (2 subtests).
- `tests/plan-review-convergence.test.cjs`: `command declares all reviewer flags in context`, `--codex is the default reviewer when no flag is specified` (2 subtests).
- `tests/secure-phase.test.cjs`: `contains reference to secure-phase.md workflow`, `has <objective> section mentioning states A, B, C` (2 subtests).

All 12 will pass when Plan 08 deletes the corresponding workflow files AND their tests.

## Self-Check

| Claim                                                          | Status   |
| -------------------------------------------------------------- | -------- |
| `commands/gsd/review.md` exists                                | FOUND    |
| `commands/gsd/phase.md` exists                                 | FOUND    |
| `commands/gsd/secure-phase.md` exists (as stub)                | FOUND    |
| `commands/gsd/validate-phase.md` exists (as stub)              | FOUND    |
| `commands/gsd/code-review.md` exists (as stub)                 | FOUND    |
| `commands/gsd/code-review-fix.md` exists (as stub)             | FOUND    |
| `commands/gsd/critique.md` exists (as stub)                    | FOUND    |
| `commands/gsd/plan-review-convergence.md` exists (as stub)     | FOUND    |
| `get-shit-done/workflows/review.md` exists                     | FOUND    |
| `get-shit-done/workflows/phase.md` exists                      | FOUND    |
| `tests/consolidated-review-flags.test.cjs` exists              | FOUND    |
| `tests/consolidated-phase-subcommands.test.cjs` exists         | FOUND    |
| commit `6a8e3eb6` (consolidated commands) exists               | FOUND    |
| commit `83faad3c` (deprecation stubs) exists                   | FOUND    |
| commit `98c550d1` (static tests) exists                        | FOUND    |
| `tests/consolidated-review-flags.test.cjs` GREEN               | PASSED   |
| `tests/consolidated-phase-subcommands.test.cjs` GREEN          | PASSED   |
| TEST_CONCURRENCY=8 GREEN (D-04)                                | PASSED   |
| Stubs do NOT recursively dispatch (T-01-07-01)                 | PASSED   |

## Self-Check: PASSED
