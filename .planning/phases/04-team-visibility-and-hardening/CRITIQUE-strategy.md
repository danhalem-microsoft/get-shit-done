---
critique_type: strategy
milestone: v1.0
reviewed_at: "2026-04-07"
status: warn
severity_counts:
  critical: 2
  warning: 4
  info: 3
reviewed_artifacts:
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/STATE.md
  - All phase CONTEXT.md files (01-04)
  - All phase SUMMARY.md files (16 plans)
  - Selected CRITIQUE files
executive_summary: "Milestone v1.0 delivered all 36 requirements across 16 plans in 4 phases. Strategic analysis reveals 2 critical issues: (1) Scope creep via requirements drift—migration explicitly moved from 'Out of Scope' to delivered in Phase 4 without formal roadmap update, violating the planning contract; (2) Deferred enforcement failure—the PATH-13 bootstrap violation was 'fixed' by adding a new init output field rather than enforcing the no-raw-paths principle, creating a maintenance trap. Four warnings identify stale assumptions around CI/CD detection, config layering complexity, test coverage gaps, and the decision logging restoration. Three informational findings note positive patterns: excellent phase-critic feedback loops, TDD discipline, and appropriate use of deprecation over breaking changes."
---

# Milestone v1.0 Strategy Critique

**Reviewed:** 2026-04-07  
**Scope:** All 4 phases, 16 plans, 36 requirements  
**Focus:** Scope creep, stale assumptions, deferred enforcement failures

---

## Executive Summary

The v1.0 milestone successfully delivered a functional multi-user monorepo system across 4 phases in approximately 21 days (March 17 - April 7, 2026). All 36 v1 requirements have completed plans, 694 tests pass, and the core architecture is sound. However, strategic review reveals **critical discipline failures** in three areas:

1. **Scope Creep (Critical):** Requirements drift allowed migration support to move from "Out of Scope" to delivered without formal roadmap expansion
2. **Deferred Enforcement (Critical):** PATH-13 audit gate was violated, then "fixed" by exemption rather than principled resolution
3. **Stale Assumptions (Warning-level):** CI/CD detection strategy from Phase 1 contradicts later Phase 3 integration test needs

The system is production-capable but carries **strategic debt** that will compound in v2 development.

---

## Lane 1: Scope Creep — Requirements Drift Without Roadmap Updates

### CRITICAL: Migration support added despite explicit "Out of Scope" declaration

**Finding ID:** strategy-C01  
**Severity:** Critical  
**Impact:** Requirements contract violation

**Description:**

REQUIREMENTS.md line 80 (established 2026-03-17) explicitly declares:

```
| Migration from old .planning/ structure | Old structure fundamentally incompatible; clean break is simpler |
```

This was a **principled architectural decision**: the old flat structure has no user directories, making automatic migration ambiguous (which user owns the old project? what if multiple users share a machine?). The ROADMAP Phase 1 context (01-CONTEXT.md line 63) reinforced this with inline error message guidance directing users to manual re-initialization.

Phase 4 (2026-04-07) **silently reversed this decision**:
- 04-CONTEXT.md lines 48-53 define full auto-migration flow (`cmdMigrate`, copy-then-delete pattern, project name extraction from old PROJECT.md)
- Plan 04-03 delivered the implementation (04-03-SUMMARY.md lines 69-70, 90)
- REQUIREMENTS.md was updated RETROACTIVELY (removing migration from "Out of Scope") DURING execution, not during requirements review

**Evidence of process failure:**

1. **No roadmap update:** ROADMAP.md Phase 4 goals (line 138) make NO mention of migration. The scope is defined as "team visibility and hardening." Migration is neither.
2. **Critic blind spot was overridden, not resolved:** The Phase 4 discuss-critique (CRITIQUE-discuss.md lines 71-89, discuss-C03) correctly identified this as a critical scope violation. The resolution was: "User has now decided migration IS in scope" (04-CONTEXT.md line 49) — but this decision is not documented in any pre-phase planning session.
3. **Work estimation impact:** Phase 4 plans were scoped for 3 features (team-status, config resolve, commit attribution). Adding a 4th feature (migration) did not trigger re-estimation or risk analysis.

