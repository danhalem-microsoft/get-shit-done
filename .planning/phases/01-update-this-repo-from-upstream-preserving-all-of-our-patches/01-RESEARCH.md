# Phase 1: Update This Repo From Upstream, Preserving ALL of Our Patches - Research

**Researched:** 2026-04-08
**Domain:** Git fork synchronization / large-scale merge conflict resolution
**Confidence:** HIGH

## Summary

This phase requires merging 714 upstream commits into our fork while preserving 102 local commits across 6+ feature areas. A test merge reveals **61 files with conflicts containing 250 conflict markers** total. The conflicts fall into three distinct categories with different resolution strategies: core lib files (93 markers across 11 files requiring careful per-function analysis), workflow/template/agent markdown files (111 markers across 37 files with a repeating `gsd-tools.cjs init` pattern), and test files (46 markers across 8 files that test the resolved lib code).

The hardest challenge is an **architectural path resolution divergence**: our fork uses `getPlanningRoot(cwd)` (multi-user: `.planning/users/<user>/<project>/`) while upstream introduced `planningPaths(cwd)` and `planningDir(cwd)` (workstream-based: `.planning/<project>/workstreams/<ws>/`). Every core lib and workflow file touches this pattern. Additionally, upstream added significant new features (atomic writes, locking, security validation, 10 new lib modules, 136 test files, an SDK directory) that must be integrated alongside our multi-user architecture.

**Primary recommendation:** Execute the merge on a feature branch. Resolve core libs first (they establish the path resolution foundation), then workflows/templates (mechanical once libs are resolved), then tests (must match resolved lib behavior). Use the 694-test suite as the primary validation gate. Budget for approximately 250 individual conflict resolutions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Merge upstream/main into a feature branch (not rebase, not cherry-pick)
- Use default `git merge` (no -X ours/theirs flags) -- let git auto-resolve what it can, flag true conflicts for manual resolution
- Create feature branch (e.g., `upstream-sync`) for the merge work
- After validation, fast-forward main to the merge commit
- Tag current main state before starting (e.g., `pre-upstream-sync`) as safety checkpoint
- Lock upstream/main to current HEAD at phase start -- fetch once, record commit hash, do not re-fetch during work. If upstream moves, sync again in a future phase.
- Resolve core libs first (gsd-tools.cjs, core.cjs, init.cjs, commands.cjs, config.cjs, state.cjs, phase.cjs, roadmap.cjs), then workflows/templates/agents, then tests
- Careful per-conflict analysis: understand intent on BOTH sides before resolving
- Integrate upstream improvements fully (atomic writes, locking, perf fixes, new features) AND preserve all our enhancements
- No blanket "ours wins" or "theirs wins" -- each conflict evaluated for functional intent
- ALL 694 tests must pass before the merge is considered complete
- Abort threshold: if 50+ tests fail after merge, abort and reassess the merge approach
- Test failures fixed in separate commits on the feature branch (not squashed into merge commit)
- No Bazel files exist in this repo -- MODULE.bazel.lock policy from CLAUDE.md is not applicable
- ALL feature areas preserved: multi-user monorepo (69 commits), fork infrastructure (19), taste/critics/mistakes (8), dynamic researcher selection (2), code search (2), completion gates (1), adaptive synthesizer (3)

### Claude's Discretion
- Exact feature branch naming
- Order of conflict resolution within each file category
- Whether to break the merge work into multiple intermediate commits on the feature branch
- How to structure the feature-area audit (script vs manual)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git merge | 2.x | Three-way merge of upstream into feature branch | Default merge preserves both histories; user-locked decision |
| node:test | Node.js built-in | Test runner for 694+ tests | Project standard, both sides use it |
| node scripts/run-tests.cjs | Project test runner | Cross-platform test execution with concurrency | Upstream's standard test runner, already in our repo |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| git tag | built-in | Safety checkpoint before merge | Tag `pre-upstream-sync` before starting |
| git diff --name-only --diff-filter=U | built-in | List unresolved conflicts | After merge to enumerate work |
| grep -c "^<<<<<<<" | built-in | Count conflict markers per file | Triage and progress tracking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git merge | git rebase | Would linearize history but rewrite 102 commits; user rejected |
| git merge | cherry-pick | Would cherry-pick 714 upstream commits one-by-one; impractical |
| Default merge | -X ours/theirs | Would auto-resolve in one direction; user rejected for safety |

## Architecture Patterns

### Conflict Resolution Categories (from test merge)

