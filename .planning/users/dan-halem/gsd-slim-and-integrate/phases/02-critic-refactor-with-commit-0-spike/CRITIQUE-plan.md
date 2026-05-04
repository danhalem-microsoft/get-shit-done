---
critique_type: plan
phase: "02-critic-refactor-with-commit-0-spike"
plan: "02-01 through 02-08"
reviewed_at: "2026-05-04"
status: fail
critics: [plan-critic]

severity_counts:
  critical: 5
  high: 5
  medium: 5
  low: 2
  info: 2
  total: 19
---

## Executive Summary

5 critical findings. The most consequential are: **Plan 02-06 depends_on omits Plan 04/05** creating a race condition on `<plan_specific_checklist>` XML tag names; **CHANGELOG bullet 4 references nonexistent `--inject-fault` flag** that Plan 07 explicitly locked OUT (duplicate of scope-C-002); and **wave-numbering inconsistencies** between PLAN frontmatter and VALIDATION.md.

## Critical Findings

### [CRITICAL] plan-C-001 — Wave numbering inconsistent between PLAN frontmatter and VALIDATION.md

**Files:** All 8 PLAN.md frontmatter `wave:` fields; `02-VALIDATION.md` Wave structure

PLAN frontmatter uses waves 0/1/2/2/3/3/4/5 (after revision-2 cascade). VALIDATION.md still references "5 waves (Wave 0 + Waves 1–4)" — the cascade fix wasn't propagated. An executor querying plans by wave to identify parallelizable work will be misled.

**Fix:** Update VALIDATION.md's wave taxonomy to match the 6-wave cascade (0 + 1–5).

### [CRITICAL] plan-C-002 — Plan 02-03 objective text says "Plans 03/04/05 are wave 2" but actual cascade has Plan 05 in wave 3

**Files:** `02-03-PLAN.md` objective paragraph

Plan 03's objective claims "Wave 2 = Plans 03, 04, 05" but Plan 05's frontmatter is wave 3 (depends on Plan 04 which is wave 2). Documentation contradicts encoded depends_on graph.

**Fix:** Correct objective: "Wave 2 = Plans 03 and 04 (parallel, both depend on Plans 01–02 only). Wave 3 = Plan 05 (depends on Plan 04)."

### [CRITICAL] plan-C-003 — Plan 02-06 `depends_on` omits Plan 04 (pilot trim); race condition on `<plan_specific_checklist>` XML tag

**Files:** `02-06-PLAN.md:6` (`depends_on: [1, 2, 3]`)

Plan 06 authors `workflows/critique.md` with hardcoded `<plan_specific_checklist>` XML tag references that come from the post-trim shape. Plan 04 (pilot trim of `gsd-critic-strategy.md`) and Plan 05 (bulk trim) establish the `<{lens}_specific_checklist>` naming convention. If Plan 06 runs in parallel with Plan 04 (currently both wave 3 after cascade), the workflow body could be authored against unfinalized tag names.

Plan 06's depends_on includes Plan 03 but not Plan 04. Plan 04 validates the addendum shape; Plan 06's workflow body bakes in assumptions about post-trim critic shapes.

**Fix:** Add `5` to Plan 06's `depends_on`: `[1, 2, 3, 5]`. This makes Plan 06 wave 4 (cascade follows: Plan 07 → wave 5, Plan 08 → wave 6).

### [CRITICAL] plan-C-004 — Spike test cross-directory Bazel `entry_point` is fragile

**Files:** `02-01-PLAN.md:370-385` (Task 3)

`tests/critic-spike-passes.test.cjs` placed in `tests/` but registered in `integration/BUILD.bazel` with `entry_point = "../tests/critic-spike-passes.test.cjs"`. Cross-package `..` references are fragile in `rules_js`; `entry_point` is expected to be a label or path relative to the package directory. Without `exports_files(["critic-spike-passes.test.cjs"])` in `tests/BUILD.bazel` and a label reference like `//tests:critic-spike-passes.test.cjs`, this may fail at `bazel build` time or create a duplicate target with conflicting tag sets.

The plan's mitigation ("if a collision arises, EXCLUDE from `tests/BUILD.bazel` list comprehension") is conditional rather than implemented proactively.

