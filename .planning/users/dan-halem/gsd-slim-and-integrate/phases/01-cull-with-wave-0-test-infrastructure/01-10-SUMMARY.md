---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 10
subsystem: cull-quality-gate
tags: [cull, gap-closure, CR-01, help.md, orphan-test]
gap_closure: true
gaps_addressed: [CR-01]
requirements_addressed: [TEST-01, CULL-06]
depends_on: [09]
wave: 2
dependency_graph:
  requires:
    - tests/fixtures/cull-deletion-list.cjs (deletedCommands, slashMentionExcludes)
    - tests/cull-no-orphan-references.test.cjs (existing top-level scan, ALLOW_LIST shape)
    - tests/migration-table-present.test.cjs (Plan 09 — must not regress)
  provides:
    - Durable CR-01 guard sub-test (`Usage: /gsd-<deleted>` scan over ALLOW_LIST file bodies)
    - Cleaned help.md body free of live-command documentation for deleted commands
  affects:
    - get-shit-done/workflows/help.md (207 lines removed net; migration table preserved)
    - tests/cull-no-orphan-references.test.cjs (50 lines added — additive sub-test)
tech-stack:
  added: []
  patterns:
    - "Test additivity: new sub-test does NOT relax existing scan; carve-out (slashMentionExcludes) honored consistently"
    - "Per-test concurrency contract (D-04): read-only fs, own-scope locals, no shared-state mutation"
    - "Migration-table-as-source-of-truth: /gsd-help body shows only live commands; deleted-command names live exclusively in the migration table at the bottom"
key-files:
  created: []
  modified:
    - tests/cull-no-orphan-references.test.cjs
    - get-shit-done/workflows/help.md
decisions:
  - "Broader strip than plan scoped: the new CR-01 guard test correctly flags 20 violations (not just the 3 named in CR-01). Per Rule 2 (auto-add missing critical functionality), the test is right and the strip was widened to cover all flagged commands. This aligns with the phase goal: 'no orphan references to deleted names anywhere in surviving... workflows.'"
  - "Removed two stale workflow examples in ## Common Workflows (Rule 1 — auto-fix bug): the /gsd-debug example (entire example removed; the command is deleted) and the /gsd-insert-phase example (rewritten to /gsd-phase insert; the command is consolidated, not deleted). These weren't flagged by the test (they're code-block examples, not Usage: lines) but they're the same class of stale-doc bug."
  - "Migration-table preservation regex in plan was faulty: `Removed.*gsd-do` does not match the actual table format `| /gsd-do | _(none)_ | Removed. |` because `Removed` appears AFTER the command name. Used corrected regex `^\\| \\`/gsd-do\\`` to confirm preservation. Three migration-table rows for CR-01 commands all preserved."
metrics:
  start: 2026-05-01T17:08:46Z
  end: 2026-05-01T17:14:11Z
  duration_seconds: 325
  duration_human: "5m 25s"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  commits: 2
  lines_changed: "+51 / -206 (net -155)"
---

# Phase 01 Plan 10: Close BLOCKER CR-01 (help.md body advertising deleted commands) Summary

Strip live command-reference sections for deleted commands from `get-shit-done/workflows/help.md` and tighten the orphan-reference test with a durable guard against `Usage: /gsd-<deleted-command>` patterns inside any allow-listed file.

## Outcome

CR-01 closed. The orphan-reference test (`tests/cull-no-orphan-references.test.cjs`) now has two passing test blocks:

1. **Existing top-level scan** (1/1, GREEN, unchanged): zero orphan references across 6 syntactic contexts × 10 scan roots.
2. **NEW CR-01 guard sub-test** (1/1, GREEN): zero `Usage: /gsd-<deleted-command>` patterns in any of the 16 ALLOW_LIST files. This is the durable guard that catches the same class of bug if reintroduced anywhere.

