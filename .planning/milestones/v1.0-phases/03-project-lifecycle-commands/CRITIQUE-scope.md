---
critique_type: scope
phase: "03"
reviewed_at: "2026-04-07"
status: pass
severity_counts:
  critical: 0
  warning: 2
  info: 3
reviewed_artifacts:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
  - 03-CONTEXT.md
  - ROADMAP.md
  - REQUIREMENTS.md
executive_summary: "All 5 plans stay within the Phase 3 boundary (LIFE-01 through LIFE-10). All 10 LIFE-* requirements are assigned to at least one plan with full coverage. The two critical scope creep findings from the pre-planning critique (decision logging and restore-project) were properly resolved — LIFE-10 was formalized and LIFE-09 was expanded. No Phase 4 (TEAM-*) items leak into plans. Two warnings: (1) loadConfig source tracking in 03-01 builds Phase 4 infrastructure beyond what LIFE-06 strictly requires, and (2) scope_path in 03-03 remains an undocumented requirement stored as dead config. Three informational findings on plan structure."
---

# Phase 03 Post-Planning Scope Critique

## Executive Summary

The 5 plans for Phase 3 are well-structured and stay within the LIFE-01 through LIFE-10 boundary established by the ROADMAP and REQUIREMENTS documents. The two critical findings from the pre-planning scope critique have been properly resolved: decision logging was formalized as LIFE-10 (added to REQUIREMENTS.md), and `/gsd:restore-project` was absorbed into an expanded LIFE-09 definition. No TEAM-* (Phase 4) requirements leak into any plan. All 10 LIFE-* requirements are assigned to at least one plan, and each plan's stated work maps cleanly to its declared requirements.

**Status: PASS** — No critical scope violations. Two warnings merit awareness but do not block execution.

---

## Previous Critique Resolutions

The pre-planning scope critique (CRITIQUE-scope.md) raised 2 critical and 3 warning findings. Their resolution status:

| Finding | Status | Resolution |
|---------|--------|------------|
| scope-C01: Decision logging untracked | ✅ Resolved | Formalized as LIFE-10 in REQUIREMENTS.md (line 47) and ROADMAP.md. Assigned to 03-04-PLAN |
| scope-C02: /gsd:restore-project untracked | ✅ Resolved | LIFE-09 expanded in REQUIREMENTS.md (line 46) to include restore. Assigned to 03-02-PLAN |
| scope-W01: Config precedence overlaps TEAM-04 | ⚠️ Partially resolved | CONTEXT.md lines 52-54 clarify Phase 3 builds merge + tracking, Phase 4 adds debug command. See scope-W01 below |
| scope-W02: scope_path undocumented | ⚠️ Not resolved | CONTEXT.md line 26 describes scope_path as "informational metadata for now — no downstream consumer yet." No requirement created. See scope-W02 below |
| scope-W03: ROADMAP 02-05 unchecked | ✅ Resolved | ROADMAP.md line 55 now shows `[x]` for 02-05 |

---

## Findings

### WARNING Findings

#### scope-W01: loadConfig source tracking builds Phase 4 infrastructure beyond LIFE-06

**Severity:** warning
**Evidence:**
- 03-01-PLAN.md line 17: `"loadConfig() tracks source layer per key for Phase 4 config resolve"`
- 03-01-PLAN.md lines 199-206: Task 2 includes `_sources` object tracking which layer each value came from
- 03-01-PLAN.md line 215: "Test loadConfig._sources tracks correct source per key"
- REQUIREMENTS.md line 43 (LIFE-06): "Per-project config at `.planning/users/<user>/<project>/config.json` overrides global defaults"
- REQUIREMENTS.md line 55 (TEAM-05): "`gsd-tools.cjs config resolve <key>` shows which layer a config value came from" (Phase 4)
- 03-CONTEXT.md line 53: "The implementation tracks which layer each value came from... so Phase 4's `config resolve` debug command (TEAM-05) can surface it without rework"

**Impact:** LIFE-06 requires per-project config to override globals. It does NOT require source tracking per key. The `_sources` field is infrastructure for TEAM-05's `config resolve` debug command, which is a Phase 4 deliverable. This is forward-compatible design rather than scope creep — the extra work is minor (tracking which file each value came from during the merge that's already happening). The CONTEXT.md explicitly acknowledges this as Phase 4 prep.

**Recommendation:** Accept as-is. The source tracking is a trivial addition to the merge logic and prevents a Phase 4 rework. However, the plan should not include tests for `config resolve` CLI output — only the internal `_sources` data structure. The plan correctly limits itself to internal tracking (line 215: "Test loadConfig._sources tracks correct source per key").

**Justification for Warning:** Work is done for TEAM-05 (Phase 4) in a Phase 3 plan. While the CONTEXT explicitly blesses this approach, it crosses the phase boundary. Not critical because: (a) the work is small, (b) it's explicitly documented, and (c) the alternative (implementing merge without tracking, then reworking in Phase 4) is wasteful.

