---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 03
subsystem: integration-test-infrastructure
tags: [parity-helper, walltime-ledger, TEST-02, XCUT-03, wave-0, cross-phase-contract]
dependency_graph:
  requires:
    - integration/helpers/claude-runner.cjs (runClaudeWithTools)
    - get-shit-done/bin/lib/profile-pipeline.cjs (JSONL append idiom — pattern source)
  provides:
    - integration/helpers/agent-parity.cjs (runAgentParity, SCHEMAS, BASELINES_DIR, loadBaseline, saveBaseline)
    - integration/helpers/walltime-recorder.cjs (recordWalltime, LEDGER)
    - integration/test-fixtures/walltime-ledger.jsonl (empty ledger w/ comment header)
    - tests/agent-parity-helper-shape.test.cjs (TEST-02 static)
  affects:
    - Plan 04 (will invoke runAgentParity in capture mode for first baselines)
    - Phase 2 (consumes critic-findings schema for parity comparison)
    - Phase 3 (consumes plan-structural schema; Phase 4 flips redStepRequired to true)
    - Phase 6 (consumes schema-conformance schema; consumes walltime-ledger trend)
tech_stack:
  added: []  # zero new deps — Node.js built-ins (node:fs, node:path, node:test) only
  patterns:
    - "fs.appendFileSync JSONL append (sourced from profile-pipeline.cjs:357)"
    - "execFileSync wrapper via runClaudeWithTools"
    - "node:test describe/test pattern (matches tests/code-review-command.test.cjs structure)"
key_files:
  created:
    - integration/helpers/walltime-recorder.cjs
    - integration/helpers/agent-parity.cjs
    - integration/test-fixtures/walltime-ledger.jsonl
    - tests/agent-parity-helper-shape.test.cjs
  modified: []
decisions:
  - "Three SCHEMAS kinds locked at this commit per RESEARCH.md §1.2: critic-findings (Phase 2), plan-structural (Phase 3), schema-conformance (Phase 6) — helper supports all three even though Phase 1 only exercises capture mode"
  - "redStepRequired defaults to false (Phase 1 default; Phase 4 will flip to true) — encoded so tests in subsequent phases switch behavior by overriding the schema"
  - "compute*Deltas are intentional stubs returning pass:true — Phase 2/3/6 will replace each with production comparison logic; the helper signature stays stable (T-01-03-05 mitigation: no production paths invoke these in Phase 1 capture mode)"
  - "walltime-recorder.cjs is a separate helper (not inlined in agent-parity.cjs) — cleaner separation of concerns per RESEARCH.md §1.2"
  - "Empty ledger committed with comment line so git tracks the file; standard JSONL parsers tolerate #-prefixed comment lines"
metrics:
  duration_seconds: 159
  duration_human: "2m 39s"
  completed_date: "2026-04-29"
  tasks_total: 3
  tasks_completed: 3
  files_created: 4
  files_modified: 0
  commits: 3
---

# Phase 01 Plan 03: Wave 0 Parity Infrastructure Summary

Built the cross-phase parity-testing helpers (`runAgentParity`, three locked SCHEMAS, walltime recorder + ledger, static shape test) that Phases 2/3/6 will consume — capture mode is now wired and Plan 04 can begin baseline capture immediately.

## What Was Built

### Files Created (4)

| File | Purpose | LOC |
|------|---------|-----|
| `integration/helpers/walltime-recorder.cjs` | Append `{date, test, walltime_ms, cost_usd, phase}` to `walltime-ledger.jsonl`; validates input shape (T-01-03-01 mitigation) | 44 |
| `integration/helpers/agent-parity.cjs` | `runAgentParity(agentName, fixture, schema, opts)` with three locked SCHEMAS, capture/compare modes, N=1/N=5, baseline JSON I/O, walltime instrumentation | 211 |
| `integration/test-fixtures/walltime-ledger.jsonl` | Empty (comment-only) JSONL ready for Plan 04 first append | 1 |
| `tests/agent-parity-helper-shape.test.cjs` | TEST-02 static — 8 cases verifying helper exports without invoking live API | 69 |

### Helper Exports (5 from agent-parity.cjs)

- `runAgentParity` — async function, accepts `(agentName, fixture, schema, opts)`
- `SCHEMAS` — three kinds locked: `critic-findings`, `plan-structural`, `schema-conformance`
- `BASELINES_DIR` — string ending `integration/test-fixtures/baselines`
- `loadBaseline(agentName, fixtureId)` — returns parsed JSON or null
- `saveBaseline(agentName, fixtureId, payload)` — writes pretty-printed JSON

### Three Locked SCHEMAS (from RESEARCH.md §1.2)

| Kind | Key fields | Phase consumer |
|------|-----------|----------------|
| `critic-findings` | threshold 0.85, severities `[critical, major, minor]`, noMissingCritical true, bucketKey `[severity, category, lane]` | Phase 2 |
| `plan-structural` | taskCountTolerance 0.10, requireMustHaveCoverage `set-equality`, dependencyGraphCheck `isomorphic-by-content`, redStepRequired **false** (Phase 1 default; Phase 4 flips to true) | Phase 3 / Phase 4 |
| `schema-conformance` | expectedSections `[]` (per-call), fieldsPresent `[]`, smokeCritiqueModel `cheap`, smokeCritiqueMaxBudget 0.5 | Phase 6 |

