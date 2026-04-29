---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 01
subsystem: testing
tags: [test-infrastructure, static-analysis, orphan-references, cull-gate, fixture, node-test]

# Dependency graph
requires:
  - phase: 01-cull-with-wave-0-test-infrastructure
    provides: "(self-contained — Wave 0 entry-point plan; no prior dependencies)"
provides:
  - "tests/fixtures/cull-deletion-list.cjs — single source-of-truth fixture exporting deletedCommands(49), consolidatedCommands(9), deletedAgents(17), deprecationStubs(6), slashMentionExcludes(['review']), survivingCommandCount(37), survivingAgentCount(22)"
  - "tests/cull-no-orphan-references.test.cjs — 6-context orphan-reference scan across 10 scan roots, honoring D-01 slashMentionExcludes carve-out"
  - "Cull-gate test: RED until Plans 06-08 complete; failure output names file:line + context-kind for grep+fix"
affects:
  - "01-02 (parity helper) — independent but co-located in Wave 0"
  - "01-06/07/08 (Wave 1 cull commits) — gated by this test going GREEN"
  - "01-09 (migration table) — consumes the fixture's consolidatedCommands map"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static fixture as single source of truth (mirrors get-shit-done/bin/lib/model-profiles.cjs CJS-export-of-literal-map idiom)"
    - "Multi-context regex scan + ALLOW_LIST + describe-test idiom (mirrors tests/anti-pattern-enforcement.test.cjs and tests/agent-frontmatter.test.cjs)"
    - "Fail-soft sanity-check (sanityCheckCliCoverage emits stderr WARN without failing the test) for catching silent walk-skip bugs"

key-files:
  created:
    - "tests/fixtures/cull-deletion-list.cjs"
    - "tests/cull-no-orphan-references.test.cjs"
  modified: []

key-decisions:
  - "ALLOW_LIST sized at 16 entries, not the plan-comment's 17 (plan arithmetic was off by one; the body's enumeration was authoritative). Documented inline."
  - "D-01 carve-out implemented in 3 scan contexts (scanContext2/3/5) where deletedCommand names are matched against text — bare /gsd-review correctly survives the scan."
  - "Test runs under node --test (no Bazel target needed; tests/ auto-discovers per scripts/run-tests.cjs)."

patterns-established:
  - "Single-source-of-truth fixture pattern for cull/migration tests: tests/fixtures/cull-deletion-list.cjs is read by Plan 09's migration-table test as well."
  - "D-01 slashMentionExcludes carve-out pattern: when a deleted name is reused for a consolidated command, list it in slashMentionExcludes; the file-deletion check still uses the full deletedCommands list, but the slash-mention scanner skips it."
  - "Sanity-check + WARN pattern for static tests: detect silent skip-the-target bugs (CLI walk missing critical files) without coupling to find-count assertions."

requirements-completed: [TEST-01]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 1: Wave 0 orphan-reference test infrastructure Summary

**Static cull-gate test (TEST-01) — 6-context orphan-reference scan reading a single source-of-truth fixture, RED pre-cull (1217 findings) and ready to drive Plans 06-08 to GREEN.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-29T21:10:55Z
- **Completed:** 2026-04-29T21:16:59Z
- **Tasks:** 2
- **Files modified:** 0 (2 created)

