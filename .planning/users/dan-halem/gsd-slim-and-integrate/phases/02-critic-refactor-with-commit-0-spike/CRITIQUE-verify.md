---
critique_type: verify
phase: "02-critic-refactor-with-commit-0-spike"
plan: "02-01-PLAN.md through 02-08-PLAN.md"
reviewed_at: "2026-05-04"
status: fail
critics: [verify-critic]

severity_counts:
  critical: 4
  warning: 6
  info: 3
  total: 13
---

## Executive Summary

4 critical findings. The most dangerous gap: **the spike test (CRIT-01) as designed is vulnerable to a false-positive pass** — the prompt instructs the parent orchestrator to spawn a sub-Task rather than directly invoking the critic, creating a two-hop indirection where the canary can appear in the parent's context from the prompt text itself rather than from `@`-resolution inside the spawned agent.

Second critical: **the fault-injection test cannot verify the three-part CRIT-09 contract** (detect + log info + continue) because the planned assertion reads CRITIQUE.md from the Phase 1 fixture directory, which may be stale or absent.

Third critical: **`extractCategoryFromTitle` backfill accuracy is entirely untested** — parity could pass at 85% via incorrect bucket keys that coincidentally match.

Fourth critical: **`walltime-ledger-schema.test.cjs` is listed as "optional" in RESEARCH:794** despite XCUT-03 being mandatory.

## Critical Findings

### [CRITICAL] verify-C-001 — Spike test structurally vulnerable to canary-in-prompt false-positive

**Files:** `02-01-PLAN.md:312-366` (Task 3 spike test body); `02-02-PLAN.md:280-290` (Task 2 Step A)

The spike's stated goal is to prove `@`-reference content is injected into the spawned agent's prompt context. The test design at 02-01-PLAN.md:343-349 has the parent orchestrator invoke `runClaudeWithTools` with a prompt containing the literal: `"Use the Task tool to spawn subagent_type='gsd-critic-plan' with this prompt: '...Find the literal string starting with SPIKE-CANARY- and echo it verbatim...'"`.

**The canary string `SPIKE-CANARY-7d8e9f0-base-loaded` appears in this parent prompt because the instruction references it by name.** Claude Code's parent context contains the canary text from the *prompt itself*, not solely from `@`-resolution inside the spawned sub-agent. When the sub-agent receives `prompt="...echo SPIKE-CANARY-..."`, the canary literal is already in the sub-agent's Task prompt as text — so the sub-agent can echo it correctly even if the `@`-reference to `critic-base.md` fails to resolve entirely.

RESEARCH §Pitfall-1 (lines 382–390) diagnoses this exact failure mode: "An agent missing its base prompt but still capable of vague critique would appear to 'work.'" The mitigation requires the canary in `critic-base.md` AND verification it appears in output *without* the prompt mentioning it. The planned test violates this by naming the canary prefix `SPIKE-CANARY-` in the prompt text. The inverse-test (delete base, confirm canary absent) is deferred to "Phase 2.1."

**A false-positive PASS here is the most expensive outcome in Phase 2** — all subsequent plans proceed with `@`-reference architecture on a foundation that has not been verified.

**Fix:** Change the spike prompt to be agnostic of the canary: `"You are gsd-critic-plan. Read your own agent prompt context. Print any HTML comment you find on the first line of your context. Do not analyze any plan. Output only the comment text."` Canary becomes an HTML comment in critic-base.md (already specified at 02-02-PLAN.md:118). Test asserts canary appears in output without the prompt mentioning it. **Add the inverse test in Wave 0 (not deferred):** temporarily rename `critic-base.md` to `critic-base.md.bak`, rerun, assert canary absent, restore — within a single test using try/finally.

### [CRITICAL] verify-C-002 — Fault-injection test cannot verify the three-part CRIT-09 contract

**Files:** `02-07-PLAN.md:287-331` (CRIT-09 test body); `02-07-PLAN.md:64` (objective)

CRIT-09 requires: (a) aggregate findings from remaining 5 critics, (b) log missing critic as `info`-severity, (c) continue. Test must verify all three.

Test body at lines 305-320 reads `CRITIQUE.md` from `locatePhaseDir(getRepoRoot(), FIXTURE_PHASE)`. FIXTURE_PHASE is `'1'`. Phase 1 currently has no `CRITIQUE.md`. The test then `fs.readFileSync(path.join(phaseDir, 'CRITIQUE.md'))` — if file doesn't exist, throws unhandled error reported as test framework failure rather than assertion failure, masking the CRIT-09 gap.

