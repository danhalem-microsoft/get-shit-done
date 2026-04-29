---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 05
subsystem: testing
tags: [parity-testing, baseline-freshness, static-tests, _meta-shape, node-test]

# Dependency graph
requires:
  - phase: 01
    plan: 04
    provides: 22 baseline JSON files with locked _meta block (agent, fixture_id, captured_at, schema_kind, runs_recorded=1) plus _meta.json corpus manifest
provides:
  - tests/parity-baselines-shape.test.cjs (TEST-03 structural — every baseline has a complete _meta block; locked schema_kind set; result non-empty; fixture_id matches filename)
  - tests/parity-baselines-stale.test.cjs (TEST-05 freshness — baselines fresh within 90 days OR have a _meta.staleness_acknowledged set within the last 30 days)
  - Wave 0 completion: orphan test (01-01) + lifecycle decomposition (01-02) + parity helper/ledger (01-03) + baseline corpus (01-04) + freshness/shape guards (01-05) all delivered
affects: [02-critic-refactor, 03-planner-merge, 03-synthesizer-archival, 06-spine-trim]

# Tech tracking
tech-stack:
  added: []  # No new libraries — pure node:test + node:fs walk
  patterns:
    - "Filesystem-walk + per-file dynamic test generation (one test per baseline) — adapts as new baselines are added in future phases without test-code changes"
    - "_meta.captured_at as authoritative freshness source (NOT git mtime) — survives cherry-picks/rebases"
    - "Acknowledgment with grace period: stale baselines kept deliberately must be re-acknowledged every 30 days; eliminates 'set once and forget' anti-pattern"
    - "PHASE_1_CORPUS_FLOOR constant (=22) — floor never decreases; future phases may add baselines but corpus must never shrink"

key-files:
  created:
    - tests/parity-baselines-shape.test.cjs
    - tests/parity-baselines-stale.test.cjs
  modified: []

key-decisions:
  - "[Rule 1 - Bug fix in plan code] Plan's <action> code asserted `baselines.length >= 23` as the corpus floor, but Plan 04's _meta.json records agent_count=22 and fixture_count=22 (and `find` confirms 22 .json baselines on disk). Used >=22 to match the actual corpus. The plan author appears to have mis-typed 23 (off-by-one). With 23 the test would be RED on commit — violating the plan's own success criteria 'tests must be GREEN'."
  - "Pulled the floor into a named constant (PHASE_1_CORPUS_FLOOR = 22) used in both tests. This makes the link to _meta.json's documented corpus size explicit and gives a single point to update when a future phase grows the corpus."
  - "Both tests share an identical walkBaselines() generator (filename-prefix filter for .input.json + _meta.json + non-.json skip). Kept them as separate copies (not extracted to a helper module) per the plan's explicit `<action>` code shape — the duplication is ~10 LOC and avoids invoking the deferred 'parity helpers' refactor that's out of Wave 0 scope."

patterns-established:
  - "Two-clamp staleness pattern: time-since-capture clamp (90d) AND time-since-acknowledgment clamp (30d). Same idea applies to any future 'this might rot' guard — e.g., schema-conformance baselines, walltime ledger snapshots."
  - "Per-baseline test-name template (`<agent>/<file>: <assertion>`) makes node-test output greppable and CI-friendly — failed baselines are immediately identifiable in test reports."

requirements-completed: [TEST-03, TEST-05]

# Metrics
duration: ~10 minutes (mostly reading PLAN/RESEARCH/PATTERNS, sample baselines, and verifying the temporary-mutation smoke tests both fire)
completed: 2026-04-29
---

# Phase 01 Plan 05: Baseline Shape + Staleness Guards Summary

**Two static tests (TEST-03 + TEST-05) that walk integration/test-fixtures/baselines/ and assert each baseline has a complete _meta block AND is either ≤90 days old or carries an acknowledgment that's itself ≤30 days old — Wave 0 is now complete.**

## Performance

