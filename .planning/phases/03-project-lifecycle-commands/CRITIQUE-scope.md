---
critique_type: scope
phase: "03"
reviewed_at: "2026-04-07"
status: warn
severity_counts:
  critical: 2
  warning: 3
  info: 2
reviewed_artifacts:
  - 03-CONTEXT.md
  - ROADMAP.md
  - REQUIREMENTS.md
executive_summary: "Phase 3 CONTEXT covers all LIFE-01 through LIFE-09 requirements and is broadly well-aligned with the roadmap. Two critical findings: (1) decision logging restoration is scope creep — it has no backing requirement or roadmap entry and should be tracked separately, and (2) /gsd:restore-project is an unbudgeted new command beyond LIFE-09's scope. Three warnings flag config precedence overlap with Phase 4 TEAM-04, monorepo scope_path as an undocumented requirement, and the ROADMAP showing Phase 2 plan 02-05 unchecked despite STATE.md marking Phase 2 complete."
---

# Phase 03 Scope Critique

## Executive Summary

Phase 3 context demonstrates strong alignment with LIFE-01 through LIFE-09 requirements. The core lifecycle commands (`/gsd:new-project`, `/gsd:switch`, `/gsd:progress` enhancements, command transparency audit, per-project config, and project archival) are all well-scoped and traceable to documented requirements.

However, two items in the context document add capabilities that have no backing requirement or roadmap entry. Decision logging workflow wiring and `/gsd:restore-project` both expand the deliverable surface without formal tracking. Additionally, the config precedence specification in Phase 3 overlaps significantly with TEAM-04 (Phase 4), creating a risk of duplicated or conflicting work.

**Status: WARN** — Two critical scope creep findings require resolution before planning proceeds. Three warnings need clarification.

---

## Findings

### CRITICAL Findings

#### scope-C01: Decision logging restoration is scope creep — no backing requirement

**Severity:** critical  
**Evidence:**
- 03-CONTEXT.md lines 58-62: "Decision logging restoration" section scopes `log-decision-init` and `log-decision` workflow wiring into `discuss-phase.md`, `new-project.md`, `new-milestone.md`, and `plan-phase.md`
- 03-CONTEXT.md lines 100: Integration points list 4 workflow files for decision logging changes
- 03-CONTEXT.md lines 114: Deferred section acknowledges the command was "restored during this session as a bugfix" but then declares workflow wiring in-scope
- ROADMAP.md: Zero mentions of "decision", "log-decision", or "decision logging" anywhere in the Phase 3 section (lines 88-123)
- REQUIREMENTS.md: Zero mentions of "decision" or "log" in any requirement (LIFE-01 through LIFE-09 or any other)
- ROADMAP.md Phase 3 Key Deliverables (lines 117-123): No mention of decision logging

**Impact:** This adds workflow modifications to 4 files (`discuss-phase.md`, `new-project.md`, `new-milestone.md`, `plan-phase.md`) that are not tracked by any requirement. If included, it inflates the Phase 3 plan count and test surface without traceability. If the feature breaks, there is no requirement to verify against. The "silent failure" design (line 62) further obscures verification.

**Recommendation:**
- **Option A (Preferred):** Remove decision logging from Phase 3 scope entirely. Create a standalone requirement (e.g., `MAINT-01`) and track it separately — either as a Phase 3 addendum or a standalone maintenance task.
- **Option B:** Add a new requirement (e.g., `LIFE-10: Decision logging is wired into context-gathering workflows`) to REQUIREMENTS.md and add it to the ROADMAP.md Phase 3 table. This formalizes the scope expansion.
- **Do not** leave it in CONTEXT.md without a backing requirement — it will be invisible to verification and coverage checks.

**Justification for Critical:** Untracked scope items are the #1 cause of scope creep in prior phases. Phase 1 and Phase 2 both passed scope critique with 0 untracked items. Adding one here breaks the traceability chain.

---

#### scope-C02: /gsd:restore-project is a new command beyond LIFE-09 scope

**Severity:** critical  
**Evidence:**
- 03-CONTEXT.md line 54: "/gsd:restore-project reverses the move from _archived/ back to active"
- 03-CONTEXT.md line 55: "Archive active project → clear + auto-select" — additional behavior beyond requirement
- REQUIREMENTS.md line 46 (LIFE-09): "Completed projects **can be archived** to `.planning/users/<user>/_archived/<project>/` and **excluded from default project listings**"
- LIFE-09 says nothing about restoring/un-archiving
- ROADMAP.md line 105 (LIFE-09): Same text — archive and exclude, no restore
- ROADMAP.md Key Deliverables line 122: "Project archival command and `_archived/` directory support" — singular "command", not plural
- 03-CONTEXT.md line 56: "--archived flag" for `/gsd:switch` — also not in LIFE-09

