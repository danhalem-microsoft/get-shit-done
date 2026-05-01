---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 13
subsystem: cull
tags: [cull, gap-closure, CR-03, dispatcher, structural-test]
status: blocked-on-architectural-decision
gap_closure: true
requires:
  - 01-09 (install-manifest test infrastructure)
  - 01-10 (orphan-reference test scaffolding)
provides:
  - tests/gsd-tools-dispatcher-reachable.test.cjs (new structural CR-03 guard)
  - tests/BUILD.bazel (Bazel target registration for the new test)
affects:
  - get-shit-done/bin/gsd-tools.cjs (NOT modified — see Deviations)
  - get-shit-done/bin/lib/intel.cjs (NOT deleted — see Deviations)
  - get-shit-done/bin/lib/docs.cjs (NOT deleted — see Deviations)
  - get-shit-done/bin/lib/gsd2-import.cjs (NOT deleted — see Deviations)
  - get-shit-done/bin/lib/init.cjs (NOT modified — see Deviations)
tech-stack:
  added: []
  patterns:
    - Structural reachability testing (regex-extracted dispatcher cases × cross-file caller corpus)
    - BLOCKER 2 sub-issue B false-positive guard (third subtest validates regex relaxation against known survivors)
key-files:
  created:
    - tests/gsd-tools-dispatcher-reachable.test.cjs (177 lines)
  modified:
    - tests/BUILD.bazel (+1 line — js_test target registration)
decisions:
  - "Switch caller-search corpus to include sdk/src/ — the SDK forwards canonical query commands to gsd-tools.cjs cases either via native handler registration or subprocess fallback; SDK source is a legitimate surviving-caller surface."
  - "Use multi-pattern OR-search instead of a single permissive regex — separate patterns for gsd-tools argv form, gsd-sdk argv form, registry.register('<case>') string, golden-row cjs:'<case>', execRaw('<case>') — this dramatically reduces false negatives without admitting incidental prose hits."
  - "STOP before Task 2 — plan's deletion premise (intel/docs-init/from-gsd2 have no surviving callers) is empirically false. Surviving callers found across SDK, golden tests, and Plan 01-08-protected lib tests."
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-01
  tasks_completed: 1
  tasks_blocked: 1
---

# Phase 01 Plan 13: CR-03 dispatcher dead-route closure (BLOCKED)

Task 1 (structural test) shipped successfully — the new
`tests/gsd-tools-dispatcher-reachable.test.cjs` is registered in Bazel and
passes its sanity + false-positive subtests. **Task 2 (deletion of dead
dispatcher cases + lib files) is BLOCKED**: the plan's premise that
`intel`, `docs-init`, `from-gsd2`, and `cmdInitMapCodebase` have no
surviving callers is empirically false. Their actual callers are spread
across the SDK source, SDK golden tests, and `tests/*.test.cjs` files
that Plan 01-08 explicitly decided to KEEP.

Executing Task 2 as written would break:

1. `tests/intel.test.cjs` — directly `require()`s
   `get-shit-done/bin/lib/intel.cjs`
2. `tests/gsd2-import.test.cjs` — directly `require()`s
   `get-shit-done/bin/lib/gsd2-import.cjs` AND
   `runGsdTools(['from-gsd2', ...])`
3. `tests/init.test.cjs` — runs
   `runGsdTools('init map-codebase', tmpDir)` and describes
   `cmdInitMapCodebase`
4. `tests/subagent-timeout.test.cjs` — same `runGsdTools('init
   map-codebase', ...)` invocations
5. `sdk/src/golden/golden.integration.test.ts` — calls
   `captureGsdToolsOutput('intel', ['update'], ...)` and
   `captureGsdToolsOutput('docs-init', [], ...)`
6. `sdk/src/golden/read-only-golden-rows.ts` — golden table parity rows
   `cjs: 'intel'` / `cjs: 'intel'` for status/diff/validate/query
7. `sdk/src/query/index.ts` — registers `'docs-init'` and
   `'init.map-codebase'` / `'init map-codebase'` as native handlers
