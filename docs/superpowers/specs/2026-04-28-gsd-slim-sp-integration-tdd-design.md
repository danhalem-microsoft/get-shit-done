# GSD Slim + SP Integration + TDD Hardening

**Date:** 2026-04-28
**Status:** Design approved, ready for plan-phase
**Author:** Brainstormed with Claude (Opus 4.7) via SP brainstorming skill

## One-line summary

Cull GSD's surface area from 93 commands → ~37, optimize the surviving spine for fewer hops and smaller prompts, integrate SP brainstorming as a first-class on-ramp into milestone/phase creation, and harden TDD with three layers of enforcement.

## Scope summary

This spec covers a coordinated trim-and-integrate pass on GSD itself. Four concerns rolled into one design because they share affected surface:

1. **Cull and consolidate** the 93-command, 39-agent surface.
2. **Speed optimization** of the surviving spine (parallel hops, shared base prompts, light agent prompt trim).
3. **TDD hardening** with layered enforcement (prompt + plan-checker + pre-commit hook).
4. **SP↔GSD integration** so SP brainstorming is a first-class on-ramp into GSD milestone/phase creation, with `--from-spec` flags and gap-skipping discuss-phase.

Out of scope: any feature work in GSD beyond these four concerns. Specifically excluded are aggressive agent rewrites (Posture B/C in Section 5), critic conditional-spawn (Lever 3), TDD coverage thresholds and mutation testing, and bidirectional GSD↔SP planning.

## Success criteria

- Command count drops from 93 to ~37 surviving (-60%).
- Agent count drops from 39 to ~21 surviving (-46%; ~22 at end of Phase 1, then ~21 after the synthesizer merge in Phase 3).
- Critic line count drops from 1,731 to ~600 (-65%).
- Plan-phase has 1 fewer agent and 1 fewer hop end-to-end.
- TDD layer 3 (pre-commit hook) rejects untested-source commits, `*.skip` patterns, and unannotated internal-module mocks; clean commits pass.
- TDD layer 2 (plan-checker) rejects implementation tasks lacking a RED-step sub-task at critical severity.
- TDD layer 1 (executor) invokes SP `test-driven-development` skill at the start of each task and respects the GSD anti-mock/anti-skip addendum.
- SP brainstorm produces a spec doc with required sections (Scope summary, Success criteria, Must-haves, Recommended next step) when `.planning/` is detected in the repo.
- All three GSD commands (`/gsd-new-milestone`, `/gsd-phase add`, `/gsd-discuss-phase`) accept `--from-spec <path>` and consume the spec correctly.
- `/gsd-discuss-phase --from-spec` skips questions whose answers are already in the spec.
- All static tests in `tests/` pass after each phase.
- All live integration tests in `integration/` pass after each phase.
- `gsd-lifecycle.test.cjs` runs the new spine end-to-end successfully.

## Must-haves

These are the locked design decisions, captured here so the implementation plan can derive tasks directly.

### Must-have 1 — Cull list

**Commands deleted outright (49):**

```
audit/diagnostic (9):     audit-fix, audit-uat, forensics, health, stats, scan, intel, map-codebase, graphify
specialty phases (8):     ai-integration-phase, ui-phase, ui-review, eval-review, spike, sketch, spike-wrap-up, sketch-wrap-up
debug/explore (2):        debug, explore
idea capture (5):         note, plant-seed, add-backlog, thread, review-backlog
milestone extras (5):     audit-milestone, plan-milestone-gaps, milestone-summary, archive-project, restore-project
git/PR extras (4):        ship, undo, inbox, review
process control (6):      manager, autonomous, fast, do, next, session-report
phase manip extras (4):   spec-phase, import, ultraplan-phase, list-phase-assumptions
docs (2):                 docs-update, ingest-docs
misc (4):                 from-gsd2, add-tests, analyze-dependencies, cleanup
```

Note: `add-tests` is removed because it generates tests *after* implementation, which is incompatible with the TDD hardening in Must-have 4 (RED test must come *before* implementation). The functional need it served — coverage gap fill — is replaced by TDD layer 1 (executor writes tests first) and TDD layer 3 (hook rejects untested-source commits).

**Commands consolidated (8 → 2):**