`get-shit-done/workflows/help.md` body no longer contains live command-reference sections for any command in `deletedCommands`. The migration table at the bottom of the file is untouched: it remains the authoritative source of truth for what replaced each deleted command. Plan 09's migration-table-present test (80/80 GREEN) confirms no regression.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add CR-01 guard sub-test (RED) | `60a2ecbd` | `tests/cull-no-orphan-references.test.cjs` |
| 2 | Strip live-command body sections from help.md (GREEN) | `51ac511e` | `get-shit-done/workflows/help.md` |

## RED → GREEN evidence

**RED (after Task 1, before Task 2):**

```
$ node --test tests/cull-no-orphan-references.test.cjs
ok 1 - TEST-01: no orphan references to deleted commands/agents
not ok 2 - CR-01 guard: ALLOW_LIST files have no live Usage blocks for deleted commands
  20 finding(s) including:
    get-shit-done/workflows/help.md:59 (/gsd-map-codebase)
    get-shit-done/workflows/help.md:92 (/gsd-list-phase-assumptions)
    get-shit-done/workflows/help.md:131 (/gsd-do)
    get-shit-done/workflows/help.md:133 (/gsd-do)
    [+ 16 more violations]
# pass 1, # fail 1
```

**GREEN (after Task 2):**

```
$ node --test tests/cull-no-orphan-references.test.cjs
ok 1 - TEST-01: no orphan references to deleted commands/agents
ok 2 - CR-01 guard: ALLOW_LIST files have no live Usage blocks for deleted commands
# pass 2, # fail 0
```

## What was stripped from help.md

### Three CR-01 targets (named in 01-VERIFICATION.md / 01-REVIEW.md)

| Section | Old line range | What was removed |
|---------|----------------|------------------|
| `/gsd-map-codebase` | 51-60 | Header + 4 description bullets + `Usage:` line + trailing blank |
| `/gsd-list-phase-assumptions` | 85-93 | Header + 3 description bullets + `Usage:` line + trailing blank |
| `/gsd-do` + `### Smart Router` heading | 121-134 | Section heading (only entry was `/gsd-do`) + header + 4 bullets + 3 `Usage:` lines |

### Additional violations the test surfaced (broader strip per Rule 2)

The CR-01 guard sub-test correctly flagged 16 more live Usage blocks for deleted commands. These were not named in CR-01 but represent the same class of bug. Stripped:

| Section / standalone block | Was section/heading removed? |
|-----|-----|
| `/gsd-fast` (was inside `### Quick Mode`) | Block removed; section retained for `/gsd-quick` |
| `/gsd-debug` (was sole entry of `### Debugging`) | Entire section removed |
| `/gsd-spike`, `/gsd-sketch`, `/gsd-spike-wrap-up`, `/gsd-sketch-wrap-up` (were sole entries of `### Spiking & Sketching`) | Entire section removed |
| `/gsd-note` (was sole entry of `### Quick Notes`) | Entire section removed |
| `/gsd-ship` (was sole entry of `### Ship Work`) | Entire section removed |
| `/gsd-plant-seed` (standalone between `---` separators) | Block removed |
| `/gsd-audit-uat` (standalone between `---` separators) | Block removed |
| `/gsd-audit-milestone`, `/gsd-plan-milestone-gaps` (sole entries of `### Milestone Auditing`) | Entire section removed |
| `/gsd-cleanup` (was inside `### Utility Commands`) | Block removed; section retained for `/gsd-help`, `/gsd-update`, `/gsd-join-discord` |

### Stale workflow examples in `## Common Workflows` (Rule 1 — bug fix)

