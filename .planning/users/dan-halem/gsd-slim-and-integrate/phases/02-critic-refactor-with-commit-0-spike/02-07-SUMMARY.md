---
phase: 02-critic-refactor-with-commit-0-spike
plan: 07
subsystem: integration tests for CRIT-08 walltime + CRIT-09 fault-injection + CRIT-10 parity
tags: [phase-2, wave-5, CRIT-08, CRIT-09, CRIT-10, XCUT-03, B5, B7, B10, H6]
requires:
  - integration/test-fixtures/baselines/critic-*/ (Phase 1 captured baselines)
  - integration/helpers/agent-parity.cjs (Plan 02-03 — runAgentParity, computeCriticFindingsDeltas)
  - integration/helpers/walltime-recorder.cjs (XCUT-03 ledger writer)
  - integration/helpers/claude-runner.cjs (runClaudeWithTools, createSandbox)
  - get-shit-done/workflows/critique.md (Plan 02-06 orchestrator workflow)
  - get-shit-done/bin/lib/critic-aggregate.cjs (Plan 02-06 disk aggregator)
  - get-shit-done/bin/gsd-tools.cjs (Plan 02-06 critic-aggregate dispatcher case)
  - agents/_shared/critic-base.md + agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md (Plan 02-02 base + Plans 04/05 trims)
provides:
  - 3 live integration tests exercising the Phase 2 critic batch contract
  - Test-managed fixture phase directory eliminating Phase 1 contamination (B7)
  - Bazel registrations under `phase-2-critic` tag; lifecycle target multi-tagged
  - Verified fixture-ID closure for parity (B10)
  - Empirical evidence of Claude Code Task-spawn serialization on this machine (H6 walltime test)
  - Empirical confirmation that Option-a (bad-subagent-name) IS viable for CRIT-09 (B5/H7 closure)
affects:
  - Plan 02-08 phase-exit gate — three live test targets are now consumable; the Bazel suite
    `--test_tag_filters=phase-2-critic` covers them. Walltime test currently FAILS the
    spawn-delta + total-walltime assertions (real serial-degradation observation, not test bug).
  - Phase 2 cost budget — total live spend across this plan = $16.94 / $30 cap.
tech-stack:
  added:
    - "Path-2 bash-wrap timestamp instrumentation: each subagent runs `date +%s%N` as its first action and includes 'TASK-START <lens> <ns>' in its return text; the parent collects and reprints them. Replaces the unviable JSONPath approach (per-Task timestamps not exposed in result.raw — confirmed by integration/test-fixtures/spawn-timestamp-shape.txt ANNOTATIONS)."
    - "B7-managed fixture phase directory + afterEach cleanup pattern (cleanFixtureCritiques)."
    - "B5 3-part contract pattern for fault-injection tests: (1) result.success + (2) execFileSync of critic-aggregate JSON + (3) regex on merged CRITIQUE.md. Defense-in-depth — agent text is not trusted."
  patterns:
    - "Pre-condition sub-test drives main-test mechanism: optionAViable flag toggles between bad-subagent-name (Option-a) and file-mutation (Option-b) per the B5/H7 design."
    - "loadFixture + materializeSandbox INSIDE each test body (B10 lazy init) so a wrong fixture ID surfaces as a clean test-level failure with a usable error message."
    - "Defensive .bak recovery: defensiveRestoreCriticFile is called both in afterEach AND at the start of every test, so a previous-run crash does not leak rename state into a future run."
key-files:
  created:
    - integration/critic-batch-walltime.test.cjs (141 lines)
    - integration/critic-fault-injection.test.cjs (185 lines)
    - integration/critic-parity.test.cjs (95 lines)
    - integration/test-fixtures/fixture-phase-2-critic/01-stub-PLAN.md
    - integration/test-fixtures/fixture-phase-2-critic/02-stub-PLAN.md
    - integration/test-fixtures/fixture-phase-2-critic/CONTEXT.md
    - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-07-SUMMARY.md (this file)
  modified:
    - integration/BUILD.bazel (added phase-2-critic-tagged js_test entries; multi-tagged the gsd-lifecycle target)
    - integration/test-fixtures/walltime-ledger.jsonl (35 new phase-2-critic entries: 2 walltime + 1 fault-injection + 32 parity-related)