- `code-review`, `code-review-fix`, `critique`, `plan-review-convergence`, `secure-phase`, `validate-phase` → **`/gsd-review`** with flags `--code`, `--security`, `--coverage`, `--critique`, `--converge`.
- `add-phase`, `insert-phase`, `remove-phase` → **`/gsd-phase`** with subcommands `add`, `insert`, `remove`.

**Agents deleted outright (17):**

```
gsd-debugger, gsd-debug-session-manager                                       (2)
gsd-doc-writer, gsd-doc-classifier, gsd-doc-synthesizer, gsd-doc-verifier     (4)
gsd-domain-researcher, gsd-eval-auditor, gsd-eval-planner,
  gsd-framework-selector, gsd-ai-researcher                                   (5)
gsd-ui-auditor, gsd-ui-checker, gsd-ui-researcher                             (3)
gsd-codebase-mapper, gsd-intel-updater                                        (2)
gsd-nyquist-auditor                                                           (1)
```

**Agents merged:**

- `gsd-research-synthesizer` content appended into `gsd-planner.md`; agent file deleted.

**Surviving agents (~22 at end of Phase 1, ~21 after Phase 3 synthesizer merge):**

Spine: `pattern-mapper`, `phase-researcher`, `planner` (with merged synthesis after Phase 3), `plan-checker`, `executor`, `verifier`, `assumptions-analyzer`, `advisor-researcher`. Project lifecycle: `roadmapper`, `project-researcher`. Quality (under `/gsd-review`): `code-reviewer`, `code-fixer`, `security-auditor`, `integration-checker`. Critics (consolidated to base + 6 lenses): `critic-plan/code/scope/verify/discuss/strategy`. Misc: `user-profiler`. Note: `research-synthesizer` survives Phase 1 untouched and is merged-then-deleted in Phase 3.

### Must-have 2 — Critic refactor

- Create `agents/_shared/critic-base.md` (~200 lines): role framing, severity definitions, `CRITIQUE.md` output schema, cross-flag rules, evidence requirements.
- Each critic shrinks to a "lens addendum" of 50-80 lines: lane definition, signature flags, calibration examples specific to the lens.
- Each critic prompt begins with the critic-base load directive followed by its lens body.
- The orchestrator that fires critics (e.g. `/gsd-review --critique` and any place critic-plan, critic-verify, etc. are invoked) sends a single message with parallel `Task` calls — wall-clock = max(critics), not sum.
- Net: critic line-count goes from 1,731 to ~600.

### Must-have 3 — Plan-phase chain merge

- Append `gsd-research-synthesizer.md` content into `gsd-planner.md`; delete the synthesizer file.
- `/gsd-plan-phase` orchestrator fires `pattern-mapper` and `phase-researcher` as a single parallel batch, then synchronizes before invoking `planner`.
- `planner` reads researcher output directly and synthesizes inline.
- `plan-checker` retained as a separate fresh-eyes review.
- Critics fire post-plan-checker as a single parallel batch (per Must-have 2).
- Net: 1 fewer agent, 1 fewer hop.

### Must-have 4 — TDD hardening (3 layers)

**Layer 1 — Prompt enforcement (executor + planner):**

- `gsd-executor.md` invokes `superpowers:test-driven-development` skill at the start of each implementation task.
- `gsd-executor.md` adds a `<gsd-tdd-rules>` section (≤ 80 lines) covering:
  - **No `it.skip` / `xit` / `describe.skip` / `test.skip` / `.todo` in committed code.** If a test cannot pass, delete it and file a follow-up task.
  - **No mocking internal modules unless an explicit `// MOCK: <reason>` annotation justifies why a real instance cannot be used.** Mocking is reserved for external boundaries (network, filesystem, time, nondeterminism).
  - **No catch-all assertions.** `expect(x).toBeTruthy()`, `expect(fn()).not.toThrow()`, bare `expect(x).toBeDefined()` count as no-ops. Tests must assert specific values, shapes, or behaviors.
  - **Watch the test fail with the right message.** RED step requires running the test before writing implementation, copying the failure message into the task log, then making it pass.
- `gsd-planner.md` updated so every implementation task in `PLAN.md` includes an explicit "RED test first" sub-step naming: behavior to test (user-observable), expected assertion shape, test file path.

**Layer 2 — Structural validation (plan-checker):**

- `gsd-plan-checker.md` adds a `TDD-STRUCTURE` validation rule.
- For each task tagged as implementation work, plan-checker confirms: paired RED sub-step exists, RED sub-step names a test file path and an asserted behavior, implementation sub-step references the same test file.
- Plans failing this check return a `TDD-STRUCTURE` finding at severity `critical`. The plan does not advance to execute-phase until fixed.