8. `sdk/src/query/intel.ts` and `sdk/src/query/docs-init.ts` — full
   ports of the lib handlers, comments declare provenance
   (`Ported from get-shit-done/bin/lib/intel.cjs.` and
   `Full port of cmdDocsInit and helpers from get-shit-done/bin/lib/docs.cjs.`)

This is a **Rule 4 architectural deviation**: the plan offers two paths
(delete OR document) and chose deletion based on a faulty assumption.
Empirically, only documentation is viable without invalidating other
phase decisions — and `intel`/`docs-init` aren't even orphans by the
test's own logic, so they need no documentation.

## What Task 1 Shipped

| Artifact                                              | Lines | Purpose                                                                       |
|------------------------------------------------------|-------|-------------------------------------------------------------------------------|
| `tests/gsd-tools-dispatcher-reachable.test.cjs`      | 177   | Three subtests — main reachability check, sanity extraction, survivor guard. |
| `tests/BUILD.bazel` (+1 line)                        | —     | `js_test` target so Bazel CI discovers and runs the new test.                 |

The test reads `get-shit-done/bin/gsd-tools.cjs`, extracts top-level
cases via the regex `^ {4}case '([a-z][a-z0-9-]*)':`, builds a caller
corpus from `agents/`, `commands/gsd/`, `get-shit-done/workflows/`,
`get-shit-done/templates/`, **and `sdk/src/`** (added during the
caller-search regex iteration — see *BLOCKER 2 Sub-issue B*), then
flags any case neither found in the corpus nor in
`docs/INVENTORY.md`'s `## CLI Subcommands` section.

**Bazel registration diff hunk:**

```diff
 ) for test_file in [
     "agent-parity-helper-shape.test.cjs",
     "walltime-recorder.test.cjs",
+    "gsd-tools-dispatcher-reachable.test.cjs",
 ]]
```

The reference target chosen was the existing `js_test` block at the top
of `tests/BUILD.bazel` (covering `agent-parity-helper-shape.test.cjs`
and `walltime-recorder.test.cjs`). Same `data` deps, `size`, `tags`,
and `timeout` apply — the new test is a static read-only structural
test, identical contract.

**BLOCKER 2 sub-issue A (Bazel target):** CLOSED.
`grep -c "gsd-tools-dispatcher-reachable.test.cjs" tests/BUILD.bazel`
returns `1`.

## BLOCKER 2 Sub-issue B (Caller-search False-positive Guard)

**Iteration 1 (initial):** caller-search restricted to
`agents/`, `commands/gsd/`, `get-shit-done/workflows/`,
`get-shit-done/templates/` only, with a single regex
`\\b(?:[./]?bin/)?gsd-tools(?:\\.cjs)?\\b[^\\n]{0,40}?\\b<case>\\b`.

Result: 38 false-positive orphans flagged including known survivors
(`commit`, `verify`, `workstream`, etc.). The regex was too narrow:
top-level dispatcher cases like `verify-summary`, `workstream`, etc.
are now invoked via `gsd-sdk query <case>` and their reachability
flows through the SDK source (which forwards to gsd-tools.cjs via
subprocess fallback).

**Iteration 2 (final):** expanded `CALLER_ROOTS` to include `sdk/src/`
and added five additional regex patterns covering:

| Invocation surface             | Regex pattern                                                                 |
|--------------------------------|-------------------------------------------------------------------------------|
| Direct CJS argv                | `\\b(?:[./]?bin/)?gsd-tools(?:\\.cjs)?\\b[^\\n]{0,160}?\\b<case>\\b`           |
| SDK CLI argv                   | `\\bgsd-sdk\\b[^\\n]{0,80}?\\b<case>\\b`                                      |
| SDK native handler registry    | `\\bregister\\s*\\(\\s*['"]<case>(?:[.\\b'"])`                                |
| SDK gsd-tools subprocess shim  | `args\\[0\\]\\s*===\\s*['"]<case>['"]`                                        |
| SDK golden-row table           | `cjs:\\s*['"]<case>['"]`                                                      |
| SDK execRaw call               | `execRaw\\s*\\(\\s*['"]<case>['"]`                                            |

These patterns are observed verbatim in the existing source —
`sdk/src/query/index.ts` `registry.register(...)`, `sdk/src/gsd-tools.ts`
`execRaw(...)`, `sdk/src/golden/read-only-golden-rows.ts` `cjs: '...'`,
etc.