**Why this matters:**

- **Contract violation:** The "Out of Scope" section is the project's promise of what won't be built. Changing it mid-flight without visibility undermines trust in the planning process.
- **Precedent risk:** If Phase 5 planning starts with "these are out of scope," how can stakeholders trust they'll stay out?
- **Missed dependencies:** Migration was rejected because it's "fundamentally incompatible." Building it anyway suggests either (a) the original analysis was wrong, or (b) the new implementation is flawed. Neither was formally re-examined.

**Recommendation:**

Establish a **requirements change protocol** for future milestones:
1. Any movement of items FROM "Out of Scope" TO "Active" requires explicit sign-off BEFORE context gathering
2. Roadmap phases updated BEFORE planning begins, not during execution
3. Critic findings on scope violations are BLOCKING, not advisory — execution does not proceed until the contradiction is resolved through formal process (update requirements doc, get sign-off, re-estimate)

---

### WARNING: Decision logging restoration (LIFE-10) formalized post-hoc

**Finding ID:** strategy-W01  
**Severity:** Warning  
**Impact:** Scope expansion without traceability

**Description:**

Decision logging (`log-decision-init`, `log-decision`, `getUnprocessedDecisionLogs`) was removed from the codebase in an earlier session, then restored during Phase 3 preparation. Phase 3's pre-planning scope critique (CRITIQUE-scope.md lines 33-38, scope-C01) correctly flagged this as untracked work.

The resolution was to **create a new requirement LIFE-10** and add it to REQUIREMENTS.md (line 47). While this is better than leaving it untracked, it reveals a process gap:

1. Decision logging restoration happened BEFORE requirements were updated
2. The restoration was driven by workflow needs discovered during context gathering, not by pre-defined requirements
3. LIFE-10 was added to make the work "traceable," but the work itself pre-dated the requirement

**Why this matters (less severe than C01):**

- Decision logging is a GSD-internal feature (supporting the `extract-taste` pipeline), not a user-facing capability. The scope risk is low.
- The work was small (3 CLI commands already existed in gsd-tools.cjs, just needed workflow integration)
- The critic feedback loop caught it and forced documentation, preventing it from being hidden

However, it establishes a pattern of "do the work, then justify it with a requirement" rather than "define requirements, then do the work."

**Recommendation:**

For v2: Any feature restoration or "undelete" must be proposed as a requirements change BEFORE implementation begins. If context gathering reveals "we need feature X that was removed," pause and add it to requirements first.

---

### INFO: scope_path metadata collection with no consumer

**Finding ID:** strategy-I01  
**Severity:** Info  
**Impact:** Minor UX noise, no functional harm

**Description:**

The new-project workflow (03-03-PLAN.md lines 129-131) prompts users for "which monorepo subdirectory or Bazel target" and stores the answer in `config.json` as `scope_path`. No GSD command consumes this value in v1.

The Phase 3 scope critique (CRITIQUE-scope.md lines 69-88, scope-W02) flagged this as "dead config." The resolution was to keep it as "informational metadata for now — future phases may use it."

**Why this is informational:**

- The prompt is a single question during new-project setup (low friction)
- Future monorepo features (scoped codebase mapping, Bazel target awareness) could consume this
- The alternative (asking for scope later, when a consuming feature is built) would require re-prompting existing users

**Observation:**

This demonstrates **good aspirational design** — capturing potentially-useful metadata early without over-engineering consumers. It's borderline scope creep, but acceptably so.

---

## Lane 2: Stale Assumptions — Early Decisions Contradicted by Later Learnings

### WARNING: CI/CD hard block contradicts Phase 3 integration testing needs

**Finding ID:** strategy-S01  
**Severity:** Warning  
**Impact:** Design tension, no immediate breakage

**Description:**

Phase 1 decision (01-CONTEXT.md lines 64-68):

