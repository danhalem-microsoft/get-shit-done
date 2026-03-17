# Pitfalls Research

**Domain:** Multi-user monorepo project management tooling (file-based state, CLI, per-user isolation in shared git repos)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Incomplete Path Resolution Migration (The "540 Hardcoded Paths" Problem)

**What goes wrong:**
The codebase has **540+ references** to `.planning/` across 62 files (73 in lib/, 335 in workflows/, 132 in agents/). Refactoring path resolution in `gsd-tools.cjs` but missing workflow markdown or agent markdown references creates a system where the CLI resolves the right path but agents/workflows read/write to the old flat `.planning/` location. Data silently goes to the wrong directory. Planning artifacts appear "lost."

**Why it happens:**
Path references exist in three fundamentally different layers with different resolution mechanisms:
1. **JavaScript (lib/*.cjs)** — programmatic `path.join(cwd, '.planning', ...)` — refactorable via function extraction
2. **Workflow markdown** — hardcoded string paths like `Read .planning/STATE.md` — requires manual find-and-replace in 37 files
3. **Agent markdown** — paths embedded in prompt text like "write to `.planning/phases/`" — requires understanding prompt semantics, not just string replacement

A developer naturally starts with the programmatic layer, gets it working, and declares victory without auditing the other two layers.

**How to avoid:**
1. Create a **single path resolution function** (`resolvePlanningPath(cwd, user, project, relativePath)`) in `core.cjs` that all JS code uses
2. For workflows/agents: replace hardcoded `.planning/` with a **variable** populated from `gsd-tools.cjs init` output (e.g., `$PLANNING_DIR`). The init compound commands already return paths — extend them to return the user-qualified root
3. **Grep audit gate:** Before merging, run `grep -rn '\.planning/' --include='*.md' --include='*.cjs'` and verify every hit uses the new resolution. Zero raw `.planning/` references should remain in any file that isn't documentation or the resolution function itself

**Warning signs:**
- Artifacts created during `new-project` appear at `.planning/` instead of `.planning/users/dan/myproject/`
- Agent-created files (PLAN.md, SUMMARY.md) land in wrong directory while CLI-created files (STATE.md) land correctly
- Tests pass (they use the JS layer) but real workflow usage fails (agents use markdown layer)

**Phase to address:**
Phase 1 (Foundation) — this must be the first thing built. Every subsequent feature depends on correct path resolution.

---

### Pitfall 2: `.active` File Race Condition (Shared Mutable Global State)

**What goes wrong:**
The design stores active project selection in `.planning/.active` as a JSON file (`{"user": "dan", "project": "frontend"}`). This is **process-global mutable state in the filesystem**. When two terminal sessions (or two AI runtimes) run GSD simultaneously, one user's `/gsd:switch` changes the active project for ALL concurrent sessions. User A is executing phase 3 of `auth-service`, User B runs `/gsd:switch frontend`, and User A's next gsd-tools.cjs invocation suddenly operates on `frontend`.

**Why it happens:**
Single-user tools use "current selection" files all the time (e.g., `kubectl config current-context`, `nvm alias default`). The pattern feels natural. But those tools are designed for one user on one machine. In a multi-user monorepo, multiple developers (or multiple terminal panes) share the same `.planning/` directory via git.

Even a single user opening two terminals can trigger this: one terminal runs a long `/gsd:execute-phase` (which invokes gsd-tools.cjs dozens of times over 20+ minutes) while the other terminal runs `/gsd:switch` to check on a different project.

**How to avoid:**
Three options (in order of preference):
1. **Per-terminal active context:** Store active project in an **environment variable** (`GSD_ACTIVE=dan/frontend`) set by `/gsd:switch` and passed to gsd-tools.cjs. No shared file needed. Survives within a session, doesn't leak across terminals.
2. **Per-process-tree lockfile:** Use PID-based `.active.{PID}` files with cleanup. Complex but filesystem-only.
3. **Per-user .active files:** Store at `.planning/users/dan/.active` instead of `.planning/.active`. This isolates users from each other but still allows self-interference across terminals.

Recommendation: Use environment variable (option 1) as the primary mechanism, with `.planning/users/<user>/.active` as the persistent default that the env var overrides.

**Warning signs:**
- Manual testing with two terminals produces wrong-project operations
- Long-running `/gsd:execute-phase` occasionally creates artifacts in wrong project directory
- Users report "my STATE.md was overwritten with someone else's state"

**Phase to address:**
Phase 1 (Foundation) — active context mechanism is foundational. Getting this wrong poisons every subsequent feature.

---

### Pitfall 3: Git Identity Fragility (Username Derivation Assumptions)

**What goes wrong:**
Using `git config user.name` to derive the filesystem directory name (`dan`, `alice`) creates several failure modes:
1. **Name contains filesystem-unsafe characters:** `"Jean-François"` → needs sanitization → what happens when sanitization produces collisions? (`jean-francois` and `jean_francois`)
2. **Name changes:** User changes their git identity (marriage, corporate rename) → their entire `.planning/users/oldname/` tree becomes orphaned
3. **Name is empty or unconfigured:** In CI/CD, Docker containers, or fresh git installs, `user.name` may be empty, `"root"`, or a generic service account name
4. **Same person, different identities:** Work laptop has `Dan Halem`, personal laptop has `danhalem` → two separate user directories for the same person
5. **Email vs name inconsistency:** If some code paths use `user.name` and others use `user.email`, the same user gets two directories

**Why it happens:**
Git identity is convenient — it's universally available and requires zero additional configuration. But git identity was designed for commit attribution, not filesystem organization. It has no uniqueness guarantees, no stability guarantees, and no format constraints.

**How to avoid:**
1. **Sanitize aggressively on first use, then lock in a mapping:** On first GSD interaction, derive a directory name from git identity, but immediately write a mapping file (`.planning/user-map.json`: `{"dan.halem@company.com": "dan"}`) that becomes the source of truth. Subsequent lookups use the mapping, not live git identity.
2. **Use email as the lookup key, name as the display name:** Email is more stable and more unique than display names. The sanitized directory name can be derived from the local part of the email.
3. **Validate on every invocation:** If `git config user.email` returns empty or doesn't match any mapped user, error with a clear message: "GSD user not configured. Run `/gsd:init-user` to set up."
4. **Never auto-create directories from raw git identity** without user confirmation.

**Warning signs:**
- Users with non-ASCII names get cryptic filesystem errors
- CI/CD pipelines create phantom user directories (`root/`, `github-actions/`)
- Same developer has duplicate planning trees and can't figure out where their state went

**Phase to address:**
Phase 1 (Foundation) — user identity resolution must be designed and tested before any user directories are created.

---

### Pitfall 4: STATE.md Concurrent Write Corruption

**What goes wrong:**
The existing `state.cjs` does read-modify-write on STATE.md with no locking. In single-user mode this is fine (one Claude session at a time). With multi-user support, the design explicitly allows "Multiple users can work on different phases of the same project simultaneously." If two executors update STATE.md at roughly the same time (both updating `last_commit`, `current_plan`, or the Decisions section), one write silently overwrites the other.

Even within a single user's session, `parallelization=true` means multiple gsd-executor agents run simultaneously and each writes SUMMARY.md files + potentially updates shared state.

**Why it happens:**
File-based state management without locking is the #1 corruption pattern in multi-process tools. The gap between `readFileSync` and `writeFileSync` is the critical section. JavaScript's single-threaded nature doesn't help because gsd-tools.cjs is invoked as separate `node` processes (one per `Task spawn`).

**How to avoid:**
1. **Make STATE.md per-user, per-project** (which the design already proposes — but verify no shared state remains)
2. **Eliminate shared mutable files entirely:** If two users work on the same project, they should have separate STATE.md files at `.planning/users/dan/frontend/STATE.md` and `.planning/users/alice/frontend/STATE.md`
3. **For ROADMAP.md (which IS shared in concept):** Use append-only patterns instead of read-modify-write. Or make ROADMAP.md per-user too (as the design proposes with "everything per-user")
4. **If any shared file remains:** Implement file locking via `fs.open` with `O_EXCL` flag, or use a `.lock` file pattern with exponential backoff

**Warning signs:**
- ROADMAP.md loses progress markers that were written minutes ago
- STATE.md `current_phase` field reverts to an earlier value after parallel execution
- Decision log entries disappear between sessions

**Phase to address:**
Phase 1 (Foundation) — concurrent access model must be defined before any state operations are built on top.

---

### Pitfall 5: Missing Path Resolution in `init` Compound Commands

**What goes wrong:**
The `init.cjs` module has **53 references** to `.planning/` — more than any other file. These compound init commands (`cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitNewProject`, etc.) are the single most critical integration point because they return JSON blobs containing file paths, existence checks, and directory locations that workflows consume.

If the init commands return paths like `".planning/STATE.md"` instead of `".planning/users/dan/frontend/STATE.md"`, every downstream workflow that uses these paths operates on the wrong location. The init commands are the "narrow waist" of the architecture — fix them correctly, and 80% of downstream consumers work automatically; miss them, and nothing works.

**Why it happens:**
The init module is the most complex module (~1200 LOC) and the hardest to refactor safely because:
1. It composes results from multiple other modules (core, phase, roadmap, config)
2. Each of those modules independently resolves `.planning/` paths
3. The returned JSON has both **existence checks** (does this file exist?) and **path strings** (what path should the workflow read?) — both must agree
4. Tests mock individual modules but don't test the full init → workflow → agent pipeline

**How to avoid:**
1. **Introduce a `ProjectContext` object** created once per invocation that carries `{user, project, planningRoot}` and is passed to every module. No module does its own path resolution.
2. **Audit every `pathExistsInternal()` call** to ensure the path argument goes through the new resolution
3. **Add integration tests** that verify init output paths actually exist on disk after setup
4. **Compare init output before/after:** Run `gsd-tools.cjs init plan-phase 1` in old and new modes, diff the JSON output, and verify every path field was updated

**Warning signs:**
- Init returns `state_exists: false` when the state file clearly exists (at the new path)
- Workflows read stale/empty context because init pointed them to non-existent files
- "Phase not found" errors when the phase directory exists under the new user-qualified path

**Phase to address:**
Phase 1 (Foundation) — init commands must be refactored as part of the core path resolution work.

---

### Pitfall 6: `/gsd:team-status` Reads Other Users' Private State

**What goes wrong:**
The `/gsd:team-status` command needs to read across user directories to show what everyone is working on. This means it must parse STATE.md and ROADMAP.md from `.planning/users/alice/frontend/` even when the current user is `dan`. If the code uses the same user-qualified path resolution for this cross-user read (resolving to the *current* user's directory), it silently shows only your own status. If it bypasses path resolution to read other directories, it creates a code path that ignores the isolation model.

**Why it happens:**
The path resolution system is designed to scope everything to the current user. A command that intentionally breaks that scoping is architecturally antagonistic to the isolation model. Developers either:
- Hack around the resolver (fragile, bypasses validation)
- Add a "read as another user" mode to the resolver (complicates the API, potential security surface)
- Build a separate "scan all users" utility that duplicates path logic (drift risk)

**How to avoid:**
1. **Design the path resolver with an explicit `scope` parameter** from the start: `resolvePath({scope: 'user'})` for normal ops, `resolvePath({scope: 'all-users'})` for team-status. This makes cross-user access intentional and auditable.
2. **team-status should only read frontmatter** (machine-readable), never full markdown bodies (which may contain sensitive planning details). Treat the frontmatter as the "public API" of a user's state.
3. **Consider a separate index file** (`.planning/team-index.json`) that each user updates with their current status on commit, so team-status doesn't need to traverse user directories at all.

**Warning signs:**
- `/gsd:team-status` only shows the current user's projects
- Cross-user reads fail silently (empty state for other users)
- Path resolution tests pass for single-user operations but fail for cross-user operations

**Phase to address:**
Phase 2 or later — team-status is a secondary feature. But the resolver design in Phase 1 must anticipate this use case.

---

### Pitfall 7: Workflow Markdown Uses Paths as Literal Strings (Not Variables)

**What goes wrong:**
Workflows contain instructions like:
```markdown
Read `.planning/ROADMAP.md` to understand the phase breakdown.
Write the context document to `.planning/phases/01-foundation/01-CONTEXT.md`.
```

These are prompts consumed by AI agents. The agent sees `.planning/ROADMAP.md` as a literal file path and passes it to the `Read` tool. In the new multi-user structure, this file is at `.planning/users/dan/frontend/ROADMAP.md`. The agent has no way to know this unless the workflow passes the correct path.

Unlike code (where you can extract a function), prompt text is read literally by the AI. You can't "parameterize" a markdown prompt the same way you parameterize a function call. Every path in every prompt must be either:
- Dynamically constructed by the orchestrator before agent spawn
- Replaced via a template variable system

**Why it happens:**
The original design was elegant for single-user: paths are constants, so embedding them in prompts is simple and readable. Multi-user breaks this assumption but doesn't change the prompt format — prompts are still markdown strings.

**How to avoid:**
1. **Orchestrators already construct agent prompts dynamically** — the `<files_to_read>` blocks are built at spawn time. Ensure ALL paths in the spawned prompt go through the orchestrator's path resolution, not through hardcoded strings in the agent's own markdown.
2. **Audit agent files for hardcoded paths:** The 132 `.planning` references in agent files must be categorized:
   - **Instructions to read/write specific files** → must be replaced with variables from the orchestrator prompt
   - **Documentation/examples** → can stay as-is (they're illustrative, not operational)
   - **Path patterns** (like "write to `.planning/phases/{phase}/`") → must use the resolved planning root
3. **Add a `PLANNING_ROOT` variable** to every agent spawn prompt, and instruct agents to prefix all `.planning/` paths with it.

**Warning signs:**
- Agents create files at `.planning/` (root) instead of the user-qualified path
- `<files_to_read>` blocks contain correct paths but agent's own internal references use hardcoded paths
- Agents work correctly for the first user who happens to match the old path structure, but fail for subsequent users

**Phase to address:**
Phase 1 (Foundation) — must be addressed alongside path resolution since agents are the primary consumers.

---

### Pitfall 8: Config Layering Ambiguity (Global vs Project vs User)

**What goes wrong:**
The design introduces three config levels:
1. `.planning/config.json` — global defaults
2. `.planning/users/dan/frontend/config.json` — project-level overrides
3. `~/.gsd/defaults.json` — user-level defaults (existing, external to repo)

The question of which config wins in which scenario is not defined. If User A sets `parallelization: false` in their project config but the global config says `parallelization: true`, which wins? What about model profiles — should the team lead be able to enforce `quality` profile globally?

Without a clear precedence rule, users get unpredictable behavior. Worse, the existing `loadConfig()` function merges configs but doesn't document its merge strategy, so adding a third layer creates a 3-way merge with implicit rules.

**Why it happens:**
Config layering is a well-known hard problem (see: git config, npm config, ESLint config). Each layer feels intuitive in isolation, but the composition is always surprising. Developers add layers without defining precedence because "we'll figure it out."

**How to avoid:**
1. **Define explicit precedence** and document it: `user-machine (~/.gsd) < repo-global (.planning/config.json) < user-project (.planning/users/dan/frontend/config.json) < CLI flags < environment variables`
2. **Add a `gsd-tools.cjs config resolve <key>` command** that shows which layer a config value came from (like `git config --show-origin`)
3. **Test the merge behavior** with conflicting values at every layer
4. **Consider making the global config read-only** (shared defaults) and only user-project config writable per-user. This eliminates the "who can change global settings" question.

**Warning signs:**
- Users report "I set X but it's still using Y" — the setting exists at a lower-precedence layer
- `model_profile` varies unexpectedly between users on the same project
- Config changes in one user's project leak to another user's project

**Phase to address:**
Phase 1 (Foundation) — config loading is used by every workflow.

---

### Pitfall 9: Git Commit Attribution Breaks with User Directory Structure

**What goes wrong:**
GSD currently creates atomic commits per task with messages like `feat(01-02): implement user model`. In the multi-user structure, two users working on the same project may both have a Phase 01. Commit messages become ambiguous: does `feat(01-02)` refer to Dan's Phase 01 Plan 02 or Alice's Phase 01 Plan 02?

Additionally, the commit scope now includes files under `.planning/users/dan/...` — git diffs show whose planning artifacts changed, but the commit message format doesn't encode the user or project context.

**Why it happens:**
The commit message format was designed for single-user, single-project. Adding multi-user/multi-project means the commit message needs to encode more context. But changing the commit format is an API change that affects git log readability, bisect workflows, and any tooling that parses commit messages.

**How to avoid:**
1. **Extend commit message format** to include user/project context: `feat(dan/frontend/01-02): implement user model` or use a `User: dan` trailer
2. **Planning artifact commits vs code commits:** Planning artifact changes are inherently per-user (files under `users/dan/`), but code commits affect shared files. Keep the existing format for code commits, add user context only for planning artifact commits.
3. **Don't change the format unless it causes real confusion** — the git diff already shows which user directory was modified. Over-engineering commit messages creates noise.

**Warning signs:**
- Git log is hard to filter by user's work (can't distinguish whose phase commits are whose)
- `git bisect` finds a planning artifact commit and can't determine whose workflow created it
- Commit message parsing in status/progress commands breaks on the new format

**Phase to address:**
Phase 2 — after core path resolution works. This is a UX refinement, not a functional requirement.

---

### Pitfall 10: "Everything Per-User" Creates Invisible Divergence

**What goes wrong:**
The design choice to make everything per-user (including ROADMAP.md, REQUIREMENTS.md, and codebase analysis) means two users working on the "same project" may have completely different roadmaps, different requirement interpretations, and different understandings of the codebase. Their work diverges silently because there's no shared artifact that forces alignment.

User A's ROADMAP says Phase 3 is "API authentication." User B's ROADMAP says Phase 3 is "Database optimization." They both commit code changes that conflict — not in planning artifacts (those are isolated) but in actual source code.

**Why it happens:**
Full isolation is the simplest model to implement and reason about. It eliminates all conflict possibilities in planning artifacts. But it also eliminates all coordination possibilities. The system optimizes for "no merge conflicts in .planning/" at the cost of "no shared understanding of the project."

**How to avoid:**
1. **Accept this as a design tradeoff, not a bug.** Document that GSD multi-user mode is for **independent work streams** (Dan works on frontend, Alice works on auth-service), not for **collaborative work on the same deliverables**.
2. **Add a visibility mechanism** (the `/gsd:team-status` command) so users can see what others are planning, even if they can't modify it.
3. **If collaborative roadmaps are ever needed**, introduce a `shared/` directory under each project name for artifacts that are intentionally shared (ROADMAP.md, REQUIREMENTS.md), separate from user-specific artifacts (STATE.md, CONTEXT.md).
4. **Warn during `/gsd:new-project`** if another user already has a project with the same name — prompt whether this is independent or collaborative work.

**Warning signs:**
- Two users create identical project names with different requirements
- Code conflicts increase because users planned the same features differently
- Team lead can't get a unified view of project progress

**Phase to address:**
Phase 2 (team features) — visibility commands address this. Phase 1 design should leave room for shared artifacts later.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode `.planning/users/{user}/{project}/` as new path instead of using a resolver function | Faster initial implementation, easy to grep | Every path construction must be updated if hierarchy changes; no single place to change path strategy | Never — the resolver function costs 30 minutes and saves hundreds of hours |
| Skip agent markdown path updates, rely on orchestrator prompts to provide correct paths | Agents "work" because orchestrators pass correct `<files_to_read>` blocks | Agents that construct internal paths (planner creating PLAN.md, executor writing SUMMARY.md) write to wrong location | Only in MVP if agents are verified to never construct their own paths (unlikely — planner constructs output paths) |
| Use `git config user.name` directly without sanitization/mapping | Zero configuration step for new users | Filesystem errors for international names, identity instability, CI/CD breakage | Never — sanitization is trivial and prevents hard-to-debug failures |
| Store `.active` as a committed file in `.planning/` | Persistent across `git pull`, visible in team-status | Race conditions between users, merge conflicts on `.active`, git noise from constant updates | Never — `.active` should be in `.gitignore` or replaced with env vars |
| Skip integration tests, only unit test the resolver | Faster development, existing test patterns reuse | The 3-layer path resolution (JS → workflow → agent) is only testable end-to-end; unit tests miss the critical gaps | Only in first iteration if manual smoke testing covers the gaps |

## Integration Gotchas

Common mistakes when connecting to external services / systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Git identity (`git config`) | Assuming `user.name` is always set, always stable, always ASCII-safe | Read both `user.name` and `user.email`, sanitize for filesystem, cache in a mapping file, error clearly when unconfigured |
| Git staging (commit workflow) | Using `git add -A` which stages ALL `.planning/users/` changes, including other users' files if modified | Stage only files under the current user's planning directory: `git add .planning/users/dan/frontend/` |
| Claude Code Task spawning | Passing hardcoded `.planning/` paths in the spawn prompt because "the agent knows the structure" | Always resolve paths in the orchestrator and pass fully-qualified paths in the agent prompt. Agents should never derive paths. |
| `.gitignore` patterns | Adding `.planning/.active` to `.gitignore` but forgetting `.planning/users/*/.active` (if per-user .active files exist) | Define ignore patterns for ALL mutable non-committable files at ALL levels: `.planning/.active`, `.planning/**/.active`, `.planning/**/*.lock` |
| Environment variables | Expecting `GSD_ACTIVE` to persist between terminal sessions | Document that env vars are session-scoped. Provide `gsd:switch --persist` to write to the user's `.active` file and `gsd:switch --session` to set only the env var |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `/gsd:team-status` scans all user directories via `fs.readdirSync` + nested reads | Command takes 5+ seconds, blocks main context | Build a team index file updated on commit, not scanned on read | > 10 users, > 5 projects each (50+ STATE.md files to parse) |
| Path resolution calls `git config user.name` on every gsd-tools.cjs invocation | 50-100ms overhead per invocation, adds up in execute-phase (dozens of invocations) | Cache git identity in process memory (already available from first call), or resolve once in init and pass as argument | > 20 gsd-tools.cjs invocations per workflow (typical execute-phase) |
| Config loading reads 3 files (global, repo-global, user-project) per invocation | Tripled I/O compared to current single-file load | Merge all three configs once in init, pass merged config in JSON to downstream calls | Noticeable at > 50 invocations per workflow, negligible for most use cases |
| Milestone archiving traverses ALL users' phase directories | Archive of a shared milestone takes O(users * phases) time | Archive per-user on demand, not all users simultaneously | > 10 users with large phase histories |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| User A can read/write User B's planning artifacts (no filesystem-level isolation) | Users can modify each other's plans, inject tasks, or corrupt state | Accept this as a trust boundary decision — git history provides audit trail. If stronger isolation needed, use branch-based separation instead of directory-based |
| Git identity spoofing — user sets `git config user.name "alice"` to operate as another user | Impersonation of planning context, state corruption under another user's directory | Use email (harder to spoof credibly) + document that GSD relies on git's trust model. For high-security environments, add commit signature verification |
| `.planning/` committed with secrets from user's personal notes in CONTEXT.md or STATE.md Decisions | Secrets leak to all repo collaborators via committed planning artifacts | Add a pre-commit scan of `.planning/users/*/` for high-entropy strings and common secret patterns. Document that planning artifacts are git-tracked and visible to all repo users |
| CI/CD systems auto-create user directories under service account names | Phantom directories pollute the planning tree, may conflict with real user setup | Check for `CI=true` or `GITHUB_ACTIONS=true` environment variables and refuse to create user directories in CI contexts |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring `/gsd:switch` before every command when user only has one project | Unnecessary friction for the common case (most users have 1-2 projects) | Auto-select if only one project exists for the current user. Prompt only when ambiguous. |
| Error message says "project not found" when user forgot to switch | User thinks their project was deleted or corrupted | Error message should say: "No active project. You have projects: [frontend, auth-service]. Run `/gsd:switch frontend` to select one." |
| `/gsd:new-project` creates nested directory structure user didn't expect | User runs `ls .planning/` and sees only `config.json` and `users/` — their files are buried 3 levels deep | On first project creation, explain the directory structure. Show the full path to key files. |
| `/gsd:progress` shows "no project" instead of listing available projects | User runs the familiar command and gets a useless error | `/gsd:progress` without active project should list all the user's projects with their status summary |
| Git diff shows massive `.planning/users/` changes that obscure actual code changes | Code review becomes noisy, reviewers ignore planning artifact diffs | Document recommendation to use `git diff -- ':!.planning'` for code review. Consider adding a `gsd:diff` command that filters planning artifacts. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Path Resolution:** All `gsd-tools.cjs` paths resolve correctly — verify agent-generated files (PLAN.md, SUMMARY.md, VERIFICATION.md) also land in user-qualified paths, not just orchestrator-generated files
- [ ] **Project Switching:** `/gsd:switch` sets context correctly — verify that a LONG-RUNNING execute-phase started BEFORE the switch continues using its ORIGINAL project context, not the newly-switched one
- [ ] **User Identity:** `git config user.name` returns a usable value — verify behavior when user.name is empty, contains spaces, contains unicode, or changes between sessions
- [ ] **Team Status:** `/gsd:team-status` shows other users — verify it works when other users' STATE.md files have different frontmatter schemas (e.g., old format vs new format)
- [ ] **Config Merge:** Three-layer config loads correctly — verify behavior when middle layer (repo-global) doesn't exist, or when user-project config has keys not present in global
- [ ] **Git Operations:** Commits attribute correctly to current user — verify `git add` only stages current user's planning directory, not all users' files
- [ ] **Init Commands:** All 53 path references in init.cjs updated — verify by diffing old and new init output JSON and confirming every path field reflects user-qualified path
- [ ] **Existing Commands:** All 36 existing commands work with active project context — verify `/gsd:health` validates the user-qualified directory structure, not the old flat structure
- [ ] **Backwards Compatibility:** Clean break documented — verify that running new GSD on a repo with old `.planning/` structure gives a clear error message, not silent misbehavior

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Artifacts created at wrong path (flat `.planning/` instead of user-qualified) | LOW | Move files to correct location: `mv .planning/STATE.md .planning/users/dan/frontend/STATE.md`. Git history preserved via `git mv`. |
| `.active` race condition corrupted another user's session | LOW | Reset `.active` file. Corrupted session's in-progress work is in git (atomic commits), so re-run the interrupted workflow. |
| Git identity change orphaned user directory | MEDIUM | Create mapping entry for new identity pointing to old directory. Or rename directory: `git mv .planning/users/oldname .planning/users/newname`. |
| STATE.md concurrent write corruption | MEDIUM | `git log -p .planning/users/dan/frontend/STATE.md` to find the last good version. `git checkout <commit> -- .planning/users/dan/frontend/STATE.md` to restore. |
| Config layering produces wrong behavior | LOW | `gsd-tools.cjs config resolve <key>` shows which layer the value came from. Override at the correct layer. |
| Agent wrote to wrong user directory | MEDIUM | Identify misplaced files via `git status`. Move to correct directory. Audit the agent prompt that produced the wrong path. Fix the orchestrator's path construction. |
| Two users' roadmaps diverged silently | HIGH | Manual reconciliation. Compare roadmaps, align on shared plan, update both users' planning artifacts. This is fundamentally a process problem, not a tooling problem. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 Incomplete path resolution migration | Phase 1: Foundation | `grep -rn '\.planning/' --include='*.md' --include='*.cjs'` returns zero unresolved raw references (excluding docs) |
| #2 `.active` file race condition | Phase 1: Foundation | Run two terminals simultaneously: one executing a phase, one switching projects. Verify no cross-contamination. |
| #3 Git identity fragility | Phase 1: Foundation | Test with `user.name=""`, `user.name="José García"`, `user.name="a"`. Verify sanitized directory names are unique and stable. |
| #4 STATE.md concurrent writes | Phase 1: Foundation | Verify all STATE.md files are under user-qualified paths. No shared mutable state files exist. |
| #5 Init command path references | Phase 1: Foundation | Diff init JSON output: every `_path` field must include `/users/<user>/<project>/` segment |
| #6 Team-status cross-user reads | Phase 2: Team Features | `/gsd:team-status` returns status for all users. Mock 3+ users and verify output. |
| #7 Workflow markdown hardcoded paths | Phase 1: Foundation | Agent smoke test: spawn gsd-planner with multi-user context, verify PLAN.md written to user-qualified path |
| #8 Config layering ambiguity | Phase 1: Foundation | Create conflicting configs at all 3 layers, verify `config resolve` command shows correct precedence |
| #9 Commit attribution | Phase 2: Polish | Review git log for multi-user session, verify commits are distinguishable per-user |
| #10 Everything-per-user divergence | Phase 2: Team Features | `/gsd:team-status` reveals different roadmaps for same project name; documentation warns users |

## Sources

- Codebase analysis: 540+ hardcoded `.planning/` references across 62 files (grep audit of lib/, workflows/, agents/)
- PROJECT.md design document (`.planning/PROJECT.md`) — target directory structure and key design decisions
- CONCERNS.md technical debt analysis — existing single-user assumption documented as known limitation
- ARCHITECTURE.md — orchestrator-agent communication patterns, init compound command design
- init.cjs source code — 53 `.planning/` references in the most critical integration point
- state.cjs source code — read-modify-write pattern without locking
- Prior art: kubectl context switching, nvm alias, direnv — patterns for per-session vs global active selection
- Prior art: git config layering (`--system`, `--global`, `--local`) — precedent for multi-layer config with explicit precedence

---
*Pitfalls research for: multi-user monorepo project management tooling (GSD)*
*Researched: 2026-03-17*
