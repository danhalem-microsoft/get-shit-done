---
critique_type: plan
phase: "03"
reviewed_at: "2026-04-07"
status: warn
severity_counts:
  critical: 1
  warning: 4
  info: 3
reviewed_artifacts:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
executive_summary: "All 10 LIFE-* requirements are covered across 5 plans with sensible wave assignments and clear task decomposition. One critical finding: Plan 03-03 uses `init project-setup` and `switch` commands from Plan 03-02 but lists only 03-01 as a dependency, meaning both are wave 2 and could run in parallel despite 03-03 depending on 03-02's outputs. Four warnings address: (1) 03-04 Task 2 modifies new-project.md concurrently with 03-03's rewrite of the same file and provides insufficient guidance on where to insert decision logging into the new structure; (2) 03-01 claims LIFE-04 but only builds the infrastructure — the actual switch listing UX is in 03-02/03-04; (3) scope_path is instructed to be stored in config.json but has no downstream consumer and no test; (4) 03-05 tests `progress` instead of `debug` as the CONTEXT specified."
---

# Phase 03 Plan Critique

## Executive Summary

The five plans decompose Phase 3's project lifecycle commands into a logical dependency chain: core module changes (03-01) → CLI commands and dispatcher (03-02) + new-project workflow (03-03) → workflow files and decision logging (03-04) + integration tests (03-05). All 10 LIFE-* requirements are mapped to at least one plan. Tasks are generally specific and actionable with clear verification criteria.

However, one critical dependency error will cause execution failure: Plan 03-03 uses `init project-setup` and `gsd-tools.cjs switch`, both created in Plan 03-02, but only declares a dependency on 03-01. Since both are wave 2, they could execute in parallel, causing 03-03 to fail when the commands it calls don't exist yet.

**Status: WARN** — 1 critical dependency error must be fixed before execution. 4 warnings need attention.

---

## Findings

### CRITICAL Findings

#### plan-C01: Plan 03-03 has an undeclared dependency on Plan 03-02

**Description:** Plan 03-03 (new-project workflow rewrite) uses two artifacts created by Plan 03-02: the `init project-setup` dispatcher case and the `switch` CLI command. However, 03-03's frontmatter declares `depends_on: [03-01]` only. Both 03-02 and 03-03 are wave 2, meaning they can execute in parallel. If 03-03 executes first (or concurrently), the workflow it writes will reference commands that don't exist yet.

**Evidence:**
- 03-03-PLAN.md line 7: `depends_on: [03-01]`
- 03-03-PLAN.md line 116: `SETUP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init project-setup)` — `project-setup` is created in 03-02-PLAN.md Task 1 (line 157: `cmdInitProjectSetup(cwd, raw)`)
- 03-03-PLAN.md line 140: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" switch "${PROJECT_SLUG}"` — `switch` dispatcher case is created in 03-02-PLAN.md Task 2 (line 208)
- 03-02-PLAN.md artifacts (lines 25-33): explicitly lists `cmdInitSwitch` and `cmdInitProjectSetup` as provided artifacts
- 03-03-PLAN.md interfaces (lines 70-73): documents `gsd-tools.cjs init project-setup` and `gsd-tools.cjs switch` as available — but these come from Plan 02, not Plan 01

**Impact:** If execution proceeds with current wave assignments, 03-03 could be scheduled in parallel with 03-02. The new-project.md workflow would be written referencing `init project-setup` and `switch` commands that don't exist. The workflow would appear correct syntactically but would fail at runtime. Even if the executor happens to run 03-02 first, the wave assignment is formally incorrect.

**Recommendation:** Either:
- **Option A (preferred):** Add `03-02` to 03-03's `depends_on` and move 03-03 to wave 3 (alongside 03-04 and 03-05). This makes the dependency explicit.
- **Option B:** Keep wave 2 but add `03-02` to `depends_on`. The execute-phase orchestrator handles intra-wave dependencies by sequencing within the wave.

**Severity justification:** Critical — this is a dependency error that will cause execution failure or produce a broken artifact if plans execute in parallel.

---

### WARNING Findings

#### plan-W01: Plan 03-04 modifies new-project.md that Plan 03-03 rewrites — file contention with insufficient merge guidance

