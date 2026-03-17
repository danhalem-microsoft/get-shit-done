# Feature Research

**Domain:** Multi-user/multi-project support for CLI-based developer workflow tooling (monorepo context)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Automatic user identity resolution** | Users shouldn't have to configure who they are — git identity already exists in every repo | LOW | `git config user.name` → sanitize for filesystem. Fallback chain: `user.name` → `user.email` → prompt. Already decided in PROJECT.md |
| **Per-user artifact isolation** | Two users' STATE.md / ROADMAP.md must never conflict on merge — this is the entire premise | MEDIUM | Directory-based isolation: `.planning/users/<user>/<project>/`. Structurally eliminates merge conflicts on planning files |
| **Active project context** | Every GSD command must know which project it's operating on without the user specifying it each time | LOW | `.planning/.active` JSON file: `{"user": "dan", "project": "frontend"}`. Read on every `gsd-tools.cjs` invocation |
| **Project switching (`/gsd:switch`)** | Users working on multiple projects need to change context; without args = list projects, with args = set | LOW | With args: validate project exists, update `.active`. Without args: list user's projects, show active, let user pick |
| **Path resolution through active context** | All existing commands must work unchanged — the path root just shifts from `.planning/` to `.planning/users/<user>/<project>/` | HIGH | ~60+ hardcoded `.planning/` references in `init.cjs` alone. Every path in core.cjs, state.cjs, phase.cjs, etc. needs a `resolveBase(cwd)` function that reads `.active` and returns the right prefix. This is the single highest-effort change |
| **Project initialization scoped to user** | `/gsd:new-project` must create artifacts under the user's directory, not the flat `.planning/` root | MEDIUM | Extend `new-project` workflow to resolve user dir, create `users/<user>/<project>/` tree. Must handle first-time setup (create `users/` and user dir if absent) |
| **Per-project config** | Users need project-level settings (model profile, workflow toggles) independent of other users/projects | LOW | Already exists as `.planning/config.json` — just move to `.planning/users/<user>/<project>/config.json`. Global defaults at `.planning/config.json` with per-project overrides |
| **Listing user's projects** | User needs to see what projects they have; discoverable without remembering directory names | LOW | Scan `users/<current-user>/` for directories containing `PROJECT.md`. Display in `/gsd:switch` (no args) and `/gsd:progress` |
| **Backwards-incompatibility error** | If old flat `.planning/` structure detected (has `PROJECT.md` at root), commands should error clearly, not silently break | LOW | Check for `.planning/PROJECT.md` at root in init — if found, emit clear error: "Old single-user structure detected. Multi-user GSD requires re-initialization." |
| **Git-committable state** | All planning artifacts must remain git-trackable so project state survives across machines | LOW | Already the case — just ensure `.gitignore` doesn't exclude user dirs. `.active` file should probably be in `.gitignore` (local-only) |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Team status visibility (`/gsd:team-status`)** | See what other team members are working on without interrupting them — async team awareness via git | MEDIUM | Scan `users/*/` directories, read each user's `STATE.md` frontmatter (current_phase, last session). Display table: user, project, phase, last active. Zero-coordination team awareness |
| **Zero-config user identity** | No `.gsdrc`, no `gsd init --user`, no environment variables — just use git. Frictionless onboarding | LOW | Already decided. Differentiates from tools that require separate identity/auth setup. New team member clones repo, runs `/gsd:new-project`, done |
| **Branch-agnostic design** | GSD has no opinion on branching — trunk-based, feature branches, release branches all work | LOW | Already decided. Monorepo teams use diverse strategies. GSD's only git interaction is atomic commits. Differentiates from tools that impose branching conventions |
| **Structural merge-conflict immunity** | Not just "reduced conflicts" but structurally impossible conflicts on planning artifacts (separate file paths per user) | LOW | Inherent to the directory design. No locks, no conflict resolution, no merge strategies needed. This is a major selling point for teams |
| **Cross-project dependency awareness** | When a user's project depends on code another user is actively changing, surface that | HIGH | Would require parsing Bazel targets or package.json dependencies and cross-referencing with other users' active projects. Very powerful for monorepo coordination but significant implementation effort |
| **User-scoped `.gitignore` support** | Individual users can choose to not commit their planning artifacts (e.g., experimental projects) | LOW | Add `.planning/users/<user>/.gitignore` support. Some users may want local-only planning for throwaway experiments |
| **Project archival** | Completed projects can be archived without deletion, keeping history accessible but decluttering active project lists | LOW | Move to `.planning/users/<user>/_archived/<project>/` or add `archived: true` to project config. Filter from default listings |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time collaboration / live sync** | Teams want to see each other's changes instantly | GSD is async-by-design (git-based). Real-time requires a server, WebSockets, conflict resolution — fundamentally incompatible with the zero-dependency, file-based architecture. Also overkill: GSD sessions are solo AI-assisted work | Git pull/push for sync. `/gsd:team-status` reads committed state. Async is a feature, not a limitation |
| **Shared roadmaps across users** | Teams want one roadmap for the whole project | Different users have different analysis needs, timelines, and priorities. Shared roadmaps create coordination overhead, bottlenecks, and conflict zones. Also contradicts "each user's GSD is their own" principle | Each user owns their roadmap. Team coordination happens through code and PRs, not through shared planning documents |
| **Same-phase concurrency (two users on same phase of same project)** | Two people want to work on "Phase 2: Auth" simultaneously | Executors make atomic commits to the same files — concurrent execution on the same phase would create git conflicts in source code, not just planning artifacts. GSD's wave-based execution assumes single-executor-per-phase | Different users work on different phases (structurally separated). If truly needed, split the phase into sub-projects |
| **Migration tool from old `.planning/` structure** | Existing users want to preserve their planning history | Old structure is fundamentally incompatible (single-user assumptions baked throughout). Migration would need to guess which user owns existing artifacts. Clean break is simpler, more reliable, and communicates the scope of the change | Document the breaking change clearly. Old `.planning/` can be git-archived manually if history matters |
| **GSD-specific user identity system** | What if someone doesn't use git? Custom usernames? | Adds configuration burden, requires new state management, creates yet another identity to manage. Every GSD user already has git configured (it's a git-based tool) | Git identity is sufficient. If git isn't configured, prompt to set it up — that's a prerequisite |
| **Centralized task assignment / project management** | Teams want to assign tasks to specific users through GSD | Turns GSD from a developer productivity tool into a project management tool — different product category entirely. Would need auth, permissions, notifications, dashboards | Each user plans their own work. External tools (Linear, Jira, GitHub Issues) handle team-level task assignment |
| **Shared codebase maps across users** | "Why should two users analyze the same codebase separately?" | Different users may focus on different parts of the monorepo, use different tools, care about different concerns. Shared maps create staleness and ownership ambiguity | Per-user codebase analysis. If two users analyze the same code, their maps may actually differ usefully (different perspectives) |
| **Lock files / pessimistic concurrency** | Prevent two users from modifying the same project | File-level locks are fragile (stale locks, crashes), require cleanup mechanisms, and contradict the async git model. Directory isolation already eliminates the conflict surface | Directory-based isolation makes locks unnecessary. Each user's files are their own — no shared mutable state to protect |