After Iteration 2, the third subtest
("survivor cases are NOT flagged as orphans") **PASSES** —
`commit`, `verify`, `workstream`, `graphify`, `learnings` all resolve
through the corpus.

**BLOCKER 2 sub-issue B (false-positive guard):** CLOSED in the test
itself. The guard is now a durable subtest that runs on every commit;
future regex regressions will be caught.

(Note: the plan's "expected survivors" list included `query` —
`query` is NOT a top-level case in `gsd-tools.cjs`; it is the SDK
CLI command name. The plan's expected list was corrected during
iteration to drop `query` and use the actual top-level survivors.
Documented as deviation `[Rule 1 - Plan fact bug]` below.)

## Pre-Task-2 RED Capture (verbatim)

Captured to `/tmp/cr-03-pre-deletion-output.txt`:

```
TAP version 13
# Subtest: every top-level case in gsd-tools.cjs is reachable from a surviving caller or documented (CR-03 guard)
not ok 1 - every top-level case in gsd-tools.cjs is reachable from a surviving caller or documented (CR-03 guard)
  ---
  duration_ms: 418.143926
  failureType: 'testCodeFailure'
  error: 'dead dispatcher cases (no surviving caller, not in INVENTORY.md CLI Subcommands): from-gsd2, config-resolve, archive-project, restore-project, update-taste-counters, migrate.'
  actual:
    0: 'from-gsd2'
    1: 'config-resolve'
    2: 'archive-project'
    3: 'restore-project'
    4: 'update-taste-counters'
    5: 'migrate'
  operator: 'deepStrictEqual'
  ...
# Subtest: extractTopLevelCases returns a non-trivial set of known cases (sanity)
ok 2 - extractTopLevelCases returns a non-trivial set of known cases (sanity)
# Subtest: survivor cases are NOT flagged as orphans pre-Task-2 (BLOCKER 2 sub-issue B guard)
ok 3 - survivor cases are NOT flagged as orphans pre-Task-2 (BLOCKER 2 sub-issue B guard)
1..3
# tests 3 # pass 2 # fail 1
```

**Critical observation:** The orphans list contains `from-gsd2,
config-resolve, archive-project, restore-project,
update-taste-counters, migrate` — **NOT** the plan's expected `intel`,
`docs-init`, `map-codebase`. Verification:

| Case          | Plan expected RED?          | Actual RED?                                                                                 |
|---------------|-----------------------------|---------------------------------------------------------------------------------------------|
| `intel`       | YES                         | NO — SDK ports it (`sdk/src/query/intel.ts`), goldens register it (`cjs: 'intel'`)          |
| `docs-init`   | YES                         | NO — SDK registers it (`registry.register('docs-init', docsInit)`)                          |
| `from-gsd2`   | YES                         | YES — but `tests/gsd2-import.test.cjs` `runGsdTools(['from-gsd2', …])` is a tests-only call |
| `map-codebase`| YES                         | OUT OF SCOPE — inner case, 8-space indent, the test only matches top-level cases            |

The grep below confirms `commit`, `query`, `verify`, `workstream`,
`graphify`, `learnings` are absent from the orphan list:

```bash
$ grep -E 'commit|query|verify|workstream|graphify|learnings' /tmp/cr-03-pre-deletion-output.txt | grep -v -E '^(TAP|#)'
# (no output — clean)
```

(BLOCKER 2 sub-issue B closure evidence.)

## Why Task 2 Is BLOCKED