**Layer 3 — Pre-commit hook (backstop):**

- New hook: `hooks/tdd-gate.sh`, registered in the project pre-commit pipeline.
- Scans staged diffs and rejects:

  | Check | Reject if |
  |---|---|
  | New source file under configured source root | No paired test file added or modified in the same commit |
  | `\bit\.skip\(`, `\bxit\(`, `\bdescribe\.skip\(`, `\btest\.skip\(`, `\bit\.todo\(`, `\btest\.todo\(`, `\.only\(` patterns in staged tests | Any match present |
  | `vi.mock(` / `jest.mock(` calls importing from project's own `src/` namespace | No `// MOCK: <reason>` annotation within 2 lines |

- Hook is opt-out per project via `.planning/settings.json`: `tdd_gate: "strict" | "warn" | "off"`.
- Default is `strict` for fresh installs, `warn` when retrofitted onto existing GSD projects (avoids breaking working repos).
- Edge cases: refactor commits touching only existing source files (no new source) are allowed without a new paired test (existing tests cover refactors). Tests-only commits always allowed. Generated-code globs in `.planning/settings.json` are ignored by the hook.

### Must-have 5 — SP↔GSD integration

**Spec format contract (brainstorm-side):**

- Brainstorm output is markdown at `docs/superpowers/specs/<date>-<topic>-design.md` (existing convention).
- When `.planning/` is detected in the repo, brainstorm always writes these named sections in addition to whatever else the design needs:
  - `## Scope summary` — one paragraph: what we're building, what we're not.
  - `## Success criteria` — bulleted, falsifiable conditions for "done".
  - `## Must-haves` — bulleted required functionality.
  - `## Recommended next step` — one of three GSD commands with rationale (per offramp recommendation logic below).
- Optional sections GSD readers consume if present: `## Phase breakdown`, `## Technical risks`, `## Dependencies`.
- GSD readers tolerate missing optional sections. Required sections missing → reader asks the user interactively.
- Brainstorm-side change is a project-local addendum (loaded when `.planning/` is detected); no fork of SP brainstorming skill.

**`--from-spec` flag (GSD-side):**

| Command | Behavior with `--from-spec <path>` |
|---|---|
| `/gsd-new-milestone --from-spec <path>` | Reads `Scope summary`, `Success criteria`, `Must-haves`, optional `Phase breakdown`. `roadmapper` agent uses these to seed the milestone's phases instead of asking from scratch. User confirms or edits. |
| `/gsd-phase add --from-spec <path>` | Reads same sections; treats spec as describing one phase. Pre-populates the new phase's title, scope, must-haves into the roadmap row. Auto-chains into `/gsd-discuss-phase --from-spec <path>` for the new phase. |
| `/gsd-discuss-phase --from-spec <path>` | `assumptions-analyzer` and `advisor-researcher` read the spec before generating questions. Each candidate question is checked against the spec — if already answered, it is skipped and the answer logged as "from spec." Only gaps surface to the user. |

- Implementation: shared spec-reader module in `get-shit-done/`, parses sections and exposes a structured object. All three commands consume that helper.

**Brainstorm offramp recommendation logic:**

At the end of the brainstorming dialogue (after the user approves the design but before SP would normally invoke `writing-plans`), the assistant assesses scope and writes one of these into the `Recommended next step` section:

| Scope assessment | Recommendation |
|---|---|
| Single cohesive feature, fits one execution cycle, no natural multi-phase breakdown | `/gsd-phase add --from-spec docs/superpowers/specs/<this-file>.md` |
| Multiple components, multi-week, natural phase breakdown emerged | `/gsd-new-milestone --from-spec docs/superpowers/specs/<this-file>.md` |
| User mentioned during brainstorm they're filling context for an existing phase row | `/gsd-discuss-phase <phase-id> --from-spec docs/superpowers/specs/<this-file>.md` |

- Assistant asks user "Is this the right next step?" before recording — confirms before writing the recommendation.
- Behavior is conditional: when `.planning/` directory is detected in the repo, the GSD-aware ending fires; otherwise standard SP `writing-plans` invocation fires unchanged.

### Must-have 6 — Light agent prompt trim (Posture A)

