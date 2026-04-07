---
critique_type: discuss
phase: "04"
reviewed_at: "2026-04-07"
status: warn
severity_counts:
  critical: 3
  warning: 5
  info: 2
reviewed_artifacts:
  - 04-CONTEXT.md
executive_summary: "Phase 4 context covers all 6 TEAM requirements with clear implementation decisions for team-status, config resolution, and git attribution. Three critical gaps: (1) PATH-13 regression from Phase 3's new-project bootstrap is not actually a regression—the hardcoded path is a pre-init bootstrap step before getPlanningRoot() exists, but fixing it requires redesigning the two-step flow; (2) team-status STATE.md schema enforcement conflicts with existing auto-sync in writeStateMd()—the context doesn't clarify whether to add validation-on-read (team-status side) or validation-on-write (all callers); (3) migration from old flat structure contradicts REQUIREMENTS.md which explicitly lists it as 'Out of Scope' with rationale 'clean break is simpler.' Five warnings cover env var mapping scope, config resolve output format ambiguity, cross-user read safety boundaries, git attribution auto-detect edge cases, and STATE.md frontmatter field definitions missing from context."
---

# Phase 04 Discussion Critique

## Critical Findings

### discuss-C01: PATH-13 "regression" is not a regression—it's a bootstrap chicken-and-egg problem

**Description:** The context claims line 110 of `new-project.md` (`mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"`) violates the PATH-13 grep audit gate from Phase 2. However, this is NOT a regression—it's a fundamental bootstrap sequencing issue that Phase 3 introduced intentionally. The two-step bootstrap flow is:

1. **Step 1a (manual):** User answers project name question → derive `${SLUG}`
2. **Step 1b (manual):** `mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"` — creates the directory
3. **Step 2 (init call):** `INIT=$(gsd-tools.cjs init new-project)` — NOW `getPlanningRoot()` can resolve because the project directory exists

The problem: `getPlanningRoot()` requires a resolved context (user + project), which requires the project directory to exist, which means the FIRST `mkdir` must use a hardcoded path BEFORE any init call happens. Phase 2's PATH-13 audit gate allows hardcoded paths in "backwards-compatibility detector" and "documentation" — the new-project bootstrap is neither. It's operational code.

The context says "replace with resolved path from init output," but init output can't resolve a path that doesn't exist yet. The real solution requires either:
1. A new `init new-project-pre-bootstrap` command that returns the target path WITHOUT requiring the directory to exist (breaks `getPlanningRoot()` contract), OR
2. Redesigning new-project to call init FIRST with a flag like `--creating` that makes `getPlanningRoot()` use a different resolution strategy, OR
3. Accepting that the bootstrap mkdir is a special case and adding an audit gate exception for it

None of these are simple "replace hardcoded path" fixes. The planner needs to understand this is a design problem, not a grep-and-replace task.

**Evidence:**
- 04-CONTEXT.md lines 38-40: "Fix hardcoded .planning/ in new-project.md... Replace with resolved path from init output"
- `new-project.md` line 110: `mkdir -p ".planning/users/${USER_SLUG}/${SLUG}"` — happens BEFORE line 114's `INIT=` call
- `core.cjs` lines 80-83: `_resolvePlanningRootSoft()` calls `tryGetPlanningContext()`, which calls `resolveContext()`, which requires the project directory to exist
- Phase 2 ROADMAP line 78: PATH-13 confirms "zero unresolved raw `.planning/` path references" — but no exception for bootstrap

**Severity justification:** Critical — mislabeling this as a "regression fix" severely underestimates the work. A planner expecting a 15-minute grep fix would discover a multi-hour design task. This also risks breaking the existing new-project flow if approached naively.

---

### discuss-C02: STATE.md schema enforcement conflicts with existing writeStateMd() auto-sync behavior

**Description:** The context says "writeStateMd() ensures all required fields are present in frontmatter on every write. Missing fields get populated with defaults" (lines 42-44). However, `writeStateMd()` in `state.cjs` is a **sync** function, not a **validation** function. It extracts field values from the markdown **body** and reconstructs the frontmatter to match. It does NOT enforce that certain fields exist or populate defaults.

