# Requirements: GSD Multi-User Monorepo Support

**Defined:** 2026-03-17
**Core Value:** Multiple users can run independent GSD projects in the same monorepo without conflicting on planning artifacts, state, or git history

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Identity & Context

- [x] **IDEN-01**: User identity is automatically resolved from `git config user.name`, sanitized to a filesystem-safe slug (lowercase, hyphens, no special chars)
- [x] **IDEN-02**: User identity falls back to email local-part (`git config user.email`) then OS username if `user.name` is not set
- [x] **IDEN-03**: User identity slug is locked in a mapping file (`.planning/user-map.json`) on first use, used as source of truth thereafter
- [x] **IDEN-04**: Active project context is stored per-user at `.planning/users/<user>/.active` (gitignored JSON: `{project, resolved_path}`) so multiple users on the same machine don't stomp each other
- [x] **IDEN-05**: Active context can be overridden via `GSD_USER` and `GSD_PROJECT` environment variables for CI/scripting
- [x] **IDEN-06**: Running GSD on a repo with old flat `.planning/PROJECT.md` at root produces a clear error message directing user to re-initialize
- [x] **IDEN-07**: CI/CD environments (`CI=true` or `GITHUB_ACTIONS=true`) are detected and refuse to auto-create user directories

### Path Resolution

- [x] **PATH-01**: A single `getPlanningRoot(cwd)` function in `core.cjs` reads active context and returns the user-qualified planning directory (`.planning/users/<user>/<project>/`)
- [x] **PATH-02**: `state.cjs` module uses `getPlanningRoot()` for all path construction instead of hardcoded `.planning/`
- [x] **PATH-03**: `phase.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-04**: `roadmap.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-05**: `config.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-06**: `verify.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-07**: `template.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-08**: `milestone.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-09**: `taste.cjs` module uses `getPlanningRoot()` for all path construction
- [x] **PATH-10**: `init.cjs` includes `active_user`, `active_project`, and `planning_root` in all init command JSON output
- [x] **PATH-11**: All workflow markdown files use paths from init JSON output rather than hardcoded `.planning/` strings
- [x] **PATH-12**: Agent-spawned prompts receive fully-resolved paths via orchestrator `<files_to_read>` blocks — agents never construct `.planning/` paths themselves
- [x] **PATH-13**: A grep audit confirms zero unresolved raw `.planning/` path references remain in operational code (excluding documentation and the resolver function itself)

### Project Lifecycle

- [ ] **LIFE-01**: `/gsd:new-project` creates planning artifacts under `.planning/users/<user>/<project>/` and sets the new project as active
- [ ] **LIFE-02**: `/gsd:new-project` prompts for a project name when in multi-user mode
- [ ] **LIFE-03**: `/gsd:switch <project>` sets the active project context for the current user
- [ ] **LIFE-04**: `/gsd:switch` without arguments lists the current user's projects with status summary and lets user choose
- [ ] **LIFE-05**: If a user has only one project, it is auto-selected without requiring `/gsd:switch`
- [ ] **LIFE-06**: Per-project config at `.planning/users/<user>/<project>/config.json` overrides global defaults at `.planning/config.json`
- [ ] **LIFE-07**: `/gsd:progress` shows project context (active user/project) and lists available projects if no active project is set
- [ ] **LIFE-08**: All existing GSD commands (plan-phase, execute-phase, verify-work, discuss-phase, debug, etc.) operate transparently on the active project context
- [ ] **LIFE-09**: Completed projects can be archived to `.planning/users/<user>/_archived/<project>/` and excluded from default project listings

### Team Features

- [ ] **TEAM-01**: `/gsd:team-status` scans `.planning/users/*/` directories and displays each user's active projects, current phase, and last activity timestamp
- [ ] **TEAM-02**: `/gsd:team-status` reads only STATE.md frontmatter (machine-readable), not full document bodies
- [ ] **TEAM-03**: Path resolver supports an explicit cross-user read scope for team-status without breaking user isolation
- [ ] **TEAM-04**: Config resolution follows explicit precedence: hardcoded defaults < shared `.planning/config.json` < per-project `users/<user>/<project>/config.json` < environment variables
- [ ] **TEAM-05**: A `gsd-tools.cjs config resolve <key>` command shows which layer a config value came from
- [ ] **TEAM-06**: Git commit messages for planning artifact changes include user/project context (e.g., `docs(dan/frontend): ...`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Team Features

- **ADV-01**: Cross-project dependency awareness — surface when a user's project depends on code another user is actively changing
- **ADV-02**: Duplicate project name warnings — alert when another user creates a project with the same name
- **ADV-03**: Shared `_shared/` directory per project for intentionally collaborative artifacts (if collaborative roadmaps are ever needed)

### Platform

- **PLAT-01**: Multi-repo support — GSD coordination across multiple repositories
- **PLAT-02**: Project templates — clone another user's project structure as a starting point

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time collaboration / live sync | GSD is async-by-design (git-based); requires server/WebSockets — fundamentally incompatible |
| Shared roadmaps across users | Each user owns their planning; team coordination happens through code and PRs |
| Same-phase concurrency (two users, same phase, same project) | Executors make atomic commits to same files — git conflicts in source code |
| Migration from old `.planning/` structure | Old structure fundamentally incompatible; clean break is simpler and clearer |
| GSD-specific user identity system | Git identity is sufficient; every GSD user already has git configured |
| Centralized task assignment / project management | Different product category; external tools (Linear, Jira) handle this |
| File locking / pessimistic concurrency | Directory isolation makes locks unnecessary; file locks add stale-lock failure modes |
| Atomic local file writes (write-temp-rename) | Atomicity matters at push/pull/merge level, not at local write level |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDEN-01 | Phase 1 | Pending |
| IDEN-02 | Phase 1 | Pending |
| IDEN-03 | Phase 1 | Pending |
| IDEN-04 | Phase 1 | Pending |
| IDEN-05 | Phase 1 | Pending |
| IDEN-06 | Phase 1 | Pending |
| IDEN-07 | Phase 1 | Pending |
| PATH-01 | Phase 1 | Pending |
| PATH-02 | Phase 2 | Complete |
| PATH-03 | Phase 2 | Complete |
| PATH-04 | Phase 2 | Complete |
| PATH-05 | Phase 2 | Complete |
| PATH-06 | Phase 2 | Complete |
| PATH-07 | Phase 2 | Complete |
| PATH-08 | Phase 2 | Complete |
| PATH-09 | Phase 2 | Complete |
| PATH-10 | Phase 1 | Complete |
| PATH-11 | Phase 2 | Complete |
| PATH-12 | Phase 2 | Complete |
| PATH-13 | Phase 2 | Complete |
| LIFE-01 | Phase 3 | Pending |
| LIFE-02 | Phase 3 | Pending |
| LIFE-03 | Phase 3 | Pending |
| LIFE-04 | Phase 3 | Pending |
| LIFE-05 | Phase 3 | Pending |
| LIFE-06 | Phase 3 | Pending |
| LIFE-07 | Phase 3 | Pending |
| LIFE-08 | Phase 3 | Pending |
| LIFE-09 | Phase 3 | Pending |
| TEAM-01 | Phase 4 | Pending |
| TEAM-02 | Phase 4 | Pending |
| TEAM-03 | Phase 4 | Pending |
| TEAM-04 | Phase 4 | Pending |
| TEAM-05 | Phase 4 | Pending |
| TEAM-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation — all 35 requirements mapped to phases*
