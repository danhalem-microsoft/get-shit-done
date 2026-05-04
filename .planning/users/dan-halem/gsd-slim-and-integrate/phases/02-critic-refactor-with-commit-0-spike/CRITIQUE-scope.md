---
critique_type: scope
phase: "02-critic-refactor-with-commit-0-spike"
plan: "02-01 through 02-08"
reviewed_at: "2026-05-04"
status: fail
critics: [scope-critic]

severity_counts:
  critical: 2
  high: 2
  medium: 3
  low: 1
  info: 2
  total: 10
---

## Executive Summary

2 critical findings block ACCEPT. The most severe: **Plan 02-06 wires `workflows/critique.md` to call `gsd-sdk query critic-aggregate`, but `critic-aggregate` is not registered in `sdk/src/query/index.ts`** — the live drift-guard test (`tests/gsd-sdk-query-registry-integration.test.cjs`) will fail at phase exit, meaning the Phase 2 Bazel suite cannot go green as designed. Second critical: **Plan 02-08's CHANGELOG draft falsely attributes the fault-injection mechanism to a `--inject-fault` production flag that was explicitly rejected**; the CHANGELOG will contradict the shipped code and confuse downstream phases.

Two high findings: install.js line numbers cited throughout Plan 02-03 are off-by-one with HEAD (plans say 5313–5318; HEAD has the loop body at 5313–5319), and the install-shape test in Plan 02-03 Task 2 tests the Claude runtime only while the deferral note for non-Claude runtimes underspecifies where the deferred tracking record must land.

## Critical Findings

### [CRITICAL] scope-C-001 — `gsd-sdk query critic-aggregate` wired without SDK registry entry

**Files:** `02-06-PLAN.md:19-23` (must_haves); `02-06-PLAN.md:420` (workflow body invokes `gsd-sdk query critic-aggregate --phase $PHASE_ARG --json`)

Plan 02-06 Task 3 authors `workflows/critique.md` with `gsd-sdk query critic-aggregate --phase $PHASE_ARG --json`. The handler is wired into `gsd-tools.cjs` via `case 'critic-aggregate':` (line 245). However, the `gsd-sdk query` surface is **not** `gsd-tools.cjs` directly — it's a separate TypeScript registry at `sdk/src/query/index.ts`. Verified at HEAD: `sdk/src/query/index.ts` contains 248 `registry.register(...)` calls (lines 275–308 sampled); **none register `critic-aggregate`**.

The live drift-guard at `tests/gsd-sdk-query-registry-integration.test.cjs:1–7` scans all `.md`, `.sh`, `.cjs`, `.js`, `.ts` files for `gsd-sdk query <name>` references and asserts every referenced name is registered. When Plan 02-06 lands `workflows/critique.md` with `gsd-sdk query critic-aggregate`, this test will fail — blocking the Plan 02-08 phase-exit Bazel suite from going green.

`gsd-tools.cjs`'s own header comment (line 4): `@deprecated The supported programmatic surface is gsd-sdk query (SDK query registry)` — confirms two separate surfaces both require registration.

**Fix:** Plan 02-06 Task 1 must add a third step: register `critic-aggregate` in `sdk/src/query/index.ts` by adding a handler function and a `registry.register('critic-aggregate', cmdCriticAggregate)` call. Add `sdk/src/query/index.ts` to `files_modified`. Alternatively, change the workflow invocation to `gsd-tools critic-aggregate` (bare CLI form) — but verify `gsd-tools` is on PATH in agent execution contexts.

### [CRITICAL] scope-C-002 — Plan 02-08 CHANGELOG draft contradicts the locked fault-injection mechanism

**Files:** `02-08-PLAN.md:126` (CHANGELOG bullet 4); `02-07-PLAN.md:64` (locked decision)

Plan 02-07 locked CRIT-09 to **Option (a)** bad-subagent-name (`Task(subagent_type="gsd-critic-DOESNOTEXIST")`), explicitly rejecting Option (c) production flag at line 64: "NO production-code changes — neither `commands/gsd/review.md` nor `workflows/critique.md` is modified." Restated at line 241: "This requires NO production-code changes."

Plan 02-08 Task 1's CHANGELOG template at line 126 contradicts: "Exercised by `integration/critic-fault-injection.test.cjs` via the **debug-only `--inject-fault <lens>` flag**." The `--inject-fault` flag is Option (c), explicitly rejected. If committed verbatim, this creates a permanent false statement in repository history — downstream phases reading CHANGELOG will have an inaccurate picture of what production surface exists.

The executor note at line 134 acknowledges ambiguity ("Adapt bullet wording based on what actually shipped") but the default template misleads rather than guides.

**Fix:** Replace bullet at `02-08-PLAN.md:126` with: "Exercised by `integration/critic-fault-injection.test.cjs` — the test sends a prompt that includes one `Task(subagent_type=\"gsd-critic-DOESNOTEXIST\")` call alongside the five valid critic spawns; no production-code changes. The orchestrator's skip-and-continue policy aggregates the surviving five critics and logs the failed spawn as an `info`-severity `missing-critic-output` finding." Remove all `--inject-fault` language.

## High Findings

### [HIGH] scope-H-001 — `bin/install.js` line numbers in Plan 02-03 are stale

**Files:** `02-03-PLAN.md:99` (interfaces block "lines 5313–5318"); `02-03-PLAN.md:263` (read_first "lines 5313–5318")