The context lists required fields: `milestone`, `status`, `last_updated`, `progress.total_phases`, `progress.completed_phases`, `progress.total_plans`, `progress.completed_plans`. But:
1. `writeStateMd()` has no concept of "required fields" — it syncs whatever it finds in the body
2. If the body doesn't contain "**Status:**", the frontmatter won't have `status`
3. Adding defaults to `writeStateMd()` means EVERY call (from every command) would auto-inject fields, even when the caller didn't intend to set them

The ambiguity: does schema enforcement happen:
- **On write** (in `writeStateMd()`)? Then every caller inherits these defaults, potentially overwriting user edits.
- **On read** (in team-status)? Then team-status handles missing fields gracefully, and schema enforcement is just a "nice to have" for consistency.
- **On specific write contexts** (only `cmdStateUpdate`, not `writeStateMd`)? Then the context needs to clarify which commands enforce the schema.

The planner needs clarity on WHERE the validation lives and WHAT happens when fields are missing (error? default? ignore?).

**Evidence:**
- 04-CONTEXT.md lines 42-44: "writeStateMd() ensures all required fields are present... Missing fields get populated with defaults"
- `state.cjs` lines 150-250: `writeStateMd()` extracts fields from body, reconstructs frontmatter — no validation or defaults
- 04-CONTEXT.md lines 21-24: team-status depends on `milestone`, `status`, `last_updated`, `progress.*` frontmatter fields

**Severity justification:** Critical — the implementation approach differs drastically based on the interpretation. A write-side enforcement changes the behavior of every STATE.md write in the entire system (high risk of side effects). A read-side enforcement is team-status-local (low risk). The context must specify which.

---

### discuss-C03: Migration from old flat structure is explicitly OUT OF SCOPE in REQUIREMENTS.md

**Description:** The context dedicates an entire section (lines 46-50) to "Hardening: Migration from old single-project structure," defining auto-migration behavior, detection triggers, and file-moving logic. However, REQUIREMENTS.md line 80 explicitly lists "Migration from old `.planning/` structure" in the "Out of Scope" table with the rationale: "Old structure fundamentally incompatible; clean break is simpler and clearer."

This is a direct contradiction. The REQUIREMENTS.md decision (from Phase 1 planning, 2026-03-17) was to NOT support migration because:
1. The old flat structure has no user directories
2. There's no way to automatically determine which user owns the old project
3. Migrating requires guessing project scope, which may be wrong
4. A clean error message directing users to manually re-initialize is safer

The context's migration plan violates this scoping decision. If the project team NOW wants migration support, the requirements need to be updated FIRST, and the roadmap scope for Phase 4 needs to expand. Alternatively, if the discuss-phase conversation drifted off-scope, this section should be moved to "Deferred Ideas" or removed entirely.

**Evidence:**
- 04-CONTEXT.md lines 46-50: full migration flow definition (detect, offer paths, auto-migrate, manual instructions)
- REQUIREMENTS.md line 80: "Migration from old `.planning/` structure" listed as Out of Scope
- REQUIREMENTS.md line 80 rationale: "Old structure fundamentally incompatible; clean break is simpler and clearer"
- ROADMAP.md Phase 4 goals (line 138): no mention of migration support

**Severity justification:** Critical — implementing an out-of-scope feature wastes phase budget on work that was explicitly rejected during requirements gathering. If migration is now required, it needs explicit sign-off and requirements update. If it's not required, the context misleads the planner into building the wrong thing.

---

## Warning Findings

### discuss-W01: Config key-to-env-var mapping is underspecified — which keys get GSD_* support?

**Description:** The context says "Which config keys get GSD_* env var mapping (start with the most commonly overridden)" is left to Claude's discretion (line 54). However, the planner needs at least a MINIMUM set to implement TEAM-04's env var precedence layer. The context doesn't provide:
1. A seed list of "must-have" env vars (e.g., GSD_MODEL_PROFILE? GSD_PARALLELIZATION? GSD_COMMIT_DOCS?)
2. Criteria for "commonly overridden" (based on what usage data?)
3. Whether env vars support ALL config keys or only a subset

