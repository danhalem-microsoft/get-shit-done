---
phase: 01-cull-with-wave-0-test-infrastructure
verified: 2026-04-29T00:00:00Z
status: gaps_found
score: 3/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User can run the orphan-reference static test and the test passes — every deleted command and agent name is absent from all 6 syntactic contexts across surviving agents, commands, workflows, fixtures, and docs."
    status: partial
    reason: "The orphan-reference test passes (1/1, GREEN), but get-shit-done/workflows/help.md contains full live-command documentation (Usage sections, description blocks) for three deleted commands (/gsd-map-codebase at lines 51-59, /gsd-list-phase-assumptions at lines 85-92, /gsd-do at lines 123-133) in the command-reference body sections — not only in the migration table. The orphan-reference test ALLOW_LISTs the entire help.md file to permit migration-table entries, so this content escapes the scan. The phase goal explicitly requires 'no orphan references to deleted names anywhere in surviving... workflows'. help.md is a surviving workflow and its body has live documentation pointing users to commands that no longer exist."
    artifacts:
      - path: "get-shit-done/workflows/help.md"
        issue: "Lines 51-59 (/gsd-map-codebase), 85-92 (/gsd-list-phase-assumptions), 123-133 (/gsd-do) are full live-command documentation blocks (header, description, Usage lines) for deleted commands. Migration table at lines 683, 712, 718 correctly marks them Removed — the body and migration table contradict each other."
      - path: "tests/cull-no-orphan-references.test.cjs"
        issue: "ALLOW_LIST entry for 'get-shit-done/workflows/help.md' exempts the entire file from orphan scanning. Intended to allow migration-table prose but ends up masking live documentation of deleted commands in the body."
    missing:
      - "Strip the three live-command sections from get-shit-done/workflows/help.md body (/gsd-map-codebase, /gsd-list-phase-assumptions, /gsd-do). Migration table rows should be the only place these names appear."
      - "Add a tighter check to the orphan-reference test that catches 'Usage: /gsd-<deleted-command>' patterns inside allow-listed files, OR add a separate test that asserts the help body never contains Usage blocks for names in deletedCommands."

  - truth: "The install-manifest.json, commands/gsd/help.md, and CHANGELOG.md migration table cover every deleted command (CR-02 + CR-03 violations reduce confidence in completeness)"
    status: failed
    reason: "CR-02 (BLOCKER from code review): tests/copilot-install.test.cjs still references /gsd-health and /gsd-autonomous as live source files that must exist. Lines 617-618 assert fs.existsSync(path.join(tempDir, 'gsd-health')), line 647 asserts commands/gsd/autonomous.md must exist as source. Both files are deleted. This causes 9 failing subtests in copilot-install.test.cjs (confirmed: '9 fail' from test run). Plan 08 SUMMARY claimed to replace these references but only fixed the pure-conversion tests (synthetic inputs), not the file-existence integration tests."
    artifacts:
      - path: "tests/copilot-install.test.cjs"
        issue: "Lines 617-618, 633, 635, 644-698 reference gsd-health and autonomous.md as actual source files that must exist. commands/gsd/health.md and commands/gsd/autonomous.md are deleted. These test assertions fail at runtime."
    missing:
      - "Replace gsd-health folder-existence assertions (lines 617-618, 633, 635, 698) with a surviving command (e.g., gsd-progress)."
      - "Replace the autonomous.md test block (lines 644-698) with a surviving command (e.g., discuss-phase.md)."

  - truth: "parity infrastructure is correct — runAgentParity median selection picks the actual median run"
    status: failed
    reason: "CR-04 (BLOCKER from code review): integration/helpers/agent-parity.cjs line 153 picks 'median run' from an unsorted array. The comment says 'median run by index after sort' but successful[] is never sorted — it is runs in completion order. The line is: current: successful[Math.floor(successful.length / 2)]. Phase 2/3/6 compare-mode delta computation reads this current field. Using a non-median run silently produces wrong delta comparisons that can approve regressions."
    artifacts:
      - path: "integration/helpers/agent-parity.cjs"
        issue: "Line 153: current: successful[Math.floor(successful.length / 2)] — successful array is not sorted by duration_ms before picking the median. The result is an arbitrary run at index floor(N/2) in completion order, not the actual median-duration run."
    missing:
      - "Sort successful runs by duration_ms before picking the median: const sorted = [...successful].sort((a, b) => (a.duration_ms ?? 0) - (b.duration_ms ?? 0)); current: sorted[Math.floor(sorted.length / 2)]"
      - "Add a unit test asserting that given 5 mock runs with deterministic durations, current is the run with the median duration (not the run at array index 2)."

  - truth: "walltime ledger records accurate cost_usd — callers that pass cost instead of cost_usd are rejected"
    status: failed
    reason: "CR-05 (BLOCKER from code review): integration/helpers/walltime-recorder.cjs validates test, walltime_ms, and phase but does NOT validate typeof entry.cost_usd. The error message names cost_usd as required but the validation block omits it. Line 36 then does entry.cost_usd ?? 0, so callers that pass { cost: 0.5 } instead of { cost_usd: 0.5 } silently write cost_usd: 0 to the ledger. Phase 6 trend analysis reads this ledger; a uniform-zero cost field hides API spend regressions."
    artifacts:
      - path: "integration/helpers/walltime-recorder.cjs"
        issue: "Lines 23-30: validation block checks typeof entry.test, typeof entry.walltime_ms, typeof entry.phase — but NOT typeof entry.cost_usd. Line 36: cost_usd: entry.cost_usd ?? 0 silently coerces missing cost_usd to 0 instead of throwing."
    missing:
      - "Add typeof entry.cost_usd !== 'number' to the validation guard so callers that pass cost instead of cost_usd receive a clear error rather than silently writing 0."
      - "Consider renaming claude-runner.cjs result.cost to result.cost_usd so the field name is consistent across the helper boundary."

  - truth: "gsd-tools.cjs dispatcher has no dead routes to deleted command handlers (~1.2K dead lines of code)"
    status: failed
    reason: "CR-03 (BLOCKER from code review): get-shit-done/bin/gsd-tools.cjs still contains four dispatcher cases routing to handlers whose user-facing commands/agents were deleted in Phase 1: case 'intel' (line 1179) routes to lib/intel.cjs (~638 lines); case 'docs-init' (line 1253) routes to lib/docs.cjs; case 'from-gsd2' (line 1380) routes to lib/gsd2-import.cjs (~511 lines); init map-codebase (line 1000) routes to init.cmdInitMapCodebase. No surviving command or agent invokes these routes. The orphan-reference test does not detect this because it only scans for slash-mention patterns and @-ref patterns, not dispatcher case strings."
    artifacts:
      - path: "get-shit-done/bin/gsd-tools.cjs"
        issue: "Lines 1179 (case 'intel'), 1253 (case 'docs-init'), 1380 (case 'from-gsd2'), 1000 (init map-codebase) route to lib files whose user-facing commands and agents are deleted. These are unreachable dead routes that contradict the cull's stated intent of removing unreferenced surface."
    missing:
      - "Delete the intel, docs-init, from-gsd2, and init-map-codebase dispatcher cases plus the corresponding lib files (intel.cjs, docs.cjs handler, gsd2-import.cjs, cmdInitMapCodebase in init.cjs). OR document each case as a surviving CLI subcommand in INVENTORY.md 'CLI Subcommands' and add a structural test asserting each case has a surviving caller."
      - "Add a structural test that for each top-level switch case in gsd-tools.cjs, either a surviving agent/command invokes it, or it is listed in INVENTORY.md CLI Subcommands."