**Impact:** `/gsd:restore-project` is a complete additional command requiring its own implementation, tests, and edge-case handling (e.g., what if a project with the same slug was created after archival?). The `--archived` flag on `/gsd:switch` is additional UX surface. Together these could add 1-2 plan tasks beyond what LIFE-09 requires.

**Recommendation:**
- **Option A:** Trim Phase 3 to exactly what LIFE-09 requires: archive command + exclusion from listings. Defer restore to Phase 4 or a future task.
- **Option B:** Expand LIFE-09 or add LIFE-10 to cover restore. Update ROADMAP.md deliverables to mention both archive and restore commands.
- The `--archived` flag is a smaller addition that could be considered an implementation detail of LIFE-09 exclusion ("excluded from default project listings" implies a way to see them), but `/gsd:restore-project` as a separate command is clearly beyond "can be archived."

**Justification for Critical:** This is a concrete new command (not just a design detail) with its own error paths and test cases, added without requirement backing.

---

### WARNING Findings

#### scope-W01: Config precedence specification overlaps with TEAM-04

**Severity:** warning  
**Evidence:**
- 03-CONTEXT.md line 48: "Precedence: hardcoded defaults < `.planning/config.json` (global) < `.planning/users/<user>/<project>/config.json` (per-project) < environment variables"
- REQUIREMENTS.md line 53 (TEAM-04): "Config resolution follows explicit precedence: hardcoded defaults < shared `.planning/config.json` < per-project `users/<user>/<project>/config.json` < environment variables"
- ROADMAP.md line 137 (TEAM-04): Same precedence chain, assigned to Phase 4
- ROADMAP.md Phase 4 deliverables line 150: "Config layering engine with 4-tier precedence"
- 03-CONTEXT.md line 49: "loadConfig() in core.cjs already supports this pattern — needs to be wired to check project-level config"

**Impact:** Phase 3's LIFE-06 says "per-project config overrides global defaults" — this is a 2-tier requirement. But the CONTEXT specifies the full 4-tier precedence chain, which is identically specified in TEAM-04 (Phase 4). If Phase 3 implements the full 4-tier chain, TEAM-04 becomes vacuous. If Phase 3 implements only 2-tier (LIFE-06), the CONTEXT overpromises.

**Recommendation:**
- Clarify the Phase 3 scope: implement the per-project config layer only (LIFE-06). The full 4-tier precedence engine and its `config resolve` debug command belong to Phase 4 (TEAM-04, TEAM-05).
- Amend the CONTEXT to specify: "Phase 3 adds per-project config loading. Phase 4 formalizes the full precedence chain and adds the debug command."
- If the precedence chain is trivially implemented via `Object.assign(defaults, globalConfig, projectConfig)` as noted in line 92, document that Phase 4 inherits this implementation and adds the debug/resolve layer on top.

**Justification for Warning:** No requirement violation — LIFE-06 is clearly Phase 3. But the CONTEXT's description mirrors TEAM-04 verbatim, creating confusion about what Phase 4 will actually do.

---

#### scope-W02: Monorepo scope_path is an undocumented requirement

**Severity:** warning  
**Evidence:**
- 03-CONTEXT.md line 26: "Ask scope during creation — prompt which monorepo subdirectory or Bazel target the project is scoped to. Store in project `config.json` as `scope_path` or similar"
- PROJECT.md line 37: "Projects are tied to subdirectories and/or Bazel targets within the monorepo" — listed as an active requirement
- REQUIREMENTS.md: No LIFE-* requirement covers `scope_path` or monorepo subdirectory scoping
- ROADMAP.md: No mention of scope_path, Bazel target, or monorepo subdirectory in any Phase 3 requirement or deliverable

**Impact:** `scope_path` adds a prompt to the new-project flow, a new config field, and potentially downstream behavior (which commands respect it?). It has no requirement backing and no success criteria. If implemented, it's dead config — no command uses it. If deferred, the CONTEXT is misleading.

