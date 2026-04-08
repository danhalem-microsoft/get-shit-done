---
critique_type: discuss
phase: "03"
reviewed_at: "2026-04-07"
status: warn
severity_counts:
  critical: 2
  warning: 4
  info: 3
reviewed_artifacts:
  - 03-CONTEXT.md
executive_summary: "Phase 3 context covers all 9 LIFE requirements with clear implementation decisions. Two critical gaps: (1) `listProjects()` is not exported from context.cjs despite being listed as a reusable asset, and the current implementation returns only a comma-joined string—it needs to return structured data for switch listings; (2) `loadConfig()` reads only ONE config file (per-project path) with no global-then-project layering, but the context claims it 'already supports this pattern' and just 'needs to be wired.' Four warnings cover ambiguous scope_path usage, missing new-project workflow refactoring details, unclear single-project auto-select vs. no-project error boundary, and the decision logging wiring scope being vaguely defined."
---

# Phase 03 Discussion Critique

## Critical Findings

### discuss-C01: `listProjects()` is not exported and returns wrong data shape

**Description:** The `<code_context>` section lists `listProjects(cwd, user)` in `context.cjs` as a "Reusable Asset" and says it's the "base for switch listing (needs enhancement for status info)." However, `listProjects` is **not exported** from `context.cjs` — it's an internal helper used only in one error message. Furthermore, the current implementation returns a flat comma-joined string (`projects.join(', ')` or `'(none)'`), which is unusable as a base for the structured switch listing that Phase 3 requires (status, phase, last activity, description).

**Evidence:**
- `context.cjs` line 88-99: `function listProjects(cwd, user)` returns a string
- `context.cjs` line 101-105: `module.exports` includes only `readActiveContext`, `writeActiveContext`, `resolveContext` — `listProjects` is absent
- 03-CONTEXT.md line 81: claims `listProjects(cwd, user) in context.cjs: scans user directory for projects — base for switch listing (needs enhancement for status info)`

**Severity justification:** Critical — a planner relying on the context doc would assume `listProjects` is an accessible, usable function and build plans around enhancing it. In reality, the function needs to be (a) exported, (b) refactored to return an array of project objects instead of a string, and (c) enhanced with status metadata. The gap between "enhance" and "redesign + export" is significant enough to affect plan estimates and task decomposition.

---

### discuss-C02: `loadConfig()` does NOT support per-project config layering — the claim is misleading

**Description:** The context document states: "`loadConfig()` in core.cjs already supports this pattern — needs to be wired to check project-level config." This is misleading. The current `loadConfig()` reads exactly ONE config file — whichever path `_resolvePlanningRootSoft(cwd)` resolves to. When the planning root resolves to `.planning/users/dan/frontend`, it reads `.planning/users/dan/frontend/config.json`. When no context is active, it falls back to `.planning/config.json`. It never merges the two.

The LIFE-06 requirement and the context's own precedence chain (`hardcoded < global < per-project < env vars`) require `loadConfig()` to read BOTH `.planning/config.json` (global) AND `.planning/users/<user>/<project>/config.json` (per-project), then merge them with proper precedence. The current code has no such layering.

**Evidence:**
- `core.cjs` lines 85-148: `loadConfig()` reads a single `configPath` derived from `_resolvePlanningRootSoft(cwd)`
- 03-CONTEXT.md line 49: "`loadConfig()` in core.cjs already supports this pattern — needs to be wired to check project-level config"
- 03-CONTEXT.md line 48: "Precedence: hardcoded defaults < `.planning/config.json` (global) < `.planning/users/<user>/<project>/config.json` (per-project) < environment variables"

**Severity justification:** Critical — the plan must include building config layering from scratch (read global, read per-project, merge with precedence), not merely "wiring" an existing capability. A planner acting on "already supports this pattern" would underestimate the work. This also has a dependency intersection with TEAM-04 (Phase 4), which defines the same precedence chain — the implementation needs to be correct here to avoid a Phase 4 rework.

---

## Warning Findings

### discuss-W01: `scope_path` concept is introduced but undefined

**Description:** The context says "Ask scope during creation — prompt which monorepo subdirectory or Bazel target the project is scoped to. Store in project `config.json` as `scope_path` or similar." But there's no definition of what `scope_path` actually does at runtime. Is it used for codebase mapping? Does it restrict which files GSD commands operate on? Does it affect `find` commands in `cmdInitNewProject`? The existing codebase has zero references to `scope_path` or any similar concept.