**Description:** Plan 03-03 Task 1 completely rewrites `get-shit-done/workflows/new-project.md` with the two-step bootstrap pattern. Plan 03-04 Task 2 then adds decision logging (`log-decision-init` and `log-decision` calls) to the same file. While 03-04 correctly depends on 03-03, the decision logging instructions in 03-04 say "Wire AFTER the project name step (Step 1 of bootstrap)" — but this references 03-03's new structure using terminology from CONTEXT.md, not from 03-03's actual output. The executor of 03-04 must understand 03-03's new workflow structure to insert logging in the right place.

**Evidence:**
- 03-03-PLAN.md line 9: `files_modified: [get-shit-done/workflows/new-project.md, ...]`
- 03-04-PLAN.md line 16: `files_modified: [... get-shit-done/workflows/new-project.md, ...]`
- 03-04-PLAN.md line 232: `"new-project.md — Same pattern but with --workflow new-project. Wire AFTER the project name step (Step 1 of bootstrap), using the phase as 'setup'."`
- 03-04-PLAN.md context (line 82): `@get-shit-done/workflows/new-project.md` — executor reads the file, but no mention of 03-03-SUMMARY.md to understand what changed

**Impact:** Low-medium. The executor should be able to figure it out since it reads the actual file. But the instructions reference "Step 1 of bootstrap" which is 03-03's internal naming, not a formally documented interface. If 03-03 changes the structure during execution (within Claude's discretion), the 03-04 instructions may not match.

**Recommendation:** Add `@.planning/phases/03-project-lifecycle-commands/03-03-SUMMARY.md` to 03-04's context so the executor knows what 03-03 actually produced. This is already partially there (03-04 lists `03-02-SUMMARY.md` but not `03-03-SUMMARY.md`).

---

#### plan-W02: LIFE-04 requirement attribution is split across plans without a clear owner

**Description:** LIFE-04 ("switch without args lists user's projects with status summary") is claimed by Plan 03-01 in its frontmatter (`requirements: [LIFE-04, LIFE-05, LIFE-06]`). But Plan 03-01 only builds the `listProjects()` infrastructure (returns structured data). The actual CLI command that lists projects without args is in Plan 03-02 (`cmdInitSwitch` with no arg → listing mode), and the user-facing workflow that formats the numbered list is in Plan 03-04 (`switch.md` workflow). Plan 03-01 contributes to LIFE-04 but doesn't satisfy it alone.

**Evidence:**
- 03-01-PLAN.md line 13: `requirements: [LIFE-04, LIFE-05, LIFE-06]`
- REQUIREMENTS.md line 42: `LIFE-04: /gsd:switch without arguments lists the current user's projects with status summary and lets user choose`
- 03-01-PLAN.md tasks: builds `listProjects()` structured return — this is infrastructure, not the command
- 03-02-PLAN.md line 13: `requirements: [LIFE-03, LIFE-04, LIFE-09]` — also claims LIFE-04
- 03-04-PLAN.md: creates `switch.md` workflow that displays the listing UX — doesn't claim LIFE-04

**Impact:** If verification checks whether LIFE-04 is "done" after Plan 03-01, it would incorrectly pass — `listProjects()` returns data but there's no user-facing command yet. The requirement is partially satisfied across three plans.

**Recommendation:** Remove LIFE-04 from 03-01's `requirements` list. It should be attributed to 03-02 (which creates the command) and/or 03-04 (which creates the UX workflow). 03-01 contributes infrastructure but doesn't independently satisfy the requirement.

---

#### plan-W03: scope_path is stored but untested and has no consumer

**Description:** Plan 03-03 Task 1 instructs the workflow to ask for a monorepo subdirectory/Bazel target scope and store it as `scope_path` in the project's config.json. However, no plan tests that `scope_path` is correctly stored, no command reads it, and CONTEXT.md itself acknowledges it's "informational metadata for now — no downstream consumer yet." The scope critique (scope-W02) flagged this; the CONTEXT resolution says it's intentionally informational. But the plans include the implementation work (prompt + config write) without any verification that it works.

**Evidence:**
- 03-03-PLAN.md line 129: `"Which monorepo subdirectory or Bazel target is this project scoped to? (press Enter to skip)"`
- 03-03-PLAN.md line 137: `"If scope was provided, add scope_path to the project config.json"`
- 03-03-PLAN.md Task 2 line 180: `cmdInitNewProject` adds `scope_path` field to output
- 03-CONTEXT.md line 26: `"This is informational metadata for now — no downstream consumer yet"`
- No test in any plan verifies `scope_path` is stored correctly