> CI/CD environments (`CI=true` or `GITHUB_ACTIONS=true`) are detected and refuse to auto-create user directories. If ANY is truthy: full block — error on any GSD operation. Hard error, no override escape hatch.

This was codified in IDEN-07 and implemented in `getPlanningRoot()` as the FIRST check (before identity resolution).

Phase 3 added integration tests (03-05-PLAN, `tests/integration-commands.test.cjs`) that execute GSD commands via subprocess. These tests run in CI (as evidenced by the test suite passing with "694 tests pass" noted in 04-03-SUMMARY.md line 112). The tests work because they use **temporary directories and direct function calls**, not subprocess execution in a real CI environment.

**The contradiction:**

If GSD is deployed to a repo with CI enabled, developers cannot run `gsd-tools.cjs team-status` or `gsd-tools.cjs config resolve` in the CI environment for **read-only reporting**. The Phase 1 rationale was "refuse to auto-create user directories" (IDEN-07) — but read-only commands don't create directories.

The Phase 1 scope critique (CRITIQUE-scope.md lines 52-67, scope-W02) identified this:

> Use case conflict: Some CI workflows may want to run `gsd-tools.cjs init progress --cwd .` to extract metadata for documentation generation or status dashboards (read-only operations)

The recommendation was:
> Consider allowing `GSD_ALLOW_CI=true` env var as escape hatch for read-only init commands

**This was never implemented.** The assumption that "CI/CD always means bad things" went unchallenged through all 4 phases.

**Why this matters:**

- **User friction:** A team using GSD in a monorepo with CI enabled cannot run status checks or config debugging in CI pipelines
- **Inconsistency:** The error message says "GSD is not supported in CI" but the actual concern is directory creation, not reads
- **Missed value:** Team-status (TEAM-01) is explicitly for team visibility — preventing it from running in CI limits its usefulness for shared dashboards

**Recommendation:**

v2 should revisit the CI/CD detection strategy:
1. Scope the block to **write operations only** (new-project, execute-phase, plan-phase)
2. Allow read-only commands (team-status, config resolve, init, progress) with a warning
3. OR: Add `GSD_ALLOW_CI=true` escape hatch as originally suggested, with clear documentation of risks

This is a **stale assumption** — the Phase 1 decision was conservative and correct for the known scope, but Phase 4's team-status feature creates new use cases that the assumption doesn't accommodate.

---

### WARNING: Config layering complexity increased without revisiting architecture

**Finding ID:** strategy-S02  
**Severity:** Warning  
**Impact:** Maintenance burden, complexity creep

**Description:**

The config system evolved across 3 phases without holistic re-architecture:

**Phase 1 (established):**
- Single config file at `.planning/config.json`
- Hardcoded defaults in `core.cjs`
- No layering

**Phase 3 (LIFE-06):**
- Two-file merge: global `.planning/config.json` + per-project `config.json`
- `_sources` tracking added for each key (which layer it came from)
- Precedence: defaults < global < per-project

**Phase 4 (TEAM-04, TEAM-05):**
- Third layer: environment variables (`GSD_MODEL_PROFILE`, etc.)
- New precedence: defaults < global < per-project < env vars
- `config resolve` command to debug the 4-tier stack

The code works (tests pass), but the architecture is showing strain:

1. **Key-to-env-var mapping is hardcoded** (04-01-PLAN.md lines 73-92: `ENV_KEY_MAP` object with 9 keys). Adding a new config key requires updating multiple places.
2. **_sources tracking is internal metadata** that leaks into the config object returned to all callers. Any code that does `Object.keys(config)` now sees `_sources` as a key.
3. **No validation or schema enforcement.** Config values are merged blindly. If global config has `model_profile: "quality"` and env has `GSD_MODEL_PROFILE=invalid-garbage`, the garbage wins.

The Phase 4 discuss critique (CRITIQUE-discuss.md lines 95-114, discuss-W01) noted the env var mapping underspecification but didn't catch the broader architecture debt.

**Why this matters:**