The test merge identified exactly **61 conflicting files** with **250 conflict markers**, organized into 5 categories:

```
Category 1: Core Libs (11 files, 93 conflict markers) -- HARDEST
  get-shit-done/bin/lib/init.cjs          22 conflicts
  get-shit-done/bin/lib/phase.cjs         17 conflicts
  get-shit-done/bin/lib/state.cjs         15 conflicts
  get-shit-done/bin/lib/commands.cjs      10 conflicts
  get-shit-done/bin/lib/core.cjs           9 conflicts
  get-shit-done/bin/gsd-tools.cjs          5 conflicts
  get-shit-done/bin/lib/config.cjs         3 conflicts
  get-shit-done/bin/lib/roadmap.cjs        4 conflicts
  get-shit-done/bin/lib/milestone.cjs      3 conflicts
  get-shit-done/bin/lib/verify.cjs         4 conflicts
  get-shit-done/bin/lib/template.cjs       1 conflict

Category 2: Workflows/Templates/Agents (37 files, ~111 conflict markers)
  26 workflow files            (~85 markers)
  6 agent files                (~9 markers)
  3 template files             (~3 markers)
  1 command file               (~1 marker)
  1 doc file                   (~1 marker)

Category 3: Tests (8 files, 46 conflict markers)
  tests/core.test.cjs          17 conflicts
  tests/config.test.cjs         9 conflicts
  tests/init.test.cjs           5 conflicts
  tests/helpers.cjs             3 conflicts
  tests/verify-health.test.cjs  2 conflicts
  tests/commands.test.cjs       1 conflict
  tests/milestone.test.cjs      1 conflict
  tests/state.test.cjs          1 conflict

Category 4: Infrastructure (3 files, 10 conflict markers)
  README.md                     8 conflicts
  CHANGELOG.md                  1 conflict
  .gitignore                    1 conflict

Category 5: Special Cases (2 files, modify/delete conflicts)
  commands/gsd/reapply-patches.md    We deleted, upstream modified -> KEEP upstream's version
  get-shit-done/workflows/set-profile.md  Upstream deleted, we modified -> Evaluate if still needed
```

### The Core Architectural Tension: Path Resolution

**Our approach (multi-user monorepo):**
```javascript
// core.cjs: getPlanningRoot(cwd) -> resolves through context.cjs + identity.cjs
//   Returns: ".planning/users/<git-username>/<project-slug>"
const planningRoot = getPlanningRoot(cwd);
const statePath = path.join(cwd, planningRoot, 'STATE.md');
```

**Upstream's approach (workstream-based):**
```javascript
// core.cjs: planningDir(cwd, ws, project) -> env vars GSD_PROJECT + GSD_WORKSTREAM
//   Returns: ".planning" or ".planning/<project>" or ".planning/<project>/workstreams/<ws>"
const statePath = planningPaths(cwd).state;
```

**Resolution strategy:** Both systems solve multi-tenancy differently. Our `getPlanningRoot` already handles the complexity upstream's `planningDir` was built for, plus more (git identity resolution, user-map locking, active project context). The merge must:

1. Keep our `getPlanningRoot` and `tryGetPlanningContext` as the primary path resolution
2. Adopt upstream's `planningPaths` helper as a convenience wrapper that delegates to our resolution
3. Adopt upstream's `atomicWriteFileSync` for crash safety (pure improvement)
4. Adopt upstream's security.cjs `validateFieldName` checks (pure improvement)
5. NOT adopt upstream's simpler `planningDir` that hardcodes `.planning` without multi-user support

### File Size Growth Analysis

| File | Merge-Base | Ours | Upstream | Growth Factor |
|------|-----------|------|----------|---------------|
| gsd-tools.cjs | 592 | 940 (+59%) | 1078 (+82%) | Both grew significantly |
| commands.cjs | 548 | 845 (+54%) | 1013 (+85%) | Both grew significantly |
| config.cjs | 169 | 170 (+1%) | 479 (+183%) | Upstream grew massively |
| core.cjs | 492 | 834 (+70%) | 1587 (+223%) | Upstream tripled |
| init.cjs | 710 | 1086 (+53%) | 1536 (+116%) | Both grew significantly |
| state.cjs | 721 | 732 (+2%) | 1415 (+96%) | Upstream nearly doubled |
| phase.cjs | 901 | 909 (+1%) | 943 (+5%) | Both grew modestly |
| roadmap.cjs | 298 | 301 (+1%) | 360 (+21%) | Upstream grew modestly |

