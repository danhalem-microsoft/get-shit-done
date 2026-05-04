---
phase: 2
slug: critic-refactor-with-commit-0-spike
generated_at: 2026-05-04
generated_from: /gsd-review --critique (manual fan-out of 4 critics — workflows/critique.md is 0 bytes pending Phase 2)
critics_run: [plan, scope, verify, strategy]
critics_skipped: [code, discuss]
critics_skipped_reason: "code: no implementation yet (pre-execution review); discuss: no CONTEXT.md exists for Phase 2"
verdict_overall: CONDITIONAL ACCEPT
total_findings: 50
unique_findings_after_dedup: ~38
---

# REVIEWS.md — Phase 2 Plan Critique

This document consolidates findings from 4 adversarial critic runs (plan, scope, verify, strategy) on the 8 PLAN.md files for Phase 2. Each finding has a stable ID (`{lens}-{severity_letter}-{NNN}`) and a fix recommendation. The planner should address every BLOCKING finding before re-submission to plan-checker.

**Live in-vivo demonstration of issue #29181 in this review session:** all 4 critic agents returned full critique content but **none wrote to disk**. The orchestrator (this document) had to save each `CRITIQUE-{lens}.md` manually from the agent return text — exactly the failure mode CRIT-07's disk-aggregation pattern is designed to mitigate. This is empirical evidence that the disk-based aggregation is load-bearing, not over-engineering.

---

## BLOCKING — must fix before execution

### B1. SDK registry gap will fail the phase exit Bazel suite
- **ID:** scope-C-001
- **Plans:** 02-06
- **Files:** `02-06-PLAN.md:19-23, 245, 420`; new requirement: `sdk/src/query/index.ts`
- **Finding:** `workflows/critique.md` invokes `gsd-sdk query critic-aggregate --phase $PHASE_ARG --json`, and the dispatcher case is added to `gsd-tools.cjs`. But the `gsd-sdk query` surface is `sdk/src/query/index.ts` (a separate TypeScript registry with 248 `registry.register(...)` calls). `critic-aggregate` is not registered there. The drift-guard `tests/gsd-sdk-query-registry-integration.test.cjs` will fail at Plan 02-08, blocking the `gsd-slim-phase-2-critic` git tag.
- **Fix:** Plan 02-06 must add `sdk/src/query/index.ts` to `files_modified` and add a Task step that registers `critic-aggregate` in the SDK registry alongside the existing 248 entries. Implement `cmdCriticAggregate` as a TypeScript handler that re-exports the gsd-tools.cjs CLI logic (or thin-wraps it).

### B2. Spike test is structurally vulnerable to canary-in-prompt false-positive
- **ID:** verify-C-001
- **Plans:** 02-01, 02-02
- **Files:** `02-01-PLAN.md:312-366` (Task 3 spike test body); `02-02-PLAN.md:280-290, 390-391`
- **Finding:** The spike prompt instructs the parent: `"Use the Task tool to spawn subagent_type='gsd-critic-plan' with this prompt: '...Find the literal string starting with SPIKE-CANARY- and echo it verbatim...'"`. The canary literal `SPIKE-CANARY-7d8e9f0-base-loaded` appears in the parent's prompt; it's then included in the sub-agent's Task prompt as text. The sub-agent can echo it correctly even if the `@`-reference to `critic-base.md` fails to resolve entirely. RESEARCH §Pitfall-1 explicitly diagnosed this exact failure mode. Inverse-test was deferred to Phase 2.1 with no automated coverage. **A false-positive PASS is the most expensive outcome in Phase 2** — every downstream plan proceeds on an unverified architectural foundation.
- **Fix:** Change spike prompt to canary-agnostic: `"You are gsd-critic-plan. Read your own agent prompt context. Print any HTML comment you find on the first line of your context. Do not analyze any plan. Output only the comment text."` Make canary an HTML comment in critic-base.md (already specified at 02-02-PLAN.md:118). **Add inverse test in Wave 0 (do NOT defer):** within a single test using try/finally, temporarily rename `critic-base.md` → `critic-base.md.bak`, rerun spike, assert canary absent, restore.