RESEARCH §Assumptions A3 explicitly flags: "If wrong: alternative is to delete one critic file pre-test." The assumption that `Task(subagent_type="gsd-critic-DOESNOTEXIST")` returns a detectable error is MEDIUM-confidence, not verified. If Claude Code silently spawns an empty sub-agent that writes nothing, `critics_missing` shows `discuss` as missing but the orchestrator's reaction depends entirely on `workflows/critique.md` Step 5 — never tested.

**Fix:** Three explicit assertions: (1) `assert.ok(result.success, ...)` — orchestrator does not crash; (2) parse critic-aggregate JSON output and assert `critics_missing` includes `discuss`; (3) read merged CRITIQUE.md and assert info-severity pattern for missing critic. For (2), invoke `gsd-tools.cjs critic-aggregate` directly via `execFileSync` after `runClaudeWithTools`. Add test-setup assertion that no pre-existing CRITIQUE.md exists.

### [CRITICAL] verify-C-003 — `extractCategoryFromTitle` backfill accuracy is untested; parity overlap is semantically meaningless without it

**Files:** `02-03-PLAN.md:225-227` (extractCategoryFromTitle impl); `02-07-PLAN.md:498-469` (parity test assertions)

Bucket key is `${severity}:${category}:${lane}|${file}` (02-03-PLAN.md:170-175). Phase 1 baselines were captured before `category` was a required field — every baseline finding falls through to `extractCategoryFromTitle`, a heuristic taking first two words lowercased and kebab-cased.

Heuristic accuracy directly determines whether 85% threshold measures real semantic overlap or coincidental title-word matching. Example: "Missing requirement coverage for AUTH-03" → `missing-requirement` bucket; "Requirement AUTH-03 not covered" → `requirement-auth-03` bucket. Same finding, different keys, counted as non-overlapping.

Conversely, two completely different findings starting with same two words get the same bucket key and count as identical. **The 85% parity threshold is an unvalidated number.**

RESEARCH §Pitfall-4 documents the risk but mitigation is "document the scheme in agent-parity.cjs block comment" — documentation, not test.

**Fix:** Add a unit test for `extractCategoryFromTitle` in a new `tests/critic-findings-delta-shape.test.cjs` (or in `agent-parity-helper-shape.test.cjs` if that file is created): (1) verify known title → category mappings against fixture set of 10+ representative finding titles from Phase 1 baselines; (2) assert mapping is stable; (3) assert clearly different findings produce different keys.

### [CRITICAL] verify-C-004 — `walltime-ledger-schema.test.cjs` listed as "optional" but XCUT-03 is mandatory

**Files:** `02-RESEARCH.md:794` ("optional"); `REQUIREMENTS.md:103` (XCUT-03 mandatory); `02-07-PLAN.md:32-35` (artifact)

XCUT-03 mandates ledger entries with `{ date, test, walltime_ms, cost_usd, phase }`. The `cost_usd` field name (not `cost`) was specifically fixed as CR-05 in Phase 1 after a silent-zero coercion bug.

RESEARCH §Validation Architecture (line 794) marks the XCUT-03 row "live appends are observation, not assertion" and "✅ shape test exists" — but PATTERNS.md classifies the file as "optional — XCUT-03 shape gate." Inconsistency. An executor under time pressure may follow the "optional" characterization and skip the test, leaving no enforcement against `cost_usd` vs `cost` regression.

Additionally, the planned schema test asserts only `{date, test, walltime_ms, cost_usd, phase}` with phase regex match. Does NOT validate that `cost_usd` is non-negative number, `walltime_ms` is positive integer, `date` is valid ISO 8601 — the type-and-range checks that actually caught Phase 1's `cost`→`cost_usd` bug.

**Fix:** Remove "optional" label from RESEARCH and PATTERNS. Make `tests/walltime-ledger-schema.test.cjs` a Wave 0 artifact (RED from start, GREEN when real entries exist). Add type-and-range assertions: `typeof entry.cost_usd === 'number' && entry.cost_usd >= 0`; `Number.isInteger(entry.walltime_ms) && entry.walltime_ms > 0`; `!isNaN(Date.parse(entry.date))`.

## Warning Findings

### [WARNING] verify-W-001 — Walltime test has no soft-warning tier

**Files:** `02-07-PLAN.md:193-224`; `02-RESEARCH.md:833`

RESEARCH explicitly recommends "soft-warning at 1s in addition to hard-fail at 2s." Planned test has only hard-fail. Flake risk on loaded CI.

