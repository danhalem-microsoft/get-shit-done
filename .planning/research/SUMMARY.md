# Project Research Summary

**Project:** GSD Multi-User Monorepo Support
**Domain:** Multi-user, multi-project state isolation for CLI-based developer workflow tooling
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

GSD's multi-user monorepo enhancement is a well-trodden architectural problem with strong industry consensus on the solution: **directory-based isolation keyed by user identity**. Every major monorepo tool (Bazel, Nx, Turborepo, Rush) separates shared configuration from per-user state using filesystem structure rather than locking, databases, or IPC. GSD's planned `.planning/users/<user>/<project>/` hierarchy directly mirrors this consensus, with one deliberate distinction: GSD keeps per-user state *inside* the repo (git-tracked, team-visible) rather than outside it (like Bazel's `~/.cache/`), because planning artifacts are collaborative context, not ephemeral caches.

The recommended approach centers on a **single path resolution function** (`getPlanningRoot()`) in `core.cjs` that reads an active context file and returns the user-qualified planning directory. This function becomes the chokepoint through which all 540+ hardcoded `.planning/` references must flow. User identity is derived from `git config user.name` with filesystem sanitization — zero additional configuration. The `.active` file (gitignored JSON) persists the current user+project selection, with environment variable overrides for CI and multi-terminal scenarios.

The primary risk is **incomplete path migration across three layers**: JavaScript modules (refactorable via function extraction), workflow markdown (manual find-and-replace across 37 files), and agent markdown (semantic path replacement in 132 references). The `init.cjs` module alone has 53 path references and serves as the "narrow waist" of the architecture — fixing it correctly propagates to 80% of downstream consumers. Secondary risks include `.active` file race conditions in concurrent sessions and git identity fragility with non-ASCII names or identity changes. All critical risks are mitigable through patterns documented in the research, and the agent layer requires zero modifications since agents receive fully-resolved paths via spawn prompts.

## Key Findings

### From STACK.md

- **Directory-based isolation is the unanimous pattern** across Bazel, Nx, Turborepo, Rush, and XDG. No surveyed tool uses file locking, databases, or IPC for user state separation. GSD's planned hierarchy matches this consensus exactly.
- **Git identity (`user.name`) is the standard approach** for user resolution. No tool builds its own identity system. Fallback chain: `user.name` -> email local-part -> OS username. Sanitization to lowercase-hyphenated slugs is essential.
- **Atomic file writes via write-temp-rename** replace `fs.writeFileSync` for corruption safety. File locking is unnecessary given directory isolation — the only shared-write surface is `.active`, which is per-machine local state.
- **Configuration layering** follows the universal pattern: hardcoded defaults < shared config (`.planning/config.json`) < per-project config (`users/<user>/<project>/config.json`) < environment variables. Later layers override earlier ones.
- **Team visibility without shared state** is achievable via read-only directory scanning of other users' STATE.md frontmatter — the filesystem *is* the database, no aggregation service needed.

### From FEATURES.md

- **Path resolution through active context is the highest-effort change** (~60+ hardcoded references in `init.cjs` alone). Every existing GSD command must route through `resolveBase()` transparently. This is the critical path — if it fails, nothing works.
- **MVP is tightly defined**: user identity, `resolveBase()`, active context file, scoped project initialization, project switching, backwards-incompatibility detection, and all existing commands working through new paths. Team status, archival, and cross-project dependency awareness are post-validation.
- **Anti-features are clearly delineated**: real-time collaboration, shared roadmaps, same-phase concurrency, migration from old structure, custom identity systems, and centralized task assignment are all explicitly out of scope. These are product category traps, not features.
- **No direct competitors exist** in the "multi-user AI-assisted planning" space. Nx/Turborepo/Bazel handle multi-project but not multi-user. Table stakes are defined by adjacent tool expectations (git, IDE workspaces), not competitor features.
- **Feature dependency chain is linear**: User Identity -> Active Context -> Path Resolution -> ALL existing commands. Team Status is independently buildable.

### From ARCHITECTURE.md

- **Two new modules** are needed: `identity.cjs` (~100 LOC, user resolution) and `context.cjs` (~300 LOC, active context + project registry). `getPlanningRoot()` lives in existing `core.cjs` (~30 LOC) since every module already imports it.
- **The agent layer requires zero modifications.** Agents receive file paths via spawn prompts from orchestrators. Path resolution happens entirely in the orchestration layer. This is the most important architectural observation — it dramatically reduces scope.
- **Layered context resolution** separates concerns: identity (who) -> active context (which project) -> path (where). Each layer is independently testable and changeable.
- **The init compound commands are the primary injection point.** Adding `active_user`, `active_project`, and `planning_root` to the existing init JSON payload makes multi-user context available to all workflows without API changes.
- **Build order is strictly sequenced**: identity.cjs -> context.cjs -> core.cjs `getPlanningRoot()` -> 8 module migrations (parallelizable) -> init.cjs enhancement -> new commands -> verification.

### From PITFALLS.md

- **540+ hardcoded `.planning/` references across 62 files** span three layers (JS, workflow markdown, agent markdown) with different resolution mechanisms. A grep audit gate (`zero raw .planning/ references`) must be enforced before declaring migration complete.
- **The `.active` file is process-global mutable state** — a `/gsd:switch` in one terminal affects all concurrent sessions. Mitigation: environment variable as primary mechanism, `.active` as persistent default that env vars override.
- **Git identity sanitization must be aggressive and locked in**: derive slug on first use, write to a mapping file (`.planning/user-map.json`), use the mapping as source of truth thereafter. Raw `git config` should never auto-create directories without confirmation.
- **`init.cjs` is the narrow waist** with 53 path references. It composes results from multiple modules and returns JSON with both existence checks and path strings — both must agree on the user-qualified path.
- **"Everything per-user" is a deliberate tradeoff**: it eliminates merge conflicts in planning artifacts but also eliminates shared understanding. `/gsd:team-status` provides visibility; collaborative roadmaps are a future consideration if needed.

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Foundation — Identity, Context, and Path Resolution**
*Rationale:* All research files unanimously agree this is the critical path. Every subsequent feature depends on correct path resolution. Build order is strictly sequenced: identity -> context -> path resolver -> module migration -> init enhancement.

What it delivers:
- `identity.cjs` — git user resolution with sanitization (STACK.md Pattern 2)
- `context.cjs` — active context manager with `.active` file I/O (STACK.md Pattern 3, ARCHITECTURE.md Pattern 2)
- `getPlanningRoot()` in `core.cjs` — the single chokepoint function (ARCHITECTURE.md Pattern 1)
- Migration of 8 existing modules to use resolved paths (ARCHITECTURE.md Build Order Phase 3)
- `init.cjs` enhancement with context fields in all init outputs (ARCHITECTURE.md Pattern 3)
- Backwards-incompatibility detection for old flat `.planning/` structure

Cross-references: STACK.md (Patterns 1-5), ARCHITECTURE.md (Build Order Phases 1-4), PITFALLS.md (Pitfalls 1-5, 7-8), FEATURES.md (all P1 features)

**Research flag:** Standard patterns — no additional research needed. Implementation patterns are well-documented across all four research files.

---

**Phase 2: New Commands and Project Lifecycle**
*Rationale:* With path resolution working, new commands can be built on the proven foundation. Project initialization must be scoped to the user directory; switching enables multi-project workflows.

What it delivers:
- Modified `/gsd:new-project` — creates artifacts under `.planning/users/<user>/<project>/`
- `/gsd:switch` command — set active project (with args) or list and choose (without args)
- Scoped project listing in `/gsd:progress`
- Atomic file writes (write-temp-rename) for STATE.md and `.active` (STACK.md Pattern 4)

Cross-references: ARCHITECTURE.md (Data Flows — Project Creation, Project Switch), FEATURES.md (MVP features), PITFALLS.md (Pitfall 2 — `.active` race condition mitigation)

**Research flag:** Standard patterns — no additional research needed.

---

**Phase 3: Team Visibility and Polish**
*Rationale:* Team features depend on the isolation model being proven. `/gsd:team-status` requires the path resolver to support cross-user reads (PITFALLS.md Pitfall 6), which must be designed carefully to avoid breaking isolation guarantees.

What it delivers:
- `/gsd:team-status` — read-only aggregation across all users' STATE.md frontmatter
- Git commit attribution refinements for multi-user clarity (PITFALLS.md Pitfall 9)
- Config layering with explicit precedence and `config resolve` debug command
- Warnings when duplicate project names exist across users (PITFALLS.md Pitfall 10)

Cross-references: STACK.md (Pattern 6 — team visibility), ARCHITECTURE.md (Team Status Flow), PITFALLS.md (Pitfalls 6, 9, 10), FEATURES.md (P2 features)

**Research flag:** May need light research on frontmatter schema standardization for cross-user reads.

---

**Phase 4: Hardening and Edge Cases**
*Rationale:* After core functionality is validated, address the long tail of edge cases identified in PITFALLS.md — identity mapping persistence, CI/CD environment handling, performance optimization for team-status scanning at scale.

What it delivers:
- User identity mapping file (`.planning/user-map.json`) for identity stability
- CI/CD environment detection (refuse user directory creation when `CI=true`)
- Project archival (`_archived/` directory)
- Performance: cached team index, single git identity resolution per workflow
- User-scoped `.gitignore` support

Cross-references: PITFALLS.md (Pitfalls 3, recovery strategies), FEATURES.md (v1.x features), STACK.md (CI/CD variant)

**Research flag:** Standard patterns — no additional research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| STACK.md | HIGH | Patterns validated across 5 major tools (Bazel, Nx, Turborepo, Rush, XDG). Universal consensus on directory-based isolation. Sources include official documentation. |
| FEATURES.md | HIGH | Feature landscape well-defined with clear MVP/defer boundaries. Anti-features are substantiated with concrete rationale. Dependency chain is testable. |
| ARCHITECTURE.md | HIGH | System architecture follows established CLI tooling patterns. Build order is dependency-validated. The "agents unaffected" observation significantly de-risks scope. |
| PITFALLS.md | HIGH | 10 pitfalls identified with specific warning signs, prevention strategies, and phase mappings. Grounded in codebase analysis (540+ reference count, 53 init.cjs references). Recovery strategies are pragmatic. |

### Gaps to Address

- **Workflow markdown audit**: The 335 `.planning/` references in workflow files need categorization (operational vs. documentation) before Phase 1 implementation begins. This is mechanical work, not research.
- **Agent markdown audit**: The 132 `.planning/` references in agent files need semantic analysis to determine which are path-constructing (must change) vs. illustrative (can stay). This requires reading each agent file.
- **Frontmatter schema for team-status**: No research file defines the exact STATE.md frontmatter fields that `/gsd:team-status` should read. Need to standardize before Phase 3.
- **Windows path handling**: Write-temp-rename atomicity on Windows is noted as "works as of Node.js 12+" but not tested. If Windows support matters, verify.

---

## Sources

Synthesized from 4 research files:

- STACK.md
- FEATURES.md
- ARCHITECTURE.md
- PITFALLS.md

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