### B3. CHANGELOG bullet 4 references nonexistent `--inject-fault` flag
- **ID:** scope-C-002 / plan-C-005 (duplicate)
- **Plans:** 02-08
- **Files:** `02-08-PLAN.md:126`; cross-ref `02-07-PLAN.md:64, 241-245`
- **Finding:** Plan 02-07 explicitly LOCKED CRIT-09 to bad-subagent-name with NO production-code changes. Plan 02-08's CHANGELOG bullet 4 template still says: "Exercised by ... via the **debug-only `--inject-fault <lens>` flag**." If committed verbatim, creates permanent false statement in repository history. Downstream phases reading CHANGELOG will have an inaccurate picture of Phase 2's user-facing surface. The executor note "Adapt bullet wording" hedges but doesn't guide.
- **Fix:** Rewrite Plan 02-08 line 126 to: "Exercised by `integration/critic-fault-injection.test.cjs` — the test sends a prompt that includes one `Task(subagent_type=\"gsd-critic-DOESNOTEXIST\")` call alongside the five valid critic spawns; no production-code changes. The orchestrator's skip-and-continue policy aggregates the surviving five critics and logs the failed spawn as an `info`-severity `missing-critic-output` finding."

### B4. Plan 02-06 race condition on lens XML tag names
- **ID:** plan-C-003
- **Plans:** 02-06
- **Files:** `02-06-PLAN.md:6, 411-415`
- **Finding:** Plan 06 authors `workflows/critique.md` with hardcoded `<plan_specific_checklist>` / `<{lens}_specific_checklist>` XML tag references. These tag names are only finalized when Plans 04 (pilot trim) and 05 (bulk trim) establish the addendum shape. Plan 06's `depends_on: [1, 2, 3]` includes Plan 03 but NOT Plans 04 or 05. After the wave cascade, both Plan 06 and Plan 04 are wave 3 — meaning Plan 06 could run in parallel with Plan 04 (or before Plan 05).
- **Fix:** Add `4` and `5` to Plan 06's `depends_on`: `[1, 2, 3, 4, 5]`. Cascade Plan 06 → wave 4, Plan 07 → wave 5, Plan 08 → wave 6.

### B5. CRIT-09 fault-injection test cannot verify the three-part contract
- **ID:** verify-C-002
- **Plans:** 02-07
- **Files:** `02-07-PLAN.md:64, 287-331`
- **Finding:** Test reads `CRITIQUE.md` from `locatePhaseDir(getRepoRoot(), FIXTURE_PHASE='1')`. Phase 1 has no CRITIQUE.md. `fs.readFileSync` throws unhandled, reported as test framework failure, masking the CRIT-09 verification gap. Even if CRITIQUE.md existed, the test asserts only on merged-markdown text — cannot verify (a) detection, (b) info-severity logging, (c) continue, atomically. Pre-condition that bad-subagent-name produces a catchable error is unverified (RESEARCH A3, MEDIUM-confidence).
- **Fix:** Three explicit assertions in order: (1) `assert.ok(result.success, ...)` orchestrator does not crash; (2) parse critic-aggregate JSON output and assert `critics_missing` includes `discuss`; (3) read merged CRITIQUE.md and assert info-severity pattern. Invoke `gsd-tools.cjs critic-aggregate` directly via `execFileSync` after `runClaudeWithTools` returns. Add a pre-condition sub-test that invokes Task with `gsd-critic-DOESNOTEXIST` and asserts a detectable error response shape; if absent, fall back to Option (b) file-mutation with try/finally.

### B6. CRIT-10 parity overlap is semantically meaningless without backfill validation
- **ID:** verify-C-003
- **Plans:** 02-03, 02-07
- **Files:** `02-03-PLAN.md:170-175, 225-227`; `02-07-PLAN.md:402-403, 498-469`
- **Finding:** Bucket key is `${severity}:${category}:${lane}|${file}`. Phase 1 baselines were captured pre-`category`-field. Every baseline finding falls through to `extractCategoryFromTitle` heuristic (first 2 words kebab-cased). Heuristic accuracy directly determines whether 85% measures real semantic overlap or coincidental title-word matching. No test validates the heuristic against known title→category mappings. Two systematic failure modes: (a) different phrasing of same finding → false-fail; (b) different findings sharing first-two-words → false-pass.
- **Fix:** Add a unit test in a new `tests/critic-findings-delta-shape.test.cjs` (or extend `agent-parity-helper-shape.test.cjs`) that: (1) verifies known title→category mappings against fixture set of 10+ representative finding titles from Phase 1 baselines; (2) asserts mapping is stable; (3) asserts clearly different findings produce different keys. Run before Plan 07 lands.