For each surviving spine agent (planner, plan-checker, phase-researcher, verifier, executor, project-researcher, roadmapper, code-reviewer, code-fixer, integration-checker, security-auditor, assumptions-analyzer, advisor-researcher, pattern-mapper, user-profiler):

- Cut stale references to deleted commands (debug, ai-integration-phase, ui-phase, etc.).
- Cut duplicated section headers and repeated examples.
- Extract patterns appearing in 3+ agents to `agents/_shared/agent-conventions.md`.
- Cut references to `.planning/` paths that no longer exist after the cull.
- Target: 10-15% per-agent reduction.
- No semantic rewrites. Behavior parity check after each agent.

## Phase breakdown

Six phases, ordered by dependency and risk. Each phase commits independently; each phase has its own exit criteria including both static and live test passes.

### Phase 1 — Cull (foundation)

**Work:**

- Delete the 49 outright-cut commands and 17 orphaned agents.
- Build `/gsd-review` (consolidates 6 quality gates) and `/gsd-phase` (consolidates 3 phase ops).
- Update `install-manifest.json`, `bin/install.js`, `commands/gsd/help.md`, README, CHANGELOG.
- Reference-rot fix: scan all surviving agent prompts and workflow files for references to deleted commands; fix or remove.
- Commit per command/agent group for easy revert.

**Exit criteria:**

- Spine passes smoke test (discuss → plan → execute → verify on a fixture phase).
- No broken references to deleted commands/agents anywhere in surviving prompts.
- ~37 commands surviving; ~22 agents surviving (synthesizer not yet merged at this phase end — that happens in Phase 3, but synthesizer survives Phase 1 untouched).
- `gsd-lifecycle.test.cjs` updated to use the post-cull spine and passes end-to-end.
- All static tests in `tests/` pass.
- All live integration tests in `integration/` pass.

### Phase 2 — Critic refactor (independent quick win)

**Work:**

- Create `agents/_shared/critic-base.md` (~200 lines) extracting common framing.
- Rewrite each of the 6 critics as a lens addendum (50-80 lines) that loads the base.
- Update `/gsd-review --critique` and any other critic invocation paths to fire all 6 in one parallel batch.

**Exit criteria:**

- Critic line-count ~600 total (down from 1,731).
- Critic-batch wall-clock measurably faster than baseline (record actual time for trend tracking).
- Behavior parity: critic findings overlap ≥85% by severity-bucketed key against pre-refactor baseline; no critical findings missing.
- All static and live tests pass.

### Phase 3 — Plan-phase chain merge

**Work:**

- Append `gsd-research-synthesizer.md` content into `gsd-planner.md`; delete synthesizer agent file.
- Update `/gsd-plan-phase` orchestrator to fire `pattern-mapper` and `phase-researcher` as a parallel batch, then invoke planner with both outputs available.
- Confirm critics fire as a parallel batch post-plan-checker (already done in Phase 2 if review pipeline is the same orchestrator; otherwise apply same pattern here).

**Exit criteria:**

- `gsd-research-synthesizer.md` does not exist; planner contains merged synthesis section.
- Plan-phase has 1 fewer agent and 1 fewer hop than baseline.
- Behavior parity: PLAN.md emitted on a fixture phase has functional equivalence (task count within ±10%, all must-haves covered, dependency graph equivalent).
- Plan-phase wall-clock no worse than baseline; ideally measurably better.
- All static and live tests pass.

### Phase 4 — TDD hardening (3 layers)

**Work:**

- Layer 1: update `gsd-executor.md` to invoke SP TDD skill + add `<gsd-tdd-rules>` section. Update `gsd-planner.md` so PLAN.md tasks always emit a "RED test first" sub-step.
- Layer 2: add `TDD-STRUCTURE` validation rule to `gsd-plan-checker.md`.
- Layer 3: create `hooks/tdd-gate.sh`; register in pre-commit pipeline; add `tdd_gate` setting to `.planning/settings.json` (default `strict` for fresh installs, `warn` for existing repos).
- Test the gate: craft synthetic deliberately-bad commits (untested-source, `it.skip`, internal mock without annotation, catch-all assertions) and clean commits; verify rejection / acceptance respectively.

**Exit criteria:**