**Recommendation:**
- Either add a requirement (e.g., `LIFE-11: New projects can be scoped to a monorepo subdirectory stored in per-project config`) or explicitly defer to Phase 4/v2.
- If included in Phase 3, define what `scope_path` actually does downstream. A config field with no consumer is waste.
- PROJECT.md's "active requirement" list is from initial project definition and predates the formal REQUIREMENTS.md — it should not override the authoritative requirements document.

**Justification for Warning:** Low risk if it's just a config field during project creation, but it adds an unanswered question and a prompt in the UX with no consumer.

---

#### scope-W03: ROADMAP.md shows Phase 2 plan 02-05 unchecked, contradicting STATE.md

**Severity:** warning  
**Evidence:**
- ROADMAP.md line 55: `- [ ] 02-05-PLAN.md — Workflow + agent + template markdown migration + grep audit gate activation` (unchecked)
- STATE.md line 19: "Phase 2: Module Path Migration — Complete (5/5 plans)"
- STATE.md session log line 69: "Plan 02-05 executed | 83 markdown files migrated + audit gate activated — 5 min"
- 02-05-PLAN.md exists with full content

**Impact:** Phase 3 depends on Phase 2 being complete (ROADMAP.md line 188: "Phase 3's commands rely on all modules correctly resolving paths"). If Phase 2 is incomplete, Phase 3 starts from a broken foundation. If this is just a stale checkbox, it should be updated to maintain artifact integrity.

**Recommendation:**
- Update ROADMAP.md line 55 to `[x]` if Phase 2 is truly complete. STATE.md says it is.
- Verify by running the audit gate test (`node --test tests/audit-paths.test.cjs`) before starting Phase 3 planning.

**Justification for Warning:** Likely a stale checkbox rather than an actual incompleteness, but worth confirming before Phase 3 depends on it.

---

### INFO Findings

#### scope-I01: Fuzzy matching for /gsd:switch is appropriately left to discretion

**Severity:** info  
**Evidence:**
- 03-CONTEXT.md line 29: "try exact slug match first, then fuzzy match against project directory names"
- 03-CONTEXT.md line 69: "How fuzzy matching works internally (substring, prefix, Levenshtein, etc.)" listed under Claude's Discretion
- LIFE-03: "sets the active project context" — no matching algorithm specified

**Impact:** None — this is an implementation detail appropriately delegated.

**Note:** Good scope discipline. The requirement says "switch to project" — the method of matching is Claude's discretion.

---

#### scope-I02: Auto-select deferred from Phase 1 is now properly claimed

**Severity:** info  
**Evidence:**
- Phase 1 CRITIQUE-scope.md scope-I01: "Auto-select logic mentioned but deferred" — LIFE-05 correctly deferred
- 03-CONTEXT.md line 36: "Single-project auto-select (LIFE-05)" now explicitly scoped
- 03-CONTEXT.md line 36: "runtime auto-select... `resolveContext()` handles it transparently" — clean implementation approach

**Impact:** None — deferred item properly picked up in the correct phase.

**Note:** This completes the handoff from Phase 1's explicit deferral. No scope gap.

---

## Scope Alignment Analysis

### Requirements Coverage

Phase 3 covers 9 requirements (LIFE-01 through LIFE-09):

| Requirement | CONTEXT Coverage | Status |
|-------------|-----------------|--------|
| LIFE-01 | Lines 19-27: /gsd:new-project creates artifacts, sets active | ✅ Covered |
| LIFE-02 | Lines 19-20: Project name asked upfront | ✅ Covered |
| LIFE-03 | Lines 28-29: /gsd:switch with args | ✅ Covered |
| LIFE-04 | Lines 30-35: /gsd:switch without args, numbered list | ✅ Covered |
| LIFE-05 | Line 36: Single-project auto-select | ✅ Covered |
| LIFE-06 | Lines 47-49: Per-project config override | ✅ Covered |
| LIFE-07 | Lines 38-40: /gsd:progress enhancements | ✅ Covered |
| LIFE-08 | Lines 43-44: Command transparency audit | ✅ Covered |
| LIFE-09 | Lines 51-56: Archival to _archived/ | ✅ Covered (with overshoot — see scope-C02) |

**All 9 LIFE-* requirements are addressed. Coverage: 100%.**

### Items Beyond Requirements

| Item | Requirement | Status |
|------|-------------|--------|
| Decision logging wiring | None | ❌ Scope creep (scope-C01) |
| /gsd:restore-project | None (beyond LIFE-09) | ❌ Scope creep (scope-C02) |
| scope_path / Bazel target | None | ⚠️ Undocumented (scope-W02) |
| Full 4-tier config precedence | TEAM-04 (Phase 4) | ⚠️ Overlap (scope-W01) |

