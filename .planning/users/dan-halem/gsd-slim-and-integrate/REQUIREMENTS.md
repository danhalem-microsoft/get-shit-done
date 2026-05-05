# Requirements — GSD Slim + SP Integration + TDD Hardening

**Project:** gsd-slim-and-integrate
**Generated:** 2026-04-29
**Status:** v1 requirements — defining

These requirements derive from three sources, in order of authority:
1. **Locked design decisions** in `PROJECT.md` (the brainstormed must-haves) and `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md`.
2. **Research-mandated additions** in `research/SUMMARY.md` (Wave-0 parity infrastructure, Phase 2 commit-0 spike, multi-signal detection, etc.).
3. **Field-validated table-stakes features** identified in `research/FEATURES.md`.

Requirement quality criteria followed: specific and testable, user-centric or system-observable, atomic, independent.

---

## v1 Requirements

### Test Infrastructure (TEST) — Wave 0 of Phase 1

These requirements MUST land before any cull or refactor work begins. The project's parity story collapses without them.

- [ ] **TEST-01**: User can run a static test (`tests/cull-no-orphan-references.test.cjs`) that scans all surviving agents, commands, workflows, fixtures, and docs for any reference to a deleted command or agent name across all 6 syntactic contexts (`@`-references, slash mentions, `install-manifest.json`, workflow markdown, frontmatter, fixture files), and the test fails loudly if any orphan reference is present.
- [ ] **TEST-02**: User can call a `runAgentParity(agentName, fixtureInput, schema, opts)` helper from `integration/helpers/agent-parity.cjs` that runs the named agent against a recorded baseline and asserts equivalence per a supplied schema (`critic-findings`, `plan-structural`, or `schema-conformance` kinds).
- [ ] **TEST-03**: User can find pre-refactor baseline outputs at `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` for every agent that will be refactored (6 critics, planner, every spine agent that Phase 6 will trim), captured against canonical fixture inputs and committed to git.
- [ ] **TEST-04**: User can run the full lifecycle test (`integration/gsd-lifecycle.test.cjs`) where each pipeline step is decomposed into its own file at `integration/lifecycle-steps/step-N-<name>.cjs` with a thin composer in the lifecycle test, and the pipeline shape is captured in JSON fixtures at `integration/test-fixtures/lifecycle-shapes/*.json`.
- [ ] **TEST-05**: User can run a static test (`tests/parity-baselines-stale.test.cjs`) that fails if any baseline JSON file is older than 90 days without a `staleness_acknowledged: <date>` field, forcing deliberate refresh.

### Cull (CULL) — Phase 1

- [ ] **CULL-01**: After Phase 1, the GSD installation contains exactly 37 surviving commands (the 49 outright-cut commands deleted, the 6 quality-gate commands consolidated into `/gsd-review`, the 3 phase-manipulation commands consolidated into `/gsd-phase`).
- [ ] **CULL-02**: After Phase 1, the GSD installation contains exactly 22 surviving agents (the 17 orphaned agents deleted; `gsd-research-synthesizer` survives Phase 1 untouched and is merged in Phase 3).
- [ ] **CULL-03**: User can run `/gsd-review` with flags `--code`, `--security`, `--coverage`, `--critique`, `--converge`, and the consolidated command dispatches to the appropriate workflow for each flag.
- [ ] **CULL-04**: User can run `/gsd-phase add`, `/gsd-phase insert`, `/gsd-phase remove`, and the consolidated command dispatches to the appropriate subcommand handler.
- [ ] **CULL-05**: User can run any of the 6 deprecated quality-gate commands (`/gsd-secure-phase`, `/gsd-validate-phase`, `/gsd-code-review`, `/gsd-code-review-fix`, `/gsd-critique`, `/gsd-plan-review-convergence`) and receive a deprecation message that explains the consolidation and dispatches to the new command. Stub commands persist for at least one milestone after Phase 1.
- [ ] **CULL-06**: User can run the full GSD spine (`/gsd-discuss-phase` → `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work`) on a fixture phase after the cull, and the workflow completes end-to-end without referencing any deleted command or agent.
- [ ] **CULL-07**: User can read `commands/gsd/help.md` and `CHANGELOG.md` and find an explicit migration table mapping every deleted/consolidated command to its replacement (or to "this command was removed; use X instead" for cuts that have no consolidation target).
- [ ] **CULL-08**: User can read `install-manifest.json` and find exactly the surviving 37 commands and 22 agents listed; no orphan entries.