## Feature Dependencies

```
[Path Resolution (resolveBase)]
    +--requires--> [Active Context (.active file)]
    |                  +--requires--> [User Identity Resolution]
    |
    +--required-by--> [ALL existing commands]
    +--required-by--> [Project Initialization (scoped)]
    +--required-by--> [Project Switching (/gsd:switch)]

[Project Switching (/gsd:switch)]
    +--requires--> [Active Context (.active file)]
    +--requires--> [Project Listing (scan user dir)]
    +--requires--> [User Identity Resolution]

[Team Status (/gsd:team-status)]
    +--requires--> [User Identity Resolution]
    +--requires--> [Per-user artifact isolation (directory structure)]
    +--independent-of--> [Path Resolution] (reads other users' dirs directly)

[Per-project Config]
    +--requires--> [Path Resolution (resolveBase)]
    +--enhances--> [Global Config (.planning/config.json)]

[Project Archival]
    +--requires--> [Project Listing]
    +--enhances--> [Project Switching]

[Cross-project Dependency Awareness]
    +--requires--> [Team Status]
    +--requires--> [Bazel/package.json parsing]
    +--conflicts-with--> [Zero-dependency constraint] (may need external tooling)
```

### Dependency Notes

- **Path Resolution requires Active Context:** Every `gsd-tools.cjs` command needs to know `{user}/{project}` to construct file paths. The `.active` file provides this. Without it, nothing works.
- **Active Context requires User Identity:** The `.active` file stores the user. On first run (no `.active` exists), user identity must be resolved from git to populate it.
- **ALL existing commands require Path Resolution:** This is the critical path. The 60+ hardcoded `.planning/` references must all route through `resolveBase()` before any command works in multi-user mode.
- **Team Status is independent of Path Resolution:** It reads other users' directories directly (not through the active context), so it can be built after or in parallel with the core path changes.
- **Cross-project Dependency Awareness conflicts with zero-dependency constraint:** Parsing Bazel BUILD files or complex `package.json` dependency graphs may require external tooling or significant custom parsing. Defer.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate that multi-user works.

