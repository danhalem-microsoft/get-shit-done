---
critique_type: plan
phase: "04"
reviewed_at: "2026-04-07"
status: pass_with_conditions
severity_counts:
  critical: 1
  warning: 3
  info: 2
reviewed_artifacts:
  - 04-01-PLAN.md
  - 04-02-PLAN.md
  - 04-03-PLAN.md
executive_summary: "Phase 4 plans successfully address the 2 critical fixes from discuss critique: (1) plan-C01 FIXED—env var override loop now runs AFTER normalization in Plan 04-01, preventing config file values from clobbering env vars; (2) plan-C02 FIXED—migration handles missing PROJECT.md gracefully with --project-name flag and needs_project_name output in Plan 04-03. One critical new issue: Plan 04-03's migration plan contradicts REQUIREMENTS.md 'Out of Scope' (same issue from discuss-C03, not fixed). Three warnings: PATH-13 fix approach in Plan 04-03 needs cmdInitProjectSetup modification but doesn't list init.cjs in files_modified; Plan 04-01 env var type coercion has subtle edge case with numeric strings; Plan 04-02 team-status relative time formatting duplicates effort. Two info findings on discretion areas handled well."
---

# Phase 04 Plan Critique

## Verification of Critical Fixes from Previous Critique

### plan-C01: ✅ FIXED — Env var override loop now runs AFTER normalization

**Status:** Successfully addressed in Plan 04-01

**Original Issue (discuss-C01):** The context didn't specify whether env var overrides should run before or after the parallelization normalization and model_overrides merge. If env vars ran before normalization, config file values could clobber the env var settings.

**Fix Verification:**
- Plan 04-01, Task 1, action step 2 explicitly states: "Place this block AFTER the `result._sources = sources;` line (just before `return result;`)"
- The plan includes a CRITICAL note (lines 133-157): "The env var loop MUST go AFTER the parallelization normalization block and model_overrides merge — NOT before them."
- The sequence is clearly defined:
  1. Merge defaults → global config → per-project config
  2. Run all normalization blocks (parallelization, model_overrides)
  3. Apply env var overrides LAST (highest priority, already self-parsed)
- Rationale provided: "Config file values (which may be strings like `"false"`) get normalized by the existing blocks. Env var values override the already-normalized result with their own self-parsed types."

**Evidence:**
- 04-01-PLAN.md lines 129-157 (step 2 of Task 1)
- Explicit ordering: normalize first, then env vars
- Comment in code snippet: "Applied AFTER normalization so env vars always win and don't get re-normalized"

**Conclusion:** This fix is correct and well-documented. The env var layer will properly override normalized config values.

---

### plan-C02: ✅ FIXED — Migration handles missing PROJECT.md gracefully

**Status:** Successfully addressed in Plan 04-03

**Original Issue (discuss-C02 was about STATE.md schema, but the migration chicken-and-egg was implied):** The migration flow needs to handle cases where PROJECT.md is missing or unreadable, which creates a chicken-and-egg: can't migrate without knowing the project name, but PROJECT.md might not exist in legacy structures.

**Fix Verification:**
- Plan 04-03, Task 2, behavior tests include:
  - "Test: cmdMigrate with missing PROJECT.md in non-auto mode returns { needs_project_name: true } in output"
  - "Test: cmdMigrate with missing PROJECT.md in auto mode returns error with clear message asking for --project-name flag"
  - "Test: cmdMigrate with --project-name flag uses provided name instead of reading PROJECT.md"
- Action step 3 explicitly handles all cases (lines 237-250):
  - If PROJECT.md missing AND no override AND auto mode → error with "--project-name" message
  - If PROJECT.md missing AND no override AND non-auto mode → include `needs_project_name: true` in JSON
  - If PROJECT.md missing BUT override provided → proceed normally with override name
- The `projectNameOverride` parameter is added to cmdMigrate signature and wired through dispatcher (lines 268-275)

**Evidence:**
- 04-03-PLAN.md lines 216-219 (behavior tests)
- 04-03-PLAN.md lines 237-250 (action step 3 in Task 2)
- 04-03-PLAN.md lines 268-275 (dispatcher wiring for --project-name flag)