**Impact:** Low. It's a small amount of work (one prompt, one config write). But it's dead data with no test — if the implementation is wrong, nothing will catch it until Phase 4+ tries to use it.

**Recommendation:** Either add a minimal test in 03-03 Task 2 (verify `scope_path` appears in the cmdInitNewProject output) or explicitly note it as untested informational metadata in the done criteria.

---

#### plan-W04: Integration tests (03-05) test `progress` instead of `debug` as CONTEXT.md specified

**Description:** CONTEXT.md specifies targeted integration tests for "5-6 highest-risk commands: execute-phase, plan-phase, verify-work, discuss-phase, quick, debug." Plan 03-05 tests 6 commands but substitutes `progress` for `debug`. While `progress` is arguably more important (it's being modified in this phase), the CONTEXT.md decision was explicit about `debug`.

**Evidence:**
- 03-CONTEXT.md line 48: `"5-6 highest-risk commands: execute-phase, plan-phase, verify-work, discuss-phase, quick, debug"`
- 03-05-PLAN.md lines 14-19: tests execute-phase, plan-phase, verify-work, discuss-phase, quick, progress
- `debug` is not mentioned anywhere in 03-05-PLAN.md

**Impact:** Low. Both `progress` and `debug` are reasonable choices. `progress` is being actively modified in this phase (03-04 enhances it), making it a sensible inclusion. But the CONTEXT.md locked decision listed `debug`, and deviating without explanation weakens the CONTEXT-to-plan traceability.

**Recommendation:** Either test 7 commands (add both `debug` and `progress`) or document why `progress` was substituted for `debug` in the plan's objective. The CONTEXT.md decision says "5-6" so testing 7 is within bounds.

---

### INFO Findings

#### plan-I01: Wave assignments are sensible and internally consistent

**Description:** The wave structure is well-designed:
- Wave 1: 03-01 (core module changes — no dependencies)
- Wave 2: 03-02, 03-03 (CLI commands and workflow — depend on 03-01)
- Wave 3: 03-04, 03-05 (workflow files and integration tests — depend on 03-02/03-03)

This correctly serializes the dependency chain: infrastructure → commands → UX/tests. The only issue (plan-C01) is that 03-03 should also depend on 03-02 within wave 2.

**Evidence:** All plan frontmatter `wave` and `depends_on` fields cross-referenced.

---

#### plan-I02: Prior critique findings are well-addressed in plans

**Description:** The scope critique (CRITIQUE-scope.md) raised 2 critical findings. Both were resolved in the updated CONTEXT.md:
- scope-C01 (decision logging scope creep) → resolved by adding LIFE-10 to REQUIREMENTS.md; 03-04 covers it
- scope-C02 (restore-project scope creep) → resolved by expanding LIFE-09 to include restore; 03-02 covers it

The discussion critique (CRITIQUE-discuss.md) raised 2 critical and 4 warning findings. All are addressed:
- discuss-C01 (listProjects not exported) → 03-01 Task 1 redesigns and exports it
- discuss-C02 (loadConfig doesn't layer) → 03-01 Task 2 rebuilds it from scratch
- discuss-W02 (new-project bootstrap) → 03-03 implements two-step bootstrap
- discuss-W03 (zero-project handling) → 03-01 implements null return in resolveContext
- discuss-W04 (command audit scope) → 03-05 implements targeted tests for 6 commands

**Evidence:** CONTEXT.md header: "7 critic blind spots addressed"

---

#### plan-I03: Task decomposition is appropriately sized

**Description:** Plans have 1-3 tasks each, consistent with the project's established pattern of 2-3 tasks per plan. Each task has clear `<behavior>`, `<action>`, `<verify>`, and `<done>` sections. TDD tasks are marked with `tdd="true"`. The one human verification gate (03-03 Task 3) is correctly marked as `checkpoint:human-verify` with a blocking gate.

---

## Requirements Coverage Matrix

| Requirement | Plan(s) | Coverage Quality | Notes |
|-------------|---------|-----------------|-------|
| LIFE-01 | 03-03 | ✅ Full | new-project creates under user-qualified path |
| LIFE-02 | 03-03 | ✅ Full | Project name asked upfront via two-step bootstrap |
| LIFE-03 | 03-02 | ✅ Full | switch with args via cmdInitSwitch |
| LIFE-04 | 03-01, 03-02, 03-04 | ⚠️ Split | Infrastructure (01), command (02), UX (04) — see plan-W02 |
| LIFE-05 | 03-01 | ✅ Full | resolveContext auto-select for single project |
| LIFE-06 | 03-01 | ✅ Full | loadConfig two-file merge with source tracking |
| LIFE-07 | 03-04 | ✅ Full | progress.md context header + no-project handling |
| LIFE-08 | 03-05 | ✅ Full | Integration tests for 6 commands × 3 resolution methods |
| LIFE-09 | 03-02 | ✅ Full | Archive to _archived/, restore, exclude from listings |
| LIFE-10 | 03-04 | ✅ Full | Decision logging wired into 4 workflows |

**Coverage: 10/10 LIFE requirements mapped. All addressed.**

## Dependency Graph Validation

```
Wave 1: 03-01 (no deps)
          ↓
Wave 2: 03-02 (depends: 03-01) ← 03-03 should depend on this too (plan-C01)
        03-03 (depends: 03-01, MISSING: 03-02)
          ↓
Wave 3: 03-04 (depends: 03-02, 03-03) ✅
        03-05 (depends: 03-01, 03-02) ✅
```

## CONTEXT.md Locked Decision Compliance

| Locked Decision | Plan Coverage | Status |
|----------------|---------------|--------|
| Project name asked upfront | 03-03 Task 1 Step 1 | ✅ |
| Slugify + confirm | 03-03 Task 1 Step 1 | ✅ |
| Always multi-user path | 03-03 Task 1 (no special-casing) | ✅ |
| List + confirm existing projects | 03-03 Task 1 Step 1 | ✅ |
| Auto-switch to new project | 03-03 Task 1 Step 3 | ✅ |
| Block duplicate names | 03-03 Task 1 Step 1 | ✅ |
| Copy global defaults to config | 03-03 Task 1 Step 3 | ✅ |
| Ask scope during creation | 03-03 Task 1 Step 2 | ✅ |
| Two-step workflow bootstrap | 03-03 Task 1 | ✅ |
| Flexible match for switch | 03-02 Task 1 | ✅ |
| Numbered list for switch (no args) | 03-04 Task 1 | ✅ |
| Status fields in listing | 03-01 Task 1 (listProjects) | ✅ |
| Runtime auto-select | 03-01 Task 1 (resolveContext) | ✅ |
| Context header in progress | 03-04 Task 2 Part A | ✅ |
| No active project → list + prompt | 03-04 Task 2 Part A | ✅ |
| resolveContext returns null for 0 projects | 03-01 Task 1 | ✅ |
| Targeted integration tests (5-6 commands) | 03-05 Task 1 | ⚠️ See plan-W04 |
| loadConfig merge with source tracking | 03-01 Task 2 | ✅ |
| loadConfig full rebuild | 03-01 Task 2 | ✅ |
| Move directory for archival | 03-02 Task 1 | ✅ |
| Clear + auto-select on archive active | 03-02 Task 1 | ✅ |
| Decision logging as LIFE-10 | 03-04 Task 2 Part B | ✅ |
| Restore command | 03-02 Task 1 | ✅ |

**All locked decisions are addressed by plans. No contradictions found.**

---

## Recommendations

### Priority 1 (Must fix before execution):

1. **plan-C01:** Fix 03-03's dependency to include 03-02. Either move 03-03 to wave 3, or add 03-02 to `depends_on` and keep wave 2 (forcing sequential execution within the wave).

### Priority 2 (Should fix):

2. **plan-W01:** Add `03-03-SUMMARY.md` to 03-04's `@context` block so the executor understands the rewritten new-project.md structure before adding decision logging to it.

3. **plan-W02:** Remove LIFE-04 from 03-01's requirements list. The infrastructure contribution is real but doesn't independently satisfy the requirement.

### Priority 3 (Nice to have):

4. **plan-W03:** Add a minimal verification for `scope_path` in 03-03 or note it as untested.

5. **plan-W04:** Add `debug` to the integration test list in 03-05, or document the substitution.

---

## Conclusion

The plans are well-structured with clear, actionable tasks and good traceability to requirements and CONTEXT.md locked decisions. The critical dependency error (plan-C01) is a straightforward fix — add 03-02 to 03-03's dependencies. With that fixed, the five plans form a sound execution plan that should deliver all 10 LIFE-* requirements.

**Final Status: WARN — Fix 1 critical dependency error before /gsd:execute-phase**

---

*Critique completed: 2026-04-07*
*Reviewer: Plan quality analysis*
*Next step: Fix plan-C01 dependency, then proceed to /gsd:execute-phase*