## Accomplishments
- Locked the deletion-list contract: 49 commands deleted + 9 consolidated + 17 agents deleted + 6 deprecation stubs + slashMentionExcludes=['review'] + survivingCommandCount=37/survivingAgentCount=22, all in one fixture that subsequent plans (08, 09) consume read-only.
- Wired the orphan-reference scan across 6 syntactic contexts (@-refs, slash-mentions, install-manifest.json walk, workflow markdown, YAML frontmatter, fixture cross-references) and 10 scan roots — including the CRITICAL `bin/install.js` and `get-shit-done/bin/lib/` paths the design spec missed.
- Verified the D-01 carve-out: bare `/gsd-review` mentions are not flagged as orphans (the new consolidated entry point is honored), while the OLD `commands/gsd/review.md` file is still on the deletion list. Manual grep `node --test ... 2>&1 | grep -E "/gsd-review[^A-Za-z0-9_-]" | grep -v review-backlog` returns 0 findings.
- Confirmed RED-as-designed: the test currently reports 1217 findings (expected — Plans 06-08 haven't culled yet), with file:line + context-kind in every failure line so devs can grep+fix in one shot. Both `gsd-debugger` (RESEARCH §3.2) and `gsd-codebase-mapper` (RESEARCH §3.1) appear in the findings, confirming the scan reaches the critical reference-rot sites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the cull-deletion-list fixture** — `2756a0f3` (test)
2. **Task 2: Create the orphan-reference scan test** — `86bea7b2` (test)

## Files Created/Modified
- `tests/fixtures/cull-deletion-list.cjs` — Source-of-truth fixture (CJS module), 8 exported keys, 101 lines.
- `tests/cull-no-orphan-references.test.cjs` — Static `node --test` test implementing the 6-context scan with 16-entry ALLOW_LIST and CLI-coverage WARN sanity check, 249 lines.

## Decisions Made
- **D-01 carve-out implementation surface.** The plan said the carve-out applies to slash-mention scanning; I implemented it in scanContext2 (slash-mentions), scanContext3 (install-manifest string walk), and scanContext5 (frontmatter), wherever a deletedCommand name is matched against text content. The file-deletion check (Plan 08 owns it) is intentionally outside this file's scope.
- **No Bazel target added.** Per RESEARCH.md §4.1: `tests/*.test.cjs` are auto-discovered by `scripts/run-tests.cjs`. Adding a `tests/BUILD.bazel` entry was explicitly NOT required; the fixture file (`.cjs` under `tests/fixtures/`) is also outside the Bazel test pattern.
- **CLI-coverage check is fail-soft.** `sanityCheckCliCoverage` emits a stderr WARN if the walk misses model-profiles.cjs / intel.cjs / docs.cjs / init.cjs from `get-shit-done/bin/lib/` — but does NOT fail the test on missing-CLI alone. The test only fails on actual orphan findings. This decouples "test wired correctly" from "this codebase has reference rot."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Documentation Bug] Plan-comment arithmetic on ALLOW_LIST size was off-by-one**
- **Found during:** Task 2 (orphan-reference test creation)
- **Issue:** The plan's inline ALLOW_LIST comment said "ALLOW_LIST is exactly 17 entries — (3 test infra + 6 deprecation stubs + 4 migration-table files + 4 consolidated command files/workflows = 17)." But the plan's enumerated ALLOW_LIST body explicitly lists only 3 migration-table files (commands/gsd/help.md, get-shit-done/workflows/help.md, CHANGELOG.md), making the actual total 3+6+3+4 = 16 entries. Two of the success criteria (`grep -E "^  '" ... | wc -l` returning 17, and "exactly 17 entries with inline justification") inherited the same off-by-one.
- **Fix:** Implemented the ALLOW_LIST exactly as enumerated in the plan body (16 entries verbatim). Updated the inline comment from "17 entries" to "16 entries (3 + 6 + 3 + 4)" with a note that the plan's arithmetic comment was off-by-one and the explicit enumeration is authoritative. The 4 D-01 entries (commands/gsd/review.md, commands/gsd/phase.md, get-shit-done/workflows/review.md, get-shit-done/workflows/phase.md) are all present and verified by individual grep.
- **Files modified:** `tests/cull-no-orphan-references.test.cjs` (inline comment only — the literal ALLOW_LIST contents match the plan body 1:1).
- **Verification:** `awk '/const ALLOW_LIST = new Set\(\[/,/\]\);/' tests/cull-no-orphan-references.test.cjs | grep -cE "^  '"` returns 16. All 4 D-01 entries are confirmed by individual `grep -F`. All 13 of the explicit non-D-01 entries are present.
- **Committed in:** `86bea7b2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 documentation bug)
**Impact on plan:** Cosmetic — fixed an inline-comment arithmetic error. No functional impact; the implementation matches the plan body's explicit enumeration verbatim.

## Acceptance Criteria Notes

**Loose-floor sanity-grep on the fixture (`grep -c "^    '" tests/fixtures/cull-deletion-list.cjs`) returned 35, below the criterion's "at least 75" floor.** This is a formatting mismatch, not an implementation gap — the fixture packs many entries per line (e.g., `'audit-fix', 'audit-uat', 'forensics', ...` on one line) following the project's idiomatic CJS-literal style (matches `get-shit-done/bin/lib/model-profiles.cjs`). The strict programmatic checks (`f.deletedCommands.length === 49`, `f.deletedAgents.length === 17`, etc.) all pass and prove the literals are present. Treating the loose-floor count as a flawed criterion vs. the strict programmatic checks (per the deviation rules' "scope boundary"); no implementation change.

## Issues Encountered
- The success-criterion grep `grep -E "^  '" tests/cull-no-orphan-references.test.cjs | wc -l` returned 26, not 17, because the regex matches ANY 2-space-indented quoted string, including the SCAN_ROOTS literals and ALLOW_LIST entries collectively. Used `awk '/const ALLOW_LIST/,/\]\);/'` to scope the count to the ALLOW_LIST block specifically. This is a phrasing issue in the success criterion, not an implementation issue.

## User Setup Required
None — no external service configuration required. Tests run via `npm test` and `node --test`.

## Next Phase Readiness

- **Wave 0 cull-gate test is live.** Plans 06-08 (the cull commits) can now be authored against a known starting point (1217 findings) and use the test's pass/fail status as their definition-of-done.
- **Fixture is read-only contract.** Plan 09's migration-table test will `require` `tests/fixtures/cull-deletion-list.cjs` to enumerate the rows. Plan 02's parity infrastructure (independent track) does not consume this fixture.
- **D-01 carve-out is correctly wired.** No legitimate references to the NEW `/gsd-review` (consolidated quality-gate) will be flagged — confirmed by `grep -E "/gsd-review[^A-Za-z0-9_-]" | grep -v review-backlog` returning 0 findings against the current scan output.
- **No Bazel update needed.** Future Wave 0 plans should remember `tests/*.test.cjs` auto-discover (per RESEARCH.md §4.1).
- **No blockers.** Plan 02 (parity helper) is independent and can run in parallel.

## Self-Check: PASSED

- FOUND: tests/fixtures/cull-deletion-list.cjs
- FOUND: tests/cull-no-orphan-references.test.cjs
- FOUND: .planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-01-SUMMARY.md
- FOUND: commit `2756a0f3` (Task 1 fixture)
- FOUND: commit `86bea7b2` (Task 2 orphan-reference test)

---
*Phase: 01-cull-with-wave-0-test-infrastructure*
*Completed: 2026-04-29*
