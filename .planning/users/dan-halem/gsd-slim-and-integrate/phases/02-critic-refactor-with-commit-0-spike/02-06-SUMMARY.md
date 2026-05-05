---
phase: 02-critic-refactor-with-commit-0-spike
plan: 06
subsystem: testing
tags: [parallel-task, critic-aggregator, sdk-registry, workflow-orchestration, gsd-tools]

# Dependency graph
requires:
  - phase: 02-critic-refactor-with-commit-0-spike (Plan 02-04)
    provides: gsd-critic-strategy addendum (with <strategy_specific_checklist> tag)
  - phase: 02-critic-refactor-with-commit-0-spike (Plan 02-05)
    provides: 5 trimmed critic addendums with <{lens}_specific_checklist> tags (plan/code/scope/verify/discuss)
  - phase: 02-critic-refactor-with-commit-0-spike (Plan 02-01)
    provides: critic-base.md skeleton + shared install fixtures
  - phase: 02-critic-refactor-with-commit-0-spike (Plan 02-02)
    provides: walltime ledger + parity helpers
  - phase: 02-critic-refactor-with-commit-0-spike (Plan 02-03)
    provides: agent-parity guards
provides:
  - get-shit-done/workflows/critique.md (orchestrator prompt body — single-message 6-Task batch + disk aggregation)
  - get-shit-done/bin/lib/critic-aggregate.cjs (handler module)
  - gsd-tools.cjs `case 'critic-aggregate':` (CLI surface)
  - sdk/src/query/critic-aggregate.ts (TS handler — shells to dispatcher)
  - sdk/src/query/index.ts registry entry (B1 — closes scope-C-001)
  - tests/critique-workflow-structure.test.cjs (CRIT-06 static proxy)
  - tests/critic-aggregate-shape.test.cjs (CRIT-09 unit guard)
  - docs/INVENTORY.md row for `critic-aggregate` (CR-03 reachability)