---

#### scope-W02: scope_path stored as dead config with no backing requirement

**Severity:** warning
**Evidence:**
- 03-03-PLAN.md line 20: `"Scope path is asked and stored in project config.json"`
- 03-03-PLAN.md lines 129-131: "Ask scope — prompt which monorepo subdirectory or Bazel target... Store response for config.json"
- 03-CONTEXT.md line 26: "Store in project `config.json` as `scope_path`. This is informational metadata for now — no downstream consumer yet. Future phases may use it"
- REQUIREMENTS.md: No LIFE-* requirement covers scope_path
- ROADMAP.md Phase 3: No mention of scope_path in requirements table or key deliverables
- 03-03-PLAN.md requirements field: `[LIFE-01, LIFE-02]` — neither mentions scope

**Impact:** This adds a user-facing prompt ("Which monorepo subdirectory or Bazel target?") and a config field with zero consumers. Users will be asked a question whose answer is never used. The work is small (one prompt + one config write), but it's not traceable to any requirement.

**Recommendation:** Either:
- Remove the scope prompt from 03-03 and defer until a consuming feature is built
- OR accept it as a minor data-gathering enhancement under LIFE-01 ("creates planning artifacts" — config.json is an artifact)

The risk is low either way. This was raised in the pre-planning critique (scope-W02) and the resolution in CONTEXT.md was to keep it as "informational metadata." If kept, no additional plan changes are needed — it's 3 lines of workflow code.

**Justification for Warning:** Adds UX surface (user prompt) without requirement backing. Not critical because: the work is trivial, it's explicitly documented as aspirational, and it doesn't affect any other plan's scope.

---

### INFO Findings

#### scope-I01: LIFE-04 is covered by both 03-01-PLAN and 03-02-PLAN (correct split)

**Severity:** info
**Evidence:**
- 03-01-PLAN.md requirements: `[LIFE-04, LIFE-05, LIFE-06]` — LIFE-04 (switch without args lists projects)
- 03-02-PLAN.md requirements: `[LIFE-03, LIFE-04, LIFE-09]` — LIFE-04 again
- LIFE-04: "/gsd:switch without arguments lists the current user's projects with status summary"

**Impact:** None — this is correct and intentional. 03-01 builds the `listProjects()` function that returns structured data (the listing capability). 03-02 builds the `cmdInitSwitch` command that calls `listProjects()` and presents the listing to the user. Both plans are necessary to fulfill LIFE-04. The split is a natural consequence of separating core functions (Plan 01) from CLI commands (Plan 02).

---

#### scope-I02: Plan dependency chain correctly prevents parallel execution of dependent waves

**Severity:** info
**Evidence:**
- 03-01-PLAN.md: wave 1, depends_on: [] (no dependencies)
- 03-02-PLAN.md: wave 2, depends_on: [03-01]
- 03-03-PLAN.md: wave 2, depends_on: [03-01]
- 03-04-PLAN.md: wave 3, depends_on: [03-02, 03-03]
- 03-05-PLAN.md: wave 3, depends_on: [03-01, 03-02]

**Impact:** None — the wave/dependency structure is well-designed:
- Wave 1 (Plan 01): Core module changes — all downstream plans depend on this
- Wave 2 (Plans 02, 03): CLI commands and new-project workflow — can execute in parallel since they touch different files
- Wave 3 (Plans 04, 05): Workflow files and integration tests — depend on the commands they wire/test

This matches the RESEARCH.md recommendation: "core module changes first, then CLI commands, then workflow modifications, then integration testing."

---

#### scope-I03: 03-03-PLAN is non-autonomous (human verification gate) — appropriate for workflow rewrite

**Severity:** info
**Evidence:**
- 03-03-PLAN.md line 11: `autonomous: false`
- 03-03-PLAN.md lines 197-218: Task 3 is a `checkpoint:human-verify` gate requiring the user to test the new-project workflow end-to-end
- All other plans are `autonomous: true`

**Impact:** None — this is appropriate. The new-project workflow rewrite (Task 1) produces a markdown file that orchestrates multi-step user interaction. Automated testing cannot verify the full UX flow (project name prompt → slugify → confirm → directory creation → init). The human verification gate ensures the workflow works correctly before downstream plans (03-04) modify it further for decision logging integration.

---

## Requirements Coverage Matrix

All 10 LIFE-* requirements are assigned to at least one plan:

| Requirement | Plan(s) | Coverage |
|-------------|---------|----------|
| LIFE-01 | 03-03-PLAN | ✅ New-project creates artifacts under user path, sets active |
| LIFE-02 | 03-03-PLAN | ✅ Project name asked upfront in multi-user mode |
| LIFE-03 | 03-02-PLAN | ✅ cmdInitSwitch with project arg, writeActiveContext |
| LIFE-04 | 03-01-PLAN, 03-02-PLAN | ✅ listProjects structured return (01) + cmdInitSwitch listing mode (02) |
| LIFE-05 | 03-01-PLAN | ✅ resolveContext auto-select for single project |
| LIFE-06 | 03-01-PLAN | ✅ loadConfig global + per-project merge |
| LIFE-07 | 03-04-PLAN | ✅ Progress context header, no-project listing + prompt |
| LIFE-08 | 03-05-PLAN | ✅ 6 commands × 3 resolution methods integration tests |
| LIFE-09 | 03-02-PLAN | ✅ cmdArchiveProject + cmdRestoreProject + dispatcher wiring |
| LIFE-10 | 03-04-PLAN | ✅ Decision logging wired into 4 workflows with silent failure |

**Coverage: 10/10 LIFE-* requirements. 0 unmapped. 0 dropped.**

---

## Phase 4 Leakage Check

| TEAM-* Requirement | In Any Plan? | Status |
|-------------------|-------------|--------|
| TEAM-01: /gsd:team-status | No | ✅ Not present |
| TEAM-02: STATE.md frontmatter-only reads | No | ✅ Not present |
| TEAM-03: Cross-user read scope | No | ✅ Not present |
| TEAM-04: Full 4-tier config precedence | Partially (see scope-W01) | ⚠️ Source tracking only |
| TEAM-05: config resolve debug command | No | ✅ Not present (internal `_sources` only) |
| TEAM-06: Git commit attribution | No | ✅ Not present |

**No Phase 4 commands or features leak into Phase 3 plans.** The only cross-boundary item is the `_sources` internal tracking (scope-W01), which is documented and intentional.

---

## CONTEXT.md Decision Alignment

Verifying plans match the locked decisions from 03-CONTEXT.md:

| CONTEXT Decision | Plan Alignment |
|-----------------|----------------|
| Project name asked upfront | 03-03 Task 1: "What should this project be called?" is first question ✅ |
| Slugify + confirm | 03-03 Task 1: generateSlugInternal + show slug ✅ |
| Always multi-user path | 03-03 Task 1: all projects under .planning/users/ ✅ |
| List + confirm existing projects | 03-03 Task 1: show projects before creating ✅ |
| Auto-switch to new project | 03-03 Task 1: switch after directory creation ✅ |
| Block duplicate names | 03-03 Task 1: error if slug exists ✅ |
| Copy global config defaults | 03-03 Task 1: cp config.json to new project ✅ |
| Two-step workflow bootstrap | 03-03 Task 1: project-setup → create → switch → init ✅ |
| Flexible match for switch | 03-02 Task 1: exact then fuzzy (substring) ✅ |
| Numbered list + pick | 03-04 Task 1: switch workflow numbered list ✅ |
| Runtime auto-select | 03-01 Task 1: resolveContext single-project scan ✅ |
| Zero-project null return | 03-01 Task 1: resolveContext returns null project ✅ |
| Context header in progress | 03-04 Task 2: "User: X \| Project: Y" header ✅ |
| loadConfig two-file merge | 03-01 Task 2: global + per-project merge ✅ |
| Move directory for archival | 03-02 Task 1: fs.renameSync to _archived/ ✅ |
| Clear + auto-select on archive | 03-02 Task 1: clear .active, auto-select if 1 remains ✅ |
| Decision logging silent failure | 03-04 Task 2: `2>/dev/null \|\| true` ✅ |
| Targeted integration tests | 03-05 Task 1: 6 commands × 3 methods ✅ |
| listProjects redesign | 03-01 Task 1: structured array, exported ✅ |
| loadConfig rebuild | 03-01 Task 2: full rebuild, not wiring change ✅ |

**All locked decisions are reflected in plans. No contradictions found.**

---

## Items NOT in Plans (Correctly Excluded)

Verifying that deferred items from CONTEXT.md are absent from plans:

| Deferred Item | Plan Presence | Status |
|---------------|--------------|--------|
| /gsd:team-status | Not present | ✅ Correctly deferred |
| Config resolve debug command | Not present | ✅ Correctly deferred |
| Git commit attribution | Not present | ✅ Correctly deferred |
| scope_path consumers | Not present | ✅ Correctly deferred (data stored only) |

---

## Conclusion

The 5 plans for Phase 3 are well-scoped, properly traceable, and faithfully implement the CONTEXT.md decisions. The two critical scope creep findings from the pre-planning critique were properly resolved through requirement formalization (LIFE-10) and requirement expansion (LIFE-09). No Phase 4 features leak into the plans.

Two minor warnings remain: source tracking for Phase 4's benefit (scope-W01) and scope_path as dead config (scope-W02). Both are explicitly documented in CONTEXT.md and represent small, controlled additions that don't materially affect Phase 3's scope or timeline.

**Final Status: PASS**

---

*Critique completed: 2026-04-07*
*Reviewer: Automated post-planning scope analysis*
*Artifacts reviewed: 5 PLAN files, CONTEXT.md, ROADMAP.md, REQUIREMENTS.md, STATE.md*