**Conclusion:** This fix is correct and comprehensive. The migration flow provides clear user guidance and a workaround when PROJECT.md is unavailable.

---

## Critical Findings

### plan-C01: Migration feature contradicts REQUIREMENTS.md Out of Scope (UNRESOLVED from discuss-C03)

**Description:** Plan 04-03 implements a full migration flow from old flat `.planning/` structure to multi-user structure (Task 2, lines 208-296). However, REQUIREMENTS.md line 80 explicitly lists "Migration from old `.planning/` structure" in the "Out of Scope" table with rationale: "Old structure fundamentally incompatible; clean break is simpler and clearer."

This is the SAME critical issue raised in discuss-C03. The discuss critique identified this contradiction, but the plans were revised WITHOUT resolving it. The migration feature remains in Plan 04-03, and REQUIREMENTS.md has not been updated.

**Impact on Plans:**
1. Task 2 of Plan 04-03 dedicates significant effort to migration (cmdMigrate implementation, tests, error handling, --project-name flag)
2. The plan states "Update REQUIREMENTS.md" in action step 7 (line 290-292), but this is INSIDE the task — not a prerequisite
3. If migration is truly out of scope, this entire task should be removed, saving significant phase budget
4. If migration is NOW in scope (user decision), REQUIREMENTS.md must be updated BEFORE executing Plan 04-03

**Context from discuss-phase:**
- 04-CONTEXT.md lines 48-53 explicitly states: "REQUIREMENTS.md originally listed migration as 'Out of Scope' with rationale 'clean break is simpler.' User has now decided migration IS in scope for Phase 4. REQUIREMENTS.md should be updated to reflect this change."
- This indicates a user decision to override the original requirements

**Recommended Resolution:**
1. Update REQUIREMENTS.md FIRST (before executing Plan 04-03) to:
   - Remove migration from "Out of Scope" table
   - Add a note explaining the scope change: "Migration was added to scope for Phase 4 per user decision 2026-04-07"
2. OR: Remove Task 2 from Plan 04-03 entirely if migration is not actually desired
3. The current plan has the update INSIDE the task (step 7), which means the plan contradicts requirements until that step executes

**Evidence:**
- REQUIREMENTS.md line 80: "Migration from old `.planning/` structure | Out of Scope | Old structure fundamentally incompatible; clean break is simpler and clearer"
- 04-03-PLAN.md lines 208-296: Full migration implementation (Task 2)
- 04-CONTEXT.md lines 48-53: "User has now decided migration IS in scope for Phase 4. REQUIREMENTS.md should be updated to reflect this change."
- 04-03-PLAN.md lines 290-292: "Update REQUIREMENTS.md" as action step 7 within Task 2

**Severity justification:** Critical — The plan contradicts the documented requirements. This creates confusion about project scope and wastes effort if migration is not actually desired. However, since CONTEXT.md explicitly states the user decided to add migration to scope, the fix is straightforward: update REQUIREMENTS.md before executing the plan (make it a prerequisite, not an in-task step).

**Recommended Change:** Add a Task 0 to Plan 04-03 that ONLY updates REQUIREMENTS.md to remove migration from Out of Scope, and make Task 2 depend on Task 0. OR update REQUIREMENTS.md manually before starting Plan 04-03 execution.

---

## Warning Findings

### plan-W01: PATH-13 fix modifies cmdInitProjectSetup but doesn't list init.cjs in files_modified

**Description:** Plan 04-03, Task 3 fixes the PATH-13 bootstrap violation by adding a `bootstrap_path` field to `cmdInitProjectSetup` output (action step 3a, lines 324-329). The plan states:

> "In `get-shit-done/bin/lib/init.cjs`, modify `cmdInitProjectSetup` to include `bootstrap_path` in its output."