### New Upstream Modules (No Conflict, Pure Addition)

Upstream added 10 new lib modules. These have no conflict with our code and will be merged automatically:

| Module | Lines | Purpose |
|--------|-------|---------|
| security.cjs | 503 | Path validation, field name validation, validatePath() |
| profile-output.cjs | 1048 | Profile output formatting |
| intel.cjs | 660 | Intelligence/analytics tracking |
| profile-pipeline.cjs | 539 | Model profile pipeline |
| docs.cjs | 267 | Documentation generation commands |
| learnings.cjs | 378 | Learning/pattern tracking |
| workstream.cjs | 495 | Workstream management |
| uat.cjs | 282 | User acceptance testing |
| schema-detect.cjs | 238 | Schema detection |
| model-profiles.cjs | 70 | Model profile definitions |

### New Upstream Test Files (No Conflict, Pure Addition)

Upstream added **115 new test files** in `tests/` plus **26 test files** in `sdk/`. These won't conflict with our 6 unique test files (audit-paths, context, identity, integration-commands, migration, team-status).

### New Upstream Content (No Conflict, Pure Addition)

- `sdk/` directory (TypeScript SDK with vitest)
- `.github/` workflow improvements (CI, security, stale, etc.)
- `hooks/` directory (shell hooks for runtimes)
- `CONTRIBUTING.md`, `VERSIONING.md`
- Internationalized READMEs (ja-JP, ko-KR, pt-BR, zh-CN)
- 40+ new command definitions in `commands/gsd/`
- 12+ new agent definitions
- Multiple new workflow files

### Our Unique Files (No Conflict Risk)

These files exist only in our fork and won't be touched by the merge:

| File | Purpose |
|------|---------|
| get-shit-done/bin/lib/identity.cjs | Git user identity resolution |
| get-shit-done/bin/lib/context.cjs | Multi-user planning context |
| get-shit-done/bin/lib/taste.cjs | Taste preference system |
| FORK.md | Fork documentation |
| install-manifest.json | Fork installation manifest |
| scripts/verify-install.js | Fork install verification |
| 6 test files | identity, context, migration, etc. |
| 6 critic agent files | gsd-critic-*.md |
| 10 researcher files | get-shit-done/researchers/*.md |
| 11 command files | switch, archive, restore, taste, etc. |
| 10 workflow files | switch, archive, restore, taste, etc. |
| All .planning/ artifacts | Our planning history |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conflict detection | Manual file-by-file diff | `git merge --no-commit` then `git diff --diff-filter=U` | Git's three-way merge is more accurate than manual diffing |
| Conflict counting | Manual scanning | `grep -c "^<<<<<<<" <file>` | Reliable, standard approach |
| Test validation | Manual function checks | `node --test tests/` (694 tests) | Comprehensive regression detection |
| Feature area audit | Manual file-by-file review | Script that checks for key symbols/exports per feature area | Repeatable, documents what was checked |
| CHANGELOG merging | Manual three-way merge | Take upstream's CHANGELOG entirely, append our section | CHANGELOG conflicts are cosmetic, not functional |

**Key insight:** The merge itself is mechanical (git does it). The hard work is 250 conflict resolutions, each requiring understanding of both sides' intent. Don't try to automate conflict resolution -- each one needs human-equivalent judgment about which code to keep, combine, or adapt.

## Common Pitfalls

### Pitfall 1: Silent Patch Loss in Auto-Merged Files
**What goes wrong:** Git auto-merges a file where both sides changed different parts, but the resulting code is semantically broken (e.g., our import added at the top, upstream's restructured exports at the bottom -- imports reference functions that moved).
**Why it happens:** Git merges text, not semantics. Auto-merged files can have broken references.
**How to avoid:** After merge, run the full 694-test suite. Every feature area we added has tests. If a test fails, it catches the breakage. Also run the feature-area audit on the ~88 shared files.
**Warning signs:** Tests pass individually but fail when run together (circular dependency), or tests pass but the commands don't work when invoked from workflows.

### Pitfall 2: Path Resolution Architecture Clash
**What goes wrong:** Resolving conflicts by taking upstream's `planningPaths(cwd).state` in some files and our `getPlanningRoot(cwd)` in others creates inconsistent path resolution.
**Why it happens:** The two systems use different abstractions. Mixing them means some code resolves to `.planning/STATE.md` and some to `.planning/users/dan/myproject/STATE.md`.
**How to avoid:** Establish the path resolution pattern FIRST in core.cjs. Make `planningPaths` delegate to our `getPlanningRoot`. Then resolve all downstream files consistently.
**Warning signs:** Commands work for single-user but break for multi-user, or vice versa.

### Pitfall 3: Upstream's `atomicWriteFileSync` Replacing `fs.writeFileSync` Without Our Path Resolution
**What goes wrong:** Upstream replaced many `fs.writeFileSync` calls with `atomicWriteFileSync` for crash safety. These are pure improvements. But they also changed the path argument from our `path.join(cwd, planningRoot, ...)` to `planningPaths(cwd).state`.
**Why it happens:** The atomic write improvement is bundled with the path resolution change.
**How to avoid:** Accept the atomic write wrapper (it's better), but use our path resolution inside it.
**Warning signs:** Files written to wrong locations, or written atomically but to `.planning/STATE.md` instead of `.planning/users/<user>/<project>/STATE.md`.

### Pitfall 4: Test Helper Divergence
**What goes wrong:** Our `tests/helpers.cjs` has `createTempMultiUserProject()` for multi-user tests. Upstream's has `TEST_ENV_BASE` for session isolation and `env` parameter support. Both changes are needed.
**Why it happens:** The helpers diverged independently. The merge must combine both sets of improvements.
**How to avoid:** Resolve helpers.cjs carefully -- keep our multi-user helpers AND upstream's env isolation. Tests that were auto-merged may need helper adjustments.
**Warning signs:** Tests that pass locally but fail in CI, or tests that interfere with each other.

### Pitfall 5: Module Exports Drift
**What goes wrong:** After resolving core.cjs, the `module.exports` block is missing functions that other modules import.
**Why it happens:** Both sides added exports. A conflict in the exports block can silently drop entries.
**How to avoid:** After resolving core.cjs, verify every import statement across all lib files resolves to an exported function. Grep for `require('./core.cjs')` destructuring patterns.
**Warning signs:** `TypeError: X is not a function` at runtime, usually in a module that imports from core.

### Pitfall 6: Modify/Delete Conflicts Resolved Wrong Way
**What goes wrong:** Two files have modify/delete conflicts. Choosing the wrong resolution drops important content.
**Why it happens:** `commands/gsd/reapply-patches.md` was deleted by us but modified by upstream (we should keep upstream's version). `get-shit-done/workflows/set-profile.md` was deleted by upstream but modified by us (need to evaluate if our changes are now in settings.md).
**How to avoid:** For reapply-patches: accept upstream's version (we deleted it incorrectly -- it's part of fork infrastructure). For set-profile: check if upstream's settings.md now contains the functionality, and if so, delete our set-profile.md and ensure our changes are in settings.md.
**Warning signs:** Missing commands that should exist, or duplicate/conflicting command definitions.

### Pitfall 7: Version and Package.json Conflicts
**What goes wrong:** Our package.json says version 1.22.4, upstream says 1.34.2. The merge creates a conflict on version number.
**Why it happens:** Both sides bump versions independently.
**How to avoid:** Take upstream's version (1.34.2) since we're syncing to their release state. Our fork-specific version tracking isn't needed -- we track via git tags.
**Warning signs:** npm publish would fail, or install scripts reference wrong version.

## Code Examples

### Pattern: Resolving the Core Path Resolution Conflict

The most critical resolution pattern. Every lib file will need this:

```javascript
// CONFLICT in state.cjs:
// <<<<<<< HEAD (ours)
// const planningRoot = getPlanningRoot(cwd);
// const statePath = path.join(cwd, planningRoot, 'STATE.md');
// =======  (upstream)
// const statePath = planningPaths(cwd).state;
// >>>>>>> upstream/main

// RESOLUTION: Keep our getPlanningRoot, adopt planningPaths as convenience
// In core.cjs, make planningPaths delegate to getPlanningRoot:
function planningPaths(cwd) {
  const planningRoot = getPlanningRoot(cwd);
  const base = path.join(cwd, planningRoot);
  const root = path.join(cwd, '.planning');
  return {
    planning: base,
    state: path.join(base, 'STATE.md'),
    roadmap: path.join(base, 'ROADMAP.md'),
    project: path.join(root, 'PROJECT.md'),  // PROJECT.md stays at root
    config: path.join(root, 'config.json'),   // Global config stays at root
    phases: path.join(base, 'phases'),
    requirements: path.join(base, 'REQUIREMENTS.md'),
  };
}

// Then downstream files can use either pattern consistently:
// Option A (our current): const planningRoot = getPlanningRoot(cwd);
// Option B (upstream's):  const statePath = planningPaths(cwd).state;
// Both resolve to the same multi-user path.
```

### Pattern: Merging Import Statements

```javascript
// CONFLICT in state.cjs imports:
// <<<<<<< HEAD
// const { escapeRegex, loadConfig, getMilestoneInfo, getMilestonePhaseFilter, output, error, getPlanningRoot } = require('./core.cjs');
// =======
// const { escapeRegex, loadConfig, getMilestoneInfo, getMilestonePhaseFilter, normalizeMd, planningDir, planningPaths, output, error, atomicWriteFileSync } = require('./core.cjs');
// >>>>>>> upstream/main

// RESOLUTION: Union of both sides' imports
const { escapeRegex, loadConfig, getMilestoneInfo, getMilestonePhaseFilter, normalizeMd, planningPaths, output, error, getPlanningRoot, atomicWriteFileSync } = require('./core.cjs');
// Keep getPlanningRoot (our multi-user resolution)
// Add planningPaths (upstream convenience, now delegates to ours)
// Add atomicWriteFileSync (upstream crash safety improvement)
// Add normalizeMd (upstream utility)
// Drop planningDir (internal to planningPaths, not needed in consuming modules)
```

### Pattern: Workflow Init Line Conflicts

Most workflow conflicts follow this pattern:

```markdown
<!-- CONFLICT: our init uses context fields, upstream added new fields -->
<!-- <<<<<<< HEAD -->
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
<!-- ======= -->
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
<!-- >>>>>>> upstream/main -->

<!-- RESOLUTION: Take upstream's version (it has @file: support we also added)
     then verify context fields are still emitted by init -->
```

### Pattern: Adopting Upstream's Atomic Writes

```javascript
// Upstream pattern: replace fs.writeFileSync with atomicWriteFileSync
// This is a pure improvement -- adopt it everywhere

// BEFORE (both sides):
fs.writeFileSync(statePath, content, 'utf-8');

// AFTER (upstream's improvement):
atomicWriteFileSync(statePath, content, 'utf-8');
// Uses write-to-temp + rename for crash safety
```

## State of the Art

| Old Approach (merge-base) | Our Approach | Upstream Approach | Resolution |
|--------------------------|--------------|-------------------|------------|
| Flat `.planning/` | `.planning/users/<user>/<project>/` | `.planning/<project>/workstreams/<ws>/` | Keep ours (more mature) |
| `fs.writeFileSync` | `fs.writeFileSync` | `atomicWriteFileSync` | Adopt upstream's |
| No locking | No locking | File locking with cleanup | Adopt upstream's |
| No field validation | No field validation | `security.cjs` validation | Adopt upstream's |
| No session isolation in tests | Multi-user test helpers | `TEST_ENV_BASE` env isolation | Merge both |
| Package v1.22.4 | Package v1.22.4 | Package v1.34.2 | Take upstream's |

## Open Questions

1. **planningPaths delegation architecture**
   - What we know: We need planningPaths to work with our multi-user resolution, and upstream code calls it extensively
   - What's unclear: Should planningPaths call getPlanningRoot internally, or should we refactor all callsites to use getPlanningRoot directly?
   - Recommendation: Make planningPaths delegate to getPlanningRoot. This is the smallest change that preserves both APIs. The planner should evaluate which approach minimizes conflict resolution work.

2. **set-profile.md disposition**
   - What we know: Upstream deleted it, we modified it. Upstream's `settings.md` may contain the same functionality.
   - What's unclear: Did our modifications to set-profile.md add unique content not in settings.md?
   - Recommendation: Compare our set-profile.md with upstream's settings.md. If settings.md covers the functionality, delete set-profile.md. If not, merge our unique parts into settings.md.

3. **Post-merge test count**
   - What we know: We have 694 tests (693 pass, 1 fail). Upstream adds 115+ new test files. After merge, the test count will increase significantly.
   - What's unclear: Will upstream's new tests pass with our multi-user path resolution? Many likely use upstream's `planningDir` pattern in test setup.
   - Recommendation: First ensure our 694 tests pass. Then run upstream's new tests. Failures in new tests are a lower priority than regressions in existing tests.

4. **SDK directory integration**
   - What we know: Upstream added an `sdk/` directory with TypeScript code and vitest tests. This is entirely new.
   - What's unclear: Does the SDK reference `planningDir` or other patterns that need our multi-user adaptation?
   - Recommendation: Let SDK merge cleanly (no conflicts expected). Evaluate separately if SDK tests need multi-user awareness.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node.js built-in) |
| Config file | scripts/run-tests.cjs |
| Quick run command | `node --test tests/*.test.cjs` |
| Full suite command | `node scripts/run-tests.cjs` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MERGE-01 | Merge completes without unresolved conflicts | smoke | `git diff --diff-filter=U \| wc -l` (must be 0) | N/A (git) |
| MERGE-02 | All 694 pre-existing tests pass | regression | `node scripts/run-tests.cjs` | Yes |
| MERGE-03 | Multi-user identity resolution works | unit | `node --test tests/identity.test.cjs` | Yes |
| MERGE-04 | Multi-user context resolution works | unit | `node --test tests/context.test.cjs` | Yes |
| MERGE-05 | All multi-user commands work | integration | `node --test tests/integration-commands.test.cjs` | Yes |
| MERGE-06 | Team status works | unit | `node --test tests/team-status.test.cjs` | Yes |
| MERGE-07 | Migration flow works | unit | `node --test tests/migration.test.cjs` | Yes |
| MERGE-08 | Path audit gate passes | unit | `node --test tests/audit-paths.test.cjs` | Yes |
| MERGE-09 | Taste/critic/mistake code present | smoke | `grep -l 'taste\|critic\|mistake' get-shit-done/bin/lib/*.cjs` | N/A (grep) |
| MERGE-10 | Dynamic researcher code present | smoke | `grep -l 'researcher' get-shit-done/researchers/*.md \| wc -l` | N/A (grep) |
| MERGE-11 | Fork infrastructure files present | smoke | `ls FORK.md install-manifest.json scripts/verify-install.js` | N/A (ls) |

### Sampling Rate
- **Per task commit:** `node --test tests/core.test.cjs tests/state.test.cjs tests/init.test.cjs` (quick smoke of most-changed files)
- **Per wave merge:** `node scripts/run-tests.cjs` (full 694-test suite)
- **Phase gate:** Full suite green + feature-area audit + smoke test of key commands

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The 694 tests plus feature-area audit scripts provide comprehensive regression coverage.

## Quantitative Merge Summary

| Metric | Value |
|--------|-------|
| Upstream commits to merge | 714 |
| Our commits to preserve | 102 |
| Merge base | `2eaed7a` |
| Files changed by us | 241 |
| Files changed by upstream | 551 |
| Files changed on both sides | 88 |
| Files with actual conflicts | 61 |
| Total conflict markers | 250 |
| Upstream new files (added) | 419 |
| Our new files (added) | ~120 (including .planning/) |
| Modify/delete conflicts | 2 |
| Auto-merged files (both sides, no conflict) | 27 |
| Our test files (unique) | 6 |
| Upstream new test files | 115+ |
| Pre-merge passing tests | 693 (1 known failure in audit-paths) |
| Upstream version | 1.34.2 |
| Our version | 1.22.4 |

## Sources

### Primary (HIGH confidence)
- **Actual test merge** -- `git merge upstream/main --no-commit --no-ff` executed and analyzed on 2026-04-08. All conflict counts, file lists, and marker counts are from this real merge attempt, not estimates.
- **git merge-tree** -- Used for additional conflict analysis before the actual merge test.
- **Direct file inspection** -- core.cjs `getPlanningRoot` (line 705), upstream's `planningDir` (line 669) and `planningPaths` (line 698) inspected directly.
- **Test suite execution** -- `node --test tests/` run on current main: 694 tests, 693 pass, 1 fail.

### Secondary (MEDIUM confidence)
- **Feature area identification** -- Based on `git log --oneline` analysis of our 102 commits, categorized by commit message patterns and file paths.

### Tertiary (LOW confidence)
- None -- all findings based on direct repository inspection.

## Metadata

**Confidence breakdown:**
- Conflict inventory: HIGH -- based on actual test merge, not estimates
- Path resolution architecture: HIGH -- direct code inspection of both sides
- Feature preservation risk: HIGH -- our unique files clearly identified, shared files enumerated
- Post-merge test behavior: MEDIUM -- can predict conflicts but not all semantic breakage until tests run

**Research date:** 2026-04-08
**Valid until:** Until upstream/main moves (locked at current HEAD per user decision)
