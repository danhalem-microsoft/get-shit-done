# Phase 02 Discuss Critique - module-path-migration

---
critique_type: discuss
phase: 02-module-path-migration
created: 2026-03-31
severity_counts:
  critical: 3
  warning: 4
  info: 2
---

## Overview

This critique reviews the CONTEXT.md document produced during the discuss phase for Phase 02: module-path-migration. The document establishes decisions for migrating from hardcoded `.planning/` paths to use `getPlanningRoot()` across modules, workflows, and agents.

## Findings

### Critical Issues

#### discuss-001: Ambiguous allowlist for identity.cjs references
**Severity:** Critical  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:37-40  
**Evidence:**
```
The only acceptable `.planning/` references in operational code are: (1) the `getPlanningRoot()` resolver function in core.cjs, (2) the backwards-compatibility detector in core.cjs, and (3) identity.cjs `loadUserMap`/`lockIdentity` which reference `.planning/user-map.json` (repo-root file, not user-qualified).
```

**Justification:** The allowlist states that identity.cjs can reference `.planning/user-map.json` because it's a "repo-root file, not user-qualified." However, this creates ambiguity:

1. **Path Construction:** How does identity.cjs construct this path? Does it use `path.join(cwd, '.planning/user-map.json')` directly, or does it have a special helper?
2. **Multi-user context:** If the planning root is now `.planning/users/<user>/<project>/`, the user-map.json needs to be at `.planning/user-map.json` (repo root). The document should explicitly state whether identity.cjs is the ONLY module allowed to construct repo-root `.planning/` paths, and whether this pattern might be needed elsewhere (e.g., for future shared resources).
3. **Migration scope:** The document doesn't clarify if identity.cjs needs ANY changes in this phase or if it's already correct.

**Impact:** Without clarity on identity.cjs's path handling, the grep audit gate may incorrectly flag legitimate references or miss violations. The phase plan could miss required work.

---

#### discuss-002: Undefined behavior for gsd-tools.cjs main dispatcher
**Severity:** Critical  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:43-46  
**Evidence:**
```
### Claude's Discretion
- Exact order of module migration within the "all at once" approach
- Whether to create a shared path-building helper or repeat `path.join(getPlanningRoot(cwd), 'STATE.md')` patterns
- How to handle `gsd-tools.cjs` main dispatcher (also has `.planning/` refs alongside the lib modules)
```

**Justification:** The main dispatcher file `gsd-tools.cjs` is mentioned as having `.planning/` references but is left to "Claude's Discretion" for how to handle it. This is problematic because:

1. **Scope ambiguity:** Is `gsd-tools.cjs` in scope for this phase or not? If it's out of scope, why? If it's in scope, it should be part of the implementation decisions, not discretion.
2. **Reference count missing:** The code_context section shows reference counts for lib modules but doesn't show how many references are in the main dispatcher.
3. **Dependency risk:** If the dispatcher is the entry point for all commands and isn't migrated, it could undermine the "zero operational code references raw `.planning/` paths" goal.

**Impact:** Unclear scope could lead to incomplete migration, causing the grep audit gate to fail or requiring phase rework.

---

#### discuss-003: No verification strategy for workflow/agent markdown changes
**Severity:** Critical  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:43-47  
**Evidence:**
```
### Claude's Discretion
...
- Test strategy for workflow/agent markdown audits (automated content scanning vs manual review checklist)
```

**Justification:** With ~37 workflow files containing ~335 references and ~18 agent files containing ~132 references, manual review is error-prone. The document leaves verification strategy to discretion, but this decision has major quality implications:

1. **Scale:** 467 total references across markdown files is too large for reliable manual review.
2. **Success criteria gap:** The roadmap (PATH-11, PATH-12, PATH-13) requires grep audit confirmation, but doesn't specify how to validate semantic correctness of path substitutions in markdown (e.g., ensuring `${planning_root}/STATE.md` is used in the right context).
3. **Regression risk:** Without automated verification, future changes could reintroduce hardcoded paths.

**Impact:** High risk of missed references, incorrect substitutions, or test plan gaps that would require phase rework after execution begins.

---

### Warnings