### B7. FIXTURE_PHASE='1' contaminates Phase 1's working directory
- **ID:** plan-H-004
- **Plans:** 02-07
- **Files:** `02-07-PLAN.md:192, 263, 323-330`
- **Finding:** Walltime + fault-injection tests run `/gsd-review --critique 1`. Critics write CRITIQUE-{lens}.md into Phase 1's actual `.planning/...` directory. Subsequent test runs (and the parity test) read these stale files. Cross-test contamination + non-portable across workspaces (`gsd-tools.cjs find-phase 1` resolves to user-specific path).
- **Fix:** Replace `FIXTURE_PHASE = '1'` with a test-managed fixture directory at `integration/test-fixtures/fixture-phase-2-critic/`. Run critic batch against the fixture-specific dir; clean up CRITIQUE-*.md files in `afterEach` (or try/finally). Update `locatePhaseDir` calls in the tests to read the fixture path directly.

### B8. Cross-directory Bazel `entry_point` is fragile
- **ID:** plan-C-004
- **Plans:** 02-01
- **Files:** `02-01-PLAN.md:370-385`
- **Finding:** `tests/critic-spike-passes.test.cjs` placed in `tests/` but registered in `integration/BUILD.bazel` with `entry_point = "../tests/critic-spike-passes.test.cjs"`. Cross-package `..` references are fragile in `rules_js`. May fail at `bazel build` time or create duplicate target with conflicting tag sets. Mitigation ("if collision arises, exclude from `tests/BUILD.bazel`") is conditional.
- **Fix:** Move file to `integration/critic-spike-passes.test.cjs` (it's a live test, belongs there). OR add `exports_files(["critic-spike-passes.test.cjs"])` to `tests/BUILD.bazel` and reference from integration as `//tests:critic-spike-passes.test.cjs`. Plan 01 Task 4 BUILD.bazel snippets need updating accordingly.

### B9. Walltime ledger schema test marked "optional" but XCUT-03 mandatory
- **ID:** verify-C-004
- **Plans:** 02-07
- **Files:** `02-RESEARCH.md:794`; `02-PATTERNS.md:41`; `02-07-PLAN.md:32-35`
- **Finding:** XCUT-03 mandates `{date, test, walltime_ms, cost_usd, phase}` in ledger. RESEARCH/PATTERNS conflict on whether the schema test is required. The planned test asserts only key presence — does NOT validate `cost_usd` is non-negative number, `walltime_ms` is positive integer, `date` is valid ISO 8601 (the type-and-range checks that caught Phase 1's `cost`→`cost_usd` bug).
- **Fix:** Remove "optional" label from RESEARCH and PATTERNS. Make `tests/walltime-ledger-schema.test.cjs` a Wave 0 artifact (RED from start, GREEN when entries exist). Add type-and-range assertions: `typeof entry.cost_usd === 'number' && entry.cost_usd >= 0`; `Number.isInteger(entry.walltime_ms) && entry.walltime_ms > 0`; `!isNaN(Date.parse(entry.date))`.

### B10. Parity fixture IDs are illustrative
- **ID:** scope-M-001 = plan-H-005 = verify-I-002 (3-way duplicate, raised by 3 critics independently)
- **Plans:** 02-07
- **Files:** `02-07-PLAN.md:439-445, 471-473`
- **Finding:** FIXTURES object hardcodes fixture IDs (`'plan-with-known-issues'`, `'code-with-smells'`, etc.) acknowledged as illustrative. Module-level `loadFixture` calls throw at import time if IDs wrong, crashing the test module rather than producing a clean per-test failure. A wrong ID burns a $25 / 30-min parity run.
- **Fix:** Pre-execution: run `ls integration/test-fixtures/baselines/critic-*/` and replace illustrative IDs with verified IDs in Plan 07. Move `loadFixture` calls inside test bodies for lazy initialization (so a wrong ID surfaces as a clean test failure, not a module crash).

---

## HIGH — should fix; not strictly blocking

### H1. `tests/agent-parity-helper-shape.test.cjs` referenced but no plan creates it
- **ID:** plan-H-002
- **Plans:** 02-03
- **Files:** `02-03-PLAN.md:241, 252`
- **Fix:** Add to Plan 03 read_first: verify file exists; if not, document as Phase 1 debt or add minimal create step.

### H2. `bin/install.js` line numbers stale (5313–5318 cited; HEAD is 5313–5319)
- **ID:** scope-H-001
- **Plans:** 02-03
- **Fix:** Update Plan 03 references to "lines 5313–5319" (inclusive). Or use grep-based location: `grep -n "file.startsWith('gsd-')" bin/install.js`.

### H3. Multi-runtime install deferral has no tracking record
- **ID:** scope-H-002
- **Plans:** 02-03
- **Fix:** Add a Plan 03 task to append to STATE.md or REQUIREMENTS.md Future Requirements: "Multi-runtime `agents/_shared/` install verification (Codex/Cursor/Cline/Windsurf/Augment/Gemini/OpenCode/Kilo/Antigravity/Trae/Qwen) — deferred per RESEARCH §Open-Q-4, Phase 7+."

### H4. critique-workflow-structure regex too lazy
- **ID:** plan-H-001
- **Plans:** 02-06
- **Fix:** Add negative lookahead for `\bWait\b`, `\bStep \d+\b`, `\bAfter .* returns\b` between Task calls in the regex.

### H5. lineCount helper inconsistent between Plan 01 and RESEARCH §Code-Example-2
- **ID:** plan-H-003 / verify-I-001
- **Plans:** 02-01
- **Fix:** Standardize on `wc -l`-equivalent: `fs.readFileSync(file, 'utf8').split('\n').length`. Add code comment documenting the choice.

### H6. Walltime test has no soft-warning tier (1s yellow flag)
- **ID:** verify-W-001
- **Plans:** 02-07
- **Fix:** Add `process.stderr.write('WARN: spawn-delta ...')` when `spawnDelta > 1000`. Compute `TOTAL_WALLTIME_SANITY_MS` dynamically from Phase 1 ledger.

### H7. Bad-subagent-name catchable-error assumption unverified
- **ID:** verify-W-002
- **Plans:** 02-07
- **Fix:** Pre-condition sub-test in `critic-fault-injection.test.cjs`: invoke Task with `gsd-critic-DOESNOTEXIST` and assert detectable error response shape. Document observed behavior. Fall back to Option (b) if needed.

### H8. N=5 too small without empirical variance estimate
- **ID:** verify-W-003
- **Plans:** 02-07; pre-execution reconnaissance
- **Fix:** Pre-execution: run each Phase 1 critic at N=3 against own baseline (~$5). If variance ≥15%, raise N or lower threshold. Document empirical basis in VALIDATION.md.

### H9. no-base-shadowing only checks tag names, not content
- **ID:** verify-W-004
- **Plans:** 02-01
- **Fix:** Add second sub-test for content overlap (substring scanning or Jaccard similarity).

### H10. install-shared-dir test invocation pattern under-specified
- **ID:** verify-W-005 / scope-M-003 / plan-M-004
- **Plans:** 02-03
- **Fix:** Add `--dry-run --manifest-only` mode to `bin/install.js` (10-line addition) instead of guessing CLI shape; OR read install.js argv parser to lock the actual flag.

### H11. critique-workflow-structure tests grep, not execution semantics
- **ID:** verify-W-006
- **Plans:** 02-06
- **Fix:** Revise must_haves truth: "static structural proxy passes — does NOT constitute verification of CRIT-06 runtime parallelism; full verification requires CRIT-08."

---

## STRATEGY-LEVEL — milestone scope concerns

### S1. Spike fallback path not pre-authorized in ROADMAP
- **ID:** strategy-W-001
- **Files:** `ROADMAP.md` Phase 2 section
- **Fix:** Add: "If the spike fails, a Phase 2.1 (INSERTED) plan covers install-time inlining via `bin/install.js` before Plans 04-07 proceed; this adds an estimated 1 plan and 1-2 days."

### S2. Phase 1 plan-count overrun (44%) pattern not in Phase 2 estimate
- **ID:** strategy-W-002
- **Files:** `ROADMAP.md` Phase 2 plan-count line
- **Fix:** Update "Plans: 8 plans across 2 waves" to "Plans: 8 plans across 5 waves; estimated 1-2 gap-closure plans may follow verification."

### S3. Critic-refactor recursion risk
- **ID:** strategy-W-003
- **Files:** `ROADMAP.md` Phase 3 "Depends on" section
- **Fix:** Add: "Phase 3 plans should be reviewed by the Phase 2 critics AND optionally cross-checked against a pre-refactor critic run on at least one Phase 3 plan to verify parity holds on out-of-distribution content."

### S4. Heuristic category-backfill needs pilot validation
- **ID:** strategy-W-004 (related to verify-C-003)
- **Files:** Plan 02-04
- **Fix:** During Plan 04 pilot trim, run a single pre-trim vs post-trim parity comparison and inspect `missingCritical` and `extraFindings` outputs by hand. Cost ~$0.60. Catches systematic false-pass/false-fail before 5 wasted parity runs.

---

## ORCHESTRATOR-OWNED — already fixable without planner revision

### O1. Wave numbering drift between PLAN frontmatter and VALIDATION.md
- **ID:** plan-C-001 / plan-C-002
- **Files:** `02-VALIDATION.md` Sampling Rate / Wave 0 Requirements sections
- **Fix:** Update VALIDATION.md taxonomy to 6 waves (0 + 1–5) matching the cascade. Update Plan 03 objective text to remove the false claim that Plans 03/04/05 are all wave 2.

### O2. Plan 02-08 prose XCUT-01 reference (correctly absent from frontmatter)
- **ID:** scope-L-001
- **Fix:** Revise Plan 08 prose at lines 20, 33: "XCUT-01 pattern (owned by Phase 1; applied here for Phase 2 exit)."

### O3. walltime-ledger-shape vs walltime-ledger-schema filename inconsistency
- **ID:** plan-L-001
- **Fix:** Update VALIDATION.md to use `walltime-ledger-schema.test.cjs` consistently with Plan 07.

### O4. Plan 05 Task 2b unexpanded `$lens` shell-variable in acceptance criteria
- **ID:** plan-L-002
- **Fix:** Replace `$lens` placeholder with explicit per-file entries in acceptance criteria.

### O5. Inverse spike test deferred — see B2 fix
- **ID:** plan-I-002 (related to verify-C-001)
- **Fix:** Implement inverse test in Wave 0 as part of B2 fix.

---

## Coverage Summary

All 11 phase requirements (CRIT-01..10 + XCUT-03) remain covered by at least one plan. The findings are about HOW the plans verify those requirements, not whether they cover them. The phase scope is sound; the test design and a few specific cross-plan dependencies need refinement.

## Critic verdict roll-up

| Critic | Verdict | Top blocker |
|--------|---------|-------------|
| plan | CONDITIONAL ACCEPT | plan-C-003 (Plan 06 race) |
| scope | CONDITIONAL ACCEPT | scope-C-001 (SDK registry) |
| verify | CONDITIONAL ACCEPT | verify-C-001 (spike false-positive) |
| strategy | CONDITIONAL ACCEPT | strategy-W-001 (no fallback in ROADMAP) |

**Overall:** CONDITIONAL ACCEPT. 10 BLOCKING items must be addressed before execution. Several are 1-line fixes; the highest-cost are B2 (spike redesign + inverse test in Wave 0), B5 (fault-injection 3-part contract restructure), B6 (parity heuristic unit test), and B7 (FIXTURE_PHASE replacement). The aggregated fix budget is roughly +1 day of planning work to prevent multiple days of wasted execution.