The existing code already has `GSD_USER` and `GSD_PROJECT` (context.cjs line 79), establishing a precedent for snake_case env vars. But without a starter set, the planner might either:
- Implement too few (e.g., just GSD_MODEL_PROFILE), making the feature less useful
- Implement too many (e.g., all 15+ config keys), adding unnecessary maintenance burden

A minimum viable set (e.g., "at least GSD_MODEL_PROFILE, GSD_PARALLELIZATION, and GSD_COMMIT_DOCS") would anchor the planner without over-constraining.

**Evidence:**
- 04-CONTEXT.md line 54: "Which config keys get GSD_* env var mapping" listed under Claude's Discretion
- 04-CONTEXT.md line 28: "support environment variable overrides with `GSD_` prefix"
- `context.cjs` line 79: existing `GSD_PROJECT` env var precedent
- `core.cjs` lines 86-99: config has 15+ keys (model_profile, commit_docs, parallelization, etc.)

**Severity justification:** Warning — the feature is well-defined conceptually, but lack of a minimum viable set risks under-delivery (too few env vars) or over-engineering (too many). A planner needs at least 2-3 "must-have" examples to calibrate scope.

---

### discuss-W02: `config resolve` output format is ambiguous about "layers checked" display

**Description:** The context says `gsd-tools.cjs config resolve <key>` shows "the full chain of layers checked (env var, per-project, global, default) with which value each had" (lines 27-28). However, the output format is left to discretion (line 59: "How `config resolve` formats the 'layers checked' section").

The ambiguity: when a value is resolved from per-project config, should the output show:
1. **Only the winning layer**: "Value: 'balanced', Source: .planning/users/dan/frontend/config.json" (minimal)
2. **All layers with values**: "Per-project: 'balanced' ✓, Global: 'quality', Env: (not set), Default: 'balanced'" (comprehensive)
3. **All layers with presence indicators**: "Env var GSD_MODEL_PROFILE: (not set), Per-project: 'balanced' ✓, Global: (not set), Default: 'balanced'" (most verbose)

The context's phrase "full chain... with which value each had" suggests option 2 or 3, but without a format example, the planner might implement option 1 (which doesn't show the "chain"). An example output in the decisions section would eliminate the ambiguity.

**Evidence:**
- 04-CONTEXT.md line 27-28: "shows... the full chain of layers checked... with which value each had"
- 04-CONTEXT.md line 59: "How `config resolve` formats the 'layers checked' section (exact output formatting)" under discretion
- `core.cjs` lines 215-216: `result._sources = sources;` — sources already tracked, just needs formatting

**Severity justification:** Warning — the underlying data structure is clear (`_sources` object), but formatting ambiguity could lead to misaligned user expectations. A single example output would anchor the implementation.

---

### discuss-W03: Cross-user read scope boundaries are vague — what if permission errors or missing STATE.md?

**Description:** The context says team-status supports "read-only cross-user scope" and "path resolver supports reading other users' STATE.md frontmatter for team-status without modifying any files or breaking write isolation" (lines 23-24). However, the error handling boundaries are undefined:

1. **Permission errors:** On shared filesystems (NFS, corporate laptops with multi-user repos), reading another user's directory might fail with EACCES. Should team-status:
   - Skip the user silently?
   - Show the user with "(permission denied)" status?
   - Error and abort?

2. **Missing STATE.md:** A user might have a project directory but no STATE.md (corrupted, manually deleted, etc.). Should team-status:
   - Skip the project?
   - Show it with "unknown" status?
   - Show all fields as "(not available)"?

3. **Malformed frontmatter:** STATE.md exists but YAML is invalid. Same question.

The context says implementation of "how to handle permission errors, missing dirs" is Claude's discretion (line 56), but team-status is a TEAM-visible command — inconsistent error handling (some users visible, others silently skipped) creates confusion. At minimum, the context should specify whether errors are silent (skip) or visible (show with error indicator).