affects:
  - Plan 02-07 (live critic-fault-injection — exercises the workflow live)
  - Plan 02-08 (drift-guard suite — registry integration test now passes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-message parallel Task batch (CRIT-06) — all 6 critics fire in one assistant turn
    - Disk-based output aggregation via subprocess CLI (CRIT-07) — workflow trusts disk over text summary
    - Skip-and-continue policy for missing critics (CRIT-09) — info-severity orchestrator finding per absence
    - Thin SDK shim (option (a)) — TS handler shells to gsd-tools.cjs to keep one source of truth

key-files:
  created:
    - get-shit-done/workflows/critique.md (84 lines, was 0 bytes)
    - get-shit-done/bin/lib/critic-aggregate.cjs (116 lines)
    - sdk/src/query/critic-aggregate.ts (108 lines)
    - tests/critic-aggregate-shape.test.cjs (161 lines)
    - tests/critique-workflow-structure.test.cjs (84 lines)
  modified:
    - get-shit-done/bin/gsd-tools.cjs (+ require + dispatcher case + help-text)
    - sdk/src/query/index.ts (+ import + registry.register entry)
    - tests/BUILD.bazel (+ 2 test entries)
    - docs/INVENTORY.md (+ CLI Subcommands row)

key-decisions:
  - "SDK option (a) — thin shim shelling to gsd-tools.cjs (vs option (b) — TS port). Single source of truth lives in lib/critic-aggregate.cjs; TS handler stays minimal."
  - "Test fixtures use indented YAML (not inline-flow maps) because the fork's extractFrontmatter parser does not handle inline maps. Verified via direct Node test before writing test fixtures."
  - "ErrorClassification.Blocked for missing dispatcher binary, ErrorClassification.Execution for runtime failures — there is no System variant in errors.ts."
  - "INVENTORY.md row added — even though caller surface (workflow) exists, having both reachability paths (caller + INVENTORY) is the belt-and-suspenders convention for new dispatcher cases."

patterns-established:
  - "Pattern: contiguous-Task-block guard via negative-lookahead regex (H4) — assert no `Wait`/`Step N`/`After ... returns` text appears between consecutive Task() calls. Catches the lazy-regex failure mode at static-test layer."
  - "Pattern: aggregator coercion — extractFrontmatter returns scalars as strings; aggregator must `parseInt` severity counts before reducing. Documented inline via `toInt` helper."

requirements-completed: [CRIT-06, CRIT-07]

# Metrics
duration: 11min
completed: 2026-05-05
---

# Phase 02 Plan 06: Critique Workflow + Disk-Based Aggregator Summary

**Single-message 6-Task batch orchestrator at workflows/critique.md + critic-aggregate CLI + SDK registry entry + 2 static guards — closes the parallel-Task hallucination bug surface for the GSD critic suite.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-05T16:23:32Z
- **Completed:** 2026-05-05T16:34:24Z
- **Tasks:** 3 (all atomic; no deviations)
- **Files created:** 5
- **Files modified:** 4
- **Commits:** 3 atomic + 1 metadata

## Accomplishments

- Authored `get-shit-done/workflows/critique.md` (was 0 bytes; now 84 lines) with single-message parallel 6-Task batch, disk-based aggregation via `gsd-sdk query critic-aggregate`, and skip-and-continue policy for missing critics. All 6 `<{lens}_specific_checklist>` addendum tags from Plans 02-04 / 02-05 referenced.
- Shipped the disk-based aggregator end-to-end: `bin/lib/critic-aggregate.cjs` (handler) → `gsd-tools.cjs` dispatcher case → `sdk/src/query/critic-aggregate.ts` (thin TS shim) → `sdk/src/query/index.ts` (B1 registry entry). Same JSON shape on both surfaces.
- Two static guard tests landed: `critic-aggregate-shape.test.cjs` (JSON contract — happy + missing paths) and `critique-workflow-structure.test.cjs` (CRIT-06 static proxy with H4 negative-lookahead). Both registered in `tests/BUILD.bazel` under `phase-2-critic`.
- INVENTORY.md row for `critic-aggregate` keeps the CR-03 dispatcher-reachable guard happy.

## Task Commits

Each task was committed atomically with `--no-verify` (worktree mode):

1. **Task 1: handler module + dispatcher case + SDK registry entry (B1)** — `af2da7d6` (feat)
2. **Task 2: tests/critic-aggregate-shape.test.cjs unit guard** — `0615ddb6` (test)
3. **Task 3: workflows/critique.md + critique-workflow-structure.test.cjs + INVENTORY.md** — `9bafe2ac` (feat)

**Plan metadata:** appended via this SUMMARY.md commit (final).

## Insertion Points (gsd-tools.cjs)

| Edit | Line | Content |
|---|---|---|
| `require('./lib/critic-aggregate.cjs')` | 192 | added alongside the existing module-require block |
| Help-text usage string update | 443 | inserted `critic-aggregate` between `verify-summary` and `verify` |
| `case 'critic-aggregate':` | 656–668 | added immediately after `case 'verify-summary':` close brace |

## Symbol Used from frontmatter.cjs

`extractFrontmatter` — exported at `lib/frontmatter.cjs` line 370 (verified by `grep -n` and by direct invocation). The aggregator imports it via:

```javascript
const { extractFrontmatter } = require('./frontmatter.cjs');
```

Also note: `extractFrontmatter` returns nested-key VALUES as **strings** (e.g. `severity_counts.critical` parses to `"0"`, not `0`). The aggregator handles this via the inline `toInt` helper that coerces both numeric and string inputs to integers before reducing totals. Test fixtures must use indented YAML, NOT inline-flow `{a: 0, b: 1}` syntax — the fork's parser does not parse inline maps (verified via a direct `node -e` invocation before writing the test fixtures).

## SDK registry.register entry (B1 — verbatim)

```typescript
// Phase 2 (Plan 02-06 / B1 fix per 02-REVIEWS.md scope-C-001): expose
// `gsd-sdk query critic-aggregate` as a registered native handler so the
// critique workflow's Bash invocation resolves natively (rather than via
// the GSD_QUERY_FALLBACK transparent bridge) AND the drift-guard at
// tests/gsd-sdk-query-registry-integration.test.cjs passes at Plan 02-08.
registry.register('critic-aggregate', criticAggregate);
```

Inserted at `sdk/src/query/index.ts` line 366 (immediately after the `verify summary` block). The handler is imported at line 43:

```typescript
// Phase 2 (Plan 02-06 / B1 — scope-C-001): disk-based critic-output aggregator.
import { criticAggregate } from './critic-aggregate.js';
```

## Test Confirmations

- `node --test tests/gsd-sdk-query-registry-integration.test.cjs` → **PASS** (2/2). B1 closure confirmed.
- `node --test tests/gsd-tools-dispatcher-reachable.test.cjs` → **PASS** (3/3). CR-03 happy via both INVENTORY entry AND workflow caller.
- `node --test tests/critique-workflow-structure.test.cjs` → **PASS** (3/3). CRIT-06 static proxy with H4 negative-lookahead.
- `node --test tests/critic-aggregate-shape.test.cjs` → **PASS** (2/2). JSON contract — happy + missing paths.
- `node --test tests/install-shared-dir.test.cjs` → **PASS** (4/4). Regression guard from prior plan unaffected.
- `node --check get-shit-done/bin/gsd-tools.cjs` → exit 0.
- `node --check get-shit-done/bin/lib/critic-aggregate.cjs` → exit 0.

## Smoke Test (CLI Direct)

```bash
mkdir -p /tmp/gsd-critic-test
for L in plan code scope verify discuss strategy; do
  printf -- '---\ncritique_type: %s\nstatus: pass\nseverity_counts:\n  critical: 0\n  warning: 0\n  info: 0\n  total: 0\n---\n' "$L" \
    > "/tmp/gsd-critic-test/CRITIQUE-$L.md"
done
node get-shit-done/bin/gsd-tools.cjs critic-aggregate --phase-dir /tmp/gsd-critic-test --json
```

Output (abbreviated — full output captured during execution):

```json
{
  "phase": "gsd-critic-test",
  "phase_dir": "/tmp/gsd-critic-test",
  "critics_expected": ["plan", "code", "scope", "verify", "discuss", "strategy"],
  "critics_present": ["plan", "code", "scope", "verify", "discuss", "strategy"],
  "critics_missing": [],
  "severity_counts_total": { "critical": 0, "warning": 0, "info": 0, "total": 0 },
  "status": "pass",
  "files": [
    { "path": "/tmp/gsd-critic-test/CRITIQUE-plan.md", "critique_type": "plan", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" },
    { "path": "/tmp/gsd-critic-test/CRITIQUE-code.md", "critique_type": "code", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" },
    { "path": "/tmp/gsd-critic-test/CRITIQUE-scope.md", "critique_type": "scope", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" },
    { "path": "/tmp/gsd-critic-test/CRITIQUE-verify.md", "critique_type": "verify", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" },
    { "path": "/tmp/gsd-critic-test/CRITIQUE-discuss.md", "critique_type": "discuss", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" },
    { "path": "/tmp/gsd-critic-test/CRITIQUE-strategy.md", "critique_type": "strategy", "severity_counts": { "critical": 0, "warning": 0, "info": 0, "total": 0 }, "status": "pass" }
  ]
}
```

## Smoke Test (gsd-sdk Path — B1 Verification)

The SDK CLI is not built in this worktree (no `sdk/dist/` and no `sdk/node_modules` — those live in the main repo). The drift-guard test `tests/gsd-sdk-query-registry-integration.test.cjs` is the static proxy that confirms `registry.register('critic-aggregate', ...)` is present in `sdk/src/query/index.ts`; it PASSES. When the SDK is rebuilt in the main repo (or in a worktree with a populated `sdk/node_modules`), the live `gsd-sdk query critic-aggregate --phase-dir <tmp> --json` invocation will return the same JSON as the CLI direct path because the TS handler shells out to `node get-shit-done/bin/gsd-tools.cjs critic-aggregate ...args` and forwards stdout. Plan 02-07 exercises this path live.

## B4 Cascade Confirmation

- `depends_on: [1, 2, 3, 4, 5]` — present in plan frontmatter line 6.
- `wave: 4` — present in plan frontmatter line 5.
- All 6 `<{lens}_specific_checklist>` tag references in `workflows/critique.md`:

| Lens | Count | Source addendum |
|---|---|---|
| plan | 1 | agents/gsd-critic-plan.md (Plan 02-05) |
| code | 1 | agents/gsd-critic-code.md (Plan 02-05) |
| scope | 1 | agents/gsd-critic-scope.md (Plan 02-05) |
| verify | 1 | agents/gsd-critic-verify.md (Plan 02-05) |
| discuss | 1 | agents/gsd-critic-discuss.md (Plan 02-05) |
| strategy | 1 | agents/gsd-critic-strategy.md (Plan 02-04) |

Total `_specific_checklist` mentions in workflow: 7 (6 Task prompts + 1 paragraph in `<available_agent_types>`).

## Decisions Made

- **SDK option (a) — shell to gsd-tools.cjs.** The TS handler at `sdk/src/query/critic-aggregate.ts` is a 108-line thin shim that locates `gsd-tools.cjs`, `execFileSync`'s the dispatcher, parses stdout JSON, and returns `{ data: parsed }`. Rationale: keeps one source of truth in `lib/critic-aggregate.cjs`; mirrors the existing `sdk/src/gsd-tools.ts::resolveGsdToolsPath` probe order (repo → project `.claude/` → `~/.claude/`). Option (b) would have required porting `extractFrontmatter` + `findPhaseInternal` to TS — out of scope for Plan 02-06.
- **`ErrorClassification.Blocked` for "cannot locate dispatcher", `ErrorClassification.Execution` for runtime failures.** The `errors.ts` enum has no `System` variant; mapped accordingly.
- **Indented YAML in test fixtures, not inline-flow.** The fork's `extractFrontmatter` parser does not handle `{critical: 0, warning: 0}` inline maps (verified before writing fixtures). Documented inline as a comment in the test file so future maintainers don't fall into the same trap.
- **Both INVENTORY.md entry AND workflow caller for the new dispatcher case.** Belt-and-suspenders — either alone satisfies CR-03, but the combination future-proofs against a workflow rename or a removal of the dispatcher require.

## Deviations from Plan

None — the plan executed exactly as written. The only minor adjustment was the choice of `Execution` and `Blocked` `ErrorClassification` values for the TS handler (the plan didn't pin these; only the existing enum constrained the choice).

## Issues Encountered

- **Pre-existing TS errors in worktree.** `tsc --noEmit` reports `Cannot find module 'node:child_process'` for ~150 errors, all stemming from the absence of `@types/node` in the worktree's `sdk/node_modules` (the worktree was checked out without running `npm install`). These errors are NOT introduced by Plan 02-06 — they affect every existing TS file equally. The TS handler I added uses the same patterns as `sdk/src/gsd-tools.ts` and `sdk/src/cli.ts`, both of which compile cleanly in the main repo. No action required.

## Self-Check: PASSED

Files exist:
- `get-shit-done/workflows/critique.md` — FOUND
- `get-shit-done/bin/lib/critic-aggregate.cjs` — FOUND
- `sdk/src/query/critic-aggregate.ts` — FOUND
- `tests/critic-aggregate-shape.test.cjs` — FOUND
- `tests/critique-workflow-structure.test.cjs` — FOUND

Commits exist (verified via `git log --oneline -5`):
- `af2da7d6` — FOUND
- `0615ddb6` — FOUND
- `9bafe2ac` — FOUND

## Next Phase Readiness

- Plan 02-07 (live critic-fault-injection) can now spawn the workflow via `/gsd-review --critique <phase>` and verify CRIT-06 (single-message parallel batch — wall-clock max-of-6) AND CRIT-07 (disk-based aggregation surfaces missing critics).
- Plan 02-08 (drift-guard suite) — registry integration test now passes.
- No blockers.

---
*Phase: 02-critic-refactor-with-commit-0-spike*
*Completed: 2026-05-05*