- **Future cost:** Adding env var support for all 15+ config keys requires manual mapping updates
- **Debuggability:** When a config value is wrong, tracing through 4 layers with `_sources` metadata is better than nothing, but still requires reading code to understand precedence
- **Type safety:** No runtime validation means typos in env vars (e.g., `GSD_PARALELLIZATION=5` vs `GSD_PARALLELIZATION=5`) silently do nothing

**Stale assumption:**

Phase 1 assumed config would be "simple JSON files." The layering requirements (LIFE-06, TEAM-04) were added later without revisiting the core design. A schema-based config system (e.g., JSON Schema validation, auto-derived env var names) wasn't considered because Phase 1 had already locked in the approach.

**Recommendation:**

v2 should consider:
1. **Config schema file** defining all valid keys, types, defaults, and env var names
2. **Validation on load** with clear error messages for invalid values
3. **Auto-derive env var names** from schema (e.g., `model_profile` → `GSD_MODEL_PROFILE`) rather than hardcoded mapping

This is lower priority than S01 (CI/CD) because the current system works, just with tech debt.

---

### INFO: Test coverage optimized for happy paths, edge cases under-tested

**Finding ID:** strategy-I02  
**Severity:** Info  
**Impact:** Latent bugs in error paths

**Description:**

The test suite is robust for primary flows (694 tests, all passing), but edge case coverage is uneven:

**Strong coverage:**
- Identity resolution with fallbacks (Phase 1: 14 tests in identity.test.cjs)
- Context resolution across .active / env vars / auto-select (Phase 1: 22 tests, Phase 3: 19 integration tests)
- Config layering (Phase 3: 11 tests for two-file merge)

**Weak coverage:**
- **Concurrent writes to user-map.json:** Phase 1 decision (01-CONTEXT.md lines 35-36) says "Git handles merge conflicts — no file locking needed." No tests simulate concurrent registration.
- **Corrupted user-map.json recovery:** The error handling (lines 36-37: "treat as empty and re-register") is documented but not tested.
- **Team-status with permission errors:** Phase 4 (TEAM-01, TEAM-02) reads other users' STATE.md files. No tests simulate `EACCES` or `EPERM` on cross-user reads.
- **Migration partial failure:** Phase 4 migration uses copy-then-delete pattern (04-03-PLAN.md). No tests simulate disk-full or permission error mid-migration.

**Why this is informational:**

- Edge cases are, by definition, rare. The happy-path coverage ensures the system works for 95% of users.
- Adding adversarial tests (permission errors, disk full, concurrent writes) would roughly double the test suite size.
- The documented error handling strategies (corrupted JSON → re-register, migration failure → leave old structure intact) are reasonable defaults even without tests.

**Observation:**

This reflects a **pragmatic testing strategy** — focus on integration tests for user-visible flows, skip adversarial chaos engineering. It's a deliberate tradeoff, not an oversight.

---

## Lane 3: Deferred Enforcement — Anti-Goals Violated, Deferred Items Undermining Goals

### CRITICAL: PATH-13 bootstrap violation "fixed" by audit gate exemption, not principled resolution

**Finding ID:** strategy-D01  
**Severity:** Critical  
**Impact:** Enforcement erosion, maintenance trap

**Description:**

PATH-13 (Phase 2, REQUIREMENTS.md line 34) defines the anti-goal:

> A grep audit confirms zero unresolved raw `.planning/` path references remain in operational code (excluding documentation and the resolver function itself)

This was enforced via `tests/audit-paths.test.cjs` (activated in Phase 2, Plan 02-05). The audit gate is the **core mechanism** for preventing regressions — it ensures all code uses `getPlanningRoot()` instead of hardcoded paths.

**The violation:**

Phase 3's new-project workflow (03-03-PLAN, `new-project.md` line 110) contains:

```bash
mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"
```

This is a **raw `.planning/` path reference in operational code.** It violates PATH-13.

Phase 4's discuss critique (CRITIQUE-discuss.md lines 18-43, discuss-C01) correctly identified this as a bootstrap chicken-and-egg problem:

> `getPlanningRoot()` requires the project directory to exist, which means the FIRST `mkdir` must use a hardcoded path BEFORE any init call happens.

Three resolution options were proposed:
1. Add `init new-project-bootstrap` command that returns the target path without requiring the directory to exist
2. Add `--creating` flag to init that uses different resolution strategy
3. **Accept it as a special case and add audit gate exception**

**What was actually delivered (Plan 04-03):**

Option 3 — the audit gate was modified to allow the violation. Specifically:
- `cmdInitProjectSetup` was enhanced to return a `bootstrap_path` field (04-03-SUMMARY.md line 84)
- The workflow uses `${BOOTSTRAP_PATH}` instead of the hardcoded string
- The audit gate allowlist was updated to permit the documentation references (lines 96-97: "2 remaining .planning/ refs in new-project.md are documentation comments")

**Why this is critical:**

1. **Enforcement erosion:** The principle was "zero raw `.planning/` paths in operational code." Adding exceptions creates a slippery slope. Future engineers will ask "if bootstrap gets an exception, why not X?"
2. **Incomplete fix:** The `bootstrap_path` field is computed by `cmdInitProjectSetup` calling... what? If it calls `getPlanningRoot()`, we're back to the chicken-and-egg. If it computes the path manually, we've just moved the hardcoded path from the workflow to `init.cjs`, not eliminated it.
3. **Maintenance trap:** The bootstrap exception is now invisible to the audit gate. If someone refactors `cmdInitProjectSetup`, the exception persists even if it's no longer needed.

**Proper resolution would have been Option 1:**

Create a **pre-context path construction helper**:
```javascript
// In identity.cjs or core.cjs
function computeProjectPath(cwd, userSlug, projectSlug) {
  return path.join(cwd, '.planning', 'users', userSlug, projectSlug);
}
```

This function:
- Does NOT call `getPlanningRoot()` (no chicken-and-egg)
- Takes slugs as parameters (computed before directory exists)
- Is the SINGLE SOURCE OF TRUTH for the path template
- Can be used by both the workflow AND by `getPlanningRoot()` internally

The workflow would call:
```bash
BOOTSTRAP=$(gsd-tools.cjs project-path "${USER_SLUG}" "${SLUG}")
mkdir -p "${BOOTSTRAP}"
```

The audit gate would allow `project-path` command but still block raw `.planning/` strings.

**Why this wasn't done:**

Plan 04-03 was scoped as a 7-minute fix (actual: 7 min per SUMMARY). The proper solution would require:
1. New `computeProjectPath()` function
2. New `gsd-tools.cjs project-path` CLI command
3. Refactor `getPlanningRoot()` to use `computeProjectPath()` internally
4. Update workflow to use the new command

This is ~20-30 minutes of work, not 7. The time pressure led to the expedient solution (audit gate exception) instead of the principled one (shared path construction).

**Recommendation:**

**Immediately** refactor to the principled solution:
1. Add `computeProjectPath(cwd, userSlug, projectSlug)` to `core.cjs`
2. Add `gsd-tools.cjs project-path <user> <project>` dispatcher case
3. Update `new-project.md` to use `$(gsd-tools.cjs project-path ...)`
4. Remove the audit gate exception

This is a **v1.0.1 hotfix candidate** — it should not wait for v2.

---

### WARNING: Legacy detection bypass in tryGetPlanningContext creates enforcement gap

**Finding ID:** strategy-D02  
**Severity:** Warning  
**Impact:** Anti-goal (clean break) partially undermined

**Description:**

IDEN-06 (Phase 1, REQUIREMENTS.md line 18) defines:

> Running GSD on a repo with old flat `.planning/PROJECT.md` at root produces a clear error message directing user to re-initialize

This was a **hard block** — the entire system refuses to operate on old-structure repos. The rationale (REQUIREMENTS.md line 80, later contradicted) was "clean break is simpler."

Phase 4 replaced the hard block with migration flow:
- `tryGetPlanningContext()` returns `{ legacy_detected: true }` instead of `process.exit(1)` (04-03-PLAN, core.cjs changes)
- Commands check `legacy_detected` and offer migration or manual instructions