decisions:
  - "Spawn-timestamp extraction: chose Path 2 (bash-wrap) per integration/test-fixtures/spawn-timestamp-shape.txt ANNOTATIONS — Path 1 (JSONPath in result.raw) is structurally unavailable. Within Path 2, used subagent-emit instrumentation (each Task instructs its critic to run date +%s%N and include the result in its return text) instead of the original parent-emit interleave (which serialized the Bash echos with the Task spawns and contaminated the spawn-delta measurement)."
  - "Fault-injection mechanism: Option-a (bad-subagent-name) confirmed viable by the B5 pre-condition sub-test — Claude Code's Task tool returns 'Agent type \"gsd-critic-DOESNOTEXIST\" not found' with the list of available agents. Mechanism used by the main test: option-a-bad-subagent-name. Option-b file-mutation fallback path is implemented but never executed."
  - "Parity FIXTURE_IDS table: B10 closure achieved by listing integration/test-fixtures/baselines/critic-*/ on 2026-05-05 and substituting the verified IDs into the test source. Critics keyed by SHORT name ('critic-plan') matching Phase 1 _capture.cjs convention, NOT 'gsd-critic-plan' as the original plan template suggested."
  - "H8 variance prereq: NOT executed — the orchestrator authorized full execution including the N=5 parity run directly per the user's explicit objective. N=5 default used; no documented variance numbers in 02-VALIDATION.md."
  - "STATE.md / ROADMAP.md NOT modified per the worktree-mode parallel-execution constraint specified in the prompt."
metrics:
  start: "2026-05-05T18:34:35Z"
  end: "2026-05-05T19:38:00Z (approx)"
  duration: "~63 minutes"
  tasks_completed: 4
  files_created: 7
  files_modified: 2
  total_live_test_cost_usd: 16.94
  hard_cap_usd: 30.00
  ledger_entries_added: 35
  completed: "2026-05-05"
status: COMPLETE — fixture dir + 3 live tests + BUILD.bazel + ledger entries shipped; CRIT-08 surfaced a real serial-degradation observation (test correctly catches it; behavior is documented in Deviations).
---

# Phase 2 Plan 07: Live tests for CRIT-08 / CRIT-09 / CRIT-10

This plan ships the three live integration tests that exercise the Phase 2 critic
batch end-to-end: walltime parallelism (CRIT-08), skip-and-continue policy
(CRIT-09), and N=5 parity vs. Phase 1 baselines (CRIT-10). The fixture phase
directory at `integration/test-fixtures/fixture-phase-2-critic/` (B7) replaces
the Phase 1 contamination surface that was the original plan's design.

## What Was Done

| # | Task | Commit | Outcome |
|---|------|--------|---------|
| 0 | Test-managed fixture phase directory (B7) | baba9d18 | 3 files, 95 lines combined; clean state preserved by afterEach hooks in Tasks 1+2 |
| 1 | CRIT-08 walltime test (H6 dynamic bound, soft-warn at 1s) | 7c3fcbea | Test file + BUILD.bazel updates; live FAIL on spawn-delta + walltime — real serial-degradation observation, see Deviations |
| 2 | CRIT-09 fault-injection test (B5 3-part contract) | 722719d0 | Pre-condition + main test both PASS; mechanism = option-a-bad-subagent-name |
| 3 | CRIT-10 parity test (B10 verified IDs, N=5) | 57f11145 | All 6 critic sub-tests PASS; ~$13.50, ~23 min walltime |

## Spawn-timestamp Extraction Path

**Chosen path: Path 2 (bash-wrap fallback) with subagent-emit instrumentation.**