However, the frontmatter's `files_modified` list (lines 8-17) does NOT include `get-shit-done/bin/lib/init.cjs`. It lists:
- get-shit-done/bin/lib/commands.cjs
- get-shit-done/bin/lib/core.cjs
- get-shit-done/bin/gsd-tools.cjs
- get-shit-done/workflows/new-project.md
- tests/commands.test.cjs
- tests/migration.test.cjs
- tests/audit-paths.test.cjs
- .planning/REQUIREMENTS.md

**Impact:**
1. The must_haves don't include verification that init.cjs was modified
2. The plan's dependencies don't account for changes to init.cjs
3. Verification steps don't test the bootstrap_path field output

**Evidence:**
- 04-03-PLAN.md lines 8-17: files_modified list
- 04-03-PLAN.md lines 324-329: "In `get-shit-done/bin/lib/init.cjs`, modify `cmdInitProjectSetup`"
- Plan 04-02 lines 8-12: files_modified DOES list init.cjs for cmdInitTeamStatus changes (correct pattern)

**Severity justification:** Warning — The implementation will likely work (the executor will modify init.cjs as instructed), but the plan's frontmatter is incomplete. This could cause confusion during verification and doesn't follow the pattern from Plan 04-02 where init.cjs IS listed when modified.

**Recommended Fix:** Add `get-shit-done/bin/lib/init.cjs` to the files_modified list in Plan 04-03 frontmatter.

---

### plan-W02: Env var type coercion has edge case with numeric strings that aren't integers

**Description:** Plan 04-01, Task 1, step 2 defines type coercion for env var values (lines 143-149):

```javascript
if (envVal === 'true') result[key] = true;
else if (envVal === 'false') result[key] = false;
else if (/^\d+$/.test(envVal)) result[key] = parseInt(envVal, 10);
else result[key] = envVal;
```

The regex `/^\d+$/` matches only integers (e.g., "5", "100"), but some config values might be decimal numbers. For example:
- `GSD_SOME_THRESHOLD=0.75` would NOT match the regex, so it would be stored as string `"0.75"` instead of number `0.75`
- `GSD_SOME_RATIO=1.5` would be string `"1.5"`

**Current config.json values:**
Looking at the config schema in the interfaces section, all numeric config values appear to be booleans (commit_docs, search_gitignored, research, plan_checker, verifier, nyquist_validation, parallelization, brave_search). No floating-point numbers.

**Impact:**
- **Low for current config:** All existing numeric values are booleans, so this doesn't affect v1
- **Medium for future extensibility:** If future phases add decimal config values (e.g., `timeout_multiplier: 1.5`), they would need to be parsed manually or the regex needs updating

**Evidence:**
- 04-01-PLAN.md lines 143-149: type coercion logic
- core.cjs (from interfaces): config schema has only booleans and strings, no decimals

**Severity justification:** Warning — Not a problem for current implementation (all config values are booleans/strings), but the comment "Parse booleans and numbers from string env values" (line 142) is slightly misleading since it only parses integers, not all numbers. This could bite future development.

**Recommended Fix (optional):** Either:
1. Update comment to say "Parse booleans and integers" (accurate)
2. OR expand regex to support decimals: `/^-?\d+(\.\d+)?$/` and use `parseFloat()` instead of `parseInt()`

---

### plan-W03: Team-status relative time formatting duplicates effort in Plan 04-02

**Description:** Plan 04-02, Task 1, action step 4 instructs the executor to implement relative time formatting for `last_active`:

> "Format last_active as relative time (e.g., '2 hours ago', '3 days ago') using a simple helper — compute diff from `new Date()` minus `new Date(last_active)`. Use: 'just now' (<1min), 'X minutes ago', 'X hours ago', 'X days ago', 'X weeks ago'. Return '(unknown)' if null."

This is duplicating functionality that may already exist or could be a shared helper. The plan doesn't:
1. Check if a relative time formatter already exists in the codebase
2. Extract the formatter to a shared utility (e.g., in core.cjs or commands.cjs)
3. Consider reusability for other commands that might need relative time display

**Impact:**
- **Low:** The implementation will work fine; it's just not DRY
- **Medium for future:** If other commands need relative time formatting (e.g., `/gsd:progress` showing "Last session: 3 hours ago"), they'll need to reimplement the same logic