- `hooks/tdd-gate.sh` exists, executable, registered in pre-commit pipeline.
- Hook rejects all four bad-commit fixtures with correct error messages; passes all clean fixtures.
- `gsd-planner.md` emits RED sub-steps; verified by static grep.
- `gsd-plan-checker.md` has TDD-STRUCTURE rule; verified against deliberately-bad plan fixture.
- `gsd-executor.md` invokes SP TDD skill and respects anti-mock/anti-skip rules; verified by live executor run on a trivial fixture phase.
- All static and live tests pass.

### Phase 5 — SP integration

**Work:**

- Build the spec-reader helper module in `get-shit-done/` (parses required + optional sections, exposes structured object).
- Add `--from-spec <path>` flag to `/gsd-new-milestone`, `/gsd-phase add`, `/gsd-discuss-phase`.
- Wire each consumer per the SP integration must-have section (roadmapper seeding, phase row pre-population, discuss gap-skipping).
- Author the project-local brainstorming addendum (instructs the brainstorming skill to write the required sections + recommended next step when `.planning/` is detected, falls back to writing-plans otherwise).
- End-to-end test: run `/sp brainstorm` on a sample idea, then run the recommended command, verify spec content propagates correctly.

**Exit criteria:**

- All three commands accept `--from-spec` and consume specs correctly (verified by live test).
- Brainstorm addendum activates when `.planning/` exists in test repo and is dormant otherwise.
- `/gsd-discuss-phase --from-spec` skips already-answered questions and surfaces gaps; CONTEXT.md merges spec answers + new answers.
- `gsd-lifecycle.test.cjs` updated to start from `/sp brainstorm` and use `--from-spec` throughout the pipeline; passes end-to-end.
- All static and live tests pass.

### Phase 6 — Light agent prompt trim (Posture A)

**Work:**

- For each of the surviving agents listed in Must-have 6: cut stale references, duplicated section headers, repeated examples, dead `.planning/` paths.
- Extract patterns appearing in 3+ agents to `agents/_shared/agent-conventions.md`.
- Behavior parity check after each agent.

**Exit criteria:**

- Each surviving agent at least 10% smaller than its baseline; no surviving agent grew.
- Behavior parity: per-agent fixture inputs produce structurally equivalent outputs pre- and post-trim; no critical capability regression.
- `agents/_shared/agent-conventions.md` exists with shared patterns; agents reference it.
- All static and live tests pass.

### Phase 7 — Measure & decide on stretch optimizations (deferred)

After Phases 1-6 are merged and used for ~1-2 weeks of real work, measure:

- Plan-phase wall-clock before vs after.
- Critic batch wall-clock before vs after.
- Agent prompt token counts before vs after.
- TDD discipline rate (sample N commits, count violations the hook caught).

Then decide whether to proceed with deferred items:

- Critic conditional-spawn (Lever 3 from Section 2 of brainstorm).
- Aggressive agent rewrite (Posture B/C).
- TDD coverage thresholds, mutation testing.

This phase is not part of the initial implementation plan; it is captured here so the deferred items are not forgotten.

## Testing strategy

Two test layers per phase: **static** (Bazel `tests/*.test.cjs`, no API spend) and **live** (`integration/*.test.cjs`, real Claude API calls). Cost is not a constraint per the user. Every phase's exit criteria includes both layers green before commit.

### Cross-cutting test infrastructure

- Update `integration/gsd-lifecycle.test.cjs` in Phase 1 to use the post-cull spine; further update in Phase 5 to start from `/sp brainstorm` and use `--from-spec` throughout.
- Add `integration/test-fixtures/` for canned brainstorm spec docs, fixture phases, sample plans for parity comparisons.
- Add `runAgentParity(agentName, fixtureInput, expectedOutputSchema, opts)` helper to `integration/helpers/`. Used in Phase 2, 3, 6.
- Update `tests/install-manifest-matches-surviving.test.cjs` (new) to enforce the surviving command/agent count.
- Delete tests for cut commands (e.g. `audit-fix-command.test.cjs`) along with their commands in Phase 1.

### Phase 1 — Cull tests

**Static (new in `tests/`):**

- `cull-no-orphan-references.test.cjs` — grep all surviving agents/commands/workflows for references to deleted commands/agents; fail if any match.
- `install-manifest-matches-surviving.test.cjs` — assert manifest lists exactly the surviving 37 commands and 22 agents (synthesizer still present at end of Phase 1).
- `consolidated-review-flags.test.cjs` — assert `/gsd-review` accepts `--code`, `--security`, `--coverage`, `--critique`, `--converge`; legacy commands removed.
- `consolidated-phase-subcommands.test.cjs` — assert `/gsd-phase add|insert|remove`; legacy commands removed.