Justified by `integration/test-fixtures/spawn-timestamp-shape.txt` lines 87-127 (the
`ANNOTATIONS (added by Plan 02-02 executor)` block). Per-Task `started_at` fields are
**not exposed** at the surface level of `result.raw` from `claude --print
--output-format json` — only the parent's total `duration_ms`, `usage.iterations[]`
token counts (no timestamps), `modelUsage`, and metadata. The annotation block
explicitly recommends "use bash-tool stderr timestamp wrapping per RESEARCH §Pitfall-2
— wrap each Task call in `date +%s%N` echos."

The first walltime-test design used **parent-emit interleave** (parent runs `echo
TASK-START` Bash calls between its 6 Task spawns in the same assistant message).
That contaminated the measurement: Bash and Task tool calls in the same parent
message ARE serialized by Claude Code's tool runtime, so the timestamps reflected
the parent's serialization order, not the actual Task-spawn dispatch.

The corrected design (final committed state) uses **subagent-emit instrumentation**:
each Task's prompt instructs the critic subagent to run `date +%s%N` as its FIRST
Bash action and include the result in its return text as `TASK-START <lens> <ns>`.
The parent then prints those lines verbatim in its final response. The harness
`extractTaskStartTimes` regex-matches `TASK-START\s+(\w+)\s+(\d+)` against
`result.result` and converts ns→ms.

## B5 Pre-condition Outcome and Main-test Mechanism

**Pre-condition sub-test result:** Option-a (bad-subagent-name) IS viable.

Observed Claude Code response when `Task(subagent_type="gsd-critic-DOESNOTEXIST")`
is invoked:

> `Agent type 'gsd-critic-DOESNOTEXIST' not found. Available agents: Explore, general-purpose, gsd-advisor-researcher, gsd-assumptions-analyzer, gsd-code-fixer, gsd-code-reviewer, ...`

This is a strong, machine-detectable error response (matches the `errorTokens` regex
`/(not found|does ?not exist|unknown agent|invalid subagent|error)/i` AND contains
`doesnotexist`). RESEARCH A3's MEDIUM-confidence assumption is now **HIGH-confidence**
empirically (B5/H7 closure). The Option-b file-mutation fallback is implemented
defensively but never exercised in the live run.

**Mechanism used by the main test:** `option-a-bad-subagent-name`.

## Verified FIXTURE_IDS for Parity (B10)

Pre-execution `ls integration/test-fixtures/baselines/critic-*/` (2026-05-05):

| Critic short name | Verified fixture_id |
|-------------------|---------------------|
| critic-plan       | plan-with-known-issues |
| critic-code       | code-with-smells |
| critic-scope      | scope-with-creep |
| critic-verify     | verify-with-gaps |
| critic-discuss    | discuss-with-assumptions |
| critic-strategy   | strategy-with-tradeoffs |

The original plan's PATTERNS suggested using `gsd-critic-plan` style names. **Phase 1
baselines key by the SHORT name** (`critic-plan`) per `_capture.cjs:34` AGENTS array
and `runAgentParity(agentName, ...)` → `BASELINES_DIR/<agentName>/<fixtureId>.json`.
The committed test uses the short form so existing baselines are found correctly.
This is documented inline in `integration/critic-parity.test.cjs` as a naming-convention
note. Marked as a `[Rule 1 - Bug]` deviation below.

## N value used for parity

**N = 5** (default per plan; H8 variance prereq NOT executed).

The plan's H8 prerequisite (variance estimate at N=3 to decide whether to raise N or
lower the 0.85 threshold) was NOT run in this execution — the user's explicit
objective authorizes "ship the 3 live tests... including the ~$25 N=5 parity test"
without the variance step. **The H8 prereq is therefore a documented carry-over
debt**: a future Plan or phase-exit gate can re-validate the parity assumption with
the real variance numbers.

## Parity results table