**Evidence:**
- 04-02-PLAN.md lines 197-200: inline relative time formatting instructions
- No mention of a shared utility or checking for existing helpers

**Severity justification:** Warning — Not a functional issue, just a code organization concern. The plan doesn't violate any requirements, but extracting this to a shared helper would improve maintainability.

**Recommended Fix (optional):** Add a note to extract relative time formatting to a shared helper function (e.g., `formatRelativeTime(isoDate)` in core.cjs or commands.cjs) so other commands can reuse it.

---

## Info Findings

### plan-I01: Plan 04-01 ENV_KEY_MAP has good coverage of commonly-used config keys

**Description:** Plan 04-01, Task 1, step 1 defines the ENV_KEY_MAP with 9 config keys:

```javascript
const ENV_KEY_MAP = {
  model_profile: 'GSD_MODEL_PROFILE',
  commit_docs: 'GSD_COMMIT_DOCS',
  parallelization: 'GSD_PARALLELIZATION',
  granularity: 'GSD_GRANULARITY',
  brave_search: 'GSD_BRAVE_SEARCH',
  research: 'GSD_RESEARCH',
  plan_checker: 'GSD_PLAN_CHECKER',
  verifier: 'GSD_VERIFIER',
  nyquist_validation: 'GSD_NYQUIST_VALIDATION',
};
```

This addresses discuss-W01's concern about "which keys get GSD_* support?" The selection includes:
- Core workflow toggles: research, plan_checker, verifier, nyquist_validation
- Execution settings: parallelization, commit_docs
- Optional features: brave_search
- Model profile override: model_profile

**Missing keys (not in ENV_KEY_MAP):**
- `search_gitignored` (probably fine — rarely overridden via env var)
- `branching_strategy` (makes sense — not a simple override)
- `phase_branch_template` / `milestone_branch_template` (templates are complex, env var override less useful)
- `model_overrides` (complex object, env var override would be awkward)

**Assessment:** The selection is well-reasoned. The 9 keys covered are exactly the ones most likely to need CI/CD or scripting overrides (toggle features on/off, change parallelization, override model profile).

**Evidence:**
- 04-01-PLAN.md lines 114-124: ENV_KEY_MAP definition
- Config schema from core.cjs (defaults object): 12 total keys, 9 mapped to env vars

**Severity justification:** Info — This is a positive finding. The plan made good discretionary choices for which keys to support. No action needed.

---

### plan-I02: Plan 04-03 commit attribution approach (file path heuristic) is clean and correct

**Description:** Plan 04-03, Task 1 implements commit attribution using a file path heuristic (lines 166-180):

```javascript
// Check if this is a planning commit by examining staged files
const stagedResult = execGit(cwd, ['diff', '--cached', '--name-only']);
const stagedFiles = stagedResult.exitCode === 0 ? stagedResult.stdout.trim() : '';
const isPlanningCommit = stagedFiles.split('\n').some(f => f.includes('.planning/'));

if (isPlanningCommit) {
  // Apply user/project prefix
}
```

This addresses discuss-W04's concern about "how to distinguish planning commits from code commits." The approach:
1. Checks which files are staged (`git diff --cached --name-only`)
2. If ANY staged file path contains `.planning/`, it's a planning commit
3. Only planning commits get the user/project prefix

**Advantages:**
- Simple and reliable: file path is objective
- No caller changes needed: `cmdCommit()` auto-detects
- Correct behavior: code commits (src/api/routes.ts) won't have `.planning/` in path

**Edge cases handled:**
- Line 200: "IMPORTANT: tryGetPlanningContext call may encounter legacy detection. Wrap in try/catch, fallback to no attribution."
- Line 155: "Already-prefixed 'docs(dan/frontend/phase-03): msg' is NOT double-prefixed"

**Evidence:**
- 04-03-PLAN.md lines 161-180: implementation logic
- 04-03-PLAN.md lines 149-156: behavior tests for edge cases

**Severity justification:** Info — This is a positive finding. The plan's approach is well-designed and handles edge cases properly. No action needed.

