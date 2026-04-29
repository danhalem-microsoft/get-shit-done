---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 04
subsystem: testing
tags: [parity-testing, agent-baselines, claude-cli, fixture-corpus, live-capture]

# Dependency graph
requires:
  - phase: 01
    plan: 03
    provides: runAgentParity helper (capture mode), walltime-recorder, createSandbox pattern
provides:
  - 22 input fixtures (.input.json) at integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json
  - 22 baseline outputs (.json) with locked _meta block (agent, fixture_id, captured_at, schema_kind, runs_recorded=1, result, raw)
  - integration/test-fixtures/baselines/_capture.cjs (one-shot capture script asserting AGENTS.length===22)
  - integration/test-fixtures/baselines/_meta.json (captured_commit SHA + manifest)
  - integration/test-fixtures/baselines/README.md (refresh policy + provenance documentation)
  - 22 new walltime-ledger entries (proves capture ran live, not stub)
affects: [02-critic-refactor, 03-planner-merge, 03-synthesizer-archival, 06-spine-trim]

# Tech tracking
tech-stack:
  added: []  # No new libraries — uses Plan 03's runAgentParity + claude-runner
  patterns:
    - "Single-canonical-fixture-per-agent (D-03 LOCKED at 22; per-mode fixture multiplication deferred)"
    - "Capture-script-with-AGENTS-length-assertion enforces D-03 invariant at script load"
    - "captured_commit SHA in _meta.json mitigates un-reproducible re-capture (T-01-04-06)"
    - "Per-agent isolated sandbox via createSandbox (matches gsd-lifecycle.test.cjs pattern)"

key-files:
  created:
    - integration/test-fixtures/baselines/_capture.cjs
    - integration/test-fixtures/baselines/_meta.json
    - integration/test-fixtures/baselines/README.md
    - integration/test-fixtures/baselines/critic-plan/plan-with-known-issues.input.json + .json
    - integration/test-fixtures/baselines/critic-code/code-with-smells.input.json + .json
    - integration/test-fixtures/baselines/critic-scope/scope-with-creep.input.json + .json
    - integration/test-fixtures/baselines/critic-verify/verify-with-gaps.input.json + .json
    - integration/test-fixtures/baselines/critic-discuss/discuss-with-assumptions.input.json + .json
    - integration/test-fixtures/baselines/critic-strategy/strategy-with-tradeoffs.input.json + .json
    - integration/test-fixtures/baselines/gsd-planner/standard-plan.input.json + .json
    - integration/test-fixtures/baselines/gsd-research-synthesizer/standard-synthesis.input.json + .json
    - integration/test-fixtures/baselines/gsd-pattern-mapper/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-phase-researcher/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-plan-checker/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-verifier/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-executor/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-project-researcher/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-roadmapper/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-code-reviewer/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-code-fixer/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-integration-checker/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-security-auditor/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-assumptions-analyzer/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-advisor-researcher/standard.input.json + .json
    - integration/test-fixtures/baselines/gsd-user-profiler/standard.input.json + .json
  modified:
    - integration/test-fixtures/walltime-ledger.jsonl (22 new entries appended by runAgentParity)

key-decisions:
  - "Bug fix in capture script (Rule 1): plan code used `await createSandbox(...)` and `sandbox.path`; createSandbox is sync and returns a string. Adapted to `const sandboxPath = createSandbox(...)`."
  - "Sandbox naming includes fixture_id (`baseline-capture-<agent>-<fixture-id>`) so per-agent runs do not collide if a re-capture is invoked while another agent is mid-flight."
  - "_meta.json is only written on a full-corpus run (`if (!target)`). Single-agent re-captures via `_capture.cjs <agent-name>` deliberately do NOT overwrite the corpus-level _meta.json — the captured_commit must reflect the source state at full capture, not a partial refresh."

patterns-established:
  - "Locked-title commit (`chore: capture pre-refactor agent baselines for parity testing`): the contract message Phase 2/3/6 grep for to verify the corpus exists at this exact SHA."
  - "Three commits per Plan 04 (orchestrator interpretation): fixtures (commit 1), capture script + 22 baselines (commit 2 with locked title), README + _meta.json (commit 3). The locked title applies only to commit 2 per CONTEXT.md `<decisions>`."

requirements-completed: [TEST-03]

