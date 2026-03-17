# Architecture Research

**Domain:** Multi-user, multi-project state management for CLI tooling (GSD monorepo support)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     Command Interface Layer                        │
│  /gsd:plan-phase 1    /gsd:switch frontend    /gsd:team-status    │
├────────────────────────────────────────────────────────────────────┤
│                     Context Resolution Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │ User Identity │  │ Active Ctx   │  │ Project Registry     │     │
│  │ Resolver      │  │ Manager      │  │                      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘     │
│         │                 │                      │                 │
├─────────┴─────────────────┴──────────────────────┴─────────────────┤
│                       Path Resolution Layer                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Path Resolver                             │   │
│  │  (user, project) → .planning/users/<user>/<project>/        │   │
│  └─────────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────────┤
│                     Data Operations Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ State    │  │ Phase    │  │ Roadmap  │  │ Config   │          │
│  │ Module   │  │ Module   │  │ Module   │  │ Module   │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
├────────────────────────────────────────────────────────────────────┤
│                     Storage Layer                                  │
│  .planning/                                                        │
│  ├── .active              # Active user+project selection          │
│  ├── config.json          # Global defaults                        │
│  └── users/                                                        │
│      ├── dan/frontend/    # Fully isolated artifact tree           │
│      ├── dan/auth-svc/    # Another project for dan                │
│      └── alice/frontend/  # Alice's independent frontend work      │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **User Identity Resolver** | Determine current user from git config, sanitize for filesystem safety | Pure function: `git config user.name` -> filesystem-safe slug |
| **Active Context Manager** | Read/write `.planning/.active` file; track current (user, project) pair | JSON file I/O with validation; provides "which project am I in?" |
| **Project Registry** | Enumerate all projects for a user, all users in repo, validate project existence | Directory scanning of `.planning/users/` tree |
| **Path Resolver** | Convert (user, project, artifact) tuple into absolute/relative filesystem path | Central function that ALL existing modules call instead of hardcoding `.planning/` |
| **Context Switcher** | Handle `/gsd:switch` command: set active project, list available projects | Writes `.active`, validates target exists |
| **Team Status Provider** | Scan all users' STATE.md files to show cross-team progress | Read-only traversal of `.planning/users/*/` |

## Recommended Project Structure

### New Modules (additions to `get-shit-done/bin/lib/`)

```
get-shit-done/bin/lib/
├── core.cjs            # EXISTING — add path resolver function here
├── context.cjs         # NEW — active context manager + project registry
├── identity.cjs        # NEW — user identity resolution from git
├── state.cjs           # EXISTING — modify to use resolved paths
├── config.cjs          # EXISTING — modify to use resolved paths
├── phase.cjs           # EXISTING — modify to use resolved paths
├── roadmap.cjs         # EXISTING — modify to use resolved paths
├── init.cjs            # EXISTING — inject context resolution into init commands
├── verify.cjs          # EXISTING — modify to use resolved paths
├── template.cjs        # EXISTING — modify to use resolved paths
├── milestone.cjs       # EXISTING — modify to use resolved paths
├── frontmatter.cjs     # EXISTING — no changes needed
├── taste.cjs           # EXISTING — modify to use resolved paths
└── commands.cjs        # EXISTING — add switch/team-status commands
```

### New Workflow/Command Files

```
commands/gsd/
├── switch.md           # NEW — /gsd:switch command definition
└── team-status.md      # NEW — /gsd:team-status command definition

get-shit-done/workflows/
├── switch.md           # NEW — project switching workflow
└── team-status.md      # NEW — team status display workflow
```

### Structure Rationale

- **`identity.cjs`:** Isolated because user resolution is a distinct concern with its own edge cases (git config missing, special characters, multiple identity sources). Small module (~100 LOC).
- **`context.cjs`:** Combines active context management and project registry because they share the same data (`.active` file and directory tree). These are read together on every command invocation. (~300 LOC).
- **Path resolver in `core.cjs`:** Not a separate module because it's used by every other module. Placing it in `core.cjs` means no new import needed — every module already imports core. Single function addition (~30 LOC).

## Architectural Patterns

### Pattern 1: Indirection Layer (Path Resolver as Single Chokepoint)