### Capture vs Compare Mode

- **Capture mode** (`mode: 'capture'`, default N=1): writes baseline JSON with `_meta.captured_at` (ISO 8601) and `_meta.schema_kind` for Plan 05 staleness check; returns `{ pass: true, mode: 'capture', baseline_path }`. **This is what Plan 04 invokes.**
- **Compare mode** (`mode: 'compare'`, default N=5): loads baseline, computes schema-aware deltas via `computeDeltas()` dispatch, returns walltime p50/p95 from successful runs. Phase 2/3/6 consumers.

## Verification Status

All 5 plan-level verification commands GREEN:

```
OK recorder parses          (node -c walltime-recorder.cjs)
OK helper parses            (node -c agent-parity.cjs)
OK static test passes       (node --test tests/agent-parity-helper-shape.test.cjs → exit 0)
OK ledger exists            (test -f integration/test-fixtures/walltime-ledger.jsonl)
OK ledger has comment       (head -1 | grep -q '^#')
```

`tests/agent-parity-helper-shape.test.cjs` outputs `# pass 8 / # fail 0` — all 8 contract checks GREEN.

## Success Criteria Confirmed

- [x] `walltime-recorder.cjs` exports `recordWalltime` and `LEDGER`
- [x] `walltime-ledger.jsonl` exists with comment header
- [x] `agent-parity.cjs` exports `runAgentParity`, `SCHEMAS`, `BASELINES_DIR`, `loadBaseline`, `saveBaseline`
- [x] All three SCHEMAS kinds populated with locked values per RESEARCH.md §1.2
- [x] `tests/agent-parity-helper-shape.test.cjs` is GREEN (8/8)
- [x] No live API call required to make this plan's static tests GREEN
- [x] Plan 04 can immediately invoke `runAgentParity(agent, fixture, SCHEMAS['schema-conformance'], { mode: 'capture', n: 1, phase: 'phase-1-cull' })`

## Commits

| Task | Type | Hash | Message (subject) |
|------|------|------|-------------------|
| 1 | feat | `44ba54b3` | feat(01-03): add walltime recorder helper and empty ledger |
| 2 | feat | `799d51b6` | feat(01-03): add runAgentParity helper with three locked schema kinds |
| 3 | test | `c277bd5a` | test(01-03): add static shape test for runAgentParity helper (TEST-02) |

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes were applied to product code.

### Notes on Verification Command

The plan's Task 3 verification expression (`grep -E "ok 1|pass " | wc -l | awk '...'`) is brittle because TAP subtest output uses `ok N - <description>` format where only `ok 1` matches the literal regex `"ok 1"` — most subtest lines (`ok 2`, `ok 3`, ...) do not match. The actual plan acceptance criterion ("8 test cases all pass") is satisfied: `node --test` exits 0 and the TAP summary reports `# pass 8 / # fail 0`. This is a verification-command flaw documented for the next planner, not a Rule 1 bug — the test itself is correct and passes.

## Known Stubs

The following stubs are **intentional** and explicitly required by the plan (CONTEXT.md `<decisions>` and threat T-01-03-05):

| File | Function | Status | Resolved by |
|------|----------|--------|-------------|
| `integration/helpers/agent-parity.cjs` | `computeCriticFindingsDeltas()` returns `pass:true` with `note: 'stub — Phase 2 implements full critic-findings comparison'` | intentional stub | Phase 2 |
| `integration/helpers/agent-parity.cjs` | `computePlanStructuralDeltas()` returns `pass:true` with `note: 'stub — Phase 3 implements full plan-structural comparison'` | intentional stub | Phase 3 |
| `integration/helpers/agent-parity.cjs` | `computeSchemaConformanceDeltas()` returns `pass:true` with `note: 'stub — Phase 6 implements full schema-conformance comparison'` | intentional stub | Phase 6 |

**Risk mitigation (T-01-03-05):** Phase 1 only exercises CAPTURE mode (which does not invoke `computeDeltas` at runtime). Phase 2/3/6 plan-checkers MUST reject any change that calls `runAgentParity` against these stubs in production paths.

## Threat Flags

None — files created in this plan introduce no new security-relevant surface beyond what is already documented in the plan's `<threat_model>` (helper → Claude API and helper → baseline filesystem writes).

## Self-Check: PASSED

**Files (5/5 found):**
- FOUND: `integration/helpers/walltime-recorder.cjs`
- FOUND: `integration/helpers/agent-parity.cjs`
- FOUND: `integration/test-fixtures/walltime-ledger.jsonl`
- FOUND: `tests/agent-parity-helper-shape.test.cjs`
- FOUND: `.planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-03-SUMMARY.md`

**Commits (3/3 found):**
- FOUND: `44ba54b3` — feat(01-03): add walltime recorder helper and empty ledger
- FOUND: `799d51b6` — feat(01-03): add runAgentParity helper with three locked schema kinds
- FOUND: `c277bd5a` — test(01-03): add static shape test for runAgentParity helper (TEST-02)
