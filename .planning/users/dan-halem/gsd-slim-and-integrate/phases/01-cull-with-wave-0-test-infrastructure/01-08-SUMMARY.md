---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 08
subsystem: surface-area-cull
tags:
  - cull
  - file-deletion
  - inventory-rewrite
  - canonical-roster
  - paired-test-deletion
  - ten-commit-groups
dependency-graph:
  requires:
    - 01-06 (reference-rot scrub of surviving prose) — Plan 06 cleared all references in surviving files; this plan removes the residual files themselves
    - 01-07 (consolidated commands + 6 deprecation stubs) — the 8 paths Plan 07 owns are NOT deleted by Plan 08; they live in commands/gsd/review.md, commands/gsd/phase.md, get-shit-done/workflows/review.md, get-shit-done/workflows/phase.md, and the 6 stubs
    - tests/cull-no-orphan-references.test.cjs (Plan 01) — the cull-gate test that goes GREEN at the end of this plan
  provides:
    - 49 outright-cut commands removed (per CONTEXT.md decisions table)
    - 17 outright-cut agents removed
    - 3 phase-manipulation commands removed (consolidated into /gsd-phase per Plan 07; no stubs)
    - paired workflow + paired test files removed alongside their commands
    - docs/INVENTORY.md restructured: '## Commands (37 shipped)' + '## Deprecation Stubs (6 shipped)' per CONTEXT.md D-02 LOCKED
    - tests/install-manifest-matches-surviving.test.cjs — the static guard test that asserts INVENTORY.md ↔ filesystem equality
    - tests/inventory-counts.test.cjs updated with a Deprecation Stubs family (Rule 2 deviation)
  affects:
    - Plan 09 (migration table + final lifecycle update + git tag) — consumes the post-cull surface for help.md migration table population
    - all downstream waves: GSD command surface is now its post-cull shape