### Critic Refactor (CRIT) — Phase 2

- [ ] **CRIT-01**: User can verify (via `tests/critic-spike-passes.test.cjs` in Phase 2 commit 0) that Claude Code's `@$HOME/.claude/get-shit-done/agents/_shared/...` reference syntax resolves correctly inside an agent prompt loaded via `Task` spawn, with content from the referenced file injected at prompt-load time.
- [ ] **CRIT-02**: User can find a shared base prompt at `agents/_shared/critic-base.md` (≤ 250 lines) containing the role framing, severity rubric, `CRITIQUE.md` output schema, cross-flag rules, and evidence requirements common to all 6 critics.
- [ ] **CRIT-03**: User can find each critic agent prompt (`agents/gsd-critic-plan.md` through `agents/gsd-critic-strategy.md`) reduced to ≤ 100 lines per critic, beginning with the `@` reference to `critic-base.md` and containing only lens-specific definitions and calibration examples.
- [ ] **CRIT-04**: After Phase 2, total critic line-count (base + 6 addendums) is ≤ 700 lines (down from 1,731), enforced by `tests/critic-line-budget.test.cjs`.
- [ ] **CRIT-05**: User can verify (via `tests/critic-no-base-shadowing.test.cjs`) that no critic addendum re-states content that already exists in `critic-base.md` — addendums are lens-only, not re-framing.
- [ ] **CRIT-06**: User can run any orchestrator that fires critics (e.g., `/gsd-review --critique`) and observe that all 6 critics are spawned in a single message with parallel `Task` calls, with wall-clock equal to max(critic) rather than sum.
- [ ] **CRIT-07**: User can run the parallel critic batch and the orchestrator reads each critic's `CRITIQUE.md` from disk after spawning (not from the parent's text summary), via `gsd-tools.cjs critic-aggregate`, mitigating the parallel-Task hallucination bug ([anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181)).
- [ ] **CRIT-08**: User can run `integration/critic-batch-walltime.test.cjs` which verifies that the timestamp delta of the 6 Task spawns is < 2 seconds (catches the [#7406 "claims parallel, executes serial" bug](https://github.com/anthropics/claude-code/issues/7406)) and that total wall-clock ≈ max(critics).
- [ ] **CRIT-09**: User can deliberately misconfigure one critic (1-of-N failure injection) and observe that the orchestrator's skip-and-continue policy aggregates findings from the remaining 5 critics, logs the missing critic as `info`-severity finding, and continues to the next stage.
- [ ] **CRIT-10**: User can run `integration/critic-parity.test.cjs` which feeds a known plan + code artifact to all 6 critics, runs N=5 iterations, takes the median, and asserts ≥85% finding overlap by severity-bucketed key against the Phase 1 baseline, with a hard fail on any missing critical-severity finding.

### Plan-Phase Chain Merge (PLAN) — Phase 3

- [ ] **PLAN-01**: After Phase 3, `agents/gsd-research-synthesizer.md` does not exist; its content is appended into `agents/gsd-planner.md` under a `<synthesis-step>` anchor with the previous planner content under `<planning-step>`.
- [ ] **PLAN-02**: User can run `/gsd-plan-phase` and the orchestrator fires `pattern-mapper` and `phase-researcher` as a single parallel Task batch, then synchronizes before invoking `planner`. Wall-clock for the parallel pair ≈ max(pattern-mapper, phase-researcher), not sum.
- [ ] **PLAN-03**: User can run `integration/plan-phase-parity.test.cjs` (N=5 median) which compares pre- and post-merge `PLAN.md` outputs on a fixture phase: task count within ±10%, all must-haves covered (set equality), dependency graph isomorphic by content, every implementation task has a RED test sub-step.
- [ ] **PLAN-04**: After Phase 3, plan-phase has 1 fewer agent and 1 fewer hop than the pre-merge baseline, verified by static parsing of `workflows/plan-phase.md`.
- [ ] **PLAN-05**: At Phase 3 exit, total token budget of merged planner under realistic input (planner prompt + research files + CONTEXT.md + REQUIREMENTS.md) does not exceed 100K tokens. If it does, escalate to Posture B trim of the planner specifically *within Phase 3* (do not defer to Phase 6).

### TDD Hardening (TDD) — Phase 4

- [ ] **TDD-01**: User can read `agents/gsd-executor.md` and find a directive at the start of each implementation task that invokes the `superpowers:test-driven-development` skill before any code is written.
- [ ] **TDD-02**: User can read `agents/gsd-executor.md` and find a `<gsd-tdd-rules>` section (≤ 80 lines) covering: no `it.skip` / `xit` / `describe.skip` / `test.skip` / `.todo` / `.only` in committed code; no mocking internal modules without `// MOCK: <reason>` annotation; no catch-all assertions (`expect(x).toBeTruthy()`, bare `expect(x).toBeDefined()`, `expect(fn()).not.toThrow()`); evidence-of-RED required (failure message captured in task log).
- [ ] **TDD-03**: User can read `agents/gsd-planner.md` and find that every implementation task in emitted PLAN.md includes an explicit "RED test first" sub-step naming the behavior to test (user-observable), the expected assertion shape, and the test file path.
- [ ] **TDD-04**: User can run `agents/gsd-plan-checker.md` against a deliberately bad plan (implementation tasks lacking RED sub-step) and the plan-checker emits a `TDD-STRUCTURE` finding at severity `critical`, blocking the plan from advancing to execute-phase.
- [ ] **TDD-05**: User can find an executable hook at `hooks/tdd-gate.sh`, registered in the project's pre-commit pipeline. The hook reads `.planning/settings.json` on every invocation (no caching) for its config.
- [ ] **TDD-06**: The TDD gate hook supports three modes via `tdd_gate.mode` in settings: `strict` (block bad commits), `warn` (print warnings, allow commit), `off` (skip). Default `strict` for fresh installs, `warn` for retrofits (existing `.planning/` without `tdd_gate` key when installer runs).
- [ ] **TDD-07**: The TDD gate hook in `strict` or `warn` mode rejects (or warns on) staged diffs containing: new source file under configured `source_roots` without a paired test file added or modified; `it.skip` / `xit` / `describe.skip` / `test.skip` / `.todo` / `.only` patterns in staged tests; `vi.mock(` / `jest.mock(` calls importing from `internal_module_patterns` without a `// MOCK: <reason>` annotation within 2 lines.
- [ ] **TDD-08**: The TDD gate hook honors carve-outs: refactor commits (modifications to existing source files with no new source files) are allowed without a paired new test; tests-only commits are always allowed; files matching `ignore_globs` (e.g., `**/*.generated.*`, `**/dist/**`) are skipped entirely.
- [ ] **TDD-09**: When `tdd_gate.mode` is `warn`, the hook prints a "warn mode expires in N days" reminder after each commit. After 30 days from the first warn-mode commit, the hook switches to `strict` (or `off` if user explicitly chose). User can extend warn mode by updating `tdd_gate.warn_until` in settings.
- [ ] **TDD-10**: User can run `tests/tdd-gate-rejects.test.cjs` and `tests/tdd-gate-passes.test.cjs` which invoke the hook against synthetic staged-diff fixtures (one per reject/pass pattern); hook accepts `--staged-diff <file>` flag in test mode for deterministic invocation; tests run in <100ms each.
- [ ] **TDD-11**: User can run `integration/executor-tdd-discipline.test.cjs` which runs `/gsd-execute-phase` on a fixture phase with one trivial implementation task and asserts: executor produces a failing test first (test file in commit N), implementation in commit N+1, tests pass at end of phase, no `*.skip` patterns in committed test file, evidence-of-RED captured in task log.
- [ ] **TDD-12**: User can run `integration/tdd-layered-composition.test.cjs` which exercises all three TDD layers in sequence: deliberately-bad plan rejected by plan-checker, then fixed plan accepted, then executor produces tests-first per Layer 1, then a deliberate hook violation rejected by Layer 3.
- [ ] **TDD-13**: User can run `integration/tdd-gate-ci-mirror.test.cjs` which runs the hook script against PR diffs in a CI environment, covering edge cases (`git commit --amend`, web-UI commits via GitHub) where local pre-commit hooks don't fire.

### Superpowers Integration (SP) — Phase 5

- [ ] **SP-01**: User can find `get-shit-done/bin/lib/spec-reader.cjs` exposing `parseSpec(filePath) → SpecDoc | { error }` and `toPromptFragment(spec, options) → markdown` exports.
- [ ] **SP-02**: User can run `tests/spec-reader-unit.test.cjs` against fixture spec docs (well-formed, missing required sections, malformed sections, alias variations like `Scope` vs `Scope summary`) and the parser returns the correct structure for valid input or a clear error for invalid input.
- [ ] **SP-03**: User can run `/gsd-new-milestone --from-spec <path>` and the workflow parses the spec, seeds the milestone's phases from `## Scope summary`, `## Success criteria`, `## Must-haves`, and optional `## Phase breakdown`, and the roadmapper agent receives the parsed summary plus the raw file path in `<files_to_read>`.
- [ ] **SP-04**: User can run `/gsd-phase add --from-spec <path>` and the workflow pre-populates a new phase row from the spec's must-haves and success criteria, then auto-chains into `/gsd-discuss-phase --from-spec <path>` for the new phase.
- [ ] **SP-05**: User can run `/gsd-discuss-phase <id> --from-spec <path>` and the `assumptions-analyzer` and `advisor-researcher` agents read the spec before generating questions, skip questions whose answers are already in the spec, and surface only gaps to the user. Final `CONTEXT.md` merges spec answers (logged as "from spec") plus new answers from the user.
- [ ] **SP-06**: User can find a brainstorming addendum file at `.planning/SP-BRAINSTORM-ADDENDUM.md` and a single-line `@.planning/SP-BRAINSTORM-ADDENDUM.md` import in the project-root `CLAUDE.md` (created or appended by the GSD installer when fresh installs are detected).
- [ ] **SP-07**: When SP brainstorming runs in a repo with `.planning/` present, the addendum instructs brainstorming to write a spec doc with required sections `## Scope summary`, `## Success criteria`, `## Must-haves`, `## Recommended next step`. Optional sections (`## Phase breakdown`, `## Technical risks`, `## Dependencies`, `## Out of scope`, `## Testing strategy`) included where applicable.
- [ ] **SP-08**: SP brainstorming, after dialogue completes, assesses scope and writes one of three GSD commands into `## Recommended next step` of the spec doc: `/gsd-new-milestone --from-spec <path>` (multi-phase), `/gsd-phase add --from-spec <path>` (single phase), or `/gsd-discuss-phase <id> --from-spec <path>` (existing phase). User confirms before recommendation is written.
- [ ] **SP-09**: When SP brainstorming runs in a repo without `.planning/` (or matching the multi-signal detection criteria), brainstorm runs unmodified — the addendum is dormant and SP's standard `writing-plans` invocation fires.
- [ ] **SP-10**: After consumption, the GSD orchestrator records consumption metadata at `.planning/SPEC-CONSUMED.json` containing `{ path, sha, consumed_at, command }` for each `--from-spec` invocation, enabling provenance audit and detecting spec drift.
- [ ] **SP-11**: User can run `integration/brainstorm-to-gsd-handoff.test.cjs` which invokes `/sp brainstorm` with a canned topic + canned answers in a sandbox; assertion: spec doc lands at `docs/superpowers/specs/<date>-<topic>-design.md` with required sections; recommendation present and points to one of three GSD commands; running that recommended command with `--from-spec` reads the spec correctly.
- [ ] **SP-12**: User can run `integration/discuss-phase-gap-skipping.test.cjs` with a fixture spec that pre-answers known questions; assertion: those questions are skipped (not asked again); remaining gap questions are asked; final `CONTEXT.md` merges spec answers + user answers with `from spec` annotations.
- [ ] **SP-13**: A nightly contract test runs SP brainstorming end-to-end against a canned topic and verifies the spec doc emerges with all required sections, detecting upstream SP plugin drift before users hit it.

### Light Agent Trim (TRIM) — Phase 6

- [ ] **TRIM-01**: After Phase 6, every surviving spine agent (planner, plan-checker, phase-researcher, verifier, executor, project-researcher, roadmapper, code-reviewer, code-fixer, integration-checker, security-auditor, assumptions-analyzer, advisor-researcher, pattern-mapper, user-profiler) has line-count ≥10% smaller than its Phase 1 wave 0 baseline; no surviving agent grew, enforced by `tests/agent-line-budget.test.cjs`.
- [ ] **TRIM-02**: User can find `agents/_shared/agent-conventions.md` containing patterns that appeared in 3+ agents in the pre-trim state. Agents that previously inlined those patterns reference the shared file via `@`.
- [ ] **TRIM-03**: User can run `integration/agent-trim-parity.test.cjs` which runs `runAgentParity` (N=5 median) for each trimmed agent against its Phase 1 wave 0 baseline using the appropriate schema (`schema-conformance` for most spine agents); structural equivalence required, no critical capability regression.
- [ ] **TRIM-04**: After Phase 6, trim work does not introduce any new agent file; every line removed was either stale (referenced a deleted command), duplicated (extracted to shared), or low-information (boilerplate examples).

### Cross-Cutting (XCUT)

- [ ] **XCUT-01**: Each phase ends with a git tag (`gsd-slim-phase-N-<name>`) created only after both static and live test suites for that phase pass. Tag absence indicates the phase did not pass exit criteria.
- [ ] **XCUT-02**: User can run `bazel test //integration/... --test_tag_filters=phase-N-<name>` to scope CI runs to a single phase's live tests; full suite runs at PR merge to main and nightly.
- [ ] **XCUT-03**: User can find a walltime ledger at `integration/test-fixtures/walltime-ledger.jsonl` with one JSONL entry per live test invocation containing `{ date, test, walltime_ms, cost_usd, phase }`.
- [ ] **XCUT-04**: User can run `tests/walltime-trend.test.cjs` which reads the ledger and emits a soft alert (not hard fail) for any test that has gotten >50% slower over the last 5 entries.
- [ ] **XCUT-05**: User can read each phase's `PLAN.md` and find the per-phase test inventory (~6-8 tests per phase) mapping new test files to the requirements they verify.

---

## Future Requirements (Phase 7+, deferred)

These are explicitly out of scope for this milestone but tracked for future consideration:

- Critic conditional-spawn (only run relevant critics per artifact type)
- Aggressive agent rewrite (Posture B/C)
- TDD coverage thresholds
- Mutation testing
- Empirical measurement of critic finding-overlap (informs whether to consolidate critics)
- Real-world false-positive rate measurement on TDD gate

---

## Out of Scope

- Forking the SP brainstorming skill — using a project-local CLAUDE.md addendum instead
- Bidirectional GSD↔SP integration — only SP→GSD direction is in scope
- Auto-running the recommended GSD command from brainstorm — too fragile if scope is misjudged; user runs the recommendation manually with confirmation
- More than one project-shipped hook in this milestone — TDD hook only; commit-message-quality / secret-scanner / etc. are out of scope (they conflict with users' existing hook stacks)
- Mode-based UI replacement (Cline / Roo Code style) — would require rewriting all command entry points and break installed workflows
- Marketplace plugin / skill ecosystem (third-party) — security risk per [prompt.security](https://prompt.security/blog/when-your-plugin-starts-picking-your-dependencies-marketplace-skills-and-dependency-hijack-in-claude-code); install/audit burden
- Background / async agent execution (Cursor-style) — coordination complexity not justified for solo-dev workflow
- Iterative critic-debate loops (Builder ↔ Critic round-trips) — slow, rarely converges past round 2; single-pass critic batch is the better tradeoff
- Heavy dashboard / GUI — CLI-first design choice; `/gsd-settings` covers configuration
- Telemetry / usage analytics — privacy concerns; if desired, opt-in only
- In-tool bug tracker / issue management — use GitHub Issues; don't reinvent

---

## Traceability

Filled by `gsd-roadmapper` after roadmap creation. Each requirement above maps to exactly one phase. Plan column stays "TBD" until `gsd-plan-phase` fills it in.

| REQ-ID | Phase | Plan |
|---|---|---|
| TEST-01 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| TEST-02 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| TEST-03 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| TEST-04 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| TEST-05 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-01 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-02 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-03 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-04 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-05 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-06 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-07 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CULL-08 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| CRIT-01 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-02 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-03 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-04 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-05 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-06 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-07 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-08 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-09 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| CRIT-10 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| PLAN-01 | Phase 3: Plan-phase chain merge | TBD |
| PLAN-02 | Phase 3: Plan-phase chain merge | TBD |
| PLAN-03 | Phase 3: Plan-phase chain merge | TBD |
| PLAN-04 | Phase 3: Plan-phase chain merge | TBD |
| PLAN-05 | Phase 3: Plan-phase chain merge | TBD |
| TDD-01 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-02 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-03 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-04 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-05 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-06 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-07 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-08 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-09 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-10 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-11 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-12 | Phase 4: TDD hardening (3 layers) | TBD |
| TDD-13 | Phase 4: TDD hardening (3 layers) | TBD |
| SP-01 | Phase 5: SP integration | TBD |
| SP-02 | Phase 5: SP integration | TBD |
| SP-03 | Phase 5: SP integration | TBD |
| SP-04 | Phase 5: SP integration | TBD |
| SP-05 | Phase 5: SP integration | TBD |
| SP-06 | Phase 5: SP integration | TBD |
| SP-07 | Phase 5: SP integration | TBD |
| SP-08 | Phase 5: SP integration | TBD |
| SP-09 | Phase 5: SP integration | TBD |
| SP-10 | Phase 5: SP integration | TBD |
| SP-11 | Phase 5: SP integration | TBD |
| SP-12 | Phase 5: SP integration | TBD |
| SP-13 | Phase 5: SP integration | TBD |
| TRIM-01 | Phase 6: Light agent trim (Posture A) | TBD |
| TRIM-02 | Phase 6: Light agent trim (Posture A) | TBD |
| TRIM-03 | Phase 6: Light agent trim (Posture A) | TBD |
| TRIM-04 | Phase 6: Light agent trim (Posture A) | TBD |
| XCUT-01 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| XCUT-02 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |
| XCUT-03 | Phase 2: Critic refactor (with commit-0 spike) | TBD |
| XCUT-04 | Phase 6: Light agent trim (Posture A) | TBD |
| XCUT-05 | Phase 1: Cull (with Wave 0 test infrastructure) | TBD |

**Coverage:** 63 of 63 v1 requirements mapped (100%). No orphans, no duplicates.

**Per-phase counts:**

| Phase | Requirement count | REQ-IDs |
|---|---|---|
| Phase 1: Cull (with Wave 0 test infrastructure) | 16 | TEST-01..05, CULL-01..08, XCUT-01, XCUT-02, XCUT-05 |
| Phase 2: Critic refactor (with commit-0 spike) | 11 | CRIT-01..10, XCUT-03 |
| Phase 3: Plan-phase chain merge | 5 | PLAN-01..05 |
| Phase 4: TDD hardening (3 layers) | 13 | TDD-01..13 |
| Phase 5: SP integration | 13 | SP-01..13 |
| Phase 6: Light agent trim (Posture A) | 5 | TRIM-01..04, XCUT-04 |

**Note on cross-cutting (XCUT) requirements:** While the *concerns* of XCUT-01 (per-phase git tags), XCUT-02 (per-phase Bazel test_tag_filters), XCUT-03 (walltime ledger), and XCUT-05 (per-phase test inventory) are applied across every phase as exit gates, each requirement is **owned by** the phase that first builds the infrastructure. XCUT-04 (walltime trend test) is owned by Phase 6 because it requires accumulated ledger data from prior phases to be meaningful. Subsequent phases consume the infrastructure but do not re-implement it.

---

**Last updated:** 2026-04-29 after roadmap creation (traceability filled by gsd-roadmapper)

---

## Future Requirements (Phase 7+, deferred)

- **Multi-runtime install verification for `agents/_shared/`** — Phase 2's
  `tests/install-shared-dir.test.cjs` covers the Claude runtime only.
  Verifying that `bin/install.js` correctly copies and manifests the shared
  agent fragments under all 11 supported runtimes (Codex, Cursor, Cline,
  Windsurf, Augment, Gemini, OpenCode, Kilo, Antigravity, Trae, Qwen) is
  deferred per Phase 2 RESEARCH §Open-Q-4. See 02-REVIEWS.md §H3
  (scope-H-002) for the tracking record. (Appended 2026-05-04 by Plan 02-03.)