Two example workflows in the "Common Workflows" section referenced deleted/consolidated commands. These are NOT flagged by the new CR-01 guard (they're code-block examples, not `Usage:` lines), but they're the same class of stale-doc bug:

| Example | Action |
|---------|--------|
| "Adding urgent mid-milestone work" | `/gsd-insert-phase 5 …` → `/gsd-phase insert 5 …` (consolidated, not deleted — keep example, update syntax) |
| "Debugging an issue" | Removed entirely (both lines used `/gsd-debug`, which is deleted) |

## Migration table preservation

| Migration-table row | Line in current help.md | Status |
|---|---|---|
| `\| `/gsd-map-codebase` \| _(none)_ \| Removed; use editor + Grep …` | 487 | Preserved |
| `\| `/gsd-do` \| _(none)_ \| Removed.` | 516 | Preserved |
| `\| `/gsd-list-phase-assumptions` \| _(none)_ \| Removed.` | 522 | Preserved |

Verification: `grep -cE '^\| `/gsd-(map-codebase\|list-phase-assumptions\|do)`' get-shit-done/workflows/help.md` returns `3`.

The plan's verification regex `Removed.*gsd-do` is faulty (the table format is `| /gsd-do | … | Removed. |` so `Removed` appears AFTER the command name, not before). Documented under Decisions; the corrected regex above confirms all three rows are intact.

## What was added to the test

**Test name:** `'CR-01 guard: ALLOW_LIST files have no live Usage blocks for deleted commands'`

**Pattern:** `new RegExp(\`Usage:\\s*\\\`?/gsd-${cmd}\\b\`, 'g')` for each `cmd` in `deletedCommands.filter(c => !slashMentionExcludes.includes(c))`.

**Behavior:**
- Iterates over the existing `ALLOW_LIST` Set (16 files).
- Skips files that don't exist on disk (defensive).
- For each file, scans every line for the regex and pushes a `${relPath}:${line} (allow-listed file contains live Usage block for deleted command /gsd-${cmd}): ${matchedLine}` finding.
- Uses `assert.deepStrictEqual(findings, [], …)` so failures show all violations at once.
- Honors the `slashMentionExcludes` carve-out (D-01): `/gsd-review` (the consolidated quality-gate entry point) is allowed to have live Usage blocks.
- Per CONTEXT.md D-04: read-only `fs.readFileSync` only, own-scope locals, no `process.chdir`, no shared-state mutation.

The new sub-test is **additive** — it does not modify or relax the existing top-level scan. Both tests now run together and both must pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical functionality] Broader strip than plan scoped**
- **Found during:** Task 1 RED-state verification
- **Issue:** The CR-01 guard sub-test, written exactly per the plan's specification (regex consumes `deletedCommands` minus `slashMentionExcludes`), surfaced 20 violations in `help.md` — not just the 3 named in CR-01. The plan's Task 2 scope (strip 3 sections) would leave the test RED on 17 violations, contradicting Task 2's `done` criterion ("the Task-1 sub-test passes GREEN").
- **Fix:** Widened Task 2 to strip every live `Usage: /gsd-<deleted>` block flagged by the new test. Aligns with the phase goal stated in `01-CONTEXT.md`: "no orphan references to deleted names anywhere in surviving... workflows."
- **Files modified:** `get-shit-done/workflows/help.md`
- **Commit:** `51ac511e`