---

# Phase 1: Cull (with Wave 0 test infrastructure) Verification Report

**Phase Goal:** GSD's surface area drops from 93 commands to 37 and from 39 agents to 22, with parity infrastructure recorded against pre-refactor baselines so all subsequent phases have a verifiable contract to compare against, and with no orphan references to deleted names anywhere in surviving prompts, workflows, fixtures, or installer manifest.
**Verified:** 2026-04-29
**Status:** gaps_found — 5 BLOCKERs identified (CR-01 through CR-05 from code review, confirmed in codebase)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Orphan-reference static test passes across all 6 syntactic contexts | PARTIAL | Test passes (GREEN, 1/1). But get-shit-done/workflows/help.md body contains live documentation for /gsd-map-codebase (lines 51-59), /gsd-list-phase-assumptions (lines 85-92), /gsd-do (lines 123-133) — deleted commands shown with full Usage sections. File is ALLOW_LISTs entirely for migration-table use, masking body violations. |
| 2 | Baseline corpus at integration/test-fixtures/baselines/ with 22 unique agent dirs, runAgentParity callable | VERIFIED | 22 agent baseline directories confirmed on disk. integration/helpers/agent-parity.cjs exists and exports runAgentParity, SCHEMAS, BASELINES_DIR, loadBaseline, saveBaseline. All 22 baselines have valid _meta blocks. parity-baselines-shape.test.cjs and parity-baselines-stale.test.cjs both pass (23/23 each). |
| 3 | Full GSD spine lifecycle test decomposed into per-step files; pipeline shape captured in lifecycle-shapes/*.json | VERIFIED | 9 step files at integration/lifecycle-steps/step-{1..9}-*.cjs. Thin composer at integration/gsd-lifecycle.test.cjs (78 lines). Shape JSON at integration/test-fixtures/lifecycle-shapes/post-cull.json. Static decomposition test (lifecycle-decomposed.test.cjs) passes GREEN (13/13). |
| 4 | /gsd-review accepts 5 flags + 6 deprecated commands dispatch to it; /gsd-phase accepts add/insert/remove | VERIFIED | commands/gsd/review.md has 6 flags (--code, --code-fix, --security, --coverage, --critique, --converge). commands/gsd/phase.md has 3 subcommands. 6 deprecation stubs exist with deprecation markers. consolidated-review-flags.test.cjs (26/26) and consolidated-phase-subcommands.test.cjs (6/6) both GREEN. |
| 5 | INVENTORY.md has exactly 37 commands + 22 agents; CHANGELOG.md + help.md have migration table; git tag gsd-slim-phase-1-cull applied; per-phase test inventory in PLAN.md | PARTIAL | INVENTORY.md has ## Commands (37 shipped), ## Agents (22 shipped), ## Deprecation Stubs (6 shipped). filesystem: 43 commands (37+6 stubs), 22 agents. install-manifest-matches-surviving.test.cjs passes (7/7). migration-table-present.test.cjs passes (80/80). Git tag gsd-slim-phase-1-cull IS applied. Bazel phase-1-cull tag in BUILD.bazel. BUT: npm test has 75 failing tests (documented deferred per Plan 08) and 5 code-review BLOCKERs unfixed. |

**Score:** 3/5 truths fully verified (Truths 2, 3, 4); 2 partially verified (Truths 1, 5); 4 BLOCKERs unresolved

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/fixtures/cull-deletion-list.cjs` | Source-of-truth fixture (49 cmds, 9 consolidated, 17 agents, 6 stubs) | VERIFIED | Exists. 49 deletedCommands, 9 consolidatedCommands, 17 deletedAgents, 6 deprecationStubs, slashMentionExcludes=['review'], 37/22 counts all correct. |
| `tests/cull-no-orphan-references.test.cjs` | 6-context orphan scan, passes GREEN post-cull | PARTIAL | Exists. Test passes (1/1 GREEN). But help.md ALLOW_LIST masks live documentation of /gsd-map-codebase, /gsd-list-phase-assumptions, /gsd-do in the body. Scan succeeds as a test artifact but not as a complete correctness gate. |
| `integration/helpers/agent-parity.cjs` | runAgentParity with 3 schema kinds, N=5 median, capture+compare modes | PARTIAL | Exists, exports correct API. BLOCKER: successful[] array not sorted before median pick (line 153). computeDeltas stubs are intentional (Phase 2/3/6 fill them). |
| `integration/helpers/walltime-recorder.cjs` | recordWalltime with cost_usd validation | PARTIAL | Exists. BLOCKER: cost_usd not validated in guard block — callers passing cost: silently write cost_usd: 0. |
| `integration/test-fixtures/baselines/<agent>/` | 22 baseline pairs (input.json + output.json) | VERIFIED | All 22 agent directories exist with valid _meta blocks. Locked-title commit present at 213dc014. |
| `integration/lifecycle-steps/step-{1..9}-*.cjs` | 9 per-step lifecycle modules | VERIFIED | All 9 files present and confirmed by lifecycle-decomposed.test.cjs. |
| `integration/test-fixtures/lifecycle-shapes/post-cull.json` | 9 expected_steps, step-4=review-critique, no step-10 | VERIFIED | Exists. |
| `integration/test-fixtures/walltime-ledger.jsonl` | JSONL ledger with 22+ entries | VERIFIED | Exists with comment header and 22+ entries from live capture. |
| `tests/parity-baselines-shape.test.cjs` | TEST-03 structural guard | VERIFIED | 23/23 GREEN. |
| `tests/parity-baselines-stale.test.cjs` | TEST-05 staleness guard | VERIFIED | 23/23 GREEN. |
| `tests/agent-parity-helper-shape.test.cjs` | TEST-02 static contract | VERIFIED | 8/8 GREEN. |
| `tests/lifecycle-decomposed.test.cjs` | TEST-04 structural | VERIFIED | 13/13 GREEN. |
| `tests/install-manifest-matches-surviving.test.cjs` | CULL-01/02/08 guard | VERIFIED | 7/7 GREEN. |
| `tests/consolidated-review-flags.test.cjs` | CULL-03/05 | VERIFIED | 26/26 GREEN. |
| `tests/consolidated-phase-subcommands.test.cjs` | CULL-04 | VERIFIED | 6/6 GREEN. |
| `tests/migration-table-present.test.cjs` | CULL-07 | VERIFIED | 80/80 GREEN. |
| `commands/gsd/review.md` | Consolidated /gsd-review | VERIFIED | Exists, 6 flags dispatched. |
| `commands/gsd/phase.md` | Consolidated /gsd-phase | VERIFIED | Exists, 3 subcommands dispatched. |
| `6 deprecation stubs` | commands/gsd/{secure-phase,validate-phase,code-review,code-review-fix,critique,plan-review-convergence}.md | VERIFIED | All 6 exist with deprecation markers, dispatch to /gsd-review --<flag>. |
| `docs/INVENTORY.md` | 37 commands + 22 agents + 6 stubs per D-02 | VERIFIED | ## Commands (37 shipped), ## Agents (22 shipped), ## Deprecation Stubs (6 shipped). |
| `tests/copilot-install.test.cjs` | No references to deleted source files | FAILED | Lines 617-618, 647, 652-653, 698 assert existence of gsd-health and autonomous.md which are deleted. 9 subtests fail at runtime. |
| `get-shit-done/bin/gsd-tools.cjs` | No dead dispatcher routes to deleted handlers | FAILED | case 'intel' (line 1179), case 'docs-init' (line 1253), case 'from-gsd2' (line 1380), init map-codebase (line 1000) all route to lib handlers whose user-facing commands are deleted. ~1.2K dead lines. |
| `integration/helpers/agent-parity.cjs` (median) | Median run correctly sorted | FAILED | successful[] not sorted before index pick at line 153. |
| `integration/helpers/walltime-recorder.cjs` (cost) | cost_usd validated | FAILED | No typeof entry.cost_usd check in validation block. |
| `get-shit-done/workflows/help.md` (body) | No live documentation for deleted commands | FAILED | /gsd-map-codebase, /gsd-list-phase-assumptions, /gsd-do appear as live commands with Usage sections in the body (lines 51-133). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| cull-no-orphan-references.test.cjs | cull-deletion-list.cjs | require() | WIRED | Confirmed: require('./fixtures/cull-deletion-list.cjs') present and SLASH_EXCLUDE_SET wired. |
| install-manifest-matches-surviving.test.cjs | docs/INVENTORY.md | fs.readFileSync | WIRED | Test correctly asserts INVENTORY.md ↔ filesystem equality per D-02. |
| parity-baselines-stale.test.cjs | baselines/_meta | walkBaselines() | WIRED | Walks integration/test-fixtures/baselines/ dynamically. |
| agent-parity.cjs | walltime-recorder.cjs | recordWalltime() | WIRED | But cost_usd validation gap means values recorded may be silently wrong (CR-05). |
| integration/BUILD.bazel | //integration:gsd-lifecycle | phase-1-cull tag | WIRED | bazel query confirms //integration:gsd-lifecycle tagged with phase-1-cull. |
| gsd-lifecycle.test.cjs | lifecycle-steps/step-{1..9}-*.cjs | require() | WIRED | Confirmed by lifecycle-decomposed.test.cjs 13/13. |
| copilot-install.test.cjs | commands/gsd/health.md | fs.existsSync | NOT_WIRED | health.md is deleted. Test assertions fail at lines 617-618, 647. |
| gsd-tools.cjs | lib/intel.cjs | case 'intel' | ORPHANED | No surviving caller routes to this case. Dead dispatcher. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| agent-parity.cjs (compare mode) | current (median run) | successful[Math.floor(N/2)] | No — unsorted array | HOLLOW — sorted order required for median semantics; produces arbitrary run instead |
| walltime-recorder.cjs | cost_usd | entry.cost_usd ?? 0 | Silently zero if caller passes cost: | STATIC — cost_usd silently defaults to 0 without validation error |
| integration/test-fixtures/baselines/ | 22 agent outputs | Live Claude CLI capture | Yes — real captures verified by $10.74 cost + 32.5 min walltime | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Orphan reference test GREEN | node --test tests/cull-no-orphan-references.test.cjs | # fail 0 | PASS (but ALLOW_LIST masks help.md body violations) |
| Install manifest surviving counts | node --test tests/install-manifest-matches-surviving.test.cjs | # fail 0 (7/7) | PASS |
| Consolidated review flags | node --test tests/consolidated-review-flags.test.cjs | # fail 0 (26/26) | PASS |
| Migration table present | node --test tests/migration-table-present.test.cjs | # fail 0 (80/80) | PASS |
| Baseline shape guards | node --test tests/parity-baselines-shape.test.cjs | # fail 0 (23/23) | PASS |
| copilot-install test | node --test tests/copilot-install.test.cjs | # fail 9 | FAIL — CR-02 confirmed |
| Full npm test suite | npm test | 4363 pass / 75 fail | FAIL — 75 failures (documented deferred issues per Plan 08 + CR-02) |
| git tag applied | git tag -l gsd-slim-phase-1-cull | gsd-slim-phase-1-cull | PASS |
| filesystem counts | ls commands/gsd/*.md | wc -l; ls agents/gsd-*.md | wc -l | 43 commands (37+6 stubs), 22 agents | PASS per D-02 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEST-01 | 01-01 | Orphan-reference static test | PARTIAL | Test GREEN but ALLOW_LIST masks help.md body violations (CR-01) |
| TEST-02 | 01-03 | runAgentParity helper callable | PARTIAL | Helper exists and exports correct API. Median pick broken (CR-04). |
| TEST-03 | 01-04 + 01-05 | 22 baselines at integration/test-fixtures/baselines/ | SATISFIED | 22 agents, valid _meta blocks, locked-title commit 213dc014, shape+staleness guards GREEN |
| TEST-04 | 01-02 | Lifecycle decomposed into step files | SATISFIED | 9 step files, 78-line composer, shape JSON, lifecycle-decomposed.test.cjs 13/13 GREEN |
| TEST-05 | 01-05 | Baseline staleness guard | SATISFIED | parity-baselines-stale.test.cjs 23/23 GREEN |
| CULL-01 | 01-08 | Exactly 37 user-facing commands | SATISFIED | INVENTORY.md ## Commands (37 shipped); install-manifest-matches-surviving.test.cjs 7/7 |
| CULL-02 | 01-08 | Exactly 22 agents | SATISFIED | ls agents/gsd-*.md = 22; INVENTORY.md ## Agents (22 shipped) |
| CULL-03 | 01-07 | /gsd-review accepts 5 flags | SATISFIED | review.md has 6 flags; consolidated-review-flags.test.cjs 26/26 |
| CULL-04 | 01-07 | /gsd-phase accepts add/insert/remove | SATISFIED | phase.md has 3 subcommands; consolidated-phase-subcommands.test.cjs 6/6 |
| CULL-05 | 01-07 | 6 deprecated commands print deprecation + dispatch | SATISFIED | All 6 stubs exist with deprecation markers and non-recursive forwarding |
| CULL-06 | 01-06 + 01-09 | Full GSD spine completes without deleted references | PARTIAL | Spine step files clean; help.md ALLOW_LISTs entire file masking CR-01 body violations; gsd-tools.cjs has dead routes (CR-03) |
| CULL-07 | 01-09 | Migration table in help.md + CHANGELOG.md | SATISFIED | migration-table-present.test.cjs 80/80 GREEN; D-01 disambiguation enforced |
| CULL-08 | 01-08 | INVENTORY.md lists exactly 37 commands + 22 agents | SATISFIED | Per D-02: INVENTORY.md is canonical roster; counts match |
| XCUT-01 | 01-09 | Git tag gsd-slim-phase-1-cull applied | SATISFIED | git tag -l confirms tag exists |
| XCUT-02 | 01-09 | bazel test --test_tag_filters=phase-1-cull resolves | SATISFIED | BUILD.bazel has phase-1-cull tag; bazel query confirms //integration:gsd-lifecycle |
| XCUT-05 | 01-09 | Per-phase test inventory in PLAN.md | SATISFIED | 01-09-PLAN.md has full test_inventory table mapping 19 test entries to REQ-IDs |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| get-shit-done/workflows/help.md | 51-59 | Live Usage documentation for deleted /gsd-map-codebase | Blocker | Users running /gsd-help see live docs pointing to a non-existent command |
| get-shit-done/workflows/help.md | 85-92 | Live Usage documentation for deleted /gsd-list-phase-assumptions | Blocker | Same as above |
| get-shit-done/workflows/help.md | 123-133 | Live Usage documentation for deleted /gsd-do | Blocker | Same as above |
| tests/copilot-install.test.cjs | 617-618, 647, 652-653, 698 | fs.existsSync assertions on deleted commands/gsd/health.md and commands/gsd/autonomous.md | Blocker | 9 test subtests fail at runtime; CR-02 |
| get-shit-done/bin/gsd-tools.cjs | 1179, 1253, 1380, 1000 | Dead dispatcher cases (intel, docs-init, from-gsd2, init map-codebase) routing to handlers with no surviving callers | Blocker | ~1.2K dead lines of code; contradicts cull intent; CR-03 |
| integration/helpers/agent-parity.cjs | 153 | Median run picked from unsorted successful[] array | Blocker | Compare-mode delta computation uses arbitrary run as "median"; silently approves regressions; CR-04 |
| integration/helpers/walltime-recorder.cjs | 23-30 | cost_usd not validated in guard block; silently writes 0 | Blocker | Phase 6 trend analysis will see uniformly zero costs; CR-05 |

### Human Verification Required

There are no items requiring human verification. All failures are programmatically observable.

### Gaps Summary

Five BLOCKERs from the code review are confirmed unfixed in the codebase:

**CR-01 (BLOCKER):** `get-shit-done/workflows/help.md` body contains live documentation (full Usage sections) for three deleted commands: `/gsd-map-codebase` (lines 51-59), `/gsd-list-phase-assumptions` (lines 85-92), `/gsd-do` (lines 123-133). The migration table at the bottom of the same file correctly marks them Removed — the body and migration table contradict each other. The orphan-reference test ALLOW_LISTs the entire `help.md` file (intended to allow migration-table prose), which masks this violation. This directly contradicts the phase goal: "no orphan references to deleted names anywhere in surviving... workflows."

**CR-02 (BLOCKER):** `tests/copilot-install.test.cjs` has file-existence assertions for `commands/gsd/health.md` and `commands/gsd/autonomous.md` (deleted in this phase). Lines 617-618 assert `gsd-health` folder exists in the copilot skill output; line 647 `assert.ok(fs.existsSync(srcFile), 'commands/gsd/autonomous.md must exist as source')` fails immediately. 9 subtests fail at runtime. Plan 08 SUMMARY claimed to fix these but only updated pure-conversion tests (synthetic string inputs), not the file-existence integration tests.

**CR-03 (BLOCKER):** `get-shit-done/bin/gsd-tools.cjs` retains four dead dispatcher cases routing to lib handlers whose user-facing commands and agents were deleted in this phase: `case 'intel'` (line 1179, routes to lib/intel.cjs), `case 'docs-init'` (line 1253, routes to lib/docs.cjs), `case 'from-gsd2'` (line 1380, routes to lib/gsd2-import.cjs), and `init map-codebase` (line 1000, routes to cmdInitMapCodebase). No surviving command, agent, or workflow calls these routes. Approximately 1.2K lines of dead code contradicting the Phase 1 cull intent per RESEARCH.md §1.1.

**CR-04 (BLOCKER):** `integration/helpers/agent-parity.cjs` line 153 picks the "median run" from `successful[]` without sorting it first. The comment says "median run by index after sort" but the sort does not happen. Phase 2/3/6 compare-mode will use this `current` field for delta computation against baselines, silently computing deltas against a quasi-random run instead of the actual median-duration run.

**CR-05 (BLOCKER):** `integration/helpers/walltime-recorder.cjs` validates `test`, `walltime_ms`, and `phase` but not `cost_usd`. The `?? 0` fallback on line 36 silently writes `cost_usd: 0` when a caller passes `{ cost: x }` instead of `{ cost_usd: x }`. The `claude-runner.cjs` result object exposes `.cost` (not `.cost_usd`), so any future caller wiring up a Phase 6 trend test could silently get zero cost recorded.

**75 npm test failures:** 75 subtests fail across the full test suite. These are the documented deferred issues from Plan 08 SUMMARY (approximately 50 subtests with hardcoded deleted-agent/command strings, approximately 12 RED subtests from Plan 07's consolidation overwriting test targets). These are expected deferred items per Plan 08. However, CR-02 (copilot-install.test.cjs) is NOT a documented deferred item — it was supposed to be fixed in Plan 08 but the file-existence assertions remain unchanged.

**Root cause grouping for replanning:** CR-01 and CR-04/CR-05 can be fixed in one small plan. CR-02 requires targeted test replacement. CR-03 requires either deleting the dead cases + lib files or documenting them as surviving CLI subcommands. All five are straightforward fix-and-verify with no architectural ambiguity.

---

_Verified: 2026-04-29_
_Verifier: Claude (gsd-verifier)_