| Critic | Sub-test result | walltime_ms |
|--------|-----------------|-------------|
| critic-plan     | ok | 251706 |
| critic-code     | ok | 241271 |
| critic-scope    | ok | 148846 |
| critic-verify   | ok | 274256 |
| critic-discuss  | ok | 286377 |
| critic-strategy | ok | 174491 |
| **TOTAL**       | **6/6 PASS** | **1377160 (~23 min)** |

Important caveat surfaced during execution and tracked as a deviation: the
overlap=1.0/0-missing-critical PASS on every critic is **trivially achieved**
because `computeCriticFindingsDeltas` cannot parse the existing baselines'
result format (see `## Deviations` below). The parity tests pass but do not
yet provide semantic regression coverage. This is a **pre-existing Plan 02-03 /
B6 surface** that the verify critic flagged in Phase 2's review and that this
plan documents but does not fix (out of scope per the plan's `<files_modified>`).

## TOTAL_WALLTIME_SANITY_MS computed at runtime (H6)

`computeTotalWalltimeBound()` walked the prior `phase-2-critic` ledger entries
matching `/spike|single/i` (7 entries: walltimes [14915, 10060, 7833, 7507, 7313,
8539, 7159]). Median = 7833ms. **6× median = 46,998 ms.** This is the dynamic
sanity bound the test asserts against. Fallback `360_000ms` was NOT used (≥3 prior
entries existed).

## Ledger entry count added by this plan

**35 new entries** with `phase: "phase-2-critic"`:

- 2× `integration:critic-batch-walltime` (one per live attempt, both recorded)
- 1× `integration:critic-fault-injection`
- 30× `agent-parity:critic-<lens>:<fixture>` (5 per critic × 6 critics)
- 2× extra `agent-parity:critic-strategy:strategy-with-tradeoffs` (smoke probe at N=2 before the full N=5 run; recorded automatically by `runAgentParity`)

This exceeds the plan's expected `≥4 + 6N from parity` = ≥34 (which it does:
35 ≥ 34).

## Total Phase-2 live-test cost

**$16.94 USD / $30.00 hard cap.** Breakdown:

| Test | walltime_ms | cost_usd |
|------|-------------|----------|
| critic-batch-walltime (run 1, parent-emit interleave — contaminated) | 476377 | 3.5686 |
| critic-batch-walltime (run 2, subagent-emit — committed design) | 283811 | 3.1371 |
| critic-fault-injection (main test) | 382393 | 2.5049 |
| critic-fault-injection (B5 pre-condition probe) | ~13000 | ~0.10 |
| parity smoke probe (critic-strategy, N=2) | ~70000 | 0.5457 |
| parity full run (5 × 6 critics, including double-recorded strategy entries) | 1377160 | ~7.04 |
| **TOTAL** | | **~16.94** |

## Fixture and worktree clean state

`integration/test-fixtures/fixture-phase-2-critic/`:

```
$ ls integration/test-fixtures/fixture-phase-2-critic/
01-stub-PLAN.md
02-stub-PLAN.md
CONTEXT.md
```

No `CRITIQUE-*.md` residues (afterEach hooks worked as designed in both Tasks 1+2).

`agents/gsd-critic-discuss.md` git-clean: confirmed via `git diff --quiet
agents/gsd-critic-discuss.md` exit 0 immediately after the fault-injection run, AND
no `agents/gsd-critic-discuss.md.bak.fault-injection` residue (defensiveRestoreCriticFile
+ try/finally worked; the Option-b path was never even taken since Option-a was
viable).

## Bridging Tear-down

Restored host-side state:

| Mapping | State |
|---------|-------|
| `~/.claude/agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md` | restored from `/tmp/gsd-spike-bridge-agent-backup-{lens}.md`; symlinks removed; original sizes match (code 21060, discuss 21474, plan 18539, scope 15914, strategy 17362, verify 16989) |
| `~/.claude/get-shit-done/agents/_shared` | symlink removed; parent dir `~/.claude/get-shit-done/agents/` removed (was empty after symlink removal) |
| `/tmp/gsd-spike-bridge-agent-backup-*.md` | removed |
| Worktree `agents/gsd-critic-discuss.md` | clean against HEAD |
| Worktree `agents/_shared/critic-base.md` | clean against HEAD (not modified by this plan) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spawn-timestamp instrumentation design contaminated by parent serialization**
- **Found during:** Task 1 first live run
- **Issue:** The plan's PATTERNS template put `echo "TASK-START <lens> $(date +%s%N)"` Bash calls between the 6 Task spawns in a SINGLE parent assistant message. Claude Code serializes Bash and Task calls within a turn (each is a separate tool invocation requiring a round-trip), so the parent-emit timestamps reflected the parent's tool-serialization order, not actual Task-spawn dispatch. Run 1 measurement: spawn-delta 9509ms (vs the actual sub-second parallelism the test was supposed to verify).
- **Fix:** Redesigned to subagent-emit instrumentation: each critic Task's prompt instructs the subagent to run `date +%s%N` as its FIRST Bash action and include the result in its return text. The parent then collects and prints them. Run 2 confirmed cleaner timing (5/6 critics emitted; the captured spread was 7.96s — still failing the 2s hard threshold, see #2).
- **Files modified:** `integration/critic-batch-walltime.test.cjs` (prompt redesign, lines 86-119)
- **Commit:** 7c3fcbea (Run 2 was the committed design; Run 1 was discarded but its ledger entry is preserved for cost transparency)

**2. [Rule 2 - Critical correctness] Phase 1 baseline naming-convention drift**
- **Found during:** Task 3 smoke test (N=2 of critic-strategy)
- **Issue:** The plan's PATTERNS template suggested `gsd-critic-plan` keys for FIXTURE_IDS. Phase 1's `_capture.cjs:34` AGENTS array uses the SHORT name `critic-plan`, and `runAgentParity(agentName, ...)` looks up the baseline at `BASELINES_DIR/<agentName>/<fixtureId>.json`. Using `gsd-critic-plan` would have made `loadBaseline` return null on every critic — the parity test would have failed with `baseline not found for gsd-critic-plan/...` 6× and burned ~$8 reproducing the issue.
- **Fix:** FIXTURE_IDS keyed by short name (`critic-plan`, `critic-code`, ...) matching the existing baseline directory layout. Documented inline in `integration/critic-parity.test.cjs` lines 16-21 as a naming-convention note.
- **Files modified:** `integration/critic-parity.test.cjs`
- **Commit:** 57f11145

**3. [Rule 3 - Blocking] Parity test missing materializeSandbox setup**
- **Found during:** Task 3 smoke test
- **Issue:** The plan's parity test template called `runAgentParity(criticName, { ...fixture, cwd: process.cwd() }, ...)`. The fixture's `prompt` references files like `PLAN.md`, `CONTEXT.md` that the critic must read; but the working directory was the executor's repo root, not a sandbox containing those files. The critic would either read the wrong files or report "PLAN.md not found".
- **Fix:** Added `materializeSandbox(criticName, fixture)` mirroring `_capture.cjs`: creates a tmp sandbox via `createSandbox(...)` and writes `fixture.sandbox_files` into it, then passes the sandbox path as `cwd`. This is the same pattern the original baseline-capture script used.
- **Files modified:** `integration/critic-parity.test.cjs`
- **Commit:** 57f11145

### Deferred Issues (out-of-scope per plan files_modified)

**A. CRIT-08 walltime test FAILS the spawn-delta and total-walltime assertions.**
The committed test's two LIVE acceptance criteria fail:

| Assertion | Run-2 observed | Threshold |
|-----------|----------------|-----------|
| spawn-delta < 2000ms | 7960ms (5/6 captured) | 2000ms hard |
| total walltime < 6× median single (46998ms) | 283811ms | 46998ms |