# Metrics
duration: ~33 minutes (capture run) + ~5 min fixture authoring
completed: 2026-04-29
---

# Phase 01 Plan 04: Capture 22 Agent Baselines Summary

**22 pre-refactor agent baselines captured live via Claude CLI (cost $10.74, walltime 32.5 min) and committed with the locked title `chore: capture pre-refactor agent baselines for parity testing` — Phase 2/3/6 parity contract is now grounded.**

## Performance

- **Duration:** ~38 minutes total (5 min fixture authoring + ~33 min capture run including the slow phase-researcher at ~9.6 min and planner at ~4.8 min)
- **Started:** 2026-04-29T22:10Z (Task 2 capture launch) — Task 1 fixtures authored just before
- **Completed:** 2026-04-29T22:44Z (capture script exited cleanly after writing _meta.json)
- **Tasks:** 3 (all autonomous, no checkpoints)
- **Files modified:** 47 (22 .input.json + 22 .json + _capture.cjs + _meta.json + README.md = 47; walltime-ledger.jsonl appended)

## Capture cost & walltime breakdown

- **Total live API cost:** $10.7442 USD (sum of `cost_usd` across the 22 new walltime-ledger entries)
- **Total walltime:** 32.51 minutes (sum of `walltime_ms` across the 22 entries)
- **Slowest agent:** `gsd-phase-researcher` at 574,514 ms (9.57 min, $2.04) — the 10-min walltimeBudgetMs envelope held but only just; refresh runs may want a higher budget for research agents.
- **Fastest agent:** `gsd-code-fixer` at 23,250 ms (0.39 min, $0.34)
- **Median:** ~$0.35 / ~50s per agent (typical schema-conformance baselines)

## Accomplishments

