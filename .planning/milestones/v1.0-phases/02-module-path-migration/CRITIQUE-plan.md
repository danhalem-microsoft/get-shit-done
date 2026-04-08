---
critique_type: plan
phase: 02-module-path-migration
reviewed_at: 2026-03-31T00:00:00Z
status: pass
critics: [manual-reviewer]
severity_counts:
  critical: 0
  warning: 1
  info: 4
reviewed_artifacts:
  - 02-01-PLAN.md
  - 02-02-PLAN.md
  - 02-03-PLAN.md
  - 02-04-PLAN.md
  - 02-05-PLAN.md
  - 02-CONTEXT.md
  - 02-RESEARCH.md
  - ROADMAP.md
  - REQUIREMENTS.md
executive_summary: |
  Phase 02 plans are well-structured and comprehensive. Five plans provide detailed coverage of
  the module path migration with proper wave organization and dependency management. One warning
  regarding inconsistent reference counts across artifacts, and four informational findings about
  opportunities for clarification and consistency improvements.
dismissed: []
---

# Critique Report: Phase 02 Module Path Migration Plans

## Findings

### Warning Severity

#### plan-W001: Reference Count Inconsistencies Across Artifacts
**File:** 02-CONTEXT.md:68-89, 02-RESEARCH.md:51-62, 02-01-PLAN.md, 02-02-PLAN.md
**Severity:** Warning
**Justification:** The grep reference counts differ between CONTEXT.md (line 68-89) and RESEARCH.md (line 51-62), creating confusion about the actual scope of work. CONTEXT.md shows state.cjs with 0 refs and roadmap.cjs with 0 refs, but RESEARCH.md shows state.cjs with 15 refs and roadmap.cjs with 4 refs. Similarly, init.cjs is listed as 53 refs in CONTEXT but 80 refs in RESEARCH. This discrepancy impacts sizing estimates and task planning.

**Evidence:**
```
CONTEXT.md line 68-89:
| init.cjs | 53 |
| state.cjs | 0 (audit) |
| roadmap.cjs | 0 (audit) |

RESEARCH.md line 51-62:
| PATH-02 | state.cjs has 15 `.planning/` refs across 10+ functions |
| PATH-04 | roadmap.cjs has 4 `.planning/` refs |

02-01-PLAN.md does not migrate state.cjs or roadmap.cjs
02-02-PLAN.md plans to migrate state.cjs and roadmap.cjs
```

**Impact:** Executors using CONTEXT.md may under-scope the work for state.cjs and roadmap.cjs migration in Plan 02-02. The reference counts guide effort estimation and testing scope.

**Recommendation:** Reconcile reference counts by re-running grep against the actual source files. Update both CONTEXT.md and RESEARCH.md with consistent, verified counts. If counts changed between discuss and research phases due to Phase 1 changes, document this explicitly.

---

### Info Severity

#### plan-I001: Missing Explicit Core.cjs Circular Dependency Test Strategy
**File:** 02-01-PLAN.md:104
**Severity:** Info
**Justification:** Plan 02-01 Task 1 mentions a circular dependency fallback for `loadConfig` but does not specify how this fallback will be tested. The plan says "Test this explicitly by calling `loadConfig` before any context is set up" but doesn't detail the expected behavior or where this test should be added.

**Evidence:**
```
Line 104 in 02-01-PLAN.md:
"CIRCULAR DEPENDENCY FALLBACK: If at runtime `getPlanningRoot` throws or returns undefined 
due to an unforeseen circular call through `loadConfig`, fall back to 
`path.join(cwd, '.planning', 'config.json')` and log a warning. Test this explicitly by 
calling `loadConfig` before any context is set up."
```

**Impact:** Low. The circular dependency risk is already assessed as low in RESEARCH.md, and the fallback is defensive. However, without explicit test coverage, the fallback may never be validated.

**Recommendation:** Add a specific test case in core.test.cjs that calls `loadConfig` in an isolated environment (no active context) to verify the fallback behavior. Document the expected outcome: either the fallback triggers correctly, or no circular dependency exists and the test validates normal behavior.

---

#### plan-I002: Template Placeholder Substitution Mechanism Under-Specified
**File:** 02-03-PLAN.md:209, 02-05-PLAN.md:154-165
**Severity:** Info
**Justification:** Plans 02-03 and 02-05 mention that template files should use `{planning_root}` placeholders and that substitution happens at "generation time" or "template expansion time," but the actual substitution mechanism is left to Claude's discretion. Plan 02-03 line 209 says "The `cmdTemplateFill` or template generation code should accept a `planning_root` variable for substitution," and Plan 02-05 lines 154-165 provide detailed clarification, but there's no requirement to verify that the substitution mechanism actually works.

**Evidence:**
```
02-03-PLAN.md line 209:
"The `cmdTemplateFill` or template generation code should accept a 
`planning_root` variable for substitution."

02-05-PLAN.md lines 154-165:
"Template placeholders `{planning_root}`, `{phase_dir}`, `{state_path}` 
are filled by the **workflow code at template expansion time**, NOT by the agent."
```