- **Duration:** ~10 minutes (1 minute wall-clock for the actual file writes + verifications; longer when including time spent reading the PLAN, RESEARCH, PATTERNS, and an existing static-test analog before writing the first line)
- **Started:** 2026-04-29T22:50Z (worktree base reset + context reads complete)
- **Completed:** 2026-04-29T22:52Z (both tests GREEN, both committed atomically)
- **Tasks:** 2 (both autonomous, no checkpoints)
- **Files modified:** 2 (both created — no existing files touched)

## Accomplishments

- **`tests/parity-baselines-shape.test.cjs`** (TEST-03 structural): walks all 22 baseline files; asserts each has `_meta.agent` matching the directory name, a non-empty `_meta.fixture_id` that equals the filename without `.json`, an ISO-parseable `_meta.captured_at`, a `_meta.schema_kind` ∈ {critic-findings, plan-structural, schema-conformance}, `_meta.runs_recorded === 1`, and a non-empty `result`. Generates 23 dynamic tests (1 floor + 22 per-baseline). All GREEN.
- **`tests/parity-baselines-stale.test.cjs`** (TEST-05 freshness): walks all 22 baselines; for each, computes `Date.now() - new Date(_meta.captured_at)`. ≤90 days → silently passes. >90 days → demands `_meta.staleness_acknowledged` (parseable date) within the last 30 days. Generates 23 dynamic tests (1 floor + 22 per-baseline). All GREEN today (Plan 04 baselines are 0 days old). Test verified RED via temporary-mutation smoke test (artificially aged a baseline to 100 days → got `100 days old (>90); add _meta.staleness_acknowledged: "<YYYY-MM-DD>" or refresh the baseline` exactly as specified in acceptance criteria).
- **Wave 0 complete:** Plans 01-01 (orphan test) + 01-02 (lifecycle decomposition) + 01-03 (parity helper + ledger) + 01-04 (22-baseline corpus) + 01-05 (shape + staleness guards) all delivered. Wave 1 (Plans 06-09) may now begin.

## Task Commits

Each task committed atomically (`--no-verify` per parallel-executor protocol):

1. **Task 1: shape test (TEST-03 structural)** — `55197471` (`test(01-05): add parity-baselines-shape test (TEST-03 structural)`)
2. **Task 2: staleness test (TEST-05)** — `38a34bfd` (`test(01-05): add parity-baselines-stale test (TEST-05 freshness guard)`)

## Files Created/Modified

### Created (Task 1, commit 55197471)
- `tests/parity-baselines-shape.test.cjs` — 79 lines. node:test + node:fs filesystem walk. Asserts every baseline has the locked _meta shape Plan 04 captured.

### Created (Task 2, commit 38a34bfd)
- `tests/parity-baselines-stale.test.cjs` — 82 lines. node:test + node:fs filesystem walk. Two-clamp staleness check (90-day capture clamp + 30-day acknowledgment clamp).

## Decisions Made