**Evidence:**
- 04-CONTEXT.md lines 23-24: "read-only cross-user scope... without modifying any files or breaking write isolation"
- 04-CONTEXT.md line 56: "how to handle permission errors, missing dirs" under discretion
- 04-CONTEXT.md line 20: "show all users... regardless of activity recency" — but what if unreadable?

**Severity justification:** Warning — the happy-path behavior is clear (read STATE.md frontmatter), but error paths are undefined. In a multi-user environment, errors are COMMON, not edge cases. The planner needs guidance on whether to be lenient (skip) or transparent (show errors).

---

### discuss-W04: Git commit attribution auto-detect might misfire on non-planning commits

**Description:** The context says `cmdCommit()` auto-detects when active project context exists and prepends `user/project/` to the scope (lines 34-36). The detection logic is: "if `resolveContext(cwd)` returns a non-null project, prepend the prefix." However, `cmdCommit()` is a GENERAL git commit wrapper used by:
1. Planning artifact commits (PLAN.md, STATE.md, ROADMAP.md) — SHOULD get prefix
2. Code commits from plan execution (src/api/routes.ts, etc.) — context says "stay clean with just the phase/plan scope" (line 35)

The context says "planning commits only" (line 34), but the auto-detect doesn't distinguish between planning and code commits. Both are called from workflows via `cmdCommit()`. The context needs to clarify HOW the distinction is made:
- **Caller passes a flag?** (e.g., `cmdCommit(cwd, message, files, raw, amend, isPlanningCommit)`)
- **File path heuristic?** (if files array contains `.planning/`, add prefix)
- **Commit message parsing?** (if message starts with `docs(` or `plan(`, add prefix)

Without this, a planner might implement "always prefix if context exists," which violates the "code commits stay clean" requirement.

**Evidence:**
- 04-CONTEXT.md line 34: "Planning commits only... Code commits from plan execution stay clean"
- 04-CONTEXT.md line 36: "`cmdCommit()` auto-detects when active project context exists"
- `commands.cjs` line 218: `function cmdCommit(cwd, message, files, raw, amend)` — no isPlanningCommit param currently
- `gsd-executor` agent: creates code commits via `cmdCommit()` wrappers

**Severity justification:** Warning — the policy is clear (planning-only prefix), but the implementation mechanism is ambiguous. A planner needs to know whether to add a parameter, inspect file paths, or parse commit messages. Each approach has different coupling characteristics.

---

### discuss-W05: STATE.md frontmatter field names are left to discretion but team-status depends on them

**Description:** The context lists required frontmatter fields for team-status (lines 42-43): `milestone`, `status`, `last_updated`, `progress.total_phases`, `progress.completed_phases`, `progress.total_plans`, `progress.completed_plans`. Then line 54 says "STATE.md frontmatter field names and defaults for schema enforcement" is Claude's discretion.

This creates a contradiction: if team-status depends on `milestone` and `status`, but the planner has discretion over field names, the planner might choose different names (e.g., `current_milestone`, `project_status`), breaking team-status's ability to parse STATE.md.

The context should either:
1. **Remove from discretion:** Lock the field names as part of the schema enforcement decision
2. **Clarify the constraint:** "Field names should match existing STATE.md conventions (milestone, status, last_updated) — discretion applies only to NEW fields or defaults"

The current wording creates a false sense of flexibility that doesn't actually exist.

**Evidence:**
- 04-CONTEXT.md lines 42-43: lists specific field names (milestone, status, last_updated, progress.*)
- 04-CONTEXT.md line 54: "STATE.md frontmatter field names and defaults" under discretion
- `context.cjs` lines 126-155: `listProjects()` already reads `stateFm.progress.completed_phases` — establishes precedent

**Severity justification:** Warning — the field names are de facto locked by team-status's consumption pattern, but the context suggests they're flexible. A planner might waste time considering alternatives that won't work. This should be clarified as "defaults only" or removed from discretion.

---

## Info Findings

### discuss-I01: Team-status table column widths and relative time format are true discretion but examples would help

