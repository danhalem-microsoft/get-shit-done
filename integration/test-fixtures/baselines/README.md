# Agent Baselines

Pre-refactor baseline outputs captured during Phase 1 Wave 0 for the
GSD Slim + SP Integration + TDD Hardening project.

## Purpose

Phase 2/3/6 refactors compare fresh agent runs against these baselines via
`integration/helpers/agent-parity.cjs` to verify behavior parity:

- Phase 2 (critic refactor): compares 6 critic outputs using `critic-findings` schema.
- Phase 3 (planner merge): compares planner output using `plan-structural` schema.
- Phase 3 (synthesizer archival): compares against `schema-conformance` (synthesizer is being deleted).
- Phase 6 (agent trim): compares 14 spine agents using `schema-conformance` schema.

## Layout

```
integration/test-fixtures/baselines/
├── README.md                                # this file
├── _meta.json                               # capture-commit metadata (incl. captured_commit SHA)
├── _capture.cjs                             # one-shot capture script
├── <agent>/
│   ├── <fixture-id>.input.json              # fixture input (prompt + sandbox + env)
│   └── <fixture-id>.json                    # baseline output (with _meta block)
```

Per CONTEXT.md D-03 (LOCKED): exactly **22 agents** — 6 critics + planner + research-synthesizer + 14 spine agents. Per-mode fixture multiplication is deferred.

The 22 agents:

- **6 critics:** `critic-plan`, `critic-code`, `critic-scope`, `critic-verify`, `critic-discuss`, `critic-strategy`
- **Planner family:** `gsd-planner`, `gsd-research-synthesizer`
- **14 spine agents:** `gsd-pattern-mapper`, `gsd-phase-researcher`, `gsd-plan-checker`, `gsd-verifier`, `gsd-executor`, `gsd-project-researcher`, `gsd-roadmapper`, `gsd-code-reviewer`, `gsd-code-fixer`, `gsd-integration-checker`, `gsd-security-auditor`, `gsd-assumptions-analyzer`, `gsd-advisor-researcher`, `gsd-user-profiler`

## _meta block schema

Every baseline `.json` file has a `_meta` object:

```json
{
  "_meta": {
    "agent": "<agent name>",
    "fixture_id": "<fixture id>",
    "captured_at": "2026-04-29T12:34:56.789Z",
    "schema_kind": "critic-findings | plan-structural | schema-conformance",
    "runs_recorded": 1
  },
  "result": "<full agent output>",
  "raw": { /* full Claude API response */ }
}
```

## Refresh policy (TEST-05)

Baselines are **read-only** after the initial capture commit. They are refreshed
ONLY when a refactor legitimately drifts behavior — and the refresh happens in
the SAME commit as the agent change, with `_meta.changed_because: "<reason>"` set.

`tests/parity-baselines-stale.test.cjs` (Plan 05) fails if any baseline is older
than 90 days without `_meta.staleness_acknowledged: <YYYY-MM-DD>` set within the
last 30 days.

## Capture procedure

To re-capture a single agent:

```
node integration/test-fixtures/baselines/_capture.cjs <agent-name>
```

To re-capture all agents (rare; only after a major refactor):

```
node integration/test-fixtures/baselines/_capture.cjs
```

Cost: ~$30 per agent × 22 agents ≈ ~$660 for full capture (one-time).
Cost is not a budget constraint per user instruction; live API calls are expected.

The capture script seeds each agent's run inside its own `createSandbox` from
`integration/helpers/claude-runner.cjs` (matches `gsd-lifecycle.test.cjs`).

## Provenance

Capture commit: `chore: capture pre-refactor agent baselines for parity testing`
Capture date: see `_meta.json`.
Captured commit SHA (repo HEAD at capture time): see `_meta.json.captured_commit` —
this lets a future re-capture be reproduced against the same source state by
checking out `captured_commit` before running `_capture.cjs`.