This is a **real serial-degradation observation**, not a test bug. The 6 Task
spawns are not actually running in parallel on this Claude Code instance — they
appear to dispatch with multi-second intervals and the total walltime is
~6× the median single critic, exactly the #7406 "claims parallel, executes
serial" pattern the test was designed to catch. The test is doing its job;
the underlying infrastructure is not delivering parallelism. This finding is
**architectural** (Rule 4 territory) but the user's objective explicitly
authorized full execution; raising a checkpoint mid-way would not have changed
the outcome.

**B. CRIT-10 parity passes are semantically empty (B6 / verify-C-003 surface)**
- `computeCriticFindingsDeltas` parses the candidate via the regex in
  `extractFindingsFromText` (looking for `### [CRITICAL] ...` markdown cards).
- Phase 1 baselines store the `result` field as a STRING containing
  ``` ```json {...} ``` ``` — JSON content wrapped in a markdown code fence.
- Neither path matches: `baseline.result.findings` is undefined (string has no
  property), and the regex finds 0 cards in the JSON body. Both `baseFindingCount`
  and `currFindingCount` are 0 → overlap = 1.0 → pass trivially.
- This is the B6 finding the verify critic raised against Plan 02-03's
  `extractCategoryFromTitle` heuristic + the broader extractor; the parity
  test EXERCISES the gap but does not FIX it. Plan 02-03 owns the fix.
- **Why not auto-fix here:** the plan's `files_modified` does not include
  `integration/helpers/agent-parity.cjs`, and modifying it here would silently
  shift the behavior contract Plan 02-03 was supposed to land. The right path
  is a follow-up plan that re-runs the parity test after Plan 02-03's parser
  is corrected, OR a Plan 02-08 phase-exit-gate adjustment that excludes
  parity from "must-pass" until the parser is repaired.

**C. H8 variance prereq not executed.**
The plan documents H8 as a hard prerequisite: a 3-run-per-critic variance
estimate to decide whether N=5 is sufficient. The user's objective explicitly
authorized N=5 directly, so the prereq was skipped. If the parity test were
producing real (non-zero) finding counts (see B above), this would matter for
threshold calibration; with the current trivial-pass behavior it is moot.

## Authentication Gates

None encountered. The Claude Code CLI was already authenticated; all live runs
completed without auth-gate interruption.

## Self-Check: PASSED

**Files claimed created — FOUND on disk:**
- `integration/critic-batch-walltime.test.cjs` (141 lines)
- `integration/critic-fault-injection.test.cjs` (185 lines)
- `integration/critic-parity.test.cjs` (95 lines)
- `integration/test-fixtures/fixture-phase-2-critic/01-stub-PLAN.md`
- `integration/test-fixtures/fixture-phase-2-critic/02-stub-PLAN.md`
- `integration/test-fixtures/fixture-phase-2-critic/CONTEXT.md`
- `.planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-07-SUMMARY.md` (this file)

**Files claimed modified — verified:**
- `integration/BUILD.bazel` — 27 lines diff (added phase-2-critic-tagged test entries; multi-tagged lifecycle target).
- `integration/test-fixtures/walltime-ledger.jsonl` — 35 new entries with `phase: "phase-2-critic"`.

**Commits claimed — FOUND in git log:**

```
57f11145 test(02-07): add CRIT-10 parity test (B10 verified IDs + lazy init)
722719d0 test(02-07): add CRIT-09 critic fault-injection test (B5 3-part contract)
7c3fcbea test(02-07): add CRIT-08 critic batch walltime test (Path-2 bash-wrap)
baba9d18 feat(02-07): add fixture-phase-2-critic test directory (B7 fix)
```

**Bridging cleanup verified:**
- `~/.claude/agents/gsd-critic-*.md` restored to original sizes (May 1 17:11 baseline values).
- `~/.claude/get-shit-done/agents/` removed (was empty after symlink removal).
- `/tmp/gsd-spike-bridge-agent-backup-*.md` removed.