**Impact:** Low. The grep audit gate (PATH-13) will catch if templates still contain literal `.planning/` paths, but it won't verify that the substitution mechanism produces correct output. A template with `{planning_root}/STATE.md` that doesn't get substituted will pass the grep audit but fail at runtime.

**Recommendation:** Add a verification step in Plan 02-05 to test template substitution end-to-end. For example, generate a document from a template and verify the output contains resolved paths like `.planning/users/<user>/<project>/STATE.md`, not literal `{planning_root}` tokens.

---

#### plan-I003: Test Helper Deprecation Strategy Unclear
**File:** 02-01-PLAN.md:143-151
**Severity:** Info
**Justification:** Plan 02-01 Task 2 provides two options for handling `createTempProject()` and `createTempGitProject()` helpers but doesn't specify which approach to take. The options are: (1) make them call `createTempMultiUserProject()` internally for backwards compat, or (2) deprecate them by having them create multi-user structure. The distinction between these options is subtle and the choice impacts downstream test file migrations.

**Evidence:**
```
02-01-PLAN.md lines 143-151:
"Options (choose one per user discretion):
- Option 1: Make `createTempProject()` call `createTempMultiUserProject()` 
  internally and return just `tmpDir` for backwards compat
- Option 2: Deprecate `createTempProject()`/`createTempGitProject()` by having 
  them create multi-user structure"
```

**Impact:** Very low. Either option satisfies the must-have requirement. However, if Option 1 is chosen and later test files call `createTempProject()` expecting only `tmpDir`, they won't have `userSlug` and `projectName` to construct `planningRoot`. If Option 2 is chosen and the helper signature changes, all callers must update.

**Recommendation:** In the plan revision or Plan 02-01 execution, commit to one approach explicitly and document it in CONTEXT.md or as a decision in the plan. Option 1 (internal call with backwards-compatible return value) seems safer for incremental migration, but Option 2 (force all callers to use new API) is cleaner long-term.

---

#### plan-I004: Workflow Path Substitution Quoting Guidance Could Be Stricter
**File:** 02-05-PLAN.md:116
**Severity:** Info
**Justification:** Plan 02-05 correctly notes to "always quote paths in shell commands" (line 116) and RESEARCH.md Pitfall 8 (line 268-272) explains the risk, but the plan doesn't specify HOW to enforce this during migration. The grep audit won't catch unquoted `${planning_root}` since the audit only checks for `.planning/` literals.

**Evidence:**
```
02-05-PLAN.md line 116:
"IMPORTANT: Always quote bash variable expansions in shell commands: 
'${planning_root}/STATE.md' not ${planning_root}/STATE.md (Pitfall 8)."

RESEARCH.md lines 268-272:
"Pitfall 8: Markdown Shell Command Quoting
What goes wrong: When workflow markdown replaces `cat .planning/STATE.md` with 
`cat ${planning_root}/STATE.md`, the path may contain spaces or special characters."
```

**Impact:** Very low. User slugs are sanitized (lowercase, hyphens only per IDEN-01), so spaces are unlikely. However, hyphens in user slugs could cause issues if paths are not quoted.

**Recommendation:** Add a manual review checklist item in Plan 02-05 verification: "Spot-check 5-10 workflow files to ensure all bash commands with `${planning_root}` use double quotes." Alternatively, consider a post-migration grep pattern to detect unquoted variable usage (e.g., grep for `cat ${planning_root}` without quotes).

---

## Summary

**Total Findings:** 5 (0 critical, 1 warning, 4 info)

**Critical Issues:** None. The plans are structurally sound and complete.

**Warning Issues:** Reference count inconsistencies between CONTEXT and RESEARCH could lead to under-scoping in Plan 02-02 execution. Reconcile before execution.

**Info Issues:** Minor clarifications needed around test strategies, template substitution verification, test helper deprecation approach, and workflow quoting enforcement. None block execution.

**Overall Assessment:** The Phase 02 plans are **ready for execution** with one recommended fix (reconcile reference counts). The five plans provide comprehensive coverage of the module path migration with proper sequencing, dependency management, and verification strategies. The wave organization (Wave 1: core, Wave 2: modules, Wave 3: init/dispatcher, Wave 4: markdown + audit gate) is logical and minimizes integration risk.

**Strengths:**
- Clear wave structure with explicit dependencies
- Comprehensive coverage of all 11 PATH requirements (PATH-02 through PATH-13)
- Detailed task breakdowns with concrete sub-steps
- Strong attention to null safety and edge cases (e.g., null planning_root handling in init.cjs)
- Well-defined grep audit gate as the phase's acceptance criteria

**Recommendations:**
1. Fix reference count inconsistencies (plan-W001) before executing Plan 02-02
2. Add explicit circular dependency fallback test in Plan 02-01 (plan-I001)
3. Add end-to-end template substitution verification in Plan 02-05 (plan-I002)
4. Document test helper deprecation approach choice in Plan 02-01 (plan-I003)
5. Add workflow quoting spot-check to Plan 02-05 verification (plan-I004)