**What:** A single function that resolves the planning root directory based on current context. All modules call this function instead of constructing `.planning/` paths directly.

**When to use:** When an existing system hardcodes paths throughout its codebase and needs to make those paths dynamic based on runtime context.

**Trade-offs:**
- Pro: One function to change, all callers update automatically
- Pro: Easy to test — mock the resolver, verify all paths change
- Pro: Matches GSD's existing pattern of centralizing operations in `core.cjs`
- Con: Every file operation now has a function call overhead (negligible for GSD's scale)
- Con: Must audit every `.planning/` reference across all modules

**Example:**
```javascript
// core.cjs — new function
function getPlanningRoot(cwd) {
  const ctx = loadActiveContext(cwd);  // reads .active file
  if (!ctx) {
    // Fallback: no active context, use legacy flat path
    return path.join(cwd, '.planning');
  }
  return path.join(cwd, '.planning', 'users', ctx.user, ctx.project);
}

// BEFORE (hardcoded in every module):
const configPath = path.join(cwd, '.planning', 'config.json');
const phasesDir = path.join(cwd, '.planning', 'phases');

// AFTER (all modules use resolver):
const root = getPlanningRoot(cwd);
const configPath = path.join(root, 'config.json');
const phasesDir = path.join(root, 'phases');
```

### Pattern 2: Layered Context Resolution

**What:** Context resolution happens in layers: identity (who) -> active context (which project) -> path (where). Each layer has exactly one responsibility and feeds the next.

**When to use:** When multiple independent concerns (user identity, project selection, path construction) must compose cleanly and any layer might need to change independently.

**Trade-offs:**
- Pro: Each layer is independently testable
- Pro: Identity resolution can change (git email vs git name) without affecting path logic
- Pro: Active context can be overridden (env var, CLI flag) without changing identity logic
- Con: Three layers of indirection for what is conceptually "find my project directory"

**Example:**
```javascript
// Layer 1: Identity — who am I?
function resolveUser() {
  const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
  return sanitizeForFilesystem(name);  // "Dan Halem" -> "dan-halem"
}

// Layer 2: Active Context — which project?
function loadActiveContext(cwd) {
  const activePath = path.join(cwd, '.planning', '.active');
  try {
    return JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    // { "user": "dan", "project": "frontend" }
  } catch { return null; }
}

// Layer 3: Path Resolution — where are the files?
function getPlanningRoot(cwd) {
  const ctx = loadActiveContext(cwd);
  return path.join(cwd, '.planning', 'users', ctx.user, ctx.project);
}
```

### Pattern 3: Context-Aware Init (Injection Point)

**What:** The `gsd-tools.cjs init <workflow>` command already serves as the single entry point for all workflow context. Multi-user context is injected here — every workflow gets user/project info in the same JSON payload it already receives.

**When to use:** When an existing system has a centralized initialization pattern that downstream consumers already depend on. Adding fields to the existing payload is non-breaking.

**Trade-offs:**
- Pro: Workflows don't need new code to read context — it's in the init JSON they already parse
- Pro: Single place to validate context (user exists, project exists, active context set)
- Pro: Existing orchestrator patterns remain unchanged
- Con: Init JSON payload grows (marginal, already returns 20+ fields)

**Example:**
```javascript
// init.cjs — enhanced init output
function cmdInitPlanPhase(cwd, phase, raw) {
  const ctx = loadActiveContext(cwd);  // NEW
  const root = getPlanningRoot(cwd);   // NEW — used for all path construction below

  const result = {
    // NEW: Context fields (added to existing init payload)
    active_user: ctx.user,
    active_project: ctx.project,
    planning_root: toPosixPath(path.relative(cwd, root)),

    // EXISTING (paths now use root instead of hardcoded .planning/)
    state_path: toPosixPath(path.relative(cwd, path.join(root, 'STATE.md'))),
    roadmap_path: toPosixPath(path.relative(cwd, path.join(root, 'ROADMAP.md'))),
    config_path: toPosixPath(path.relative(cwd, path.join(root, 'config.json'))),
    // ... all other existing fields
  };
  output(result, raw);
}
```

## Data Flow

### Command Resolution Flow (Primary)

```
User runs: /gsd:plan-phase 1
    |
    v
Orchestrator calls: gsd-tools.cjs init plan-phase 1
    |
    v
┌─ init.cjs ────────────────────────────────────────────┐
│                                                        │
│  1. resolveUser()          → "dan"                     │
│     [identity.cjs]            (from git config)        │
│                                                        │
│  2. loadActiveContext(cwd) → { user:"dan",             │
│     [context.cjs]              project:"frontend" }    │
│                                                        │
│  3. getPlanningRoot(cwd)   → ".planning/users/         │
│     [core.cjs]                 dan/frontend"           │
│                                                        │
│  4. loadConfig(root)       → { model_profile:          │
│     [core.cjs]                 "balanced", ... }       │
│                                                        │
│  5. findPhaseInternal(     → { directory: ".planning/  │
│       root, "1")               users/dan/frontend/     │
│     [core.cjs]                 phases/01-foundation" } │
│                                                        │
│  6. Return JSON with all paths resolved to user/project│
└────────────────────────────────────────────────────────┘
    |
    v
Orchestrator receives JSON with fully-resolved paths
    |
    v
Spawns agents with correct file paths in <files_to_read>
```

### Project Switch Flow

```
User runs: /gsd:switch auth-service
    |
    v
┌─ switch workflow ──────────────────────────────────────┐
│                                                        │
│  1. resolveUser() → "dan"                              │
│                                                        │
│  2. Validate project exists:                           │
│     .planning/users/dan/auth-service/ must exist       │
│                                                        │
│  3. Write .active file:                                │
│     { "user": "dan", "project": "auth-service" }       │
│                                                        │
│  4. Load STATE.md from new context                     │
│     Show current position to user                      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Project Creation Flow

```
User runs: /gsd:new-project (with multi-user active)
    |
    v
┌─ new-project workflow (modified) ──────────────────────┐
│                                                        │
│  1. resolveUser() → "dan"                              │
│                                                        │
│  2. Ask for project name → "frontend"                  │
│                                                        │
│  3. Create directory tree:                             │
│     .planning/users/dan/frontend/                      │
│       PROJECT.md, ROADMAP.md, STATE.md, config.json    │
│       research/, phases/                               │
│                                                        │
│  4. Set as active:                                     │
│     .active → { "user": "dan", "project": "frontend" }│
│                                                        │
│  5. Continue normal new-project flow                   │
│     (questioning, research, requirements, roadmap)     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Team Status Flow

```
User runs: /gsd:team-status
    |
    v
┌─ team-status workflow ─────────────────────────────────┐
│                                                        │
│  1. Scan .planning/users/                              │
│     List all user directories                          │
│                                                        │
│  2. For each user, for each project:                   │
│     Read STATE.md frontmatter (machine-readable)       │
│     Extract: current_phase, last_commit, session_id    │
│                                                        │
│  3. Format and display:                                │
│     ┌──────────────────────────────────────────┐       │
│     │ dan/frontend    Phase 03 (API endpoints) │       │
│     │ dan/auth-svc    Phase 01 (Foundation)    │       │
│     │ alice/frontend  Phase 02 (Auth flow)     │       │
│     └──────────────────────────────────────────┘       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Every GSD command:** User identity + active context -> path resolver -> all downstream file operations use resolved root. This is the critical path — if path resolution fails, nothing works.
2. **Context switch:** User selects project -> validate existence -> write `.active` -> next command automatically uses new context.
3. **Project creation:** Resolve user -> create user/project directory tree -> set active -> continue existing new-project workflow with new root.
4. **Team visibility:** Read-only scan across all `users/*/` -> parse frontmatter from STATE.md -> aggregate and display.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-3 users | Current design is ideal. `.active` file per repo. Simple directory scan for team status. |
| 3-10 users | Still works well. `.planning/users/` directory gets wider but not deeper. Team status scan reads ~10-30 STATE.md files (instant). |
| 10+ users | Consider `.gitignore`-ing other users' planning dirs to reduce noise. Team status could cache results. Unlikely scenario for GSD's use case. |

### Scaling Priorities

1. **First concern:** Not performance but git noise. Many users committing planning artifacts = busy git history. Mitigated by user-isolated paths (no merge conflicts) and optional `.gitignore` per user directory.
2. **Second concern:** `.active` file conflicts. Two users running GSD simultaneously on the same machine in the same repo would fight over `.active`. Mitigated by: `.active` is per-machine (in `.gitignore`), not committed. OR use per-user active files (`.planning/.active-dan`).

## Anti-Patterns

### Anti-Pattern 1: Global Mutable Singleton for Context

**What people do:** Store active context in a module-level variable that gets set once and read everywhere.
**Why it's wrong:** gsd-tools.cjs is invoked as a fresh process for every command. Module-level state doesn't persist. Also makes testing hard.
**Do this instead:** Read `.active` file on every invocation. It's a single `readFileSync` of a tiny JSON file — negligible cost, always fresh.

### Anti-Pattern 2: Passing User/Project Through Every Function

**What people do:** Add `user` and `project` parameters to every function signature in every module.
**Why it's wrong:** Massive API surface change. Every function in state.cjs, phase.cjs, roadmap.cjs, etc. would need new parameters. Existing callers all break.
**Do this instead:** Resolve the planning root once (in `getPlanningRoot`), pass the resolved root path. Existing functions already accept `cwd` — changing what `.planning/` resolves to is transparent to them.

### Anti-Pattern 3: Splitting .active Per-Project

**What people do:** Put `.active` inside each project directory (`.planning/users/dan/frontend/.active`).
**Why it's wrong:** Defeats the purpose — you need to know which project is active BEFORE you know which directory to look in. Chicken-and-egg.
**Do this instead:** Keep `.active` at `.planning/.active` (top-level). It's the entry point that tells you which project directory to use.

### Anti-Pattern 4: Project-Level Path Prefixes in Artifacts

**What people do:** Include the full path (`.planning/users/dan/frontend/phases/01-foundation/`) in PLAN.md file references.
**Why it's wrong:** Artifacts become user/project-specific and can't be reasoned about generically. Agents would need to parse out the prefix.
**Do this instead:** Artifacts reference files relative to project root (same as today: `phases/01-foundation/01-01-PLAN.md`). The path resolver handles the absolute resolution externally.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `identity.cjs` -> `context.cjs` | Direct `require()`, function call | Identity resolver provides user slug; context manager uses it to validate `.active` |
| `context.cjs` -> `core.cjs` | Direct `require()`, function call | Context provides (user, project); core's `getPlanningRoot()` constructs path |
| `core.cjs` -> all modules | Direct `require()` (existing) | All modules already import core; `getPlanningRoot()` replaces hardcoded `.planning/` |
| `init.cjs` -> workflows | JSON over stdout (existing) | Init output gains `active_user`, `active_project`, `planning_root` fields |
| Workflows -> agents | Prompt text with `<files_to_read>` (existing) | Agents receive fully-resolved paths; no awareness of multi-user structure needed |

### Key Observation: Agent Layer is Unaffected

Agents (`gsd-planner`, `gsd-executor`, etc.) receive file paths in their spawn prompts. They don't construct `.planning/` paths. This means:
- **Zero agent modifications needed.** Path resolution happens in the orchestration layer.
- Agents will automatically work with multi-user paths because orchestrators pass resolved paths.
- Only workflows and `gsd-tools.cjs` lib modules need changes.

## Build Order (Dependency Graph)

Components must be built in this order due to dependencies:

```
Phase 1: Foundation (no dependencies)
├── identity.cjs         — resolveUser(), sanitizeForFilesystem()
└── context.cjs          — loadActiveContext(), saveActiveContext(),
                           listUserProjects(), listAllUsers()

Phase 2: Core Integration (depends on Phase 1)
└── core.cjs additions   — getPlanningRoot() using identity + context
                           This is the chokepoint function

Phase 3: Module Migration (depends on Phase 2)
├── config.cjs           — replace hardcoded .planning/ with getPlanningRoot()
├── state.cjs            — replace hardcoded .planning/ with getPlanningRoot()
├── phase.cjs            — replace hardcoded .planning/ with getPlanningRoot()
├── roadmap.cjs          — replace hardcoded .planning/ with getPlanningRoot()
├── verify.cjs           — replace hardcoded .planning/ with getPlanningRoot()
├── template.cjs         — replace hardcoded .planning/ with getPlanningRoot()
├── milestone.cjs        — replace hardcoded .planning/ with getPlanningRoot()
└── taste.cjs            — replace hardcoded .planning/ with getPlanningRoot()
    (These are all independent of each other — parallelizable)

Phase 4: Init Enhancement (depends on Phase 3)
└── init.cjs             — inject context fields into all init command outputs
                           Validate active context on every init call

Phase 5: New Commands (depends on Phase 4)
├── /gsd:switch          — command + workflow for project switching
├── /gsd:team-status     — command + workflow for cross-user visibility
└── /gsd:new-project     — modify existing workflow to create user/project dirs

Phase 6: Verification (depends on Phase 5)
└── Tests + health check — verify all paths resolve correctly
                           Ensure no hardcoded .planning/ remains
```

### Build Order Rationale

1. **identity.cjs first** because it has zero internal dependencies (only calls `git config`). Can be unit tested immediately.
2. **context.cjs second** because it only depends on filesystem operations and the `.active` file format. Can be tested with fixture directories.
3. **core.cjs third** because `getPlanningRoot()` must exist before any module can be migrated. This is the chokepoint.
4. **Module migration (Phase 3) is parallelizable** because each module independently replaces its own `.planning/` references. No cross-module dependencies in this step.
5. **init.cjs after modules** because init calls functions from all other modules — needs them to work with resolved paths first.
6. **New commands last** because they build on everything below: identity, context, path resolution, and init.

## Critical Design Decisions for GSD Specifically

### Decision 1: `.active` File Scope

**Options:**
- A) Single `.planning/.active` (shared, in `.gitignore`)
- B) Per-user `.planning/.active-<username>` files
- C) Environment variable override

**Recommendation:** Option A with Option C as escape hatch. Single `.active` in `.gitignore` is simplest. Environment variable (`GSD_ACTIVE_PROJECT`) allows CI/scripting override. Option B only needed if two users share a machine AND work in the same repo clone simultaneously (rare).

### Decision 2: Global Config vs Per-Project Config

**The system needs two config levels:**
- `.planning/config.json` — global defaults (model profile, etc.)
- `.planning/users/dan/frontend/config.json` — project overrides

**Resolution order:** project config > global config > hardcoded defaults. This matches the existing `loadConfig` pattern but adds one more layer.

### Decision 3: Where Does `getPlanningRoot()` Live?

**In `core.cjs`**, not in a new module. Rationale:
- Every module already `require('./core.cjs')` — no new imports
- It's ~30 LOC (one function + one helper)
- It conceptually IS a core utility — it's the most fundamental path operation in the system

### Decision 4: User Slug Sanitization

**Input:** `git config user.name` (e.g., "Dan Halem", "alice_dev", "Bob O'Brien")
**Output:** filesystem-safe slug (e.g., "dan-halem", "alice-dev", "bob-obrien")
**Rules:**
- Lowercase
- Replace spaces and underscores with hyphens
- Strip non-alphanumeric except hyphens
- Collapse multiple hyphens
- Trim leading/trailing hyphens

This matches GSD's existing `generateSlugInternal()` pattern.

## Sources

- Existing GSD architecture analysis: `.planning/codebase/ARCHITECTURE.md`
- Existing GSD directory structure: `.planning/codebase/STRUCTURE.md`
- GSD core module source: `get-shit-done/bin/lib/core.cjs` (path resolution patterns)
- GSD init module source: `get-shit-done/bin/lib/init.cjs` (context injection patterns)
- GSD config module source: `get-shit-done/bin/lib/config.cjs` (config resolution patterns)
- Project requirements: `.planning/PROJECT.md` (target directory structure, requirements)
- Multi-tenant state isolation patterns from filesystem-based CLI architectures (Terraform workspaces, npm workspaces, git worktrees)

---
*Architecture research for: GSD multi-user monorepo support*
*Researched: 2026-03-17*
