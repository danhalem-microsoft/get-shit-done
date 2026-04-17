# FORK.md - GSD Fork Documentation

This fork of [get-shit-done](https://github.com/glittercowboy/get-shit-done) extends the base system with 6 integrated feature systems, all delivered natively via `git clone` + `node install.js`.

## Overview

This fork adds the following systems on top of upstream GSD:

1. **Code-Search Integration** - Optional MCP-based code search tools injected into agents
2. **Critic Agents** - 6 specialized critic agents (plan, code, scope, verify, discuss, strategy) for quality gates
3. **Dynamic Researchers** - 11 researcher types with AI-powered selection and adaptive synthesis
4. **Adaptive Synthesizer** - Synthesizer agent that adapts output format to researcher findings
5. **Mistake Registry** - Structured mistake capture, storage, and critic integration
6. **Taste Library** - Decision preference extraction, storage, and consultation during planning

## Installation

### From Fork (Recommended)

```bash
git clone https://github.com/danhalem-microsoft/get-shit-done.git
cd get-shit-done
node bin/install.js --global
```

### Runtime Options

```bash
node bin/install.js --global          # Install to ~/.claude/ (default)
node bin/install.js --local           # Install to ./.claude/
node bin/install.js --claude --global # Explicit Claude Code
node bin/install.js --opencode --global
node bin/install.js --gemini --global
node bin/install.js --codex --global
```

## Code-Search Integration

Code-search MCP server access is **optional** and auto-detected during installation.

### How It Works

1. Agent files in the fork contain template markers: `<!-- code-search-tools -->` and `<!-- code-search-guidance -->`
2. During `node install.js`, the installer checks `~/.claude/settings.json` for a `code-search` key in `mcpServers`
3. **If detected**: Markers are replaced with `, mcp__code-search__*` tools and a guidance block
4. **If not detected**: Markers are removed cleanly (agents work without code-search)

### Affected Agents

- `gsd-codebase-mapper.md` - Uses code-search during codebase analysis
- `gsd-executor.md` - Uses code-search during implementation
- `gsd-planner.md` - Uses code-search during plan creation
- `gsd-debugger.md` - Uses code-search during debugging
- `gsd-verifier.md` - Uses code-search during verification
- `gsd-phase-researcher.md` - Uses code-search during phase research
- `gsd-project-researcher.md` - Uses code-search during project research

### Setting Up Code-Search

To enable code-search, add it to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "code-search": {
      "command": "node",
      "args": ["/path/to/code-search-server/index.js"]
    }
  }
}
```

Then re-run `node bin/install.js --global` to inject the tools.

## Upstream Sync

### Adding Upstream Remote

```bash
cd /path/to/your/get-shit-done
git remote add upstream https://github.com/glittercowboy/get-shit-done.git
```

### Syncing with Upstream

Use the built-in command:

```
/gsd-sync-upstream
```

Or manually:

```bash
git fetch upstream
git checkout -b upstream-sync   # Work branch — never merge directly on main
git merge upstream/main
# Resolve conflicts (see playbook below)
node --test tests/             # Must pass before fast-forwarding main
git checkout main && git merge --ff-only upstream-sync
node bin/install.js --global   # Reinstall from merged main
```

### ⚠️ READ FIRST: Murder-Merge Prevention

**Before touching any upstream sync, read [docs/postmortems/2026-04-13-upstream-merge-murder.md](docs/postmortems/2026-04-13-upstream-merge-murder.md).**

On 2026-04-13 an upstream merge deleted 11 fork-only workflow files (1,723 lines), silently gutted fork integration from 6+ more, and buried the damage under commit messages like "fix: sync workflow and command files with upstream versions" and "fix: replace stale /gsd: colon references with /gsd- hyphen format." The fork was effectively murdered while its log read like housekeeping. The postmortem is the definitive record and its process rules are binding for every future sync.

**Three binding rules for upstream sync work:**

1. **Fork-integrity audit must pass before merging to `main`.** Run `node scripts/audit-fork-integrity.js` (planned — part of the recovery). Zero regressions OR the merge does not proceed. Adding it to CI is tracked as an action item in the postmortem.

2. **Commit bodies must state fork-integration status explicitly.** Any commit touching `get-shit-done/workflows/`, `agents/`, `commands/gsd/`, or `bin/install.js` during a sync must state, in prose:
   - File counts by type (workflows: N, agents: N, commands: N)
   - Which fork patches were reviewed and confirmed present
   - Which fork features were intentionally dropped, and why
   If none of those statements can be made truthfully, the commit does not happen.

3. **>20 failing tests after a merge is an alarm, not a chore.** If the merge produces a flood of test failures, the default hypothesis is that fork content was overwritten and the tests are correctly alarming. Investigate each failing assertion — is it measuring a fork feature? If yes, the merge is wrong, not the test. Do **not** "fix" tests by making them match damaged content.

### Upstream Sync Playbook

This section captures hard-won lessons from syncing 714 upstream commits into our 102-commit fork (April 2026). Follow this next time.

**Applied learnings from the 2026-04-13 murder-merge incident are inlined below. Where you see ⚠️, the step is there specifically because it was skipped last time and cost the fork.**

#### Phase 1: Pre-merge setup

1. **Create work branch**: `git checkout -b upstream-sync`
2. **Snapshot test baseline**: `node --test tests/ 2>&1 | tail -5` — record pass/fail count
3. **NEVER run on main** — always merge on a branch, fast-forward main only after all tests pass

#### Phase 2: Merge and resolve conflicts

1. `git fetch upstream && git merge upstream/main`
2. Resolve conflicts in waves by complexity:
   - **Wave 1**: `core.cjs` — path resolution is the hardest. Our `getPlanningRoot()` (multi-user) vs upstream's `planningDir()` (flat). Resolution: `planningPaths()` delegates to `getPlanningRoot()`, add flat `.planning/` fallback when no `users/` dir exists
   - **Wave 2**: `init.cjs`, `state.cjs`, `phase.cjs` — these use `planningPaths()` for all path resolution
   - **Wave 3**: Remaining libs (`commands.cjs`, `workstream.cjs`, `config.cjs`, etc.)
   - **Wave 4**: Markdown files (workflows, agents, templates) — ⚠️ **NEVER `git checkout --theirs` on any file listed in the "Files with Fork Customizations" table below.** Do a three-way merge: upstream's new content + the fork's added content. If you are tempted to take upstream wholesale "just for this file" — stop, open the postmortem, and read Failure Mode #1. Every file that was murdered on 2026-04-13 was murdered via that exact shortcut.
   - **Wave 5**: Test files — take upstream tests, fix for multi-user compat (see below). ⚠️ A failing workflow/agent content test is **not** a test file problem; it is almost certainly Wave 4 damage alarming. Go back to Wave 4 before touching the test.

3. **Commit the merge** once all conflict markers are resolved (tests may still fail). ⚠️ **Do not write "preserving all local patches" in the commit body unless you can name each preserved patch.** That phrase was used to describe the 2026-04-13 merge and it was false.

#### Phase 3: Fix test failures (the hard part)

⚠️ **First triage every failing test before "fixing" anything.** For each failing test, open the file it asserts on and ask: *is this test failing because fork-customised content was overwritten?* If yes, the fix is in Wave 4, not here. Only the patterns below (workstream, identity, tests that reference upstream-only paths, etc.) are legitimate Phase 3 work. The 2026-04-13 incident burned the fork by applying Phase 3 "fixes" to Wave 4 damage — running tests that were correctly alarming, then silencing them by modifying or deleting the fork content they were checking. Do not repeat.

These are the recurring patterns we hit. Fix in this order:

##### Pattern 1: Workstream awareness
Upstream added workstream support (`GSD_WORKSTREAM` env var, `--ws` flag). Our `planningPaths()` and any function using `getPlanningRoot()` directly didn't incorporate workstream scoping.

**Fix**: `planningPaths(cwd, wsOverride)` checks `wsOverride || process.env.GSD_WORKSTREAM`. Any function building phase/state paths should use `planningPaths()` not raw `getPlanningRoot()`.

##### Pattern 2: Legacy structure detection
Tests that create `.planning/PROJECT.md` without `.planning/users/` trigger our "Legacy .planning/ structure detected" hard error (`process.exit(1)`).

**Fix**: Either (a) update the test to not create `PROJECT.md` at flat level, or (b) use `ROADMAP.md` instead (won't trigger legacy check).

##### Pattern 3: Identity side effects
`tryGetPlanningContext()` → `resolveIdentity()` → `lockIdentity()` writes `user-map.json`. This creates untracked files that break "nothing to commit" tests.

**Fix**: Seed `user-map.json` in `createTempGitProject()` test helper with `{ _schema: 1, "Test User": "test-user" }`.

##### Pattern 4: Commit attribution ordering
Our TEAM-06 attribution check (`git diff --cached`) must run AFTER file staging, not before. Otherwise staged files aren't visible.

**Fix**: Move the attribution block after the staging loop in `cmdCommit`.

##### Pattern 5: process.cwd() in tests
Some upstream tests use `process.cwd()` for file resolution. When the test runner runs from `tests/` dir, paths to `get-shit-done/templates/` or `commands/gsd/` break.

**Fix**: Replace `process.cwd()` with `path.join(__dirname, '..')` in affected test files.

##### Pattern 6: process.exit(1) can't be caught
Our `error()` function calls `process.exit(1)`. `try/catch` can't catch this. Functions like `getPlanningRoot()` that hard-error on "no active project" will kill the subprocess.

**Fix**: Functions called from init commands should use `tryGetPlanningContext()` (returns nulls) instead of `getPlanningRoot()` (hard-errors). Or accept a `planningRootOverride` parameter to avoid the call entirely.

##### Pattern 7: Injection scan false positives
Our command files (`archive-project.md`, `restore-project.md`, `switch.md`) contain `<user>` in path template strings like `.planning/users/<user>/`. The prompt injection scan flags these.

**Fix**: Add to the `ALLOWLIST` in `prompt-injection-scan.test.cjs`. Comment must NOT contain literal `.planning/` or audit-paths will flag it too.

##### Pattern 8: Expected file lists
The Copilot install test has a hardcoded list of expected agent files. Our fork adds critic agents.

**Fix**: Add new agent filenames to the `expected` array in `copilot-install.test.cjs`.

##### Pattern 9: Missing template sections
Upstream may add sections to templates (e.g., "Deferred Items" in `state.md`). Tests check for them.

**Fix**: Add the section to `get-shit-done/templates/state.md` (or whichever template).

#### Phase 4: Validate and merge

1. Run full suite: `node --test tests/` — must be 0 failures
2. Checkpoint: present results to user for approval
3. Fast-forward: `git checkout main && git merge --ff-only upstream-sync`
4. Reinstall: `node bin/install.js --global`
5. Verify: `gsd-tools.cjs --version` shows correct version
6. Clean up: `git branch -d upstream-sync`

#### CRITICAL Safety Rules

- **NEVER `require(install.js)`** in any agent or test — it has side effects that overwrite `~/.claude/get-shit-done/`
- **NEVER commit MODULE.bazel.lock** without running the full test suite
- **Stash before switching branches** — uncommitted changes to hooks/ will block checkout
- **Keep the work branch** until main is verified — if anything breaks, you can go back

### Conflict Resolution

Files most likely to conflict during upstream sync:

| File | Why | Resolution |
|------|-----|------------|
| `get-shit-done/bin/lib/core.cjs` | Path resolution divergence (multi-user vs flat) | Keep our `getPlanningRoot`, add upstream's new functions, make `planningPaths` workstream-aware |
| `get-shit-done/bin/lib/init.cjs` | Init context fields differ | Keep our `tryGetPlanningContext` pattern, add upstream's new fields |
| `get-shit-done/bin/lib/commands.cjs` | Commit attribution, new commands | Merge carefully — ordering matters for attribution |
| `get-shit-done/bin/lib/phase.cjs` | Phase resolution paths | Use `planningPaths()` not raw `getPlanningRoot()` |
| `get-shit-done/bin/gsd-tools.cjs` | Dispatcher changes | Keep our multi-user routing, merge upstream's new commands |
| `bin/install.js` | Template expansion functions | Keep fork additions, merge upstream changes |
| `agents/gsd-*.md` | Template markers added | Keep fork markers, merge upstream agent changes |
| `tests/helpers.cjs` | Test helper structure | Keep our `createTempMultiUserProject`, update `createTempGitProject` |
| `hooks/gsd-check-update.js` | npm registry check | Skip npm check (fork versioning), keep stale-hook detection |

## Fork Architecture

### install-manifest.json

Declarative manifest mapping source paths to installation destinations:

```
install-manifest.json
  sources:
    workflows/    -> get-shit-done/workflows/   (copy-with-path-replacement)
    researchers/  -> get-shit-done/researchers/  (copy-with-path-replacement)
    bin/          -> get-shit-done/bin/           (copy-raw)
    references/   -> get-shit-done/references/   (copy-with-path-replacement)
    templates/    -> get-shit-done/templates/     (copy-with-path-replacement)
    agents/       -> agents/                     (copy-with-path-replacement + template markers)
    commands/gsd/ -> commands/gsd/               (copy-with-path-replacement)