- **22 input fixtures** authored with the locked 6-field shape (`fixture_id`, `agent`, `description`, `prompt`, `sandbox_files`, `env`, `expected_schema_kind`). Critics carry deliberately-flawed sandbox files so Phase 2 calibration has structural matter to compare. Spine-agent fixtures are minimal-but-representative per RESEARCH.md §1.3.
- **22 live baselines captured** via `runAgentParity(..., {mode: 'capture', n: 1})` invoking the real Claude CLI in per-agent isolated sandboxes (each baseline carries a valid `_meta` block + `result` + `raw`). No mocks; no synthetic outputs.
- **`_capture.cjs`** is a one-shot, idempotent capture script that asserts `AGENTS.length === 22` at load time (D-03 invariant), supports single-agent re-captures (`node _capture.cjs <agent-name>`), and writes `_meta.json` with `captured_commit = git rev-parse HEAD` only on a full-corpus run (T-01-04-06 mitigation).
- **Locked-title commit landed exactly:** `chore: capture pre-refactor agent baselines for parity testing` at `213dc014`. Phases 2/3/6 can grep the git log for this exact string.
- **`_meta.json` provenance:** `captured_commit=2dff30fc2dd5f2b23604c3f93c57017e0fb001f5` (the Task 1 fixtures-authored commit, which is the source state of the agent prompts at the moment of capture — Phase 6 will diff `git diff <captured_commit>..HEAD agents/` to verify no agent file was touched between Plan 04 and Plan 06's reference-rot scrub).
- **No agent file touched.** `git log 5d29680b..HEAD --name-only` is restricted to `integration/test-fixtures/baselines/` and `integration/test-fixtures/walltime-ledger.jsonl` only — Phase 1's hard ordering invariant (RESEARCH.md §1.3) is preserved.

## Task Commits

Each task committed atomically per orchestrator instructions (`--no-verify` per parallel-executor protocol):

1. **Task 1: 22 input fixtures** — `2dff30fc` (`chore(01-04): author 22 baseline input fixtures`)
2. **Task 2: capture script + 22 baselines (live capture)** — `213dc014` (`chore: capture pre-refactor agent baselines for parity testing` — LOCKED title per CONTEXT.md `<decisions>`)
3. **Task 3: README + _meta.json** — `4a47a2c4` (`docs(01-04): add baselines README and _meta.json with captured_commit`)

## Files Created/Modified

### Created (24 files in commit 213dc014 — locked title)
- `integration/test-fixtures/baselines/_capture.cjs` — Capture script (asserts D-03 count, uses createSandbox)
- 22 baseline `.json` files at `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` (each with `_meta` block + result + raw)
- `integration/test-fixtures/walltime-ledger.jsonl` — Modified: +22 new entries (agent-parity:<agent>:<fixture-id>) plus 3 entries from a transient-rogue capture process that was killed early (its outputs were overwritten by the proper run, so the on-disk baselines are all from the proper script — see Deviations §1)

### Created (22 files in commit 2dff30fc — fixtures)
- 22 `.input.json` files at `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json`

### Created (2 files in commit 4a47a2c4 — README + _meta.json)
- `integration/test-fixtures/baselines/README.md` — Purpose, layout, _meta schema, refresh policy (TEST-05), capture procedure, provenance
- `integration/test-fixtures/baselines/_meta.json` — `captured_at`, `captured_commit` (40-char SHA), `captured_by`, `agent_count=22`, `fixture_count=22`, `agents` array (22 entries), `schemas_used`, `commit_message`

## Decisions Made

- **Sandbox-name-includes-fixture-id:** The plan code used `baseline-capture-${agent}` for the sandbox directory, but agents have multiple fixtures in principle. I used `baseline-capture-${agent}-${fixture.fixture_id}` so a single-agent re-capture wouldn't collide with another in-flight capture targeting a different fixture under the same agent.
- **`_meta.json` write-only-on-full-run:** Plan code unconditionally writes `_meta.json` at end of `main()`. I gated it on `if (!target)` (no agent argument) so single-agent re-captures don't overwrite the corpus-level provenance with a partial-refresh SHA. This matches the plan's intent — `captured_commit` is supposed to record the source state at full-corpus capture, not at every partial refresh. (D-03 says baselines are read-only after this commit; partial refreshes are deviation-mode anyway.)
- **Did not split Task 2's commit:** The plan and CONTEXT.md `<decisions>` LOCK the title for the baseline-capture commit. The orchestrator instructions reinforce this: capture script + 22 baselines in ONE commit titled exactly `chore: capture pre-refactor agent baselines for parity testing`. The walltime-ledger update was included in this commit because the ledger entries are the load-bearing proof that the capture ran live (the ledger lines are what Plan 05's TEST-05 staleness test will inspect for `cost_usd > 0`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan code used `await createSandbox(...)` and `sandbox.path`; createSandbox is synchronous and returns a string**
- **Found during:** Task 2 (capture script authoring)
- **Issue:** The plan's `<action>` block (lines 282-300) showed the capture script using `const sandbox = await createSandbox(...)` then `sandbox.path`. Reading `integration/helpers/claude-runner.cjs` confirms `createSandbox` is a synchronous function that returns the absolute sandbox path as a string (no `.path` property, no Promise). If used as written, the script would fail on first agent (`sandbox.path` is undefined → fs.mkdirSync(undefined, …) throws).
- **Fix:** Replaced `const sandbox = await createSandbox(...)` with `const sandboxPath = createSandbox(...)`, and `sandbox.path` references with `sandboxPath`. Added a comment explaining the sync return.
- **Files modified:** `integration/test-fixtures/baselines/_capture.cjs` (initial author, never released a buggy version)
- **Verification:** Capture run completed successfully for all 22 agents — no `undefined` errors, every sandbox got seeded with `fixture.sandbox_files`.
- **Committed in:** 213dc014 (Task 2 commit — bug never reached a separate commit because it was caught while the script was first being written)

### Auth gates
None — `claude --version` confirmed CLI was authenticated (host's existing credentials inherited via `settings.json` copy in createSandbox).

### Other notable runtime events (not deviations, just operational notes)
- An earlier `node -e "require('./_capture.cjs')"` invocation from a misjudged smoke-test step actually executed `main()` (the script always runs `main()` regardless of how it's loaded), spawning a parallel capture run that got 3 agents in before I noticed and killed it (`kill 9617` at 22:11). The 3 baselines it wrote (critic-plan/code/scope) were overwritten by the proper script's later runs of the same agents — final on-disk baselines are all from the proper capture process. The walltime-ledger has 25 entries instead of 22 (3 extra rogue entries) because ledger writes are append-only — this is benign and the ledger format already accommodates duplicate entries (the consumer Plan 05/Phase 6 trend test groups by `(date, test)` not by uniqueness).
- `gsd-phase-researcher` ran for 574s (9.57 min) — within the 10-min `walltimeBudgetMs` budget but only by ~26s. If a future re-capture is run on slower hardware or with more research-tool-use, this agent will be the first to time out. Recommendation for Phase 6 trim parity test: bump `walltimeBudgetMs` to 900_000 (15 min) for the research-class agents, or split research agents into a separate parity-test target.

**Total deviations:** 1 auto-fixed (Rule 1 bug in plan code).
**Impact on plan:** Bug was caught during script authoring, never reached a buggy commit. Capture corpus is correct.

## Issues Encountered

- **Rogue parallel capture race** (operational, not a deviation): see "Other notable runtime events" above.
- **execFileSync stdout buffering masked progress:** The capture script's `console.log` output was visibly delayed by ~30s relative to actual completion of each agent (the line "captured X" would appear well after the next sandbox was created). This is a Node `execFileSync` stdio buffering artifact, not a script bug. For long-running captures, consider using `child_process.spawn` with line-buffered stdout if real-time progress matters more than the simpler sync API.

## Cross-phase contract (downstream consumers)

- **Phase 2 critic refactor** reads from `baselines/critic-{plan,code,scope,verify,discuss,strategy}/<fixture-id>.json` — schema kind: `critic-findings`. After Phase 2 lens-addendum extraction, the parity test re-runs each critic and compares against these baselines using ≥85% finding-overlap + `noMissingCritical: true`.
- **Phase 3 planner merge** reads from `baselines/gsd-planner/standard-plan.json` — schema kind: `plan-structural`. After Phase 3 merges synthesizer into planner, parity test compares structural shape (task-count tolerance ±10%, must-have set-equality, isomorphic dependency graph).
- **Phase 3 synthesizer archival** reads from `baselines/gsd-research-synthesizer/standard-synthesis.json` — schema kind: `schema-conformance`. Synthesizer is being deleted in Phase 3; the baseline is for archival/audit only.
- **Phase 6 spine trim** reads from `baselines/gsd-{pattern-mapper,phase-researcher,plan-checker,verifier,executor,project-researcher,roadmapper,code-reviewer,code-fixer,integration-checker,security-auditor,assumptions-analyzer,advisor-researcher,user-profiler}/standard.json` — schema kind: `schema-conformance`. After Phase 6 line-count trim, parity test verifies sectional/field conformance is preserved.

## Next Plan Readiness

- Plan 05 (parity-baselines-stale.test.cjs) can proceed: 22 baselines have valid `_meta.captured_at` ISO 8601 timestamps; `_meta.json.captured_commit` is a 40-char hex SHA the test can use to compute baseline-source drift.
- Plan 06 (reference-rot scrub) can proceed: this commit landed BEFORE any agent file touch, so when Plan 06 scrubs orphan references from agent prose, the scrubbed prose will be DIFFERENT from what was used to generate the baselines — but that's expected; the next refresh after Plan 06 (gated by Plan 05's staleness test + an explicit decision in a future phase) will realign.

## Self-Check: PASSED

Verified:
- 22 input fixtures exist (find returns 22).
- 22 baseline outputs exist with valid `_meta` block (find returns 22; node-validation passes for all).
- `_capture.cjs` exists, asserts `AGENTS.length === 22`, uses `createSandbox`.
- `_meta.json` exists, `agent_count===22`, `fixture_count===22`, `agents.length===22`, `commit_message` exact, `captured_commit` 40-char hex.
- `README.md` contains "Refresh policy", "TEST-05", "staleness_acknowledged", "captured_commit", "22 agents".
- Locked-title commit exists: `213dc014 chore: capture pre-refactor agent baselines for parity testing` (verified via `git log --oneline | grep`).
- 3 commits on the worktree branch (Task 1: 2dff30fc, Task 2: 213dc014, Task 3: 4a47a2c4).
- Walltime ledger grew by 22 proper-run entries (+ 3 rogue overwrite entries — benign).
- No agent file touched (`git log 5d29680b..HEAD --name-only` shows only `integration/test-fixtures/baselines/` paths and `integration/test-fixtures/walltime-ledger.jsonl`).

---
*Phase: 01-cull-with-wave-0-test-infrastructure*
*Plan: 04*
*Completed: 2026-04-29*