**The enforcement gap:**

The migration flow is **opt-in**. A user seeing the legacy detection error can:
1. Run `gsd-tools.cjs migrate` (auto-migrate)
2. Follow manual instructions
3. **Ignore the error and keep using old GSD**

Option 3 exists because `tryGetPlanningContext()` returns a flag, not a hard error. If a command doesn't check the flag, it might partially work with the old structure.

Example: `gsd-tools.cjs config resolve model_profile` might succeed because `loadConfig()` reads `.planning/config.json`, which exists in both structures.

**Why this matters (less severe than D01):**

- The migration flow is user-friendly (better UX than "delete everything and start over")
- Most commands DO fail correctly when `planning_root === null`
- The risk is confusion, not data corruption

**Stale assumption:**

Phase 1 decided "clean break, no migration." Phase 4 added migration support, which is good for users, but the hard-block enforcement was removed as a side effect. The original anti-goal ("don't support old structure") was abandoned without documenting the tradeoff.

**Recommendation:**

v2 should formalize the migration window:
1. v1.0 supports both old and new structures (with migration flow)
2. v1.1 deprecates old structure (warns but still works)
3. v1.2 removes old structure support (hard block returns)

This gives users a grace period while maintaining eventual enforcement.

---

### INFO: Deprecation strategy used correctly (createTempProject not removed, just marked deprecated)

**Finding ID:** strategy-I03  
**Severity:** Info  
**Impact:** Positive pattern

**Description:**

Phase 2 (02-01-PLAN) introduced `createTempMultiUserProject()` as the new test helper, replacing `createTempProject()`. The old helper creates flat `.planning/` structure; the new one creates `.planning/users/<user>/<project>/`.

The plan (02-01-PLAN.md line 146) correctly chose to **deprecate, not delete**:

> Deprecated createTempProject/createTempGitProject, kept functional for compat. Actual test file migration happens in Plans 02-04; breaking all 14 test files at once is too risky.

This is **textbook deprecation strategy**:
1. Mark old function as deprecated (with comment)
2. Provide new alternative
3. Migrate callers incrementally
4. Remove old function only after all callers migrated

The test suite continues to work throughout the migration, reducing risk.

**Observation:**

This demonstrates **strong software engineering discipline**. Contrast with the PATH-13 handling (strategy-D01) where the expedient solution was chosen over the principled one. The difference is likely time pressure — the test helper migration happened in Phase 2 (mid-project) when there was still slack, while the PATH-13 fix happened in Phase 4 (deadline pressure).

---

## Cross-Cutting Patterns

### Positive: Phase-critic feedback loop is effective

All 4 phases show the same pattern:
1. Context gathered
2. Pre-planning critiques run (discuss, scope)
3. Critical findings halt planning until resolved
4. Plans created with resolutions documented
5. Post-planning critiques verify (code, verify)

Examples of effective catches:
- Phase 1: gitignore management unclarified → resolution added to context
- Phase 3: listProjects() redesign needed → scope-C01 forced explicit requirement (LIFE-04)
- Phase 4: migration out-of-scope → discuss-C03 surfaced contradiction (even though resolution was questionable)

The critics are doing their job. The breakdowns (strategy-C01 migration, strategy-D01 PATH-13) happened when **critic findings were overridden** rather than addressed through principled resolution.

**Recommendation:**

Formalize critic severity levels:
- **CRITICAL findings are blocking** — planning does not proceed until resolved via requirements update or scope reduction
- **WARNING findings require documented decision** — can proceed, but must capture "we chose X over Y because Z" in context
- **INFO findings are advisory** — capture for future reference, no blocking

---

### Positive: TDD discipline maintained across all 16 plans

Every plan summary shows the same commit pattern:
1. Test commits (RED)
2. Feature commits (GREEN)
3. Atomic commits per task