```

### Template Markers

Template markers in agent files enable conditional feature injection:

- `<!-- code-search-tools -->` - Replaced with MCP tool list or removed
- `<!-- code-search-guidance -->` - Replaced with guidance block or removed

Detection happens at install time, not runtime.

### verify-install.js

After installation, verify integrity:

```bash
node scripts/verify-install.js  # If available
```

## Files Modified from Upstream

### Agents (14 files)

| File | Modification |
|------|-------------|
| `agents/gsd-codebase-mapper.md` | Template markers for code-search tools |
| `agents/gsd-executor.md` | Template markers for code-search tools |
| `agents/gsd-planner.md` | Template markers for code-search tools |
| `agents/gsd-debugger.md` | Template markers for code-search tools |
| `agents/gsd-verifier.md` | Template markers for code-search tools |
| `agents/gsd-phase-researcher.md` | Template markers for code-search tools |
| `agents/gsd-project-researcher.md` | Template markers for code-search tools |
| `agents/gsd-critic-code.md` | New: code quality critic agent |
| `agents/gsd-critic-discuss.md` | New: discussion quality critic agent |
| `agents/gsd-critic-plan.md` | New: plan quality critic agent |
| `agents/gsd-critic-scope.md` | New: scope creep critic agent |
| `agents/gsd-critic-strategy.md` | New: strategy critic agent |
| `agents/gsd-critic-verify.md` | New: verification critic agent |
| `agents/gsd-research-synthesizer.md` | Modified: adaptive synthesis |

### Core (3 files)

| File | Modification |
|------|-------------|
| `bin/install.js` | Code-search detection + template expansion functions |
| `get-shit-done/bin/gsd-tools.cjs` | Mistake/taste/critic commands + routing |
| `get-shit-done/bin/lib/commands.cjs` | Researcher scan/load functions |

### Workflows (9 files)

| File | Modification |
|------|-------------|
| `get-shit-done/workflows/update.md` | Fork update section, repatch references removed |
| `get-shit-done/workflows/new-project.md` | Synthesizer integration |
| `get-shit-done/workflows/new-milestone.md` | Synthesizer integration |
| `get-shit-done/workflows/discuss-phase.md` | Taste consultation + decision logging |
| `get-shit-done/workflows/complete-milestone.md` | Taste extraction hook |
| `get-shit-done/workflows/critique.md` | Critic routing workflow |
| `get-shit-done/workflows/add-taste.md` | New: add taste entry workflow |
| `get-shit-done/workflows/extract-taste.md` | New: extract taste from logs |
| `get-shit-done/workflows/sync-upstream.md` | New: upstream sync workflow |

### New Directories

| Directory | Contents |
|-----------|----------|
| `get-shit-done/researchers/` | 11 researcher type definitions |
| `get-shit-done/bin/lib/taste.cjs` | Taste library module |
| `get-shit-done/templates/code-search-guidance.md` | Template for code-search guidance block |
| `commands/gsd/` | 6 new command stubs (add-taste, extract-taste, mistakes, add-mistake, sync-upstream, reapply-patches) |

## Troubleshooting

### Code-search not injected into agents

1. Verify `~/.claude/settings.json` has `mcpServers` with a `code-search` key
2. Re-run `node bin/install.js --global`
3. Check installed agents: `grep "mcp__code-search" ~/.claude/agents/gsd-executor.md`

### Template markers visible in installed agents

If you see `<!-- code-search-tools -->` in installed agent files, the template expansion didn't run. Re-run `node bin/install.js --global`.

### Upstream merge conflicts

1. `git fetch upstream && git merge upstream/main`
2. Resolve conflicts keeping fork additions (template markers, new functions)
3. `node bin/install.js --global` to re-install
4. Verify: no template markers visible in `~/.claude/agents/`

### Commands not found

1. Verify `~/.claude/commands/gsd/` contains all command files
2. Restart Claude Code to reload commands
3. Re-run `node bin/install.js --global`