- **Floor constant = 22, not 23 (plan code typo).** See Deviations §1. Plan code in both `<action>` blocks said `baselines.length >= 23`. Plan 04's `_meta.json` records `agent_count: 22`, `fixture_count: 22`, and `find integration/test-fixtures/baselines -mindepth 2 -maxdepth 2 -name '*.json' ! -name '*.input.json'` returns 22. Setting the floor to 23 would make the test RED at commit time, contradicting the plan's success criteria (`tests must be GREEN`). Used 22 + named the constant PHASE_1_CORPUS_FLOOR so the next future-phase corpus growth (which IS authorized) is a one-token edit.
- **Did not extract the shared `walkBaselines()` helper.** The plan's `<action>` blocks for both tasks include the same generator inline, and Wave 0 explicitly excludes broader parity-helper refactors (per the wave structure). Two ~14-line copies is acceptable noise; deduping is a future-plan concern if and when a third consumer appears.
- **Filename-derived `fixture_id` invariant added (Task 1).** The plan asserts `_meta.fixture_id` is a non-empty string but doesn't explicitly assert it matches the filename. I added `assert.strictEqual(baseline._meta.fixture_id, path.basename(file, '.json'))` because Plan 04's `_capture.cjs` writes the file at `<agent>/<fixture_id>.json` — if those drift apart, the corpus is structurally broken. This is a Rule 2 "missing critical correctness assertion" auto-add.
- **`result` non-empty assertion added (Task 1).** Plan asserts `_meta` block validity but doesn't assert the actual `result` payload is non-empty. A baseline without a `result` is a useless baseline (Phase 2/3/6 parity tests have nothing to compare against). Added `assert.ok(baseline.result, ...)` — Rule 2 missing critical correctness check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `<action>` code asserted `baselines.length >= 23` but only 22 baselines exist (off-by-one in plan)**
- **Found during:** Task 1 (writing the shape test), pre-write filesystem check
- **Issue:** Both tasks' `<action>` blocks specify `assert.ok(baselines.length >= 23, ...)` as the corpus floor. The acceptance criteria for both tasks state the test must "exit 0 (GREEN)". Plan 04's `_meta.json` records `agent_count: 22` and `fixture_count: 22`. Filesystem confirms 22. Asserting >=23 makes the test RED on first run, contradicting the plan's own success criteria (the plan would block its own merge). The plan author appears to have made a typo — likely meant 22 (the documented Phase 1 corpus size).
- **Fix:** Used `PHASE_1_CORPUS_FLOOR = 22` (named constant for clarity + single-point-update). The constant is referenced in both test files and explicitly cites `_meta.json` as the source of truth. Future phases that grow the corpus update this single number; the >= operator means future growth never breaks the floor.
- **Files modified:** `tests/parity-baselines-shape.test.cjs`, `tests/parity-baselines-stale.test.cjs` (both initial authors — buggy floor never landed in any commit)
- **Verification:** Both tests run GREEN with floor=22 (verified via `node --test tests/parity-baselines-{shape,stale}.test.cjs`). With floor=23 (the plan's value), shape test would fail with `Expected ≥23 baseline files (Phase 1 corpus), found 22`.
- **Committed in:** 55197471 (shape) and 38a34bfd (staleness) — Task 1 and Task 2 commits respectively

**2. [Rule 2 - Missing critical correctness check] Added `_meta.fixture_id === path.basename(file, '.json')` assertion**
- **Found during:** Task 1 (writing the shape test)
- **Issue:** Plan asserts `_meta.fixture_id` is a non-empty string but does NOT assert it matches the filename. Plan 04's `_capture.cjs` writes baselines at `<agent>/<fixture_id>.json` — if those ever drift apart (e.g., a copy-paste error renames the file but not the field), the corpus is structurally broken in a way that breaks downstream parity tests' lookup logic.
- **Fix:** Added `assert.strictEqual(baseline._meta.fixture_id, path.basename(file, '.json'), ...)` at the bottom of the per-file assertions block.
- **Files modified:** `tests/parity-baselines-shape.test.cjs`
- **Verification:** All 22 baselines pass — confirms Plan 04's capture script wrote the field consistently. The check would catch drift introduced by any future hand-edit.
- **Committed in:** 55197471

**3. [Rule 2 - Missing critical correctness check] Added `assert.ok(baseline.result, ...)` to shape test**
- **Found during:** Task 1 (writing the shape test)
- **Issue:** Plan asserts `_meta` shape but not the actual `result` payload. A baseline with `_meta` valid but `result` empty/null is useless to Phase 2/3/6 parity consumers. The plan's own `<interfaces>` block shows `"result": "<text>"` as a top-level field of the schema.
- **Fix:** Added `assert.ok(baseline.result, '${agent}/${file}: must have non-empty "result" field')` to the shape test.
- **Files modified:** `tests/parity-baselines-shape.test.cjs`
- **Verification:** All 22 baselines have non-empty `result` strings (confirmed by GREEN test run).
- **Committed in:** 55197471

---

**Total deviations:** 3 (1 Rule 1 bug fix + 2 Rule 2 missing-critical-correctness adds).
**Impact on plan:** Bug fix (floor=22) was load-bearing — without it the test would be RED at commit time, blocking the plan's own success criteria. The two Rule 2 adds tighten the contract in ways that are correct, low-risk, and pass against Plan 04's actual corpus. No scope creep; all three changes are within the test files the plan defined.

### Auth gates
None — static tests that read local files only.

## Issues Encountered

- **Plan code's `>=23` floor.** Documented above as Deviation §1.
- **Verifying RED behavior without committing a bad baseline.** For both tests, I verified the failure path by mutating a baseline file in-place (delete `runs_recorded` for shape; backdate `captured_at` for staleness), running the test (saw the expected failure), then restoring from a `/tmp` backup before committing. Both `git status` and `git diff` confirmed clean restoration. (No baseline mutation reached any commit.)

## Cross-phase contract (downstream consumers)

- **Phase 6 (line-count trim of spine agents)** — when the spine-trim parity tests run after Phase 6's edits, they re-run each agent and compare against the same baselines this plan now guards. If those baselines drift (e.g., a shadow refresh in Phase 5), TEST-05's 90-day window forces the issue surface within a quarter. If a Phase 5/6 author wants to keep an old baseline deliberately, `_meta.staleness_acknowledged: "<YYYY-MM-DD>"` plus periodic re-ack is the documented escape hatch.
- **Phase 2 critic refactor + Phase 3 planner merge** — these phases will re-capture (or selectively refresh) baselines as part of their parity validation. TEST-05 will silently pass on the freshly-refreshed files (0 days old). TEST-03 will catch any malformed `_meta` block from a refresh script bug at PR time.

## Wave 0 Status: COMPLETE

All five Wave 0 plans have landed:

| Plan | Status | Headline deliverable |
|------|--------|----------------------|
| 01-01 | ✓ Complete | Orphan-reference test (red until Wave 1 cull lands; expected) |
| 01-02 | ✓ Complete | Lifecycle decomposition (10-step → step files, GREEN) |
| 01-03 | ✓ Complete | runAgentParity helper + walltime ledger live |
| 01-04 | ✓ Complete | 22 agent baselines captured at SHA `2dff30fc` (locked title commit `213dc014`) |
| 01-05 | ✓ Complete (this plan) | Shape + staleness guards GREEN against the 22 baselines |

Wave 1 (Plans 06-09) is now unblocked.

## Next Plan Readiness

- **Plan 06 (reference-rot scrub) can proceed.** When Plan 06 scrubs orphan references from agent prose, the orphan-test (01-01) will go from RED → GREEN. Plan 04's baselines were captured BEFORE any agent file was touched; Plan 06's scrub will create drift between the agent prose and the captured baselines, but that's expected — the next refresh cycle (gated by TEST-05's 90-day clamp) will realign.
- **TEST-05 first-failure horizon: ~2026-07-28** (90 days from Plan 04 capture date 2026-04-29). At that point Plan 04's baselines will become stale; either a refresh or an explicit `_meta.staleness_acknowledged` is required to keep `npm test` green. (If Phase 6's trim parity test refreshes the baselines, the clock resets.)