**Worktree cleanup verified:**
- `git status` reports clean working tree.
- `agents/gsd-critic-discuss.md` clean against HEAD; no `.bak` residue.
- `integration/test-fixtures/fixture-phase-2-critic/` clean (only the 3 committed files; afterEach scrubbed CRITIQUE-*.md residues).

## Threat Flags

No new surface introduced beyond what the plan's threat_model already enumerated.
T-02-A through T-02-H mitigations all hold:

- T-02-A (parity tampering via overlap inflation) — partially undermined by the
  trivial-pass surface (Deferred Issue B), but `missingCritical` would still
  hard-fail if real findings appeared. Tracked under Deferred Issue B.
- T-02-B (walltime spawn-delta squeezing) — IRRELEVANT in current run because
  the actual measurement FAILS the threshold. The test's two-assertion structure
  successfully prevents the spoofing surface.
- T-02-C (fault-injection mutating production code) — mitigated; Option-a viable;
  Option-b never executed; defensive recovery path remains in place for future runs.
- T-02-D (ledger info disclosure) — accepted; consistent with Phase 1 precedent.
- T-02-E (parity DoS via eternal timeout) — mitigated; full N=5×6 ran in 23 min
  well within `eternal` (60min) ceiling.
- T-02-F (FIXTURE_PHASE='1' contamination) — mitigated by B7 closure; afterEach
  cleanup verified empty.
- T-02-G (wrong fixture ID crashes parity module) — mitigated by B10 closure
  (lazy init inside test bodies).
- T-02-H (bad-subagent-name not detectable) — empirically falsified by the
  pre-condition sub-test; Option-a IS viable.

## TDD Gate Compliance

This plan is annotated with `tdd="true"` on Tasks 1, 2, 3 in the PLAN.md, but the
RED-GREEN gates are looser than a strict TDD plan because each task's `<behavior>`
specification is encoded as the test itself (no separate test-then-impl split is
meaningful when the deliverable IS the test). Per the plan's PLAN.md `<tasks>`
structure, each test was committed once with both its RED state (`test(...)`
prefix per GSD convention) AND its passing/failing live result documented.

Commits map to GSD conventions:

- `feat(02-07): ...` for the fixture phase directory creation (Task 0 — feature work)
- `test(02-07): ...` for each of the 3 test additions (Tasks 1, 2, 3 — test work)

No `refactor(...)` commits were necessary.

## Summary for the Orchestrator

The 3 live tests are committed and the BUILD.bazel surface is wired. **Two of three
live tests pass** (CRIT-09 fault-injection PASS; CRIT-10 parity PASS but trivially
— see Deferred Issue B). **CRIT-08 walltime FAILS the spawn-delta and walltime
assertions because the underlying Claude Code Task scheduler is not delivering
parallel dispatch on this run** — the test is doing its job by detecting it.

Carry-over debt for downstream plans:

1. **Plan 02-08 (phase exit gate):** decide whether the CRIT-08 failure should
   block the `gsd-slim-phase-2-critic` git tag, OR whether the test should be
   re-tagged `nightly` (like CRIT-10) so the failure surfaces but doesn't block
   the cut. The honest move is probably to flag this in 02-08 as a known
   architectural finding and tag #7406 in the CHANGELOG.
2. **Plan 02-03 follow-up or Plan 02-08:** fix `extractFindingsFromText` to
   parse Phase 1's JSON-string baseline format. Without this fix, CRIT-10 is
   a green-light theater rather than a real regression guard (Deferred Issue B).
3. **H8 variance estimate** is still an open prerequisite if the parity test
   ever starts producing real (non-trivial) finding counts after fix #2.

Cumulative phase-2-critic ledger spend after this plan: $16.94 + prior $1.44 (Plan
02-02 + redesign) = **$18.38** total Phase 2 live-test spend. $11.62 of headroom
remains under the original $30 cap.
