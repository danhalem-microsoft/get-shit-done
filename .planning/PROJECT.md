# GSD Multi-User Monorepo Support

## What This Is

A multi-user extension for the GSD (Get Shit Done) meta-prompting system. Multiple users work on independent projects within a single monorepo — each with their own planning artifacts, state, and project lifecycle under `.planning/users/<user>/<project>/`. Includes team visibility (`/gsd:team-status`), 4-tier config layering with env var overrides, commit attribution, and migration from legacy single-user structure.

## Core Value

Multiple users can run independent GSD projects in the same monorepo without conflicting on planning artifacts, state, or git history — each user has their own complete planning universe while sharing the same codebase.

## Requirements

### Validated

- User can initialize a GSD project (new-project workflow) — existing
- User can plan, execute, and verify phases — existing
- User can track project state across sessions — existing
- Planning artifacts are markdown with YAML frontmatter — existing
- All state mutations go through gsd-tools.cjs — existing
- Zero runtime dependencies (pure Node.js built-ins) — existing
- Atomic git commits per task — existing

## Requirements

### Validated

- ✓ User-first directory structure: `.planning/users/<git-username>/<project-name>/` — v1.0
- ✓ Each user gets fully independent planning artifacts per project — v1.0
- ✓ Global config at `.planning/config.json` for shared defaults — v1.0
- ✓ Active project selection persisted in `.planning/.active` file — v1.0
- ✓ `/gsd:switch` command — with args sets active project, without args lists projects — v1.0
- ✓ Project identity derived from git user — v1.0
- ✓ GSD is branch-agnostic — v1.0
- ✓ Per-user state files are committable but conflict-free — v1.0
- ✓ Multiple users can work on different phases simultaneously — v1.0
- ✓ `/gsd:team-status` command — cross-user visibility — v1.0
- ✓ All existing GSD commands operate on active project context — v1.0
- ✓ gsd-tools.cjs resolves paths through active project context — v1.0
- ✓ Projects tied to subdirectories/Bazel targets within monorepo — v1.0
- ✓ Legacy structure migration flow — v1.0

### Active

(None — next milestone requirements TBD via `/gsd:new-milestone`)

### Out of Scope

- ~~Migration from old single `.planning/` structure~~ — **Delivered in v1.0** (graceful detection + auto-migrate)
- Shared roadmaps across users — each user's planning is fully independent
- Same-phase concurrency (two users on the same phase of the same project) — different phases only
- Real-time collaboration features — this is async via git
- GSD-specific user identity system — git identity is sufficient
- Shared codebase maps — everything is per-user (users may have different analysis needs)

## Context

GSD currently assumes a single project per repository with a flat `.planning/` directory. This works for solo developers but breaks down in monorepo environments where:

1. **Multiple projects** coexist (frontend app, auth service, data pipeline) — each needing independent GSD lifecycle
2. **Multiple users** work in the same repo — their STATE.md, ROADMAP.md, and phase artifacts conflict on merge
3. **Different branching strategies** are used by different team members — GSD shouldn't dictate git workflow

The existing architecture is well-suited for this enhancement:
- `gsd-tools.cjs` already centralizes all state mutations — path resolution can be updated in one place
- Workflows use `gsd-tools.cjs init` for context — adding user/project resolution to init is the natural injection point
- Markdown + YAML frontmatter format is inherently conflict-resistant when files are separated by user
- The orchestrator-agent pattern means agents already receive paths via prompts — changing the path root propagates automatically

### Target Directory Structure

```
.planning/
  config.json                       # Global defaults (model profile, etc.)
  user-map.json                     # Identity slug mapping (git identity → dir name)
  users/
    dan/
      .active                       # Current project selection for this user (gitignored)
      frontend/
        PROJECT.md
        ROADMAP.md
        REQUIREMENTS.md
        STATE.md
        config.json                 # Project-level overrides
        research/
        phases/
          01-foundation/
          02-features/
      auth-service/
        PROJECT.md
        ROADMAP.md
        ...
    alice/
      .active
      frontend/
        PROJECT.md
        ROADMAP.md
        ...
```

### Key Design Considerations

- **Path resolution:** Every GSD operation currently hardcodes `.planning/` — needs to resolve to `.planning/users/<user>/<project>/`
- **Git identity:** Use `git config user.name` (or `user.email`) to derive the user directory name. Sanitize for filesystem safety.
- **Active context:** `.planning/users/<user>/.active` stores `{"project": "frontend"}` — per-user so multiple users on same machine don't conflict
- **Conflict avoidance:** Since each user has their own subdirectory tree, merge conflicts are structurally impossible on planning artifacts
- **Backwards compatibility:** This is a breaking change. Old `.planning/` directories are not migrated — clean break.

## Constraints

- **Tech stack**: Node.js built-ins only (zero dependencies) — matches existing GSD constraint
- **Compatibility**: Must work with existing Claude Code, OpenCode, Gemini CLI, and Codex runtimes
- **Module format**: CommonJS (.cjs) — matches existing codebase
- **Git identity**: Uses `git config user.name` or `user.email` — no GSD-specific identity system
- **File size**: gsd-tools.cjs is already ~9000 LOC — changes should be modular (lib/ modules)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| User-first hierarchy (users/dan/project vs projects/frontend/dan) | User directories naturally isolate all of one person's work; easier to reason about ownership | ✓ Good — clean isolation, team-status scans naturally |
| Everything per-user (including roadmaps, codebase maps) | Maximum independence — each user's GSD is their own | ✓ Good — zero conflicts in practice |
| Git identity for user resolution | Already available in every git repo, no additional config needed | ✓ Good — with user-map.json locking for stability |
| Per-user .active for project selection | Per-user avoids race condition between concurrent users on same machine | ✓ Good — gitignored correctly, auto-select for single project |
| Migration from old structure (added in v1.0) | User requested during Phase 4 — graceful upgrade path needed | ✓ Good — copy-then-delete with --project-name fallback |
| Branch-agnostic design | Monorepo teams use diverse branching strategies | ✓ Good — no branching conflicts |
| 4-tier config precedence | defaults < global < per-project < env vars | ✓ Good — _sources tracking enables config resolve debug |

## Context

**Shipped:** v1.0 (2026-04-08)
**Codebase:** 7,074 LOC core (lib/*.cjs), 14,234 LOC tests, 694 tests passing
**Tech stack:** Node.js built-ins only (zero dependencies), CommonJS, native `node:test`
**Architecture:** Orchestrator-agent pattern with gsd-tools.cjs CLI for all state mutations
**Known tech debt:** PATH-13 bootstrap exemption (chicken-and-egg), cmdConfigResolve constant duplication, team-status limited on fresh clones (.active is gitignored)

---
*Last updated: 2026-04-08 after v1.0 milestone*