#### discuss-004: Test fixture migration strategy not defined
**Severity:** Warning  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:40  
**Evidence:**
```
Test files that construct `.planning/` paths for setup (e.g., `createTempProject()`, `createTempMultiUserProject()`) must use the multi-user structure. Old-style `.planning/STATE.md` in test setup code is a violation.
```

**Justification:** The document states that test fixtures must use the multi-user structure, but doesn't clarify:

1. **Migration scope:** Does this phase include updating existing test files, or just enforcing the rule going forward?
2. **Transition strategy:** What happens to tests that currently use `createTempProject()` with the old structure? Do they need updating in this phase or a future one?
3. **Helper function status:** Is `createTempMultiUserProject()` already the standard, or does this phase include standardizing test helpers?

From the code_context section, we know `createTempMultiUserProject()` exists in `tests/helpers.cjs`, but the migration plan for existing tests using the old helper is unclear.

**Impact:** Could lead to incomplete test coverage or broken tests if the migration strategy isn't clarified before planning.

---

#### discuss-005: Workflow path substitution pattern needs validation
**Severity:** Warning  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:24-28  
**Evidence:**
```
- **Use `planning_root` from init JSON:** Workflows already call `gsd-tools.cjs init` and parse JSON. Replace all hardcoded `.planning/STATE.md` references with `${planning_root}/STATE.md` (inline substitution).
- **Always construct from `planning_root`:** Even when init JSON provides pre-resolved paths like `state_path`, workflows should construct paths from `planning_root` for consistency. Example: `${planning_root}/STATE.md` not `${state_path}`.
```

**Justification:** The decision to "always construct from `planning_root`" even when pre-resolved paths are available creates potential issues:

1. **Redundancy:** If `init` already provides `state_path`, requiring `${planning_root}/STATE.md` construction adds redundant path-building logic.
2. **Inconsistency risk:** If `init` changes how it resolves paths in the future, workflows would need to be updated to match, defeating the purpose of providing pre-resolved paths.
3. **Documentation clarity:** The document says to use `planning_root` for "consistency," but consistency with what? This decision should justify why explicit path construction is better than using pre-resolved paths.

**Impact:** Could lead to maintenance issues or confusion during implementation if the rationale isn't clarified.

---

#### discuss-006: Agent isolation enforcement mechanism unclear
**Severity:** Warning  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:30-33  
**Evidence:**
```
- **Strict isolation (PATH-12):** Agents receive ALL file paths via orchestrator `<files_to_read>` blocks. An agent never constructs `.planning/` paths in its own logic. No exceptions for "discovery" or "operational convenience."
- **Output paths in spawn prompt:** When an agent needs to write a file (SUMMARY.md, VERIFICATION.md, CRITIQUE.md), the exact output path is provided by the orchestrator in the spawn prompt. Agent uses it verbatim.
```

**Justification:** The strict isolation principle is clearly stated, but the enforcement mechanism isn't:

1. **Verification:** How will the grep audit distinguish between allowed documentation references in agent files (e.g., examples showing `.planning/` structure) and prohibited operational path construction?
2. **Placeholder variable standard:** The document mentions using placeholder variables like `{planning_root}`, but doesn't specify the exact format or provide examples. Are these bash variables, markdown placeholders, or something else?
3. **Semantic audit scope:** The document mentions "~132 references — categorize operational vs. illustrative" but doesn't provide criteria for categorization.

**Impact:** Ambiguous enforcement could lead to false positives/negatives in the audit, requiring rework.

---

#### discuss-007: Shared path-building helper decision deferred
**Severity:** Warning  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:44  
**Evidence:**
```
- Whether to create a shared path-building helper or repeat `path.join(getPlanningRoot(cwd), 'STATE.md')` patterns
```

**Justification:** This is listed as "Claude's Discretion," but it has architectural implications:

1. **Code duplication:** Repeating `path.join(getPlanningRoot(cwd), 'STATE.md')` in 8 modules creates maintenance burden and potential for typos.
2. **Consistency:** A shared helper (e.g., `getStatePath(cwd)`, `getPhasePath(cwd, phase)`) would ensure consistent path resolution.
3. **Future migration:** If the path structure changes again (e.g., Phase 3 project lifecycle features), a helper would minimize refactoring scope.