| Plan Action                                | Surviving Caller (proves premise wrong)                                                                                            |
|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Delete `case 'intel':` + `lib/intel.cjs`   | `tests/intel.test.cjs` `require('../get-shit-done/bin/lib/intel.cjs')`; `sdk/src/golden/golden.integration.test.ts` calls `captureGsdToolsOutput('intel', ['update'], …)`; `sdk/src/golden/read-only-golden-rows.ts` rows `cjs: 'intel'` for status/diff/validate/query; `sdk/src/query/intel.ts` declares port. Plan 01-08-65 explicitly KEEPS `intel.test.cjs`. |
| Delete `case 'docs-init':` + `lib/docs.cjs`| `sdk/src/golden/golden.integration.test.ts` `captureGsdToolsOutput('docs-init', [], …)`; `sdk/src/query/docs-init.ts` ports it; `sdk/src/query/index.ts` `registry.register('docs-init', docsInit)`. |
| Delete `case 'from-gsd2':` + `lib/gsd2-import.cjs` | `tests/gsd2-import.test.cjs` directly `require()`s the lib AND runs `runGsdTools(['from-gsd2', …])` repeatedly. Plan 01-08-65 explicitly KEEPS `gsd2-import.test.cjs`. |
| Delete `cmdInitMapCodebase` from `init.cjs`| `tests/init.test.cjs` describes `cmdInitMapCodebase` and runs `runGsdTools('init map-codebase', …)`; `tests/subagent-timeout.test.cjs` runs the same; `sdk/src/query/index.ts` `registry.register('init.map-codebase', …)` and `register('init map-codebase', …)`; `sdk/src/query/init.ts` ports `cmdInitMapCodebase`. |