### Deferred Items Enforcement

#### Items deferred from prior phases (should now be addressed):
- Auto-select logic (LIFE-05) — Phase 1 deferred → Phase 3 picks up ✅
- .gitignore management for `.active` (Phase 1 scope-W01) — context.cjs `writeActiveContext` already handles this per Phase 1 execution. Not re-addressed but not needed ✅

#### Items properly deferred to Phase 4:
- `/gsd:team-status` (TEAM-01, TEAM-02, TEAM-03) — Not mentioned in CONTEXT ✅
- Config `resolve` debug command (TEAM-05) — Explicitly deferred in CONTEXT line 117 ✅
- Git commit attribution (TEAM-06) — Explicitly deferred in CONTEXT line 118 ✅

#### Items at risk of being silently dropped:
- None detected — all Phase 4 items are either properly deferred or explicitly mentioned in the deferred section.

### Roadmap Consistency

| Roadmap Deliverable (Phase 3) | CONTEXT Match |
|-------------------------------|---------------|
| Modified `new-project` workflow | ✅ Lines 19-27 |
| `/gsd:switch` command implementation | ✅ Lines 28-36 |
| `/gsd:progress` enhancement | ✅ Lines 38-40 |
| Auto-selection logic | ✅ Line 36 |
| Project archival command | ✅ Lines 51-56 (overshoot) |
| Per-project `config.json` override | ✅ Lines 47-49 |

**All 6 roadmap deliverables are covered.** Two items (decision logging, restore-project) are additions beyond the roadmap.

---

## Stale Assumptions Check

### From Phase 1:
- `.active` file format `{project, resolved_path}` — CONTEXT references `writeActiveContext(cwd, user, project)` and `readActiveContext(cwd, user)` directly. Assumption holds ✅
- `resolveContext()` as full resolution chain — CONTEXT line 79 references this. Assumption holds ✅
- `tryGetPlanningContext` returns null gracefully — CONTEXT line 91 references this pattern. Assumption holds ✅

### From Phase 2:
- All modules use `getPlanningRoot()` — CONTEXT relies on this for LIFE-08 (command transparency). Assumption holds per STATE.md ✅
- Workflows use `${planning_root}` — CONTEXT modifies workflows. Must ensure new workflow content follows this convention. No conflict ✅

### From PROJECT.md:
- PROJECT.md line 37: "Projects are tied to subdirectories and/or Bazel targets" — This was an early project-level active requirement that never became a formal LIFE-* requirement. It persists in CONTEXT as `scope_path`. See scope-W02. ⚠️

---

## Recommendations

### Priority 1 (Resolve before planning):

1. **scope-C01:** Remove decision logging from Phase 3 scope OR formalize it as a new requirement. Decision logging is valid work but needs traceability.

2. **scope-C02:** Remove `/gsd:restore-project` from Phase 3 scope OR expand LIFE-09 to explicitly include restore capability. Archive-only is a valid MVP.

### Priority 2 (Clarify before planning):

3. **scope-W01:** Clarify that Phase 3 implements LIFE-06 (per-project config layer) only. Full precedence chain formalization is Phase 4's TEAM-04.

4. **scope-W02:** Decide whether `scope_path` is in scope. If yes, add a requirement. If no, remove from CONTEXT.

5. **scope-W03:** Update ROADMAP.md to mark 02-05 as complete, or verify Phase 2 completion.

### Priority 3 (Nice to have):

6. Consider whether the `--archived` flag on `/gsd:switch` is an implementation detail of LIFE-09's "excluded from default project listings" (acceptable) or a separate feature (needs tracking).

---

## Conclusion

Phase 3 context demonstrates strong coverage of all LIFE-01 through LIFE-09 requirements with well-reasoned implementation decisions. The core scope is solid. However, two items (decision logging wiring and `/gsd:restore-project`) were added without backing requirements, breaking the traceability discipline that Phases 1 and 2 maintained perfectly. These should be either formalized or deferred before planning proceeds.

**Final Status: WARN — Resolve 2 critical findings before /gsd:plan-phase**

---

*Critique completed: 2026-04-07*
*Reviewer: Automated scope analysis*
*Next step: Resolve scope-C01 and scope-C02, then proceed to planning*