**Fix:** Either (a) move file to `integration/critic-spike-passes.test.cjs` (it's a live test, belongs there); or (b) keep in `tests/` and add `exports_files(["critic-spike-passes.test.cjs"])` to `tests/BUILD.bazel`, reference from integration as `//tests:critic-spike-passes.test.cjs`.

### [CRITICAL] plan-C-005 — CHANGELOG bullet 4 references nonexistent `--inject-fault` flag

**Files:** `02-08-PLAN.md:126`

Plan 07 locked CRIT-09 to bad-subagent-name with NO production-code changes. CHANGELOG template still references "debug-only `--inject-fault <lens>` flag." If committed verbatim, creates permanent false documentation. (DUPLICATE of scope-C-002.)

**Fix:** Rewrite CHANGELOG bullet to describe the bad-subagent-name approach accurately.

## High Findings

### [HIGH] plan-H-001 — `critique-workflow-structure.test.cjs` regex too lazy

**Files:** `02-06-PLAN.md:481-487`

Regex `(Task\(\s*subagent_type[\s\S]*?){6}` is lazy and matches across arbitrary distances including across multiple paragraphs — "contiguous block" assertion is weaker than it looks. Static test can pass even if Task calls are split across multiple process steps.

**Fix:** Add negative lookahead for split-message markers (`\bWait\b`, `\bStep \d+\b`, `\bAfter .* returns\b`) between Task calls.

### [HIGH] plan-H-002 — `tests/agent-parity-helper-shape.test.cjs` referenced but no plan creates it

**Files:** `02-03-PLAN.md:241, 252`

Plan 03 Task 1 verify/acceptance_criteria call `node --test tests/agent-parity-helper-shape.test.cjs`. No plan creates this file. If it doesn't exist on disk at execute-time, every acceptance check fails with "file not found."

**Fix:** Add to Plan 03 read_first: verify file exists; if not, document missing test in SUMMARY.md or add a minimal create step.

### [HIGH] plan-H-003 — `lineCount` helper differs between Plan 01 and RESEARCH §Code-Example-2

**Files:** `02-01-PLAN.md:148-153`; `02-RESEARCH.md:521`

RESEARCH version: `fs.readFileSync(file, 'utf8').split('\n').length` (counts newlines like `wc -l`). Plan version subtracts trailing newline. For a 250-line file ending with `\n`: RESEARCH returns 251, Plan returns 250. Subtle discrepancy that may cause false pass/fail depending on file structure.

**Fix:** Add code comment explaining the chosen normalization. Standardize on `wc -l`-equivalent (the simpler RESEARCH version).

### [HIGH] plan-H-004 — `FIXTURE_PHASE = '1'` contaminates Phase 1 working directory

**Files:** `02-07-PLAN.md:192, 263`

Walltime and fault-injection tests run `/gsd-review --critique 1`. Critics write CRITIQUE-{lens}.md into Phase 1's actual `.planning/` directory. Subsequent test runs (or the parity test) will read these stale CRITIQUE files. Cross-test contamination + non-portable across workspaces (`gsd-tools.cjs find-phase 1` resolves to user-specific path).

**Fix:** Replace `FIXTURE_PHASE = '1'` with a test-managed fixture directory at `integration/test-fixtures/fixture-phase-2-critic/`. Run critic batch against fixture-specific dir; clean up CRITIQUE-*.md in `afterEach`/try-finally.

### [HIGH] plan-H-005 — Parity test fixture IDs hardcoded as guesses (DUPLICATE of scope-M-001)

**Files:** `02-07-PLAN.md:439-445, 471-473`

`FIXTURES` object uses illustrative IDs (`'plan-with-known-issues'`, etc.) explicitly noted as needing verification. Module-level `loadFixture` calls throw at import time if IDs are wrong, crashing the entire test module rather than producing a clean per-test failure.

**Fix:** Move `loadFixture` calls inside test bodies for lazy initialization. Add to `read_first`: list `integration/test-fixtures/baselines/critic-*/` and verify actual IDs.

## Medium Findings

### [MEDIUM] plan-M-001 — Plan 02-02 git-status revert check has loophole

**Files:** `02-02-PLAN.md:354-368`

`git diff --quiet` compares working tree to index. Doesn't catch staged-but-uncommitted changes.

**Fix:** Add `git diff HEAD agents/gsd-critic-plan.md | wc -c` returns 0.

### [MEDIUM] plan-M-002 — `bin/lib/critic-aggregate.cjs` accepts `useJson` parameter but never uses it

**Files:** `02-06-PLAN.md:178, 224`

Handler signature accepts `useJson` but body uses `raw` instead. `--json` flag mapping unclear — passing `--json` may produce text output if `raw` is bound to a different arg.

**Fix:** Either use `useJson` in `output()` call, or remove `useJson` and bind `--json` to `raw` consistently.

### [MEDIUM] plan-M-003 — XCUT-03 ledger entry count not enforced per-invocation

**Files:** `02-08-PLAN.md:13`

`requirements: [XCUT-03]` checks `≥4 entries`. XCUT-03 mandates "one entry per live test invocation"; with parity N=5 × 6 critics + 3 other tests, expected count is 33+. Current check passes if a parity sub-run skipped `recordWalltime`.

**Fix:** Compute expected count: 1 (spike) + 1 (walltime) + 1 (fault-injection) + 30 (parity) = 33. Assert `≥33`.

### [MEDIUM] plan-M-004 — install-shared-dir test multi-path fallback (DUPLICATE of scope-M-003)

### [MEDIUM] plan-M-005 — Plans 05 and 06 git-commit race in same wave

**Files:** Both wave 3 after cascade

Plans 05 and 06 disjoint `files_modified` but both will git commit. Whichever commits second needs rebase. Process guidance, not architectural — but should be noted.

**Fix:** Note in Plan 05/06 SUMMARIES: "commit sequentially even if executable in parallel."

## Low / Info Findings

### [LOW] plan-L-001 — `walltime-ledger-shape` vs `walltime-ledger-schema` filename inconsistency between VALIDATION.md and Plan 07

### [LOW] plan-L-002 — Plan 02-05 Task 2b uses unexpanded `$lens` shell-variable in acceptance criteria

### [INFO] plan-I-001 — CHANGELOG references unverified version "v1.36.x"

### [INFO] plan-I-002 — Inverse spike test (delete base, assert canary absent) explicitly deferred

## Verdict: CONDITIONAL ACCEPT

**Top 3 must-address:**

1. **plan-C-003** — Add Plan 05 to Plan 06's `depends_on`; cascade Plan 06 to wave 4.
2. **plan-C-005 / scope-C-002** — Correct CHANGELOG bullet 4.
3. **plan-H-004** — Replace `FIXTURE_PHASE = '1'` with managed fixture directory.