Quote from `01-08-SUMMARY.md` line 65 (Plan 01-08's keep-decision):

> "Test files that share a substring with a deleted command name but
> test independent CLI lib functionality are KEPT. Concrete examples:
> intel.test.cjs (tests get-shit-done/bin/lib/intel.cjs CLI lib),
> graphify.test.cjs (graphify.cjs lib), gsd2-import.test.cjs
> (gsd2-import.cjs lib), …"

Task 2 cannot proceed without invalidating Plan 01-08's decision OR
breaking the SDK's parity contract. Per Rule 4, this is an
architectural decision the user must make.

## Decision Options for Follow-up Plan

| Option                                                                                          | Effect                                                                                                                                                | Tradeoff                                                                                                                |
|-------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **A. Document path (plan's named alternative)** — add `## CLI Subcommands` to `docs/INVENTORY.md` for the genuinely-orphan cases (`from-gsd2`, `config-resolve`, `archive-project`, `restore-project`, `update-taste-counters`, `migrate`). Keep all lib files. | Test goes GREEN. No tests break. SDK contract preserved. ~0 LoC removed. | Cull contract for these dispatcher cases is "documented, kept" not "deleted." Plan's must_haves about LoC removal go unmet. |
| **B. Override Plan 01-08** — delete `intel.test.cjs`, `gsd2-import.test.cjs`, `init.test.cjs` (`cmdInitMapCodebase` describe block), `subagent-timeout.test.cjs` (map-codebase block), and the SDK golden integration tests + read-only golden rows for `intel`/`docs-init`. THEN delete the dispatcher cases + lib files per plan. | ~1.4K LoC removed per plan + ~2K test LoC removed. SDK parity contract relaxed (no more cjs vs sdk goldens for intel/docs-init). | Reverses Plan 01-08-65's explicit decision; reduces test coverage; weakens SDK parity contract. May need REVIEW.md amendment. |
| **C. Hybrid** — delete only `case 'from-gsd2':` block from `gsd-tools.cjs` (4 lines) since `tests/gsd2-import.test.cjs`'s `runGsdTools(['from-gsd2', …])` calls would break too — would need to delete those test lines as well. Document the rest in INVENTORY.md. | Smaller surgical change. ~50 LoC removed (case + a few test invocations). | Doesn't truly close CR-03 ("contradicts cull intent for ~1.4K LoC dead code") — the bulk of the dead code stays. |
| **D. Defer** — close CR-03 partially via Task 1 alone (the structural test is now a permanent guard against future dead-route introduction). Leave existing dead routes in place pending a separate phase to coordinate Plan 01-08 + SDK parity rules. | Lowest blast radius. Plan 01-13 ships Task 1 only. The guard catches future regressions. | CR-03 not fully closed — VERIFICATION.md "gsd-tools.cjs dispatcher has no dead routes" stays FAILED for now. |

**Recommendation (executor opinion):** Option A is the plan's own
named alternative ("Delete the … cases plus the corresponding lib
files. OR document each case as a surviving CLI subcommand in
INVENTORY.md"). It closes CR-03 with no collateral damage and the
structural test makes the documentation enforceable. The "1.4K LoC
removed" figure in the plan was based on a wrong premise; the actual
LoC numbers under Option A are different but the contract intent
("no orphan dispatcher cases") is met.

## Plan Must-Haves Status

| Truth                                                                                                                              | Status                                                                                            |
|------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| CR-03 closed: gsd-tools.cjs no longer routes to handlers whose user-facing entry points are deleted (case removals)               | **NOT MET** — cases not removed pending decision                                                  |
| Three lib files deleted (~1.4K LoC)                                                                                                | **NOT MET** — files retain surviving callers in tests/ and SDK; deletion would break those callers |
| `cmdInitMapCodebase` deleted from `init.cjs`                                                                                       | **NOT MET** — surviving callers in tests/ and SDK                                                 |
| Top-level `docs` require, lazy `intel`/`gsd2-import` requires removed from `gsd-tools.cjs`                                         | **NOT MET** — gated on case removal                                                               |
| New structural test at `tests/gsd-tools-dispatcher-reachable.test.cjs`                                                             | **MET** — created, registered in Bazel, passes survivor false-positive guard                      |
| Test registered as `js_test` target in `tests/BUILD.bazel`                                                                         | **MET** — single-line addition to existing js_test block                                          |
| Pre-Task-2 RED gate captured to `/tmp/cr-03-pre-deletion-output.txt`                                                               | **MET** — captured; orphans list contains zero false-positives among known survivors              |
| Survivor cases not flagged (`commit`, `query`, `verify`, `workstream`, `graphify`, `learnings`)                                    | **MET** — third subtest is a durable guard                                                        |
| `npm test` failure count drops further                                                                                             | **NOT MET** — CR-03 was not contributing to npm-test failures pre-fix; this measure is unaffected |
| `node --test tests/cull-no-orphan-references.test.cjs` still passes                                                                | **MET** — verified post-Task-1 (`# pass 2 # fail 0`)                                               |
| Per CONTEXT.md D-04: only `fs.readFileSync` (read-only), local-scope variables, no `process.chdir`                                 | **MET** — test follows D-04                                                                       |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan fact bug] Survivor list included `query`**
- **Found during:** Task 1 sanity test
- **Issue:** Plan listed `query` as a known survivor case
  (must_haves.truths line 5 + acceptance_criteria), but `query` is
  not a top-level case in `gsd-tools.cjs` — it is the SDK CLI command
  name (`gsd-sdk query …`). The actual top-level survivors are
  `commit`, `verify`, `workstream`, `graphify`, `learnings`.
- **Fix:** Updated `KNOWN_SURVIVORS` and `expectedSurvivors` in the
  test to use the actual top-level case names. The intent of the
  plan's guard (catch caller-search regex regressions against known
  survivors) is preserved.
- **Files modified:** `tests/gsd-tools-dispatcher-reachable.test.cjs`
- **Commit:** 8964d13d

**2. [Rule 3 — Blocking issue] Caller-search corpus excluded SDK source**
- **Found during:** Task 1 RED gate iteration 1
- **Issue:** Plan's `CALLER_ROOTS` only included
  `agents/`, `commands/gsd/`, `get-shit-done/workflows/`,
  `get-shit-done/templates/`. Result: 38 false-positive orphans
  flagged because dispatcher cases now flow through
  `gsd-sdk query <case>` (handled in `sdk/src/`), not direct
  `gsd-tools.cjs` invocations from agents.
- **Fix:** Added `sdk/src` to `CALLER_ROOTS`; added five additional
  caller patterns (gsd-sdk argv, registry.register, args[0]===,
  golden cjs:, execRaw). Iteration 2 reduces false positives to
  zero among known survivors. The plan explicitly anticipated this:
  "Possible adjustments: ... Expand `CALLER_ROOTS` to include more
  surviving surfaces."
- **Files modified:** `tests/gsd-tools-dispatcher-reachable.test.cjs`
- **Commit:** 8964d13d

### Architectural Deviation (Rule 4 — STOP)

**3. [Rule 4 — Plan premise invalidated] Task 2 deletions blocked**
- **Found during:** Task 2 pre-flight gate (per plan's
  Pre-Task-2 RED gate evidence)
- **Issue:** Plan asserts no surviving callers for `intel`,
  `docs-init`, `from-gsd2`, `cmdInitMapCodebase`. Empirically false
  — surviving callers documented in the BLOCKED table above. The
  plan's must_haves explicitly require deletions but those deletions
  break (a) Plan 01-08-65's KEPT tests, and (b) the SDK parity
  contract for goldens.
- **Fix attempted:** None — Rule 4 requires user decision.
- **Status:** Task 2 not executed. Awaiting decision in follow-up
  plan (Options A/B/C/D above).

## Files Modified

| File                                                  | Status   | Purpose                                                                                  |
|-------------------------------------------------------|----------|------------------------------------------------------------------------------------------|
| `tests/gsd-tools-dispatcher-reachable.test.cjs`       | created  | New structural CR-03 guard, 177 lines, three subtests, BLOCKER 2 sub-issue B fixed.      |
| `tests/BUILD.bazel`                                   | modified | `js_test` target registration (1 line added inside the existing `js_test` block).        |

## Commits

| Hash      | Message                                                                                          |
|-----------|--------------------------------------------------------------------------------------------------|
| 8964d13d  | `test(01-13): add dispatcher-reachable structural test (CR-03 guard)`                            |

## Surviving init.cjs handlers (preserved unchanged — no edits)

All 8 surviving `cmdInit*` handlers remain untouched in
`get-shit-done/bin/lib/init.cjs`:

- `cmdInitPhaseOp` (line 678)
- `cmdInitTodos` (line 789)
- `cmdInitMilestoneOp` (line 848)
- `cmdInitProgress` (line 1239)
- `cmdInitManager` (line 946)
- `cmdInitNewWorkspace` (line 1415)
- `cmdInitListWorkspaces` (line 1441)
- `cmdInitRemoveWorkspace` (line 1487)

`cmdInitMapCodebase` at line 909 was NOT deleted — see
*Architectural Deviation* above.

## Module Load Smoke Test

`get-shit-done/bin/gsd-tools.cjs` loads cleanly because no
modifications were made to it.

```bash
$ node -e "require('./get-shit-done/bin/gsd-tools.cjs')"
$ echo $?
0
```

## Out of Scope (per gap_closure rules)

- **WR-08 (fail-soft sanity check fail-hard upgrade):** Deferred per
  gap_closure rules — WR-08 is a WARNING, not a BLOCKER; this plan
  only addresses BLOCKER CR-03.
- **The four extra orphans surfaced by Iteration 2** (`config-resolve`,
  `archive-project`, `restore-project`, `update-taste-counters`,
  `migrate`): These are Fork-only cases per the gsd-tools.cjs
  comment block at line 1386 (`// --- Fork-only case routes
  (FORK.md §Files Modified — gsd-tools.cjs row) ---`). They were not
  in the plan's stated scope; the plan only addresses CR-03's four
  specific cases. Their presence in the orphan list is a discovery,
  not a fix-target. The follow-up plan should decide whether to
  document them in INVENTORY.md or treat the fork-cases path
  separately.

## Self-Check: PASSED

- [x] `tests/gsd-tools-dispatcher-reachable.test.cjs` exists at
  `/home/danhalem/personal/get-shit-done/.claude/worktrees/agent-a8f9e9e796e20d9c9/tests/gsd-tools-dispatcher-reachable.test.cjs`
- [x] `tests/BUILD.bazel` contains `gsd-tools-dispatcher-reachable.test.cjs`
  (verified: `grep -c` returns `1`)
- [x] Commit 8964d13d exists in `git log`
- [x] `node --test tests/gsd-tools-dispatcher-reachable.test.cjs`
  fails RED on the main subtest naming actual orphans
  (subtest 2 + subtest 3 PASS)
- [x] `node --test tests/cull-no-orphan-references.test.cjs` passes
  (`# pass 2 # fail 0`)
- [x] No edits to `get-shit-done/bin/gsd-tools.cjs`,
  `get-shit-done/bin/lib/intel.cjs`,
  `get-shit-done/bin/lib/docs.cjs`,
  `get-shit-done/bin/lib/gsd2-import.cjs`,
  `get-shit-done/bin/lib/init.cjs` — all preserved unchanged
