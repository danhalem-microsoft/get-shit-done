# Phase 1: Identity and Path Resolution Core - Context

**Gathered:** 2026-03-17 (updated 2026-03-23 — critic blind spots addressed)
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish user identity resolution, active context management, and the central `getPlanningRoot()` function so that all downstream modules and commands can resolve user-qualified paths. This phase delivers the foundational modules — identity.cjs, context.cjs, and getPlanningRoot() in core.cjs — plus init.cjs enhancements to expose active_user, active_project, and planning_root in all init JSON output. Old flat-structure detection and CI/CD blocking are also in scope.

Phase 2 handles migrating all existing modules to use getPlanningRoot(). Phase 3 handles user-facing commands (/gsd:switch, etc.). This phase only builds the resolution infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Identity slug generation
- Full name slug: `'Dan Halem'` → `'dan-halem'` using existing `generateSlugInternal()` pattern (lowercase, hyphens, alphanumeric)
- Maximum slug length: 30 characters, trim trailing hyphens after truncation
- Email local-part fallback: extract before `@`, apply same slug rules (`'dan.halem+work@example.com'` → `'dan-halem-work'`)

### Identity fallback chain
- Strict chain: `git config user.name` → email local-part (`git config user.email`) → OS username (`os.userInfo().username`)
- Silent fallthrough — each step only tried if previous is empty/unset
- Source used is recorded in user-map.json for debugging
- If ALL three sources fail: hard error — `'Cannot resolve user identity. Set git user.name or GSD_USER env var.'`

### user-map.json
- Flat JSON mapping raw git identity strings to slugs: `{"Dan Halem": "dan-halem", "dan@example.com": "dan-halem"}`
- Committed to git so all clones share identity mappings
- Located at `.planning/user-map.json` (repo root, not per-user)
- Once locked, identity is permanent — changing git user.name still resolves to the original slug
- Slug collisions: first registration wins, subsequent collisions get numeric suffix (`dan-halem-2`)
- **Concurrent write strategy:** Git handles merge conflicts — user-map.json is written rarely (only on first registration). Simultaneous registrations produce a standard JSON merge conflict resolved via git, same as any other merge conflict. No file locking needed.
- **Corrupted JSON recovery:** If user-map.json has unparseable JSON (e.g., bad merge resolution), treat it as empty and re-register the current user. Log a warning to stderr: `'Warning: user-map.json corrupted, re-registering identity.'` This prevents one bad merge from bricking all users.

### GSD_USER env var behavior
- Direct slug — bypasses identity resolution and user-map.json entirely
- Transient — does NOT persist to user-map.json or .active
- Used as-is (no slug generation applied — user provides the slug directly)

### First-use experience
- Auto-register: first GSD command creates user-map.json (if missing), adds current user's mapping
- One-time info message printed: `'GSD: Registered user dan-halem (from git user.name)'`
- No interactive prompts or interruptions

### Module structure
- New `identity.cjs` module in `lib/` (~100 LOC): `resolveIdentity(cwd)`, `sanitizeSlug(raw)`, `loadUserMap(cwd)`, `lockIdentity(cwd, raw, slug)`
- New `context.cjs` module in `lib/` (~300 LOC): `readActiveContext(cwd, user)`, `writeActiveContext(cwd, user, project)`, `resolveContext(cwd)` (combines identity + .active + env vars)
- `getPlanningRoot()` function added to `core.cjs` (~30 LOC): single chokepoint for path resolution

### Active context (.active file)
- Location: `.planning/users/<user>/.active` (gitignored)
- Format: JSON with project name and cached resolved path: `{"project": "frontend", "resolved_path": ".planning/users/dan-halem/frontend"}`
- When no .active exists: clear error with guidance — `'No active project. Run /gsd:new-project to create one, or /gsd:switch to select one.'`
- When .active points to nonexistent directory: error — `'Active project "frontend" not found. Run /gsd:switch to select a valid project.'`
- GSD_PROJECT env var overrides .active at runtime, does NOT persist to .active

### Old flat structure detection
- Heuristic: check for `.planning/PROJECT.md` at repo root AND absence of `.planning/users/` directory — both conditions must be true to trigger
- If `users/` exists alongside `PROJECT.md`, it's the new structure (shared project definition) — no error
- Hard block: refuse to run ANY GSD command if detected
- **Inline migration guidance in error message** (critic blind spot resolved): `'GSD Error: Legacy .planning/ structure detected. To start fresh: Remove .planning/ and run /gsd:new-project. To preserve work: Move your files to .planning/users/<your-slug>/<project-name>/'`
- No automated migration tool — the error IS the migration guide
- Check runs inside `getPlanningRoot()` so it's comprehensive

### CI/CD detection
- Standard CI env vars checked: `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, `TRAVIS`
- If ANY is truthy: full block — error on any GSD operation
- Hard error, no override escape hatch: `'GSD Error: CI/CD environment detected. GSD is not supported in CI.'`
- Check runs inside `getPlanningRoot()` as the FIRST check (before old-structure detection and identity resolution)

### getPlanningRoot() check order
1. CI/CD detection (hard error)
2. Old flat structure detection (hard error)
3. Identity resolution (via identity.cjs)
4. Active context resolution (via context.cjs)
5. Return resolved path: `.planning/users/<user>/<project>/`

### init.cjs enhancements
- All init command JSON output includes: `active_user`, `active_project`, `planning_root`
- These are populated by calling `getPlanningRoot()` internally

### Bootstrap and testing strategy (critic blind spot resolved)
- `tryGetPlanningContext(cwd)` is the safe wrapper for init commands — returns `{active_user: null, active_project: null, planning_root: null}` when no .active file exists
- CI/CD and old-structure checks still hard-error even through tryGetPlanningContext
- Phase 1/2 tests use `createTempMultiUserProject()` helper that creates full directory structure + .active file — no bootstrap problem
- Phase 2 module tests can use `GSD_USER` + `GSD_PROJECT` env vars for test isolation without needing .active files
- No auto-creation of default projects — the error message guides users to /gsd:new-project

### Claude's Discretion
- Exact error message wording (within the "short + actionable" style)
- Internal helper function signatures and naming
- Test file organization for identity.cjs and context.cjs
- Whether user-map.json gets a schema version field for future-proofing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateSlugInternal()` in `core.cjs`: already does lowercase, hyphen-separated, alphanumeric-only slug generation — reuse for identity slugs
- `output()` / `error()` in `core.cjs`: standard CLI output pattern for all new commands
- `loadConfig()` in `core.cjs`: pattern for safe JSON file reading with fallback defaults
- `execGit()` in `core.cjs`: safe git command execution for reading user.name/user.email
- `toPosixPath()` in `core.cjs`: path normalization for resolved planning roots

### Established Patterns
- All modules use `require('./core.cjs')` for shared utilities
- CLI command functions follow `cmd*` prefix convention
- Internal helpers use `*Internal` suffix
- Fail gracefully pattern: return null on errors, never throw from utility functions
- Large output uses `@file:` prefix for >50KB results

### Integration Points
- `init.cjs`: all workflow init commands must be enhanced to include `active_user`, `active_project`, `planning_root`
- `core.cjs`: `getPlanningRoot()` will be the new single chokepoint — consumed by Phase 2's module migration
- `.planning/user-map.json`: new file at repo root, committed to git
- `.planning/users/<user>/.active`: new file per user, gitignored

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-identity-and-path-resolution-core*
*Context gathered: 2026-03-17*
*Updated: 2026-03-23 — 3 critic blind spots resolved (concurrent writes, bootstrap, migration)*