Example from 03-01-SUMMARY.md:
```
1. Task 1: Redesign listProjects() and modify resolveContext() - 21ea794 (test) + cac9066 (feat)
2. Task 2: Rebuild loadConfig() for global + per-project merge - a74b5a5 (test) + 3916b4b (feat)
```

**No plan shows feature commits before test commits.** This is exceptional discipline for a 16-plan, 4-phase project.

**Impact:**

- High confidence in delivered code (694 tests, all passing)
- Easy to verify plan completeness (test count matches task count)
- Regression protection (tests prevent future breakage)

---

### Negative: Execution speed pressure led to expedient solutions in Phase 4

Phase 4 plan durations:
- 04-01: 5 min (config resolve)
- 04-02: 6 min (team-status)
- 04-03: 7 min (commit attribution + migration + PATH-13)

Plan 04-03 combined THREE distinct features in a single 7-minute plan. For comparison, Phase 3's similarly-scoped plans were 8-10 minutes each.

The time pressure shows in the PATH-13 resolution (strategy-D01) — the expedient solution (audit gate exception) was chosen because the principled solution (shared path construction) would have pushed the plan to 20+ minutes.

**Recommendation:**

Future milestones should budget **10% phase slack** for unexpected complexity. Phase 4 should have had 3-4 plans, not 3, to avoid cramming work.

---

## Summary Table

| Finding | Type | Severity | Phase | Impact | Recommended Action |
|---------|------|----------|-------|--------|-------------------|
| strategy-C01 | Scope Creep | Critical | 4 | Requirements contract violated | Establish requirements change protocol |
| strategy-C02 | Scope Creep | Warning | 3 | Untracked work formalized post-hoc | Context-first, requirements-second for restorations |
| strategy-I01 | Scope Creep | Info | 3 | scope_path metadata unused | Accept as aspirational design |
| strategy-S01 | Stale Assumptions | Warning | 1→3 | CI/CD hard block prevents valid use cases | Revisit for v2: scope to writes only |
| strategy-S02 | Stale Assumptions | Warning | 1→4 | Config layering complexity | Consider schema-based config for v2 |
| strategy-I02 | Stale Assumptions | Info | All | Edge case coverage gaps | Accept pragmatic testing strategy |
| strategy-D01 | Deferred Enforcement | Critical | 4 | PATH-13 audit gate exemption | **v1.0.1 hotfix:** Refactor to shared path construction |
| strategy-D02 | Deferred Enforcement | Warning | 4 | Legacy detection bypass | Formalize migration window for v2 |
| strategy-I03 | Deferred Enforcement | Info | 2 | Deprecation done correctly | Continue this pattern |

**Critical items requiring immediate action:** 2  
**Warning items for v2 planning:** 4  
**Info items (observation only):** 3  

---

## Recommendations for v2 Planning

### Process improvements:

1. **Requirements change protocol:** Any movement of items from "Out of Scope" to "Active" requires:
   - Explicit stakeholder sign-off
   - Roadmap update BEFORE context gathering begins
   - Re-estimation of affected phases
   - Critic review of the scope change

2. **Critic severity enforcement:** Formalize that CRITICAL findings block planning until resolved through proper channels (not "user override")

3. **Phase slack budget:** Add 10% time buffer to each phase for unexpected complexity

### Technical debt remediation:

1. **v1.0.1 hotfix (priority 1):** Refactor PATH-13 bootstrap to use shared path construction helper, remove audit gate exemption

2. **v2.0 architecture (priority 2):** Revisit CI/CD detection strategy — scope to write operations, allow read-only commands

3. **v2.0 refactor (priority 3):** Schema-based config system to replace 4-tier manual merge

### Strategic clarity:

1. **Document the "clean break" reversal:** REQUIREMENTS.md should include a decision log explaining why migration support was added despite original rejection

2. **Formalize migration support lifecycle:** Define when old structure support will be deprecated and removed

---

*Critique completed: 2026-04-07*  
*Milestone: v1.0 (all 36 requirements delivered)*  
*Next action: Address strategy-D01 (PATH-13) in v1.0.1 hotfix*
