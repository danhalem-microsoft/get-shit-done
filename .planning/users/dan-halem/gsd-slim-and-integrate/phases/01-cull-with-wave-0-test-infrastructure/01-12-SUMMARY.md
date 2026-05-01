---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 12
subsystem: parity-infra
tags: [gap-closure, blocker-fix, parity, telemetry, bazel]
gap_closure: true
gaps_closed: [CR-04, CR-05, BLOCKER-1]
gaps_deferred: [WR-05, WR-06]
requirements_addressed: [TEST-02, XCUT-03]
dependency_graph:
  requires:
    - "Plan 01-09 (parity infrastructure shipped; helpers exist and are wired)"
  provides:
    - "Parity infrastructure correctness: COMPARE-mode median pick now uses sorted-by-duration_ms semantics (CR-04)"
    - "Walltime ledger correctness: cost_usd validated at the helper boundary (CR-05)"
    - "Bazel discovery for tests/walltime-recorder.test.cjs and tests/agent-parity-helper-shape.test.cjs (BLOCKER 1)"
  affects:
    - "Phase 2 (critic-findings) compare-mode delta computation"
    - "Phase 3 (plan-structural) compare-mode delta computation"
    - "Phase 6 (schema-conformance + walltime trend regression) — both consumers"
tech-stack:
  added:
    - "Test-only LEDGER override pattern (_setLedgerForTest) for ledger-isolated unit tests"
  patterns:
    - "Median-by-key helper extraction (pickMedianByDuration) with copy-then-sort to avoid source-array mutation"
    - "Static call-site contract guard (test reads source via fs.readFileSync and asserts cost_usd: result.cost shape)"
    - "Bazel js_test list-comprehension targets (mirrors integration/BUILD.bazel pattern)"
key-files:
  created:
    - "tests/walltime-recorder.test.cjs (5 unit tests; CR-05 guards)"
    - "tests/BUILD.bazel (js_test targets for walltime-recorder + agent-parity-helper-shape)"
  modified:
    - "integration/helpers/agent-parity.cjs (pickMedianByDuration helper + COMPARE-mode rewire + export)"
    - "integration/helpers/walltime-recorder.cjs (cost_usd validation + _setLedgerForTest + remove ?? 0 fallback)"
    - "tests/agent-parity-helper-shape.test.cjs (3 new CR-04 guard tests appended)"
    - "integration/helpers/BUILD.bazel (visibility widened to //tests:__pkg__)"
decisions:
  - "Created tests/BUILD.bazel from scratch with targets for BOTH walltime-recorder.test.cjs AND agent-parity-helper-shape.test.cjs because the file did not exist (per plan directive when reference target is absent). Pattern mirrors integration/BUILD.bazel's fast-integration list-comprehension."
  - "Widened //integration/helpers:test_helpers visibility to include //tests:__pkg__ rather than duplicating helper sources or creating a parallel library. One-line scoped change required for the test target to compile."
  - "Used Option A (LEDGER override + restore) rather than Option B (env var) for ledger isolation in unit tests, per plan recommendation."
metrics:
  duration: "~4 minutes (234s)"
  tasks_completed: 2
  tests_added: 8
  commits: 2
  completed: 2026-05-01
---

# Phase 1 Plan 12: Close CR-04 + CR-05 + BLOCKER 1 Summary

Sorted-median run pick (CR-04) and cost_usd validation (CR-05) corrected at the parity-infra layer; new unit tests guard both fixes; new tests/BUILD.bazel registers both unit tests with Bazel before Phase 2/3/6 consumers come online.

## Tasks Completed

| Task | Name                                                                          | Commit     | Tests                       |
| ---- | ----------------------------------------------------------------------------- | ---------- | --------------------------- |
| 1    | Fix agent-parity median pick + add unit test (CR-04) with RED evidence        | `6f804537` | 11 pass / 0 fail (was 8/8)  |
| 2    | Validate cost_usd in walltime-recorder + add unit test + register Bazel       | `b4de6995` | 5 pass / 0 fail (new file)  |

## CR-04 Closure: pickMedianByDuration

`integration/helpers/agent-parity.cjs` previously had:

```js
current: successful[Math.floor(successful.length / 2)],  // median run by index after sort
```

The comment claimed "median by index after sort" but `successful[]` is never sorted — it's the array of successful runs in completion order. Phase 2/3/6 compare-mode reads `result.current` for delta computation against locked-title baselines; using a quasi-random run silently approves regressions.

Fix:

1. Extracted `pickMedianByDuration(successful)` as a top-level function that sorts a COPY of `successful` by `duration_ms` (using `(a.duration_ms ?? 0) - (b.duration_ms ?? 0)` so failed-run entries don't produce NaN ordering), then picks `sortedByDuration[Math.floor(N/2)]`.
2. Replaced the inline pick with `current: pickMedianByDuration(successful)` in the COMPARE-mode return.
3. Exported `pickMedianByDuration` for unit testing.
4. Added 3 new tests in `tests/agent-parity-helper-shape.test.cjs` (existing 8 preserved):
   - 5-run odd-N: `[100, 50, 300, 150, 200]` (completion order) → expects duration 150 (run-4).
   - 4-run even-N: `[10, 30, 20, 40]` → expects duration 30 (id 'b').
   - empty/null/undefined → returns `undefined`.

## CR-04 RED Evidence

Before extracting `pickMedianByDuration`, the unsorted inline pick returns duration **300** (completion-order index 2 of `[100, 50, 300, 150, 200]`) instead of **150** (the actual median when sorted by duration_ms ascending: `[50, 100, 150, 200, 300]`). After the fix, the helper returns 150.

Captured RED test output (`/tmp/cr-04-red-evidence.txt`):

```
RED EVIDENCE — buggy unsorted pick: {"id":"r3","duration_ms":300}
EXPECTED — sorted-median pick: {"id":"r4","duration_ms":150}
```

This is RED-then-GREEN proof: pre-fix the helper would have returned the run at completion-order index 2 (duration 300); post-fix it returns the duration-sorted median run (duration 150).

## CR-05 Closure: cost_usd Validation

`integration/helpers/walltime-recorder.cjs` previously validated `test`, `walltime_ms`, `phase` but NOT `cost_usd`. The error message claimed `cost_usd` was required, but the silent `?? 0` fallback on the write line meant callers passing `{ cost: x }` (the field shape `claude-runner.cjs` exposes) silently wrote `cost_usd: 0`. Phase 6's trend regression test would have seen uniformly zero costs and missed API spend regressions.

Fix:

1. Tightened validation guard: `typeof entry.cost_usd !== 'number'` now throws with a clear error message naming `cost_usd` and explaining the CR-05 bug shape ("Pass cost_usd (not cost)").
2. Removed the `?? 0` fallback on the write line — `cost_usd: entry.cost_usd` is unambiguous because validation guarantees it's a number.
3. Added `_setLedgerForTest(p)` test-only helper that swaps the closed-over `LEDGER` variable and returns a restore function. Leading underscore signals test-only API.
4. Confirmed the existing call site in `integration/helpers/agent-parity.cjs` at line 109 (`cost_usd: result.cost ?? 0`) is correct and required no edit (verified by grep).
5. Added 5 new unit tests in `tests/walltime-recorder.test.cjs`:
   - missing `cost_usd` → throws with `/cost_usd/` message
   - wrong field name `{ cost: 0.5 }` → throws (the exact CR-05 bug shape)
   - non-number `cost_usd: '0.5'` → throws
   - valid input → returns record with `cost_usd: 0.5` AND temp ledger jsonl line confirms the write
   - static call-site contract: agent-parity.cjs source still contains `cost_usd: result.cost`

The real ledger `integration/test-fixtures/walltime-ledger.jsonl` is bit-identical before and after running the test (verified — `git status` shows no diff).

## BLOCKER 1 Closure: Bazel Target Registered

`tests/BUILD.bazel` did not exist before this plan. Per the plan's unconditional rule ("after this task ships, `grep -c "walltime-recorder.test.cjs" tests/BUILD.bazel` MUST return >= 1"), the executor created `tests/BUILD.bazel` from scratch with targets for BOTH new test (walltime-recorder) AND its sibling (agent-parity-helper-shape) so neither test relies on Node's `--test` discovery alone.

Pattern decision: mirrored the dominant `js_test` list-comprehension pattern used in `integration/BUILD.bazel` (the "fast integration tests" block at lines 4-17). Rationale: that file already loads `aspect_rules_js`'s `js_test`, uses the same module dependency `//integration/helpers:test_helpers`, and the project's `MODULE.bazel` declares `aspect_rules_js` and `rules_nodejs` as deps.

Diff hunk for `tests/BUILD.bazel` (newly created):

```bazel
load("@aspect_rules_js//js:defs.bzl", "js_test")

# Static unit tests over integration/helpers/. No live API, no shared state
# mutation — each test uses local-scope vars and (where applicable) a temp
# ledger path. Pattern mirrors integration/BUILD.bazel's "fast integration
# tests" block.
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = [
        "//integration/helpers:test_helpers",
    ],
    size = "small",
    tags = ["unit", "local", "phase-1-cull"],
    timeout = "short",
) for test_file in [
    "agent-parity-helper-shape.test.cjs",
    "walltime-recorder.test.cjs",
]]
```

Companion change: `integration/helpers/BUILD.bazel` widened the `test_helpers` library visibility from `["//integration:__subpackages__"]` to `["//integration:__subpackages__", "//tests:__pkg__"]` so the new `js_test` targets in `//tests` can `data`-depend on the helper sources. The original visibility entry is preserved — this is an additive widening, not a swap.

## Pre-fix and Post-fix Test Counts

| File                                            | Before plan | After plan | Delta |
| ----------------------------------------------- | ----------- | ---------- | ----- |
| `tests/agent-parity-helper-shape.test.cjs`      | 8 pass      | 11 pass    | +3    |
| `tests/walltime-recorder.test.cjs`              | did not exist | 5 pass   | +5    |

All 16 tests across both files pass with `# fail 0`.

## Out-of-Scope (Explicitly Deferred)

Per gap_closure rule ("BLOCKERs only, not WARNINGs"), the following WARNINGs from `01-REVIEW.md` are explicitly NOT addressed in this plan:

- **WR-05** (`integration/helpers/agent-parity.cjs:170` — was line 155 pre-fix): `walltimes.sort((a,b)=>a-b)` performs an in-place mutation on the local `walltimes` array. Since `walltimes` is local and not reused after this expression, the mutation is harmless. The pattern is brittle (a future change adding another consumer would see sorted data unexpectedly) but does not currently cause incorrect output. Verified by `git diff` that this line is unchanged from the pre-fix version.
- **WR-06** (`integration/helpers/agent-parity.cjs:101-110`): the insufficient-runs failure branch hardcodes `walltime_ms: { p50: 0, p95: 0 }` even when some successful runs have valid durations, discarding real data from Phase 6 trend analysis. Out of scope this plan.

Both WARNINGs are tracked for a follow-on plan if they become BLOCKERs in later phase reviews.

## Self-Check

**Files claimed to exist (verified):**

- `integration/helpers/agent-parity.cjs` — FOUND (modified, has `pickMedianByDuration`, `current: pickMedianByDuration(successful)`, export entry)
- `integration/helpers/walltime-recorder.cjs` — FOUND (modified, has `typeof entry.cost_usd !== 'number'`, `_setLedgerForTest`, no `?? 0` fallback)
- `tests/agent-parity-helper-shape.test.cjs` — FOUND (modified, 11 tests pass)
- `tests/walltime-recorder.test.cjs` — FOUND (created, 5 tests pass)
- `tests/BUILD.bazel` — FOUND (created, contains both `walltime-recorder.test.cjs` and `agent-parity-helper-shape.test.cjs`)
- `integration/helpers/BUILD.bazel` — FOUND (modified, visibility widened)
- `/tmp/cr-04-red-evidence.txt` — FOUND (non-empty; contains both `300` and `150`)

**Commits claimed (verified):**

- `6f804537` — Task 1 (CR-04 fix)
- `b4de6995` — Task 2 (CR-05 + BLOCKER 1 fix)

## Self-Check: PASSED