**Evidence:**
- 03-CONTEXT.md line 27: "prompt which monorepo subdirectory or Bazel target the project is scoped to"
- Grep for `scope_path`, `monorepo.*scope`, `bazel.*target` across `get-shit-done/` — zero results
- PROJECT.md line 37: "Projects are tied to subdirectories and/or Bazel targets within the monorepo"

**Severity justification:** Warning — the data is stored but never consumed. Without defining what `scope_path` does, downstream commands won't use it, making it dead data. If it's purely informational/aspirational, that should be stated. If it's meant to be used by commands, the consumers need to be identified.

---

### discuss-W02: New-project workflow refactoring scope is underspecified

**Description:** The context says the `new-project.md` workflow needs "major changes: project name prompt, scope prompt, artifact creation under user path, `.active` update." But the current `new-project.md` workflow is ~1400 lines and deeply structured. The context doesn't clarify:

1. Where in the existing flow does the project name prompt go (before Step 1's init call? That init call currently checks `project_exists` which requires a resolved planning root)
2. How `cmdInitNewProject()` changes — it currently uses `tryGetPlanningContext()` which assumes a project already exists to resolve paths. For a NEW project being named, there IS no project directory yet
3. The "List + confirm when existing projects" step requires calling `listProjects` BEFORE `init`, but `init` is the first step of the current workflow
4. Whether the workflow needs a new `init new-project-v2` command or can reuse the existing one

**Evidence:**
- 03-CONTEXT.md lines 19-27: detailed decisions about UX flow
- 03-CONTEXT.md line 98: "new-project.md workflow — major changes"
- `init.cjs` lines 184-253: `cmdInitNewProject()` assumes `tryGetPlanningContext()` as its starting point
- `new-project.md` line 49: workflow calls `init new-project` as first step

**Severity justification:** Warning — the workflow changes are the highest-complexity deliverable in this phase. A planner needs to understand the sequencing of "name project → create directory → then init" vs. the current "init → work in already-resolved directory." The chicken-and-egg problem (init needs a project to resolve, but the project doesn't exist yet) needs explicit discussion.

---

### discuss-W03: Single-project auto-select boundary with no-project error is ambiguous

**Description:** The context defines two behaviors that have an unclear boundary:
- LIFE-05: "If user has exactly one project, resolve it without requiring `.active` file" — auto-select
- Current `resolveContext()` line 76: hard-errors with "No active project" when `.active` is missing

The context says "No persistence needed — `resolveContext()` handles it transparently." But the current `resolveContext()` hard-errors when no `.active` file exists. The auto-select logic must be added to `resolveContext()` BEFORE the `.active` check, but after identity resolution. This means `resolveContext()` needs to scan the user's project directory.

The ambiguity: what happens when a user has ZERO projects and no `.active`? The current behavior is a hard error. The context's LIFE-07 says "list available projects and prompt user to switch or create one." But `resolveContext()` calls `error()` which does `process.exit(1)`. There's no way to "prompt" from a CLI tool that exits. This prompting must happen in the workflow layer, not in `resolveContext()`.

The planner needs clarity on: does `resolveContext()` get a new return value for "zero projects" (returning null?), or does `tryGetPlanningContext()` handle this case, or does the workflow call `listProjects` separately before `init`?

**Evidence:**
- 03-CONTEXT.md line 36: "runtime auto-select... resolveContext() handles it transparently"
- `context.cjs` lines 75-77: `if (!active) { error('GSD Error: No active project...') }`
- 03-CONTEXT.md lines 38-39: "/gsd:progress... no active project → list + prompt"
- `core.cjs` line 60: `error()` calls `process.exit(1)`

**Severity justification:** Warning — the implementation path differs significantly based on which layer handles the zero-project case. A workflow-layer solution (catch the error, then list projects) vs. a context-layer solution (return null, let caller decide) lead to different code structures and different testing strategies.

---

### discuss-W04: Command transparency audit (LIFE-08) scope is vague

**Description:** The context says "do not assume Phase 2 path migration is sufficient. Each existing command... must be tested end-to-end against the multi-user directory structure. Fix any that break." This is prudent but lacks specificity:

1. No test strategy is defined — are these manual tests? Automated integration tests? New test cases in existing test files?
2. The list of commands is ~15+ but no prioritization or risk assessment ("which commands are most likely to break?")
3. Phase 2 already migrated all path references and has a grep audit gate — what specific failure modes are expected beyond path issues?

Without this, a planner might either (a) create a 15-task test matrix that inflates the phase or (b) do a cursory check that misses real breakages.

**Evidence:**
- 03-CONTEXT.md lines 43-44: "Each existing command... must be tested end-to-end"
- Phase 2 completed grep audit gate (02-CONTEXT.md line 38-41)
- STATE.md shows Phase 2 complete with 5/5 plans done

**Severity justification:** Warning — the scope is unbounded. A planner needs to know whether this is a 1-task "run each command once" check or a multi-task "add integration test coverage" effort. The risk of scope creep is high without constraints.

---

## Info Findings

### discuss-I01: Decision logging wiring scope needs workflow enumeration

**Description:** The context lists four workflows for decision logging integration: `discuss-phase.md`, `new-project.md`, `new-milestone.md`, `plan-phase.md`. However, the `<decision_logging>` integration pattern (call `log-decision-init` at session start, `log-decision` after every user response) has different implications per workflow:
- `discuss-phase.md` — natural fit, every Q&A is a decision
- `new-project.md` — 1400 lines, many user prompts, each needs wrapping
- `plan-phase.md` — may not have user-interactive decisions (it's more of a generation flow)

The planner would benefit from knowing which workflows are "add 5 lines" vs. "refactor prompting loop."

**Evidence:**
- 03-CONTEXT.md lines 60-62: lists 4 workflows for decision logging
- `discuss-phase.md` — 870+ lines of complex flow
- `new-project.md` — 1400+ lines with many user interaction points

**Severity justification:** Info — the work is well-defined conceptually, just needs sizing guidance.

---

### discuss-I02: Archive/restore commands not mapped to any CLI dispatcher entry

**Description:** The context introduces `/gsd:archive-project` and `/gsd:restore-project` as new commands. These need:
1. Command `.md` files in `commands/gsd/`
2. Workflow `.md` files in `get-shit-done/workflows/`
3. Potentially new `init` commands or new CLI dispatcher cases in `gsd-tools.cjs`

The context doesn't specify whether archival is a pure workflow (markdown only, calling existing `gsd-tools.cjs` primitives to move directories) or requires new `gsd-tools.cjs` commands. Given that directory moves and `.active` clearing are involved, some tool-level support seems necessary.

**Evidence:**
- 03-CONTEXT.md lines 52-56: archive/restore behavior defined
- `gsd-tools.cjs` switch statement: no `archive-project` or `restore-project` cases
- `commands/gsd/` directory: no archive or restore command files

**Severity justification:** Info — the decisions about archive behavior are clear; the implementation layer (workflow vs. tool) is a planner detail, but noting it prevents surprises.

---

### discuss-I03: Fuzzy match for `/gsd:switch` is left to Claude's discretion — may need bounds

**Description:** The context says "try exact slug match first, then fuzzy match" and lists fuzzy match implementation (substring, prefix, Levenshtein) as Claude's discretion. This is reasonable, but the planner should know the expected behavior when fuzzy match returns multiple results (show all candidates? pick closest?). The context covers the "no match" case ("Error with suggestions") but not the "multiple fuzzy matches" case.

**Evidence:**
- 03-CONTEXT.md line 29: "try exact slug match first, then fuzzy match against project directory names. Error with suggestions if no match"
- 03-CONTEXT.md line 69: "How fuzzy matching works internally" listed under Claude's Discretion

**Severity justification:** Info — edge case that's unlikely to matter in practice (most users have 2-5 projects), but worth noting for completeness.

---

## Contradiction Check

### No contradictions with prior phases found

Phase 1 and Phase 2 context documents are consistent with Phase 3's scope. Phase 3 correctly builds on:
- `resolveContext()`, `writeActiveContext()`, `readActiveContext()` from Phase 1
- All modules using `getPlanningRoot()` from Phase 2
- `tryGetPlanningContext()` soft-resolve pattern from Phase 1

### Minor consistency note

TEAM-04 (Phase 4) defines the same config precedence chain as LIFE-06 (Phase 3). The Phase 3 context's implementation should be designed with Phase 4's `config resolve` debug command in mind — i.e., the layering code should track which layer each value came from, not just merge blindly. This isn't a contradiction, but a forward-compatibility consideration.

---

*Critique generated: 2026-04-07*
*Reviewer: gsd-critic-discuss*
*Artifacts reviewed: 03-CONTEXT.md, context.cjs, core.cjs, init.cjs, config.cjs, new-project.md, progress.md, gsd-tools.cjs*