However, adding helpers isn't explicitly in the "pure path resolution refactor" scope defined in the phase boundary.

**Impact:** The decision affects code quality and maintainability. Should be discussed before planning to avoid scope creep or suboptimal patterns.

---

### Info

#### discuss-008: Module audit zero-ref assumption needs validation
**Severity:** Info  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:21-22  
**Evidence:**
```
- **Audit zero-ref modules too:** `state.cjs` and `roadmap.cjs` show 0 grep hits but must still be audited for implicit path assumptions (e.g., paths received from callers that assume `.planning/` root). Fix if needed.
```

**Justification:** The document correctly identifies that zero grep hits doesn't mean zero issues. However:

1. **Audit criteria:** What constitutes an "implicit path assumption"? Should auditors look for function signatures that accept pre-resolved paths? Parameters named `planningPath`?
2. **Fixing scope:** If implicit assumptions are found, does "fix if needed" mean adding validation, documentation, or actual code changes?

This is marked "Info" because the phase includes auditing these modules, but clarifying the audit criteria would improve thoroughness.

**Impact:** Minor - audit will likely catch issues, but explicit criteria would improve consistency.

---

#### discuss-009: Documentation path reference update scope unclear
**Severity:** Info  
**File:** .planning/phases/02-module-path-migration/02-CONTEXT.md:27-28  
**Evidence:**
```
- **Update documentation too:** Both operational path references AND documentation/example references within workflow markdown get updated. Docs should reflect the new `.planning/users/<user>/<project>/` structure, not the old flat structure.
```

**Justification:** The document states that documentation should reflect the new structure, but:

1. **Scope definition:** Does "documentation/example references" include:
   - Comments in workflow markdown explaining the file structure?
   - Example commands shown to users?
   - Error messages that show file paths?
2. **Backwards compatibility notes:** Should documentation mention the old structure for users migrating existing projects, or only show the new structure?

**Impact:** Minor - implementation will likely handle this correctly, but explicit scope would help reviewers validate completeness.

---

## Summary

**Critical Issues:** 3 findings that could cause phase failure if not addressed before planning:
- Ambiguous identity.cjs allowlist rules
- Undefined behavior for main dispatcher migration
- Missing verification strategy for 467 markdown references

**Warnings:** 4 findings that should be clarified to improve implementation quality:
- Test fixture migration strategy
- Workflow path substitution pattern justification
- Agent isolation enforcement mechanism
- Shared path-building helper architectural decision

**Info:** 2 findings that would improve thoroughness but aren't blockers:
- Zero-ref module audit criteria
- Documentation update scope definition

## Recommendations

### Before Planning Phase

1. **Resolve discuss-001:** Add a new section to CONTEXT.md explicitly defining the "repo-root planning path" pattern and listing ALL modules that need it (currently just identity.cjs, but might include others in future). Clarify whether identity.cjs needs migration work in this phase.

2. **Resolve discuss-002:** Either:
   - Add gsd-tools.cjs to the explicit module migration list with a reference count, OR
   - Document why it's out of scope and ensure it doesn't prevent achieving PATH-13.

3. **Resolve discuss-003:** Decide on verification strategy and document it. Recommendation: Create an automated test that:
   - Greps all workflow/agent markdown for `.planning/` references
   - Validates they match allowed patterns (e.g., within code blocks, documentation sections)
   - Runs in CI alongside the module audit gate

### During Planning Phase

4. **Address discuss-004:** In the PLAN.md, explicitly include updating test fixtures or document that they're out of scope with justification.

5. **Address discuss-005:** Either justify why explicit path construction is preferred, or revise the decision to allow using pre-resolved paths.

6. **Address discuss-006:** Define placeholder variable format and categorization criteria for the agent semantic audit.

7. **Address discuss-007:** Make an explicit decision on shared helpers, considering:
   - Scope constraint: "pure path resolution refactor, no new features"
   - Code quality: DRY principle vs. simplicity
   - Future maintenance: Phase 3 project lifecycle may need these helpers anyway

---

*Critique completed: 2026-03-31*  
*Phase: 02-module-path-migration*  
*Critique type: discuss*