---

## Contradiction Check

### Internal Contradictions

**None found.** The three plans are internally consistent:
- Plan 04-01 (config env vars) doesn't conflict with 04-02 (team-status) or 04-03 (attribution/migration)
- Plan 04-02 (team-status) doesn't depend on 04-03's changes
- Plan 04-03 Wave 2 dependency on 04-01 and 04-02 makes sense (commit attribution uses tryGetPlanningContext, which might encounter legacy detection handled in Task 2)

### Cross-Phase Contradictions

**Migration vs. Requirements (plan-C01):** As noted above, Plan 04-03 implements migration despite REQUIREMENTS.md listing it as Out of Scope. However, CONTEXT.md explicitly states the user decided to add migration to scope, so this is a requirements documentation lag, not a plan error.

### Execution Order Issues

**Plan 04-03 Wave 2 dependency is correct:** The plan lists `depends_on: [04-01, 04-02]` because:
1. Commit attribution (Task 1) calls `tryGetPlanningContext()`, which is modified in Task 2 for migration support
2. If Tasks 1 and 2 ran in parallel, Task 1 might encounter legacy detection before Task 2 implements the migration flow
3. The IMPORTANT note on line 200 ("tryGetPlanningContext call may encounter legacy detection") shows the planner is aware of this

**No issues found.**

---

## Plan Completeness Check

### Requirements Coverage

| Requirement | Plan Coverage | Evidence |
|-------------|---------------|----------|
| TEAM-04 (4-tier config precedence) | ✅ Plan 04-01 Task 1 | ENV_KEY_MAP, env var override loop after normalization |
| TEAM-05 (config resolve debug command) | ✅ Plan 04-01 Task 1 + Task 2 | cmdConfigResolve implementation, dispatcher wiring |
| TEAM-01 (team-status cross-user scanning) | ✅ Plan 04-02 Task 1 | scanAllUsers(), cmdTeamStatus() |
| TEAM-02 (STATE.md frontmatter only) | ✅ Plan 04-02 Task 1 | Uses extractFrontmatter(), never parses body |
| TEAM-03 (cross-user read scope) | ✅ Plan 04-02 Task 1 | scanAllUsers() is read-only, no modifications |
| TEAM-06 (git commit attribution) | ✅ Plan 04-03 Task 1 | cmdCommit modification with file path heuristic |
| PATH-13 (zero raw .planning/ refs) | ✅ Plan 04-03 Task 3 | bootstrap_path from cmdInitProjectSetup, audit verification |
| Migration (new scope) | ✅ Plan 04-03 Task 2 | cmdMigrate, --project-name flag, graceful fallback |

**All 6 TEAM requirements + PATH-13 + Migration are covered.**

### Must-Haves Verification

**Plan 04-01 must_haves:**
- ✅ Truths cover env var override behavior, precedence, type coercion
- ✅ Artifacts specify core.cjs (loadConfig + ENV_KEY_MAP), gsd-tools.cjs (dispatcher), tests
- ✅ Key_links map the data flow correctly (loadConfig → process.env via ENV_KEY_MAP)

**Plan 04-02 must_haves:**
- ✅ Truths cover team-status output, STATE.md frontmatter parsing, graceful error handling
- ✅ Artifacts list all 7 files (context.cjs, commands.cjs, init.cjs, gsd-tools.cjs, workflows, tests)
- ✅ Key_links show scanAllUsers → extractFrontmatter → cmdTeamStatus chain

**Plan 04-03 must_haves:**
- ✅ Truths cover commit attribution auto-detect, migration behavior, PATH-13 audit pass
- ⚠️ Artifacts list missing init.cjs (see plan-W01)
- ✅ Key_links show cmdCommit → tryGetPlanningContext → legacy_detected → cmdMigrate flow

### Test Coverage

**Plan 04-01 tests:**
- ✅ 10 behavior tests for loadConfig env var overrides (lines 101-111)
- ✅ Tests cover type coercion, precedence, _sources tracking, unknown keys
- ✅ Tests for cmdConfigResolve output format