**Live:**

- Smoke: `/gsd-progress`, `/gsd-discuss-phase`, `/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-verify-work` each invoked individually on a fixture project; assert each completes without errors.
- Update `gsd-lifecycle.test.cjs` to reflect the post-cull spine; assert end-to-end pass.

### Phase 2 — Critic refactor tests

**Static:**

- `critic-shared-base-loaded.test.cjs` — assert `agents/_shared/critic-base.md` exists; referenced by all 6 critic prompts.
- `critic-line-budget.test.cjs` — assert each critic addendum ≤ 100 lines, base ≤ 250 lines, sum ≤ 700.
- `critic-batch-invocation.test.cjs` — parse `/gsd-review --critique` workflow; assert critic-spawn step uses parallel-Task syntax.

**Live:**

- `critic-parity.test.cjs` — feed a known plan + code artifact to all 6 critics before-and-after refactor; assert ≥85% finding overlap by severity-bucketed key, no critical findings missing.
- `critic-batch-walltime.test.cjs` — measure wall-clock for full critique pass on a fixture plan; assert under budget; record actual time.

### Phase 3 — Plan-phase chain merge tests

**Static:**

- `synthesizer-removed.test.cjs` — assert `agents/gsd-research-synthesizer.md` absent; assert `gsd-planner.md` contains merged synthesis section.
- `plan-phase-parallel-spawn.test.cjs` — parse plan-phase workflow; assert pattern-mapper + phase-researcher spawn in single parallel batch.

**Live:**

- `plan-phase-parity.test.cjs` — run `/gsd-plan-phase` on fixture phase before/after merge; compare PLAN.md by structural fields (task count within ±10%, must-haves covered, dependency graph equivalent).
- `plan-phase-walltime.test.cjs` — wall-clock budget for plan-phase on fixture; record + assert under threshold.

### Phase 4 — TDD hardening tests

**Static:**

- `tdd-gate-hook-installed.test.cjs` — assert `hooks/tdd-gate.sh` exists, executable, registered.
- `tdd-gate-rejects.test.cjs` — invoke hook against synthetic diff fixtures (untested-source, `it.skip`, `internal-mock-no-annotation`, catch-all assertion); assert non-zero exit + correct error message for each.
- `tdd-gate-passes.test.cjs` — same harness, clean fixtures (source+test pair, mock with annotation, real assertion); assert zero exit.
- `executor-invokes-sp-tdd.test.cjs` — grep `gsd-executor.md` for SP TDD skill invocation marker.
- `planner-emits-red-step.test.cjs` — grep `gsd-planner.md` for "RED test first" emission template.
- `plan-checker-tdd-rule.test.cjs` — grep `gsd-plan-checker.md` for TDD-STRUCTURE rule.

**Live:**

- `executor-tdd-discipline.test.cjs` — run `/gsd-execute-phase` on fixture phase with one trivial implementation task; assert (a) executor produces failing test first, (b) implementation comes after, (c) tests pass at end, (d) no `*.skip` in committed test file.
- `plan-checker-rejects-no-tdd.test.cjs` — feed plan-checker a deliberately bad plan (impl tasks with no RED sub-step); assert TDD-STRUCTURE finding emitted at critical severity; plan does not advance.

### Phase 5 — SP integration tests

**Static:**

- `spec-reader-unit.test.cjs` — fixture spec docs (well-formed, missing required sections, malformed sections); assert reader extracts/errors correctly.
- `from-spec-flag-wired.test.cjs` — assert all three commands accept and document `--from-spec`.
- `brainstorm-addendum-detect.test.cjs` — assert addendum activates when `.planning/` exists in test repo and is dormant otherwise.

**Live:**

- `brainstorm-to-gsd-handoff.test.cjs` — run `/sp brainstorm` with canned topic + canned answers; assert spec doc lands at expected path with required sections; assert recommendation present and points to one of three GSD commands; run that command with `--from-spec`; assert it reads correctly.
- `discuss-phase-gap-skipping.test.cjs` — run `/gsd-discuss-phase --from-spec` with fixture spec pre-answering known questions; assert those skipped; assert remaining gaps asked; assert CONTEXT.md merges spec answers + new answers.
- Update `gsd-lifecycle.test.cjs` to start from `/sp brainstorm` and use `--from-spec` throughout.