`bin/install.js` has 7,056 lines at HEAD. The `if (fs.existsSync(agentsDir))` block referenced begins at line 5313, but the `for` loop body runs through line 5319 (one line longer than cited). One-line drift — harmless for an experienced executor, but the `read_first` directive tells the executor to read "5313–5318" to understand the insertion point; reading through 5318 misses the closing brace and may lead to a malformed edit producing a syntax error.

**Fix:** Update Plan 02-03 references to "lines 5313–5319" (inclusive). Or direct executor to grep: `grep -n "file.startsWith('gsd-') && file.endsWith('.md')" bin/install.js`.

### [HIGH] scope-H-002 — Multi-runtime install deferral has no tracking record

**Files:** `02-03-PLAN.md:267, 324`; `REQUIREMENTS.md:109` (Future Requirements section)

RESEARCH §Open-Q-4 defers multi-runtime install verification to "a future phase" and recommends flagging it as "Phase 7+ concern in STATE.md deferred items." Plan 02-03 correctly tests Claude only and documents the deferral in test header — but **no plan task creates the deferred-item tracking record**. REQUIREMENTS.md "Future Requirements" section does not include multi-runtime `_shared/` install verification. Scope leak in opposite direction: deferral invisible to Phase 3+.

**Fix:** Add a task to Plan 02-03 to append a deferred-items entry: "Multi-runtime `agents/_shared/` install verification (Codex, Cursor, Cline, Windsurf, Augment, Gemini, OpenCode, Kilo, Antigravity, Trae, Qwen) — deferred per RESEARCH §Open-Q-4, Phase 7+."

## Medium Findings

### [MEDIUM] scope-M-001 — CRIT-10 parity test fixture IDs in Plan 02-07 are illustrative

**Files:** `02-07-PLAN.md:438-445` (FIXTURES object)

Plan 02-07 ships fixture IDs `'plan-with-known-issues'`, `'code-with-smells'`, `'scope-with-creep'`, `'verify-with-gaps'`, `'discuss-with-assumptions'`, `'strategy-with-tradeoffs'` and acknowledges they're "illustrative" at line 472: "MUST be verified by listing `integration/test-fixtures/baselines/critic-{lens}/`." A wrong ID causes a $25, 30-minute parity run to fail at the `loadFixture` call. The plan defers an architectural decision (which baselines) to execution time.

**Fix:** Pre-execution: run `ls integration/test-fixtures/baselines/critic-*/` and document the actual fixture IDs in Plan 02-07. Replace illustrative IDs with verified IDs.

### [MEDIUM] scope-M-002 — Lifecycle multi-tag dependency on Phase 1 not documented

**Files:** `02-08-PLAN.md:13-14` (must_haves full suite); `02-07-PLAN.md:353-361` (lifecycle target multi-tagging)

Plan 02-07 Task 1 multi-tags the `gsd-lifecycle` integration target with `phase-2-critic`. The lifecycle test's step-4 (`step-4-review-critique.cjs`) invokes `/gsd-review --critique 1` — can only pass if Phase 1 is fully complete. ROADMAP says "Depends on: Phase 1 (`gsd-slim-phase-1-cull` git tag)" but no plan documents this lifecycle test's specific dependency or guards against partial Phase 1.

**Fix:** Add pre-condition check to Plan 02-08 Task 1 Step A: `git tag --list 'gsd-slim-phase-1-cull' | grep -c '^gsd-slim-phase-1-cull$'` must return 1 before the Bazel suite runs.

### [MEDIUM] scope-M-003 — install-shape test uses fragile "try multiple destination paths" pattern

**Files:** `02-03-PLAN.md:362-372` (candidatesDest array with 3 guesses)

Test passes if ANY of 3 guesses is correct. RESEARCH line 373 states `bin/install.js` writes to `~/.claude/agents/`; destination is known at research time but the plan doesn't lock it. If install.js silently writes to a wrong-but-included guess location, the test passes vacuously.

**Fix:** Require executor to read `bin/install.js` around the argv block to discover the actual target path; hardcode the single correct candidate. Remove the three-guess array.

## Low Findings

### [LOW] scope-L-001 — XCUT-01 cited in Plan 02-08 prose but correctly absent from `requirements:` frontmatter

**Files:** `02-08-PLAN.md:20, 33`

`requirements:` frontmatter correctly lists only `[XCUT-03]`. But prose at lines 20 and 33 describes Plan 02-08 as "implementing XCUT-01." Plan 02-08 is APPLYING the pattern (creating a tag), not IMPLEMENTING the requirement (Phase 1 owns).

**Fix:** Revise prose to "XCUT-01 pattern (owned by Phase 1; applied here for Phase 2 exit)."

## Info Findings

### [INFO] scope-I-001 — XCUT-04 walltime trend correctly absent from all 8 plans (clean deferral)

### [INFO] scope-I-002 — Phase 3 may want generalized `aggregate` subcommand; current `EXPECTED_LENSES` hardcoded to 6 critic lenses

## Verdict: CONDITIONAL ACCEPT

**Top 3 must-address before execution:**

1. **scope-C-001** — Register `critic-aggregate` in SDK query registry. Drift-guard will catch and the phase exit suite cannot go green. Add `sdk/src/query/index.ts` to Plan 02-06's `files_modified` and author the SDK handler.
2. **scope-C-002** — Correct CHANGELOG bullet template for fault injection. One-line edit before execution.
3. **scope-M-001** — Lock parity test fixture IDs before executor runs Plan 02-07. ~5 min vs. $25 wasted parity run.