**Plan 04-02 tests:**
- ✅ 11 behavior tests for scanAllUsers and cmdTeamStatus (lines 156-167)
- ✅ Tests cover cross-user scenarios, missing STATE.md, corrupt frontmatter, permission errors (implicit in graceful handling)

**Plan 04-03 tests:**
- ✅ 6 behavior tests for commit attribution (lines 149-156)
- ✅ 11 behavior tests for migration (lines 211-221), including missing PROJECT.md edge cases
- ✅ PATH-13 audit test verification

**Total: 38 behavior tests across 3 plans.** Coverage is comprehensive.

---

## Risk Assessment

### High Risk Items

1. **Migration feature scope ambiguity (plan-C01):** If REQUIREMENTS.md is not updated before execution, confusion about whether migration should be implemented.
   - **Mitigation:** Update REQUIREMENTS.md before executing Plan 04-03 (make it a prerequisite).

2. **cmdInitProjectSetup modification not in files_modified (plan-W01):** Executor might modify init.cjs but frontmatter doesn't track it.
   - **Mitigation:** Add init.cjs to Plan 04-03 files_modified list.

### Medium Risk Items

1. **Type coercion edge case (plan-W02):** Future config values with decimals won't parse correctly.
   - **Mitigation:** Document limitation or expand regex to support floats.

2. **Relative time formatting duplication (plan-W03):** Not DRY, but low impact.
   - **Mitigation:** Optional — extract to shared helper.

### Low Risk Items

1. **Cross-user permission errors:** Plan 04-02 handles with try/catch and "(no data)" fallback (good).
2. **Migration partial failure:** Plan 04-03 uses copy-then-delete pattern (lines 252-256), which is safe.
3. **Commit attribution double-prefixing:** Plan 04-03 explicitly checks for existing prefix (line 174).

**Overall risk: Low-Medium.** The critical issue (plan-C01) is a documentation/process issue, not a technical risk. The plans are well-designed.

---

## Summary

### Critical Fixes Verification

✅ **plan-C01 (env var override timing):** FIXED in Plan 04-01. Env vars now run AFTER normalization.
✅ **plan-C02 (migration PROJECT.md handling):** FIXED in Plan 04-03. Missing PROJECT.md handled gracefully with --project-name flag.

### New Critical Issues

❌ **plan-C01 (migration vs. requirements):** Plan 04-03 implements migration despite REQUIREMENTS.md listing it as Out of Scope. CONTEXT.md indicates user decided to add migration to scope, so REQUIREMENTS.md must be updated BEFORE executing Plan 04-03.

### Warnings (3)

⚠️ **plan-W01:** init.cjs not in Plan 04-03 files_modified list
⚠️ **plan-W02:** Env var type coercion only handles integers, not decimals (low impact)
⚠️ **plan-W03:** Relative time formatting not extracted to shared helper (code organization)

### Info (2)

ℹ️ **plan-I01:** ENV_KEY_MAP has good coverage of commonly-used config keys
ℹ️ **plan-I02:** Commit attribution file path heuristic is clean and correct

### Overall Assessment

**Status: PASS WITH CONDITIONS**

The plans successfully address the 2 critical fixes from the discuss critique. However, one critical issue remains: the migration feature contradicts REQUIREMENTS.md "Out of Scope" status. The CONTEXT.md explicitly states the user decided to add migration to scope, so the fix is straightforward: update REQUIREMENTS.md before executing Plan 04-03.

With that prerequisite addressed, the plans are well-designed, comprehensive, and ready for execution. Test coverage is strong (38 behavior tests), risk mitigation is appropriate, and the technical approach is sound.

**Recommendation:** Update REQUIREMENTS.md to remove migration from "Out of Scope" before starting Plan 04-03 execution. Consider adding init.cjs to Plan 04-03 files_modified list for completeness.

---

*Critique generated: 2026-04-07*
*Reviewer: gsd-critic-plan*
*Artifacts reviewed: 04-01-PLAN.md, 04-02-PLAN.md, 04-03-PLAN.md, REQUIREMENTS.md, 04-CONTEXT.md*