**Fix:** Emit `process.stderr.write('WARN: spawn-delta ' + spawnDelta + 'ms > 1000ms')` when `spawnDelta > 1000`. For total-walltime check, capture actual single-critic walltime from Phase 1 ledger and compute bound dynamically.

### [WARNING] verify-W-002 — Fault-injection assumes bad-subagent-name produces catchable error (unverified)

**Files:** `02-07-PLAN.md:64`; `02-RESEARCH.md:705` (A3)

A3 is MEDIUM-confidence. If Claude Code silently fails (returns empty-text response rather than error) for unknown subagent_type, orchestrator has no signal — test passes for wrong reason.

**Fix:** Add pre-condition sub-test: invoke `runClaudeWithTools('Use Task tool with subagent_type="gsd-critic-DOESNOTEXIST" and prompt="echo test"')` and assert detectable error response. If absent, fall back to Option (b) file-mutation with try/finally.

### [WARNING] verify-W-003 — N=5 too small to distinguish signal from LLM stochasticity at 85% threshold

**Files:** `02-07-PLAN.md:402-403`; `02-VALIDATION.md:42`

No variance estimate cited. Phase 1 baselines were captured at N=1. A single finding shift between runs can swing overlap 7.5 points across the 85% threshold.

**Fix:** Pre-execution: run each Phase 1 critic at N=3 against own baseline (~$5). If variance <10%, N=5 sufficient. If ≥15%, raise N to 7 or lower threshold to 80% with empirical basis. Document in VALIDATION.md.

### [WARNING] verify-W-004 — no-base-shadowing test only checks tag names, not content

**Files:** `02-01-PLAN.md:241-278`; `02-RESEARCH.md:577-608`

CRIT-05 is about content, not tag names. An addendum could re-state the severity rubric prose under a differently-named section and the test would pass.

**Fix:** Add second sub-test for content overlap: extract first 5 meaningful words of each paragraph in `critic-base.md`; assert no addendum substring exceeds 30% character overlap with any base section.

### [WARNING] verify-W-005 — install-shared-dir test invocation pattern under-specified

**Files:** `02-03-PLAN.md:353-394`

Test written to `--target` CLI flag explicitly noted as may-not-exist. Fallback uses HOME env-var assumed to work. If neither, test fails RED for wrong reason.

**Fix:** Add `--dry-run --manifest-only` mode to `bin/install.js` (10 lines) instead of guessing CLI shape.

### [WARNING] verify-W-006 — critique-workflow-structure verifies grep patterns, not execution semantics

**Files:** `02-06-PLAN.md:21-23`; `02-VALIDATION.md:57`

Static proxy is necessary but not sufficient for CRIT-06. Listing it as a `must_haves.truth` for CRIT-06 creates false impression of full verification.

**Fix:** Revise must_haves truth: "static structural proxy passes — does NOT constitute verification of CRIT-06 runtime parallelism; full verification requires CRIT-08 (`critic-batch-walltime`) to pass."

## Info Findings

### [INFO] verify-I-001 — `lineCount` helper differs between Plan 01 and RESEARCH §Code-Example-2 (DUPLICATE of plan-H-003)

### [INFO] verify-I-002 — Parity test fixture IDs illustrative (DUPLICATE of scope-M-001 / plan-H-005)

### [INFO] verify-I-003 — No test verifies CRITIQUE.md merge step preserves `critique_type` from each frontmatter

**Files:** `02-06-PLAN.md:19-23`; `02-RESEARCH.md:832`

RESEARCH §Type-II analysis identifies this Type-II error: critic-plan findings could surface under critic-code attribution. Planned test does not check this.

**Fix:** Add 4th sub-test to `tests/critique-workflow-structure.test.cjs`: given fixture with 6 pre-populated CRITIQUE-{lens}.md files (each with `critique_type` in frontmatter), run `gsd-tools.cjs critic-aggregate --phase-dir <fixture> --json` and assert `files[i].critique_type` matches expected lens for each.

## Verdict: CONDITIONAL ACCEPT

**Top 3 must-address:**

1. **verify-C-001** — Rework spike test to be agnostic of canary in parent prompt; add inverse test in Wave 0. False-positive spike enables every downstream plan to proceed on unverified foundation.
2. **verify-C-002** — Fix fault-injection test to atomically verify three-part CRIT-09 contract (detect + log info + continue) before Plan 07 is authored.
3. **verify-C-003** — Add unit test for `extractCategoryFromTitle` against real Phase 1 baseline titles before parity test runs. Without it, 85% overlap metric is semantically undefined.