**Description:** The context leaves "exact team-status table formatting (column widths, 'Last Active' relative time format)" to Claude's discretion (line 53). This is appropriate — these are presentation details that don't affect functionality. However, providing a single example output (even a sketch) would help the planner understand the expected UX:

```
USER      PROJECT       PHASE     PROGRESS  LAST ACTIVE
dan       frontend      03        3/5       2 hours ago
alice     backend       01        1/8       3 days ago
bob       mobile        02        5/5       1 week ago
```

vs.

```
User: dan | Project: frontend | Phase: 03 | Progress: 3/5 phases | Last: 2024-04-07 18:30 UTC
```

The first is compact/table, the second is verbose/list. Both are valid, but the planner benefits from knowing which style is preferred (or that either is acceptable).

**Evidence:**
- 04-CONTEXT.md line 19: "compact table with one row per user's active project"
- 04-CONTEXT.md line 53: "exact team-status table formatting" under discretion

**Severity justification:** Info — the decision is appropriately left to discretion, and a planner can make reasonable choices. An example would improve confidence but isn't critical.

---

### discuss-I02: Migration error handling is discretion but should have failure atomicity guidance

**Description:** The context says "Migration error handling (what happens if move fails partway through)" is Claude's discretion (line 57). Given that migration moves multiple files/directories (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, phases/, research/, etc.), a partial failure could leave the repo in a broken state (some files moved, others not).

The planner would benefit from guidance on atomicity expectations:
1. **Best-effort:** Move files one-by-one, if a file fails, continue with others, report which succeeded/failed
2. **Transactional:** Detect failure early (check permissions, disk space), abort before moving anything
3. **Backup-first:** Copy to temp, move to new location, delete old only if successful

The context's "Migration should work seamlessly for the common case" (line 93) suggests atomicity is important, but without explicit guidance, the planner might implement option 1 (which leaves a mess on failure).

**Evidence:**
- 04-CONTEXT.md line 57: "Migration error handling (what happens if move fails partway through)" under discretion
- 04-CONTEXT.md line 93: "Migration should work seamlessly... One command, everything moves"
- 04-CONTEXT.md lines 46-50: migration flow defined (auto-migrate moves all files)

**Severity justification:** Info — the happy-path behavior is clear, and a planner can make reasonable failure-handling choices. However, noting atomicity expectations would prevent a brittle implementation.

---

## Contradiction Check

### Contradiction: Migration in scope vs. Out of Scope in requirements

**See discuss-C03 above** — Phase 4 context includes migration as a hardening task, but REQUIREMENTS.md explicitly lists it as out of scope. This needs resolution before planning.

### No contradictions with prior phases EXCEPT config layering continuity

Phase 3's discuss-C02 finding noted that `loadConfig()` does NOT support per-project config layering (it reads only one file, not a merge). The Phase 3 context misleadingly claimed "already supports this pattern." 

Phase 4's TEAM-04 requirement ALSO requires config layering (hardcoded < global < per-project < env vars). The good news: Phase 3's implementation (completed as of STATE.md) DID add the two-file merge (global + per-project) with `_sources` tracking (core.cjs lines 130-216). So Phase 4's config work can build on Phase 3's completed layering.

However, the Phase 4 context says "loadConfig() already tracks which layer each value came from" (line 31) without noting that this was a Phase 3 deliverable. The planner should be aware that the `_sources` object exists and is already tracking global vs. per-project, but does NOT yet track env vars (TEAM-04's new layer).

**Evidence:**
- Phase 3 discuss-C02 (prior critique): claimed loadConfig() layering was misleading
- Phase 3 completed (STATE.md): all 5 plans done, including config two-file merge
- `core.cjs` lines 130-216: global/per-project layering with `_sources` tracking (added in Phase 3)
- 04-CONTEXT.md line 31: "`_sources` tracking from Phase 3... surfaces this existing data"

**Resolution:** Not a contradiction — Phase 4 correctly builds on Phase 3's work. Just noting for planner context.

---

*Critique generated: 2026-04-07*
*Reviewer: gsd-critic-discuss*
*Artifacts reviewed: 04-CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, core.cjs, context.cjs, state.cjs, commands.cjs, new-project.md*