**2. [Rule 1 — Bug] Stale workflow examples in `## Common Workflows`**
- **Found during:** Task 2 visual review of help.md after the body strip
- **Issue:** Two example workflows (`/gsd-insert-phase` and `/gsd-debug`) reference deleted/consolidated commands. The CR-01 guard does NOT flag these (they're code-block examples, not `Usage:` lines), but they mislead users in the same way as the body-section bug.
- **Fix:** Updated `/gsd-insert-phase` example → `/gsd-phase insert` (consolidated, not deleted). Removed the entire "Debugging an issue" example (both lines used `/gsd-debug`, which is deleted with no replacement).
- **Files modified:** `get-shit-done/workflows/help.md`
- **Commit:** `51ac511e`

**3. [Rule 1 — Bug] Faulty migration-table verification regex in plan**
- **Found during:** Task 2 acceptance-criteria run
- **Issue:** Plan §<verify> uses `grep -cE 'Removed.*gsd-(map-codebase|list-phase-assumptions|do)'` which returns 0 (false negative): the actual table format is `| /gsd-do | _(none)_ | Removed. |` — `Removed` appears AFTER the command name, not before.
- **Fix:** Used corrected regex `^\| \`/gsd-(map-codebase|list-phase-assumptions|do)\`` to verify preservation. All three rows confirmed intact (count = 3). Did NOT modify the plan file.
- **Files modified:** none
- **Commit:** none (this is a verification-tooling note, documented here so the verifier doesn't re-flag the false negative)

## Deferred Issues

**Out-of-scope live references in help.md NOT flagged by CR-01 guard:**

The CR-01 guard scans only `Usage: /gsd-<deleted>` patterns in `deletedCommands` minus `slashMentionExcludes`. It does NOT scan:

- `## Common Workflows` code-block examples for OTHER deleted commands (none remain in this file after the Rule 1 fixes above; future contributions could re-introduce them)
- Live Usage blocks for commands in `consolidatedCommands` (e.g., `/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-remove-phase`) — those names are still in the file as live Usage blocks (lines 127, 136, 146 of the current file). Those were left intact because the plan explicitly says (per D-01): "Do not touch any reference to the NEW `/gsd-review` (consolidated quality-gate) or `/gsd-phase` (consolidated phase-manipulation). Those references are legitimate." But `/gsd-add-phase` etc. are the OLD names that got removed. They should be replaced with `/gsd-phase add|insert|remove` in a future plan, OR the CR-01 guard could be extended to also scan `Object.keys(consolidatedCommands)`. Either is a separate concern.

**Recommendation:** Phase 1 verifier should consider whether to spawn a follow-up plan that:
1. Strips live `/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-remove-phase` Usage blocks from help.md (lines 127-155) and replaces them with a single `/gsd-phase <subcommand>` consolidated section.
2. Extends the CR-01 guard to scan `consolidatedCommands` keys too (with their own carve-out for the new consolidated namespaces `/gsd-review` and `/gsd-phase`).

This is logged as a Deferred Item, not a current-plan blocker.

## Verification

| Acceptance criterion | Status |
|---|---|
| `node --test tests/cull-no-orphan-references.test.cjs` exits 0 | PASS (2/2) |
| `node --test tests/migration-table-present.test.cjs` exits 0 | PASS (80/80) |
| Live `/gsd-map-codebase` header gone | PASS (count = 0) |
| Live `/gsd-list-phase-assumptions <number>` header gone | PASS (count = 0) |
| Live `/gsd-do <description>` header gone | PASS (count = 0) |
| Live `Usage: /gsd-map-codebase` line gone | PASS (count = 0) |
| Live `Usage: /gsd-list-phase-assumptions ` lines gone | PASS (count = 0) |
| Live `Usage: /gsd-do ` lines gone | PASS (count = 0) |
| Orphan `### Smart Router` heading removed | PASS (count = 0) |
| Migration-table rows for CR-01 commands preserved | PASS (count = 3) |
| New `CR-01 guard` sub-test name present in test file | PASS |
| Existing top-level orphan-reference test still passes | PASS |
| Other tests referencing help.md still pass (consolidated-phase, execute-phase-wave, planner-language, skill-manifest) | PASS (373/373) |

VERIFICATION.md Truth 1 should flip from PARTIAL → VERIFIED on re-verification.

## Self-Check: PASSED

- `tests/cull-no-orphan-references.test.cjs` exists: FOUND
- `get-shit-done/workflows/help.md` exists: FOUND
- Commit `60a2ecbd` (Task 1 RED): FOUND
- Commit `51ac511e` (Task 2 GREEN): FOUND
- New test name `CR-01 guard: ALLOW_LIST files have no live Usage blocks for deleted commands` present in test file: FOUND
- Three migration-table rows for `/gsd-map-codebase`, `/gsd-list-phase-assumptions`, `/gsd-do` all present in help.md: FOUND (count = 3)
- Test suite GREEN (existing scan + new CR-01 guard): FOUND (2/2 pass, 80/80 migration table, 373/373 cross-test sample)