- [ ] **User identity resolution** — Derive user directory name from `git config user.name`, sanitized for filesystem safety (lowercase, replace spaces with hyphens, strip special chars)
- [ ] **`resolveBase()` function** — Single function in core.cjs that reads `.active` and returns the planning base path (`.planning/users/<user>/<project>/`). All path references route through this
- [ ] **Active context file (`.planning/.active`)** — JSON file storing current `{user, project}`. Read on every invocation. Created on first `/gsd:new-project`
- [ ] **Scoped project initialization** — `/gsd:new-project` creates artifacts under `.planning/users/<user>/<project>/` instead of `.planning/`
- [ ] **Project switching (`/gsd:switch`)** — Set active project (with args) or list and choose (without args)
- [ ] **Global config at `.planning/config.json`** — Shared defaults; per-project config inherits and overrides
- [ ] **Backwards-incompatibility detection** — Clear error if old flat `.planning/PROJECT.md` structure detected
- [ ] **All existing commands work through new path resolution** — plan-phase, execute-phase, verify-work, progress, etc. all operate on active project context seamlessly

### Add After Validation (v1.x)

Features to add once core multi-user flow is working and tested.

- [ ] **Team status (`/gsd:team-status`)** — Triggered by first real multi-user usage; scan all users' STATE.md and display team overview
- [ ] **Project archival** — Triggered when users accumulate completed projects that clutter the project list
- [ ] **User-scoped `.gitignore`** — Triggered when users request local-only experimental projects
- [ ] **Project templates** — Clone another user's project structure as a starting point (copy directory layout without content)

### Future Consideration (v2+)

Features to defer until multi-user is proven in practice.

- [ ] **Cross-project dependency awareness** — Requires Bazel/package.json parsing; defer until team coordination pain is validated
- [ ] **Project-level permissions / ownership** — Not needed until larger teams with governance requirements appear
- [ ] **Multi-repo support** — GSD is per-repo today; cross-repo coordination is a different product

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| User identity resolution | HIGH | LOW | P1 |
| `resolveBase()` path resolution | HIGH | HIGH | P1 |
| Active context (`.active` file) | HIGH | LOW | P1 |
| Scoped project initialization | HIGH | MEDIUM | P1 |
| Project switching (`/gsd:switch`) | HIGH | LOW | P1 |
| All commands through new paths | HIGH | HIGH | P1 |
| Backwards-incompat detection | MEDIUM | LOW | P1 |
| Global + per-project config | MEDIUM | LOW | P1 |
| Team status (`/gsd:team-status`) | MEDIUM | MEDIUM | P2 |
| Project listing in `/gsd:progress` | MEDIUM | LOW | P2 |
| Project archival | LOW | LOW | P3 |
| User-scoped `.gitignore` | LOW | LOW | P3 |
| Cross-project dependency awareness | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Nx | Turborepo | Bazel | GSD (Our Approach) |
|---------|-----|-----------|-------|--------------------|
| **Multi-project awareness** | Project graph auto-detected from source | Package.json workspace detection | BUILD file targets | User-scoped directory tree; project = directory under user |
| **Project switching** | `nx run <project>:<target>` — explicit per-command | `turbo run <task> --filter=<package>` — filter syntax | `bazel build //path/to:target` — explicit target | `/gsd:switch` sets persistent context; all subsequent commands use it implicitly |
| **User isolation** | None — build tool, not user-aware | None — build tool, not user-aware | None — build tool, not user-aware | First-class: each user gets independent planning universe under their directory |
| **Team visibility** | Nx Cloud dashboard (SaaS) | Vercel dashboard (SaaS) | Build Event Protocol (requires server) | `/gsd:team-status` — scan git-committed state files, zero infrastructure |
| **State management** | Cached computation hashes | Remote cache with content hashing | Action cache (local + remote) | Per-user STATE.md with YAML frontmatter — human-readable, git-tracked |
| **Conflict avoidance** | Not applicable (build outputs, not planning) | Not applicable | Not applicable | Structural impossibility via separate file paths per user |
| **Identity** | Not user-aware | Not user-aware | Not user-aware | Git identity (`git config user.name`) — zero additional config |
| **Infrastructure required** | Optional (Nx Cloud for remote cache) | Optional (Vercel for remote cache) | Optional (remote execution service) | None — pure filesystem + git |

**Key insight:** Nx, Turborepo, and Bazel are *build* tools that handle multi-project but not multi-user. They solve "which code to build" not "which planning artifacts belong to whom." GSD operates at a different layer — planning and workflow orchestration — where user isolation is the primary concern, not computation caching. There are no direct competitors in the "multi-user AI-assisted planning" space, which means table stakes are defined by user expectations from adjacent tools (git, IDE workspaces) rather than by competitor features.

## Sources

- Nx mental model and documentation (project graph, affected commands, task orchestration)
- Turborepo documentation (workspace management, remote caching, task filtering)
- Lerna documentation (multi-package management, versioning, task execution)
- GSD codebase analysis: `gsd-tools.cjs`, `lib/init.cjs`, `lib/core.cjs` — 60+ hardcoded `.planning/` path references identified
- GSD PROJECT.md — established decisions on directory structure, identity, and scope
- Git documentation — `git config` identity resolution, per-directory config patterns

---
*Feature research for: GSD multi-user/multi-project monorepo support*
*Researched: 2026-03-17*