## Self-Check: PASSED

Verified:
- `tests/parity-baselines-shape.test.cjs` exists, parses (`node -c` clean), runs GREEN (23/23 tests pass).
- `tests/parity-baselines-stale.test.cjs` exists, parses (`node -c` clean), runs GREEN (23/23 tests pass).
- Both tests run together GREEN: `node --test tests/parity-baselines-{shape,stale}.test.cjs` → 46/46 pass.
- Both tests dynamically iterate the actual baseline files (filesystem walk, not hardcoded list) — verified by reading the source.
- Failure messages include file path + agent name + age in days + remediation hint — verified via temporary-mutation smoke tests.
- Constants exactly STALE_DAYS=90 and ACK_GRACE_DAYS=30 per RESEARCH.md §1.5 — verified via `grep` in the staleness test source.
- Both tests skip `.input.json` and `_meta.json` files — verified via the explicit filter conditions in `walkBaselines()`.
- Two commits on the worktree branch (`55197471`, `38a34bfd`) — verified via `git log --oneline -3`.
- No files modified outside `tests/` — verified via `git status` (clean working tree before SUMMARY mirror commit).
- Worktree base correctly set to `f049e3223cc2482358860721cc806171f83be0e8` — verified at agent startup with hard-reset.

---
*Phase: 01-cull-with-wave-0-test-infrastructure*
*Plan: 05*
*Completed: 2026-04-29*