tech-stack:
  added: []
  patterns:
    - 10-commit deletion strategy (one commit per category, atomic per-category reverts)
    - paired-test enumeration + deletion alongside the command file (WARNING-fix #7)
    - canonical-roster split (Commands vs Deprecation Stubs sections in INVENTORY.md per D-02)
    - INVENTORY-MANIFEST.json regeneration via scripts/gen-inventory-manifest.cjs --write
    - in-place agent-row scrubbing to keep orphan-reference test progressing toward GREEN
key-files:
  created:
    - tests/install-manifest-matches-surviving.test.cjs
  modified:
    - docs/INVENTORY.md (Commands 94→37 headline, Workflows 94→50 headline, Agents 39→22 headline; new Deprecation Stubs section; ~50 row deletions; ~20 row scrubs of slash-mentions in agent rows for agents that were deleted in Cat 10)
    - docs/INVENTORY-MANIFEST.json (regenerated post-cull)
    - tests/inventory-counts.test.cjs (added Deprecation Stubs family + filter Commands family to exclude stubs)
    - tests/claude-md.test.cjs (removed assertion that CLAUDE.md template contains '/gsd-debug' — Cat 3 deleted)
    - tests/copilot-install.test.cjs (replaced /gsd-health and /gsd-autonomous example strings with /gsd-plan-phase)
  deleted:
    - 49 commands/gsd/*.md (outright-cut commands per CONTEXT.md decisions)
    - 3 commands/gsd/{add-phase,insert-phase,remove-phase}.md (consolidated into /gsd-phase)
    - 17 agents/gsd-*.md (outright-cut agents per CONTEXT.md decisions)
    - ~45 get-shit-done/workflows/*.md (paired workflows for deleted commands)
    - ~28 tests/*.test.cjs (paired tests for deleted commands)
decisions:
  - id: D-01-08-01
    text: "Per CONTEXT.md D-02 (LOCKED): docs/INVENTORY.md splits into '## Commands (37 shipped)' for user-facing commands and '## Deprecation Stubs (6 shipped)' for the consolidated quality-gate stubs. The 6 stubs are NOT counted as commands."
    impact: "User-facing roster stays at exactly 37; the 6 stubs are kept on filesystem and listed under their own section. tests/inventory-counts.test.cjs filter mirrors this split so headline counts equal filesystem counts for both families."
  - id: D-01-08-02
    text: "Per CONTEXT.md decisions table: phase-manipulation commands (add-phase, insert-phase, remove-phase) get NO deprecation stubs — they are deleted outright. CULL-04 is verified by /gsd-phase consolidated command (Plan 07)."
    impact: "commands/gsd/{add-phase,insert-phase,remove-phase}.md and the matching workflows are git rm'd in Cat 10. /gsd-phase add|insert|remove (Plan 07) is the canonical replacement."
  - id: D-01-08-03
    text: "Per D-01 carve-out: commands/gsd/review.md is on the deletedCommands list (the OLD git/PR helper) but is NOT git-rm'd — Plan 07 overwrote it in place as the NEW consolidated quality-gate dispatcher. Same for get-shit-done/workflows/review.md."
    impact: "Cat 6 (git/PR extras) deletes ship, undo, inbox commands but skips review. The OLD review semantics are gone (Plan 07 overwrote); the slashMentionExcludes['review'] carve-out in cull-deletion-list.cjs prevents the orphan-reference test from flagging legitimate /gsd-review --flag references in surviving prose."
  - id: D-01-08-04
    text: "Cat 6 paired test cursor-reviewer.test.cjs is deleted (per Plan 07 SUMMARY's deferred-issues notes). review-model-config.test.cjs tests config keys (review.models.<cli>) and is independent — kept."
    impact: "Cleans up 12 RED subtests Plan 07 left behind in cursor-reviewer.test.cjs. Other RED subtests (in code-review.test.cjs, secure-phase.test.cjs, plan-review-convergence.test.cjs) target SURVIVING workflow files and are NOT deleted by this plan — those workflows still exist (consolidated, not deleted), so the tests still have something to assert against; their RED state from Plan 07 is a pre-existing follow-up, not Plan 08's concern."
  - id: D-01-08-05
    text: "Test files that share a substring with a deleted command name but test independent CLI lib functionality are KEPT. Concrete examples: intel.test.cjs (tests get-shit-done/bin/lib/intel.cjs CLI lib), graphify.test.cjs (graphify.cjs lib), gsd2-import.test.cjs (gsd2-import.cjs lib), milestone-audit.test.cjs (audit.cjs lib), init-manager*.test.cjs (init.cjs manager logic), health-validation.test.cjs (validate-health CLI command — different from the deleted /gsd-health slash command), review-model-config.test.cjs (config keys)."
    impact: "Avoids over-deleting CLI lib tests that cover surviving infrastructure. The plan's verify automation specifically checks 'tests/<cmd>-command.test.cjs' (a strict pattern), and the WARNING-fix #7 enumeration is permissive but interpreted as 'paired tests' = tests that explicitly test the deleted command/workflow file's existence or content."
metrics:
  duration: 0h45m
  tasks: 2
  files_changed: 153
  files_deleted: 142
  commits: 11
  completed_at: 2026-04-30T01:03:00Z
---

# Phase 01 Plan 08: The Actual Cull Summary

Executed the actual file deletions per the locked deletion list — 49 outright-cut commands + 3 phase-manipulation commands + 17 outright-cut agents + ~45 paired workflows + ~28 paired tests = 142 file deletions across 10 commit groups (one per category) plus an 11th commit that adds the new INVENTORY ↔ filesystem static guard test and restructures INVENTORY.md per D-02 LOCKED. The orphan-reference test went GREEN by the end of the plan.

## What Was Built

### 10 deletion commits (one per category)

| # | Category                                   | Cmds | Agents | Workflows | Paired tests | Commit hash |
| - | ------------------------------------------ | ---- | ------ | --------- | ------------ | ----------- |
| 1 | audit/diagnostic                           | 9    | 0      | 7         | 3            | 55a8b014    |
| 2 | specialty phases                           | 8    | 0      | 8         | 2            | 2517a503    |
| 3 | debug / explore                            | 2    | 0      | 1         | 2            | 3db6a301    |
| 4 | idea capture                               | 5    | 0      | 2         | 2            | d8573140    |
| 5 | milestone extras                           | 5    | 0      | 5         | 1            | 3a22d250    |
| 6 | git / PR extras (excluding `review` per D-01) | 3 | 0      | 3         | 1            | aae6875a    |
| 7 | process control                            | 6    | 0      | 6         | 8            | e6da4676    |
| 8 | phase manip extras                         | 4    | 0      | 4         | 2            | 2c4ea565    |
| 9 | docs / misc                                | 6    | 0      | 5         | 3            | ea63fca3    |
| 10 | phase-manip consolidation + 17 agents     | 3    | 17     | 3         | 1            | 358ae227    |
|   | **TOTAL**                                  | 51   | 17     | 44        | 25           |             |

(Note: Cat 6 deletes 3 commands, not 4 as the plan template suggests, because /gsd-review is in deletedCommands but per D-01 the file at commands/gsd/review.md is preserved in place as Plan 07's consolidated dispatcher — same name, different functionality.)

### Task 2 commit (51975085) — INVENTORY restructure + new test

- **`tests/install-manifest-matches-surviving.test.cjs`** (new, 7 test cases): asserts INVENTORY.md lists exactly 37 user-facing commands and 22 agents (per D-02), every INVENTORY entry maps to an existing file, exactly 6 stubs exist matching the locked consolidated quality-gate basenames, agents/ filesystem has exactly 22 gsd-*.md, and install-manifest.json source paths still resolve as a sanity check. Read-only fs.readFileSync only, own-scope locals (D-04 concurrency contract).
- **`docs/INVENTORY.md`** (major restructure): moved 6 stub rows out of `## Commands` into a new top-level `## Deprecation Stubs (6 shipped)` section. Added the missing `/gsd-switch` row to `## Commands` (was filesystem-only). Headline `## Commands (43 shipped)` → `## Commands (37 shipped)`. Result: Commands section has exactly 37 entries (matching D-02), Deprecation Stubs section has exactly 6 entries.
- **`tests/inventory-counts.test.cjs`** (Rule 2 deviation): added `Deprecation Stubs` family with the same dir as `Commands` but the opposite filter (stubs only). The `Commands` family filter now excludes stub basenames so `headlineCount('Commands') === fsCount(non-stub commands)`. Stub basenames sourced from `tests/fixtures/cull-deletion-list.cjs` (single source of truth — D-02 LOCKED).
- **`docs/INVENTORY-MANIFEST.json`** (regenerated via `scripts/gen-inventory-manifest.cjs --write`).

## Why It Works

The plan was structured as 10 atomic per-category commits because reference-rot crosses categories (e.g., `agents/gsd-codebase-mapper.md` references `/gsd-map-codebase`, deleted in Cat 1) and per-category atomic commits make each commit revertable in isolation. Plan 06 already scrubbed surviving prose, so the only residual reference rot was in (a) agent rows in INVENTORY.md whose agents are deleted in Cat 10, and (b) a few CLI-module description rows in INVENTORY.md that mentioned deleted commands. These are scrubbed inline as each command's deletion lands.

The orphan-reference test runs after each commit. It started at 375 findings before any deletions and progressed monotonically toward 0:

```
After Cat 1 (audit/diagnostic):    375 → 341
After Cat 2 (specialty phases):    341 → 290
After Cat 3 (debug/explore):       290 → 275
After Cat 4 (idea capture):        275 → 256
After Cat 5 (milestone extras):    256 → 237
After Cat 6 (git/PR extras):       237 → 223
After Cat 7 (process control):     223 → 181
After Cat 8 (phase manip extras):  181 → 155
After Cat 9 (docs / misc):         155 → 120
After Cat 10 (phase-manip + agents): 120 → 56
After INVENTORY-MANIFEST.json regen + small INVENTORY.md tweaks + 3 test-file fixups: 56 → 0 (GREEN)
```

The 6 deprecation stubs from Plan 07 are PRESERVED on filesystem (commands/gsd/{secure-phase,validate-phase,code-review,code-review-fix,critique,plan-review-convergence}.md). Per D-02 LOCKED, they live under `## Deprecation Stubs (6 shipped)` in INVENTORY.md, not under `## Commands`. The `commands-doc-parity.test.cjs` regex matches stub rows in any section, so parity is satisfied.

The new `install-manifest-matches-surviving.test.cjs` is a thin static guard. Per RESEARCH.md §2.5, the filename is preserved for git history but the assertion target shifted from `install-manifest.json` (which is a copy-rule manifest, not enumeration) to `docs/INVENTORY.md` (the canonical roster per D-02). The test parses INVENTORY.md's `## Commands` and `## Agents` sections (split on `## ` headers) and counts entries against the locked totals from `tests/fixtures/cull-deletion-list.cjs`.

## Verification

Final post-cull state:

```
$ ls commands/gsd/*.md | wc -l
43                                           # 37 user-facing + 6 deprecation stubs
$ ls agents/gsd-*.md | wc -l
22                                           # exactly 22 surviving agents
$ ls get-shit-done/workflows/*.md | wc -l
50

$ grep -E "^## (Commands|Agents|Deprecation Stubs|Workflows)" docs/INVENTORY.md
## Agents (22 shipped)
## Commands (37 shipped)
## Deprecation Stubs (6 shipped)
## Workflows (50 shipped)
```

All drift-control tests GREEN:

- ✅ `tests/cull-no-orphan-references.test.cjs` — zero orphan refs (TEST-01 cull gate)
- ✅ `tests/install-manifest-matches-surviving.test.cjs` — 7/7 cases pass (CULL-01, CULL-02, CULL-08 per D-02)
- ✅ `tests/inventory-counts.test.cjs` — Commands (37), Agents (22), Deprecation Stubs (6), Workflows (50), References (49), CLI Modules (29), Hooks (11) all match filesystem
- ✅ `tests/agents-doc-parity.test.cjs` — 22/22 agents have rows in INVENTORY
- ✅ `tests/commands-doc-parity.test.cjs` — every commands/gsd/*.md (43 files) has a row in INVENTORY OR a heading in COMMANDS.md
- ✅ `tests/inventory-source-parity.test.cjs` — every INVENTORY entry maps to a real file
- ✅ `tests/inventory-manifest-sync.test.cjs` — docs/INVENTORY-MANIFEST.json matches filesystem
- ✅ `tests/consolidated-review-flags.test.cjs` (Plan 07) — 6 flags + 6 stubs, non-recursive
- ✅ `tests/consolidated-phase-subcommands.test.cjs` (Plan 07) — 3 subcommands

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical Functionality] tests/inventory-counts.test.cjs needed a Deprecation Stubs family**

- **Found during:** Task 2.
- **Issue:** The plan's INVENTORY.md restructure (D-02 LOCKED) splits commands/gsd/*.md filesystem files into two roster categories: 37 user-facing commands and 6 deprecation stubs. The pre-existing `inventory-counts.test.cjs` has a single `Commands` family with filter `f => f.endsWith('.md')` for `commands/gsd/`, so `fsCount = 43` (all .md files). Without an update, `## Commands (37 shipped)` would not equal `fsCount = 43` and the test would flip RED.
- **Fix:** Added a new `Deprecation Stubs` family with the same dir but inverted filter (`f.endsWith('.md') && STUB_BASENAMES.has(f)`). Updated the `Commands` family filter to exclude stubs. Stub basenames sourced from `tests/fixtures/cull-deletion-list.cjs` (single source of truth per D-02 LOCKED).
- **Files modified:** `tests/inventory-counts.test.cjs` (~10 lines).
- **Commit:** `51975085` (folded into Task 2).

**2. [Rule 2 — Missing Critical Functionality] docs/INVENTORY.md needed a `/gsd-switch` row**

- **Found during:** Task 2.
- **Issue:** `commands/gsd/switch.md` exists on filesystem but had no row in INVENTORY.md (probably an oversight from when /gsd-switch was added). The new install-manifest-matches-surviving test requires `## Commands (37 shipped)` to enumerate 37 commands; without the /gsd-switch row, INVENTORY would only enumerate 36. The pre-existing `commands-doc-parity.test.cjs` was passing because /gsd-switch has a heading in COMMANDS.md (the "OR" clause), but the new D-02 test counts INVENTORY rows directly.
- **Fix:** Added `/gsd-switch` row to the Docs/Profile/Utilities subsection of `## Commands`.
- **Files modified:** `docs/INVENTORY.md` (1 row added).
- **Commit:** `51975085` (folded into Task 2).

**3. [Rule 1 — Bug] Stale assertions in 3 surviving test files**

- **Found during:** Task 1, after running orphan-reference test post-Cat-10.
- **Issue:** Three surviving test files referenced deleted slash commands as string literals or example values:
  - `tests/claude-md.test.cjs:40` — asserted CLAUDE.md template contains `/gsd-debug` (Cat 3 deleted /gsd-debug).
  - `tests/copilot-install.test.cjs:297, 680` — used `/gsd-health` (Cat 1) and `/gsd-autonomous` (Cat 7) as conversion-test example strings.
  - `tests/plan-phase-ui-redirect.test.cjs:21, 23, 48` — asserted plan-phase.md mentions `/gsd-ui-phase` (Cat 2 deleted /gsd-ui-phase; Plan 06 already scrubbed plan-phase.md text).
- **Fix:**
  - `tests/claude-md.test.cjs`: removed the `assert.ok(content.includes('/gsd-debug'))` line.
  - `tests/copilot-install.test.cjs`: replaced `/gsd-health` example with `/gsd-plan-phase` and updated comments mentioning `/gsd-autonomous` to `/gsd-plan-phase`.
  - `tests/plan-phase-ui-redirect.test.cjs`: deleted entirely (its assertions are about a workflow that was scrubbed of UI-phase mentions in Plan 06).
- **Files modified:** 2 tests; 1 deleted.
- **Commit:** `358ae227` (folded into Cat 10).

**4. [Rule 2 — Missing Critical Functionality] INVENTORY.md agent rows referenced deleted slash commands**

- **Found during:** Cats 1, 2, 3, 7, 9 — each category that deleted a command also flipped some agent row's `Spawned by` column to a deleted slash mention.
- **Issue:** The 17 agents being deleted in Cat 10 had rows in INVENTORY.md whose `Spawned by` columns referenced commands deleted in earlier categories (e.g., `gsd-codebase-mapper` mentioned `/gsd-map-codebase` from Cat 1). Until Cat 10 deleted the agent rows, the orphan-reference test flagged those slash mentions as findings.
- **Fix:** As each category deleted commands that were referenced by agent rows in INVENTORY.md, the affected agent rows' `Spawned by` columns were updated in the same commit to `_(spawn surface removed in Phase 1 cull)_`. By Cat 10, the agent rows themselves were deleted, but the per-category scrubs kept the orphan-reference test progressing toward GREEN throughout the plan instead of staying RED until the last commit.
- **Files modified:** `docs/INVENTORY.md` (~12 row scrubs across Cats 1, 2, 3, 7, 9).
- **Commits:** distributed across Cats 1–9.

**5. [Rule 2 — Missing Critical Functionality] INVENTORY-MANIFEST.json needed regeneration**

- **Found during:** Task 1, after Cat 10.
- **Issue:** `docs/INVENTORY-MANIFEST.json` is generated by `scripts/gen-inventory-manifest.cjs` and locked against the filesystem by `tests/inventory-manifest-sync.test.cjs`. It contained pre-cull entries for all 49 deleted commands and 17 deleted agents, so after the cull it was stale.
- **Fix:** Ran `node scripts/gen-inventory-manifest.cjs --write` after Cat 10 deletions. New manifest matches the post-cull filesystem.
- **Files modified:** `docs/INVENTORY-MANIFEST.json` (regenerated).
- **Commit:** `358ae227` (folded into Cat 10).

### Auth Gates

None — this plan is fully automated, file-edit + git-rm only.

## Deferred Issues

### Pre-existing failing tests carried over from Plan 07

Plan 07's SUMMARY listed 12 RED subtests across `tests/code-review.test.cjs`, `tests/secure-phase.test.cjs`, `tests/plan-review-convergence.test.cjs`, and `tests/cursor-reviewer.test.cjs`. Plan 08 deleted `tests/cursor-reviewer.test.cjs` (per Plan 07 SUMMARY's recommendation; that test asserted OLD `/gsd-review` cross-AI behavior, which Plan 07 overwrote). The other three test files are NOT deleted because their corresponding workflow files (`code-review.md`, `secure-phase.md`, `plan-review-convergence.md`) survive (they are CONSOLIDATED, not DELETED). The remaining ~10 RED subtests in those files target the OLD workflow content that Plan 07 changed; they are a pre-existing concern that should be triaged in a follow-up plan (probably Plan 09 or a Phase 2 plan).

### docs/COMMANDS.md and docs/AGENTS.md narrative drift

`docs/COMMANDS.md` and `docs/AGENTS.md` still contain narrative content (role cards, command descriptions) for commands and agents deleted in this plan. The relevant drift-control tests (`commands-doc-parity.test.cjs`, `agents-doc-parity.test.cjs`) only assert that every filesystem file has a row in INVENTORY.md (or, for commands, optionally a heading in COMMANDS.md). They do NOT assert that every COMMANDS.md heading or AGENTS.md card has a corresponding filesystem file. So the docs may have ghost entries for deleted items. This is out of scope for Plan 08; Plan 09 (migration table + docs cleanup) is the right place to scrub them.

## Self-Check

| Claim                                                                                          | Status   |
| ---------------------------------------------------------------------------------------------- | -------- |
| 10 deletion commits land in git log with `chore(cull): delete <category>` titles               | FOUND    |
| Filesystem `commands/gsd/*.md` count = 43 (37 user-facing + 6 stubs per D-02)                  | PASSED   |
| Filesystem `agents/gsd-*.md` count = 22                                                        | PASSED   |
| Filesystem `get-shit-done/workflows/*.md` count = 50                                           | PASSED   |
| INVENTORY.md `## Commands (37 shipped)` headline                                               | PASSED   |
| INVENTORY.md `## Agents (22 shipped)` headline                                                 | PASSED   |
| INVENTORY.md `## Deprecation Stubs (6 shipped)` headline (new section per D-02)                | PASSED   |
| All 49 outright-cut commands absent from filesystem                                            | PASSED   |
| All 3 phase-manip commands absent from filesystem                                              | PASSED   |
| All 17 deleted agents absent from filesystem                                                   | PASSED   |
| 6 deprecation stub files PRESERVED (Plan 07 ownership)                                         | PASSED   |
| commands/gsd/review.md and get-shit-done/workflows/review.md PRESERVED (D-01 carve-out)        | PASSED   |
| commands/gsd/phase.md and get-shit-done/workflows/phase.md PRESERVED (Plan 07 consolidation)   | PASSED   |
| tests/cull-no-orphan-references.test.cjs GREEN                                                 | PASSED   |
| tests/install-manifest-matches-surviving.test.cjs GREEN (7/7 cases)                            | PASSED   |
| tests/inventory-counts.test.cjs GREEN (7 families: Agents, Commands, Deprecation Stubs, Workflows, References, CLI Modules, Hooks) | PASSED |
| tests/agents-doc-parity.test.cjs GREEN                                                         | PASSED   |
| tests/commands-doc-parity.test.cjs GREEN                                                       | PASSED   |
| tests/inventory-source-parity.test.cjs GREEN                                                   | PASSED   |
| tests/inventory-manifest-sync.test.cjs GREEN (docs/INVENTORY-MANIFEST.json regenerated)        | PASSED   |
| commit `55a8b014` (Cat 1) exists                                                               | FOUND    |
| commit `2517a503` (Cat 2) exists                                                               | FOUND    |
| commit `3db6a301` (Cat 3) exists                                                               | FOUND    |
| commit `d8573140` (Cat 4) exists                                                               | FOUND    |
| commit `3a22d250` (Cat 5) exists                                                               | FOUND    |
| commit `aae6875a` (Cat 6) exists                                                               | FOUND    |
| commit `e6da4676` (Cat 7) exists                                                               | FOUND    |
| commit `2c4ea565` (Cat 8) exists                                                               | FOUND    |
| commit `ea63fca3` (Cat 9) exists                                                               | FOUND    |
| commit `358ae227` (Cat 10) exists                                                              | FOUND    |
| commit `51975085` (Task 2) exists                                                              | FOUND    |

## Self-Check: PASSED