### Phase 6 — Agent trim tests

**Static:**

- `agent-line-budget.test.cjs` — pre-trim baseline checked in; assert each surviving agent at least 10% smaller; no surviving agent grew.
- `agent-shared-conventions.test.cjs` — assert `agents/_shared/agent-conventions.md` exists; shared patterns present; agents reference it.

**Live:**

- `agent-trim-parity.test.cjs` — for each trimmed agent, run pre-trim vs post-trim against fixture input via `runAgentParity` helper; assert structural output equivalence; no critical capability regression.

### Cost note

Cost is not a budget constraint for live tests per the user. Live tests run freely as part of phase exit criteria. CI matrix will likely run static every commit and live nightly + on-demand, but that is an ops concern for the implementation plan; this design specifies that live tests must pass for a phase to be considered complete.

## Technical risks

- **Reference rot during cull (Phase 1):** surviving agent prompts may reference deleted commands/agents. Mitigation: dedicated reference-rot test in Phase 1 static suite that fails if any deleted name appears in surviving prompts.
- **Critic behavior drift (Phase 2):** extracting common framing into a base may inadvertently change critic output. Mitigation: ≥85% finding-overlap parity test; manual spot-check of any critical findings that disappear.
- **Planner growth (Phase 3):** merging synthesizer into planner makes the planner ~200 lines bigger; risks exceeding context budgets in some scenarios. Mitigation: Posture A trim in Phase 6 will offset some of the growth; if necessary, escalate to Posture B for the planner specifically.
- **TDD hook false positives (Phase 4):** hook could reject legitimate refactor commits or generated code. Mitigation: the design explicitly carves out refactor commits (no new source = no required new test) and generated-code globs in `.planning/settings.json`. Edge cases tested with synthetic fixtures before activation.
- **SP brainstorming skill drift:** the brainstorming skill is part of the SP plugin and updates may overwrite local customizations. Mitigation: project-local addendum lives in this repo (not the SP plugin cache); behavior is conditional on `.planning/` detection so it does not affect brainstorming in other repos.
- **`gsd-lifecycle.test.cjs` is enormous-tier:** updating it is expensive to iterate. Mitigation: build smaller per-phase live tests first (smoke tests, individual command tests) before re-running the full lifecycle to validate.

## Dependencies

- SP brainstorming skill (existing, in `~/.claude/plugins/cache/claude-plugins-official/superpowers/`).
- SP `test-driven-development` skill (existing, same plugin tree). Required for Layer 1 of TDD hardening.
- Existing GSD test infrastructure in `tests/` and `integration/` (Bazel `js_test` rules, `claude-runner.cjs`).
- Live API key for integration tests (already required by existing `requires-api-key`-tagged tests).
- Phases ordered by dependency: Phase 1 must complete before any other; Phase 3 before Phase 4 (TDD layer 1 modifies planner, which is also being modified in Phase 3); Phase 4 before Phase 5 (Phase 5 touches discuss-phase / roadmapper but TDD hardening is orthogonal so this ordering is preference, not strict dependency); Phase 6 last (trim is polish on top of agents in their final structural form).

## Recommended next step

`/gsd-new-milestone --from-spec docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md`

Rationale: this design spans six phases of work (cull, critic refactor, plan-phase merge, TDD hardening, SP integration, agent trim) plus a deferred measurement phase. Each phase is independently substantial enough to warrant its own implementation plan. A milestone with the six phases is the natural shape; `roadmapper` seeded from this spec produces them.

If the `--from-spec` flag does not yet exist when this is run (chicken-and-egg, since one of the deliverables of this spec is to build the flag), the alternative is `/gsd-new-milestone` and manual seeding from this spec — the recommendation logic in this design will become real once Phase 5 is implemented.

## Out of scope (explicit)

- Forking SP brainstorming skill (using project-local addendum instead).
- Bidirectional integration (GSD → SP planning); design only handles SP → GSD direction.
- Auto-running the recommended GSD command from brainstorm (user runs manually with confirmation).
- Critic conditional-spawn (Lever 3) — deferred to Phase 7.
- Aggressive agent rewrite (Posture B/C) — deferred to Phase 7.
- TDD coverage thresholds and mutation testing — deferred to Phase 7.
- Any feature work in GSD beyond these four concerns.
