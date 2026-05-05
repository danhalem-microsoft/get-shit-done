# Phase 1: Cull (with Wave 0 test infrastructure) — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** Synthesized from PROJECT.md, ROADMAP.md Phase 1 section, REQUIREMENTS.md (16 REQ-IDs), and the locked design spec at `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` (commit `f1b3e7ae`). Wave 0 additions are research-mandated by `.planning/users/dan-halem/gsd-slim-and-integrate/research/SUMMARY.md`. PRD-equivalent context — discuss-phase skipped because all decisions were locked during the SP brainstorm dialogue.

<domain>
## Phase Boundary

This phase delivers GSD's surface-area cull plus the parity infrastructure that every subsequent phase depends on. Two waves run in strict order:

**Wave 0 (research-mandated, lands BEFORE any cull):**
- Orphan-reference grep test (`tests/cull-no-orphan-references.test.cjs`) wired to a static deletion-list data fixture, scanning all 6 syntactic contexts (`@`-references, slash mentions, `install-manifest.json`, workflow markdown, frontmatter, fixture files) across `agents/`, `commands/`, `get-shit-done/workflows/`, `get-shit-done/templates/`, `tests/`, `integration/`, `docs/`.
- `runAgentParity(agentName, fixtureInput, schema, opts)` helper at `integration/helpers/agent-parity.cjs` supporting three schema kinds: `critic-findings` (≥85% finding overlap by severity-bucketed key, `noMissingCritical: true`), `plan-structural` (task-count tolerance ±10%, must-have set equality, isomorphic dependency graph, `redStepRequired: true`), `schema-conformance` (per-agent schema validation).
- Pre-refactor agent baseline corpus at `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` for every agent that will be refactored: 6 critics, planner, every spine agent that Phase 6 will trim (planner, plan-checker, phase-researcher, verifier, executor, project-researcher, roadmapper, code-reviewer, code-fixer, integration-checker, security-auditor, assumptions-analyzer, advisor-researcher, pattern-mapper, user-profiler). Captured against canonical fixture inputs and committed in a single named commit: `chore: capture pre-refactor agent baselines for parity testing`.
- Lifecycle test step decomposition: `integration/gsd-lifecycle.test.cjs` becomes a thin composer; per-step files live at `integration/lifecycle-steps/step-N-<name>.cjs`; pipeline shape captured at `integration/test-fixtures/lifecycle-shapes/*.json`.
- Baseline staleness static guard (`tests/parity-baselines-stale.test.cjs`) failing if any baseline JSON is older than 90 days without an explicit `staleness_acknowledged: <date>` field.

**Wave 1 (cull, gated by Wave 0 passing):**
- Delete the 49 outright-cut commands listed in the design spec.
- Delete the 17 outright-cut agents listed in the design spec.
- Consolidate 6 quality-gate commands → `/gsd-review` with flags `--code`, `--security`, `--coverage`, `--critique`, `--converge`.
- Consolidate 3 phase-manipulation commands → `/gsd-phase` with subcommands `add`, `insert`, `remove`.
- Add deprecation stubs for the 6 consolidated quality-gate commands; each prints a deprecation message and dispatches to the new command. Stubs persist for at least one milestone after Phase 1.
- Update `install-manifest.json` to list exactly 37 surviving commands and 22 surviving agents.
- Update `commands/gsd/help.md` and `CHANGELOG.md` with an explicit migration table (every deleted/consolidated command → replacement, or "removed; use X" for cuts with no consolidation target).
- Reference-rot fix: orphan-reference test passes (i.e., scan and remove every reference to a deleted name from surviving prompts/workflows/fixtures).
- Update `gsd-lifecycle.test.cjs` (now decomposed) to run against the post-cull spine; full live lifecycle passes end-to-end.
- Tag exit: `gsd-slim-phase-1-cull` created only after both `bazel test //tests/...` and `bazel test //integration/... --test_tag_filters=phase-1-cull` pass.

**Explicitly NOT in this phase:**
- Critic refactor (lens-addendum extraction, parallel critic batch). → Phase 2.
- Synthesizer merge into planner. → Phase 3.
- Plan-phase chain merge / parallel pattern-mapper + phase-researcher. → Phase 3.
- TDD layered enforcement (executor prompt rules, plan-checker structural rule, `hooks/tdd-gate.sh`). → Phase 4. Plans authored in this phase will not yet emit RED-test sub-steps; that requirement starts in Phase 4.
- `--from-spec` flag, `lib/spec-reader.cjs`, brainstorm addendum. → Phase 5.
- Light agent prompt trim. → Phase 6.
- `gsd-research-synthesizer` survives Phase 1 untouched (it is merged-then-deleted in Phase 3); its baseline IS captured here so Phase 3 has something to compare against.

</domain>

<decisions>
## Implementation Decisions

All decisions below are LOCKED (sourced from the brainstorm dialogue captured in `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` and reinforced by `.planning/users/dan-halem/gsd-slim-and-integrate/research/SUMMARY.md`). Plans should treat these as constraints, not options.

### Deletion list (commands)

The following 49 commands are deleted outright in Wave 1. Counts in parentheses:

```
audit/diagnostic (9):     audit-fix, audit-uat, forensics, health, stats, scan, intel,
                          map-codebase, graphify
specialty phases (8):     ai-integration-phase, ui-phase, ui-review, eval-review, spike,
                          sketch, spike-wrap-up, sketch-wrap-up
debug/explore (2):        debug, explore
idea capture (5):         note, plant-seed, add-backlog, thread, review-backlog
milestone extras (5):     audit-milestone, plan-milestone-gaps, milestone-summary,
                          archive-project, restore-project
git/PR extras (4):        ship, undo, inbox, review
process control (6):      manager, autonomous, fast, do, next, session-report
phase manip extras (4):   spec-phase, import, ultraplan-phase, list-phase-assumptions
docs (2):                 docs-update, ingest-docs
misc (4):                 from-gsd2, add-tests, analyze-dependencies, cleanup
```

Note: `add-tests` is removed because it generates tests *after* implementation, which is incompatible with the TDD hardening landing in Phase 4 (RED test must come *before* implementation). The functional need it served is replaced in Phase 4 by Layer 1 (executor writes tests first) and Layer 3 (hook rejects untested-source commits). This phase does NOT yet deliver that replacement — but `add-tests` is still deleted now to keep the deletion atomic. Document in `commands/gsd/help.md` migration table that `add-tests` has no direct replacement; users should rely on the TDD discipline arriving in Phase 4.

### Consolidation list (commands)

8 commands → 2 consolidated commands:

| New command | Subcommand/flag | Replaces |
|---|---|---|
| `/gsd-review` | `--code` | `/gsd-code-review` |
| `/gsd-review` | `--code-fix` (or equivalent) | `/gsd-code-review-fix` |
| `/gsd-review` | `--security` | `/gsd-secure-phase` |
| `/gsd-review` | `--coverage` | `/gsd-validate-phase` |
| `/gsd-review` | `--critique` | `/gsd-critique` |
| `/gsd-review` | `--converge` | `/gsd-plan-review-convergence` |
| `/gsd-phase` | `add` | `/gsd-add-phase` |
| `/gsd-phase` | `insert` | `/gsd-insert-phase` |
| `/gsd-phase` | `remove` | `/gsd-remove-phase` |

Note that `code-review-fix` is one of the six deprecated quality-gate commands referenced in CULL-05; preserve a deprecation stub for it as well. The consolidated dispatch reaches the same workflow each former command pointed at — this is a pure entry-point unification, not a logic rewrite.

### Deletion list (agents)

The following 17 agents are deleted outright in Wave 1:

```
gsd-debugger, gsd-debug-session-manager                                       (2)
gsd-doc-writer, gsd-doc-classifier, gsd-doc-synthesizer, gsd-doc-verifier     (4)
gsd-domain-researcher, gsd-eval-auditor, gsd-eval-planner,
  gsd-framework-selector, gsd-ai-researcher                                   (5)
gsd-ui-auditor, gsd-ui-checker, gsd-ui-researcher                             (3)
gsd-codebase-mapper, gsd-intel-updater                                        (2)
gsd-nyquist-auditor                                                           (1)
```

`gsd-research-synthesizer` is NOT deleted in Phase 1 — it is merged-then-deleted in Phase 3.

### Surviving agents (post-Phase-1, count = 22)

Spine: `pattern-mapper`, `phase-researcher`, `planner`, `plan-checker`, `executor`, `verifier`, `assumptions-analyzer`, `advisor-researcher`, `research-synthesizer` (alive at end of Phase 1; merged in Phase 3).
Project lifecycle: `roadmapper`, `project-researcher`.
Quality (under `/gsd-review`): `code-reviewer`, `code-fixer`, `security-auditor`, `integration-checker`.
Critics: `critic-plan`, `critic-code`, `critic-scope`, `critic-verify`, `critic-discuss`, `critic-strategy` (refactored in Phase 2, not Phase 1).
Misc: `user-profiler`.

### Deprecation stub semantics

For each of the 6 consolidated quality-gate commands (`/gsd-secure-phase`, `/gsd-validate-phase`, `/gsd-code-review`, `/gsd-code-review-fix`, `/gsd-critique`, `/gsd-plan-review-convergence`):

- The command file remains in the codebase as a stub.
- Stub prints a clear deprecation message naming the new command and the equivalent flag (e.g., "`/gsd-secure-phase` is deprecated; use `/gsd-review --security`").
- Stub then dispatches to the new command, preserving any arguments the user passed.
- Stub stays for at least one milestone (per CULL-05). Removal is a future-milestone decision, not this phase.

The 3 consolidated phase-manipulation commands (`/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-remove-phase`) are NOT covered by CULL-05's stub requirement. Their consolidation is verified by CULL-04 (`/gsd-phase add|insert|remove` dispatches correctly) and they may be deleted outright if the orchestrator design supports it; if not, follow the same stub pattern for consistency.

### Wave 0 scope and capture rules

- **Orphan-reference test data fixture format.** The deletion list is a static JSON or JS data fixture (e.g., `tests/fixtures/cull-deletion-list.cjs`) listing every deleted command name and every deleted agent name. The test reads this fixture and `grep -rE` scans for matches across the 6 syntactic contexts. Plans should specify the fixture file path and the exact 6 contexts to scan.
- **`runAgentParity` signature.** Mirrors the existing `runClaudeWithTools` pattern: `runAgentParity(agentName, fixtureInput, schema, opts) → ParityResult`. Three schema kinds, one for each refactor pattern arriving in later phases. Implementation must use **N=5 median** for live runs (per research SUMMARY.md), severity-stratified thresholds, and shape-aware comparison; baseline runs are recorded once and frozen.
- **Baseline-corpus capture commit.** Single commit, exact title: `chore: capture pre-refactor agent baselines for parity testing`. Fixture inputs for each agent are defined alongside the helper at `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json`; outputs land at `integration/test-fixtures/baselines/<agent>/<fixture-id>.json`. Baselines are read-only after this commit; refresh requires deliberate action gated by TEST-05.
- **Lifecycle step decomposition.** `integration/gsd-lifecycle.test.cjs` is the thin composer; per-step files at `integration/lifecycle-steps/step-N-<name>.cjs`; JSON shape fixtures at `integration/test-fixtures/lifecycle-shapes/*.json`. The composer is the only file that orchestrates step ordering. Steps map 1:1 to `discuss-phase`, `plan-phase`, `execute-phase`, `verify-work` (and any sub-steps the post-cull spine still requires).

### Test infrastructure choices

- **Static tests live in `tests/` (Bazel `js_test` rules).** New static tests for this phase: `tests/cull-no-orphan-references.test.cjs`, `tests/parity-baselines-stale.test.cjs`, `tests/install-manifest-matches-surviving.test.cjs` (asserts manifest lists exactly 37 commands + 22 agents), `tests/consolidated-review-flags.test.cjs` (asserts `/gsd-review` accepts the 5 flags + legacy command files removed or stubbed), `tests/consolidated-phase-subcommands.test.cjs` (asserts `/gsd-phase` accepts `add|insert|remove`).
- **Live tests live in `integration/` and use real Claude API.** Cost is NOT a budget constraint per user instruction. Live tests that this phase must add: an updated `gsd-lifecycle.test.cjs` running the post-cull spine end-to-end, plus individual smoke tests for each spine command (`/gsd-progress`, `/gsd-discuss-phase`, `/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-verify-work`) on a fixture project.
- **Per-phase test inventory in PLAN.md.** Per XCUT-05, the PLAN.md (or PLANs) for this phase MUST contain a test inventory section mapping each new test file to the REQ-IDs it verifies. Roughly 6-8 tests per phase. This is a hard requirement, not a nice-to-have.
- **Bazel test_tag_filters.** Tag every new live test in this phase with `phase-1-cull`; the BUILD.bazel targets for these tests must include the tag so `bazel test //integration/... --test_tag_filters=phase-1-cull` scopes correctly (XCUT-02). Existing static `tests/` continue to run under the standard `bazel test //tests/...` invocation.
- **Walltime ledger format.** Each live test invocation appends one JSONL entry to `integration/test-fixtures/walltime-ledger.jsonl`: `{ date, test, walltime_ms, cost_usd, phase: 'phase-1-cull' }`. Phase 1 sets up the ledger file (creating it if absent) and the writer mechanism; the `walltime-trend.test.cjs` consumer is owned by Phase 6 (XCUT-04). XCUT-03's primary owner is Phase 2, but this phase MUST set up the ledger so Phase 2 has something to append to.

### Sequencing within Phase 1

Wave 0 → Wave 1 ordering is hard. The plans MUST be sequenced so:

1. Orphan-reference test infrastructure exists FIRST (test file + deletion-list fixture, even if the fixture is initially empty or contains the planned deletions but no deletions have been performed yet).
2. `runAgentParity` helper + baseline corpus committed BEFORE any agent file is touched (refactored or deleted). The baseline-capture commit is its own atomic step.
3. Lifecycle step decomposition can land in parallel with #1-#2 (no agent-file dependency) but BEFORE Wave 1 starts, because the post-cull lifecycle update happens in Wave 1.
4. Cull commits (Wave 1) per command/agent group for easy revert. Group boundaries should be the categories in the deletion list (e.g., one commit for the 9 audit/diagnostic commands, one for the 8 specialty phases, etc.). Each cull commit must leave the orphan-reference test green and the lifecycle test green.
5. Consolidated commands (`/gsd-review`, `/gsd-phase`) are added BEFORE the deprecation stubs, so the stubs have something to dispatch to.
6. Manifest update (`install-manifest.json`) lands in the same commit as the corresponding deletion(s) or in an immediately-following commit; the manifest test (`install-manifest-matches-surviving`) gates the wave.
7. Final Wave 1 commit updates `gsd-lifecycle.test.cjs` (the composer) to use the post-cull spine and re-runs the full live lifecycle.

### Reference rot scan boundaries

The orphan-reference test scans these 6 syntactic contexts:

1. `@`-references: any `@<path>` or `@$HOME/...` reference whose path resolves to a deleted file.
2. Slash mentions: any `/<command-name>` reference in markdown or docs.
3. `install-manifest.json`: any entry pointing to a deleted command/agent file.
4. Workflow markdown: any cross-reference between workflow `.md` files in `get-shit-done/workflows/`.
5. Frontmatter: any YAML frontmatter `agents:` or `commands:` array entries naming deleted items.
6. Fixture files: any test fixture under `tests/fixtures/` or `integration/test-fixtures/` referencing deleted names.

Scan roots: `agents/`, `commands/`, `get-shit-done/workflows/`, `get-shit-done/templates/`, `tests/`, `integration/`, `docs/`. The deletion-list fixture is the source of truth; the test fails loudly if any deleted name appears in any scan root in any of the 6 contexts.

### Disambiguations locked after plan-checker review (2026-04-29)

The plan-checker surfaced four ambiguities. Each is locked here so plans treat them as constraints, not interpretations.

**D-01 — `/gsd-review` name reuse is a redefinition, not a deletion-then-recreation conflict.** The OLD `/gsd-review` (in the git/PR-extras deletion category) and the NEW consolidated `/gsd-review` share a name but are different commands. The orphan-reference test MUST NOT flag legitimate references to the NEW `/gsd-review` as orphans. Concrete rule: `tests/fixtures/cull-deletion-list.cjs` excludes `review` from the slash-mention scan portion (the `slashMentionExcludes` array, or equivalent), while still listing `review` for the file-deletion check (the OLD `commands/gsd/review.md` IS removed and any pre-existing references to its old behavior must be cleaned up). The same applies to `phase` if the consolidation reuses the `gsd-phase` name (it does — `/gsd-phase add|insert|remove` consolidates `add-phase|insert-phase|remove-phase`; `phase` was NOT in the deletion list so this is moot, but the rule is the same: ALLOW_LIST `commands/gsd/phase.md` and `get-shit-done/workflows/phase.md` since they contain `/gsd-phase` references). Migration table rows for OLD `/gsd-review` are explicitly worded "Removed (the old `/gsd-review` git/PR helper; the new `/gsd-review` is the consolidated quality-gate review entry point — different functionality, same name)."

**D-02 — CULL-01 and ROADMAP success criterion 5 are amended to count user-facing commands only.** Filesystem reality: 37 user-facing commands + 6 deprecation stubs = 43 `.md` files in `commands/gsd/`. CULL-01 reads "exactly 37 surviving commands" but is now interpreted as "exactly 37 surviving USER-FACING commands as listed in `docs/INVENTORY.md`." Stubs are NOT counted as commands for inventory purposes; they are deprecation entries. `docs/INVENTORY.md` lists exactly 37 commands. The filesystem may have additional `.md` files that are stubs (per CULL-05's stub-persistence rule). The static test for CULL-01/CULL-08 asserts: (a) `docs/INVENTORY.md` lists 37 commands and 22 agents, (b) the union of files in `commands/gsd/` matches the inventory list PLUS exactly 6 stubs whose filenames match the consolidated quality-gate list. ROADMAP.md success criterion 5's wording ("find exactly 37 commands and 22 agents listed") is honored by `docs/INVENTORY.md` — the canonical roster file. `install-manifest.json` (the copy-rule manifest, NOT the inventory list, per RESEARCH.md §2.5) does not need to enforce this count.

**D-03 — Baseline corpus is exactly 22 unique agents × 1 canonical fixture each = 22 baseline pairs in Phase 1.** The 23-vs-22 inconsistency in earlier plan iterations is resolved: 22. Per-mode fixture multiplication (e.g., planner standard / gap-closure / reviews) is deferred — Phase 3's plan-merge parity test (which is the consumer of the planner baseline) only needs ONE planner baseline because plan-merge parity is structural-equivalence on a single fixture phase, not multi-mode coverage. Plan 04's `_meta.json` has `agent_count: 22`, `fixture_count: 22`, and the agents array contains exactly 22 entries: 6 critics (`critic-plan`, `critic-code`, `critic-scope`, `critic-verify`, `critic-discuss`, `critic-strategy`) + `planner` + `research-synthesizer` + 14 spine agents (`pattern-mapper`, `phase-researcher`, `plan-checker`, `verifier`, `executor`, `project-researcher`, `roadmapper`, `code-reviewer`, `code-fixer`, `integration-checker`, `security-auditor`, `assumptions-analyzer`, `advisor-researcher`, `user-profiler`).

**D-04 — Per-test concurrency contract for new static tests.** Every new static test in this phase MUST use only `fs.readFileSync` (read-only) and own-scope local variables. NO inter-test state. NO `process.chdir`. NO mutation of shared in-memory caches. This is enforced as a constraint on plan authors (Plans 01, 02, 05, 07, 08, 09 test tasks) and verified at phase exit by `TEST_CONCURRENCY=8 npm test` (Plan 09 checkpoint Task 4 acceptance criterion).

### Claude's Discretion

The following are NOT specified in source artifacts; the planner may choose freely (with brief rationale documented in PLAN.md):

- Plan/wave decomposition within Phase 1 (one big plan vs multiple smaller plans). The 7-step sequencing above defines the dependency graph, but how to split that across PLAN.md files is the planner's call. Recommendation from the spec is "commit per command/agent group for easy revert" — applies at execution granularity, not necessarily at plan-file granularity.
- Concrete file paths for new test files (within the conventions: `tests/<name>.test.cjs`, `integration/<name>.test.cjs`).
- Internal organization of the consolidated command files (`/gsd-review` and `/gsd-phase`) — flag-dispatch vs subcommand-dispatch implementation is the planner's call as long as the user-facing surface matches CULL-03 and CULL-04.
- Exact deprecation message wording in the 6 stubs (must include the new command name and explain the consolidation, but exact text is the planner's call).
- Whether to use `bin/install.js` updates as part of Phase 1 or only the manifest itself (the manifest update IS required; install.js updates may or may not be needed depending on how the installer resolves manifest entries — the planner should verify and decide).
- How to thread the walltime ledger writer (could be a small helper in `integration/helpers/`, could be inlined in the `claude-runner.cjs` wrapper — planner's call).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs and requirements

- `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` — Complete locked design spec (435 lines). Phase 1 sections: "Phase 1 — Cull (foundation)" (Phase breakdown), "Phase 1 — Cull tests" (Testing strategy). Must-have 1 (Cull list) is the canonical deletion + consolidation list.
- `.planning/users/dan-halem/gsd-slim-and-integrate/PROJECT.md` — Locked decisions table (8 decisions), constraints, key context. Brownfield baseline (validated requirements) lists what already exists.
- `.planning/users/dan-halem/gsd-slim-and-integrate/ROADMAP.md` — Phase 1 entry with full goal text, dependencies (Nothing), and 5 success criteria with file paths and exact commands. Phases 2-6 entries provide downstream context for what Phase 1 baselines must support.
- `.planning/users/dan-halem/gsd-slim-and-integrate/REQUIREMENTS.md` — All 63 requirements; Phase 1 owns 16: TEST-01..05, CULL-01..08, XCUT-01, XCUT-02, XCUT-05.

### Project research (already produced — read for grounding, do NOT re-derive)

- `.planning/users/dan-halem/gsd-slim-and-integrate/research/SUMMARY.md` — Executive summary of all research; surfaces Wave 0 mandates, parity threshold rationale, parallel-Task hallucination bug mitigation, three parity-measure schemas, test-tag taxonomy.
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/PITFALLS.md` — 100k chars; Pitfall 1.1-1.4 cover Phase 1 risks (reference rot, agent-not-found degradation, consolidation hides functionality, parity-baseline unrecoverability).
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/TESTING.md` — Five test-layer model, parity infrastructure design, hook test discipline (synthetic staged-diff fixtures, not real `git commit`).
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/ARCHITECTURE.md` — Surface-area patterns across the 2026 dev-tool ecosystem; calibrates the cull target (~37 lands GSD in the Aider band).
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/FEATURES.md` — Field-validated table-stakes features that informed REQUIREMENTS.md.

### Existing GSD codebase landmarks (planner needs file paths)

- `install-manifest.json` (project root) — Source of truth for installed commands and agents. Phase 1 must update this to list 37 commands and 22 agents.
- `bin/install.js` — Installer entry point. May need updates if the manifest format/resolution changes; usually just consumes the manifest.
- `commands/gsd/help.md` — User-facing help / migration table goes here.
- `CHANGELOG.md` (project root) — Migration table mirror lives here.
- `agents/` (project root) — All agent prompt files. 17 files deleted in Wave 1; baseline corpus captured for survivors before deletion.
- `commands/gsd/` — All slash-command files. 49 deleted, 9 consolidated into 2.
- `get-shit-done/workflows/` — Workflow markdown referenced by orchestrators. Reference rot scan must include this.
- `get-shit-done/templates/` — Template files referenced by workflows. Reference rot scan must include this.
- `tests/` — Bazel-driven static tests. New tests live here.
- `tests/BUILD.bazel` — Bazel test targets for `tests/`. Update as new tests are added.
- `integration/` — Live integration tests; existing helpers in `integration/helpers/` (e.g., `claude-runner.cjs`).
- `integration/BUILD.bazel` — Bazel test targets for live tests with `test_tag_filters` support. New `phase-1-cull` tag added here.
- `integration/test-fixtures/` — Existing fixture directory; baselines and lifecycle shapes land here.
- `integration/gsd-lifecycle.test.cjs` — Existing enormous-tier lifecycle test; decomposed into `integration/lifecycle-steps/` in this phase.
- `tests/hook-validation.test.cjs` — Pattern reference for hook test discipline (synthetic fixtures, deterministic invocation). The TDD gate hook tests in Phase 4 will follow this pattern; not used in Phase 1 but the planner should be aware so the lifecycle decomposition aligns with existing testing idioms.

### Cross-phase parity contracts (Phase 1 produces; Phases 2/3/6 consume)

- `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` — Phase 2 critic-parity test reads from `baselines/critic-*/`. Phase 3 plan-phase parity reads from `baselines/planner/` and `baselines/research-synthesizer/`. Phase 6 trim parity reads from `baselines/<spine-agent>/` for every Phase-6-trimmed agent.
- `integration/helpers/agent-parity.cjs` — Phase 2/3/6 consumers all import this helper. Phase 1 owns the design and implementation. Three schema kinds must all be implemented in Phase 1, even though only `critic-findings` is exercised by Phase 2's first parity run; Phase 1 is the only opportunity to design all three coherently.

### External issues referenced

- [anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181) — Parallel-Task hallucination bug. Mentioned for Phase 2 mitigation context; not directly actioned in Phase 1.
- [anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406) — "Claims parallel, executes serial" bug. Same — Phase 2 context.

</canonical_refs>

<specifics>
## Specific Ideas

### Concrete file paths to be created (Phase 1)

**Wave 0 — test infrastructure (lands first):**
- `tests/fixtures/cull-deletion-list.cjs` — static fixture listing all 49 deleted commands + 17 deleted agents (and the 9 consolidated-into-2 entries with their dispatch targets).
- `tests/cull-no-orphan-references.test.cjs` — new static test (TEST-01).
- `tests/parity-baselines-stale.test.cjs` — new static test (TEST-05).
- `tests/install-manifest-matches-surviving.test.cjs` — new static test (CULL-01, CULL-02, CULL-08).
- `tests/consolidated-review-flags.test.cjs` — new static test (CULL-03, CULL-05).
- `tests/consolidated-phase-subcommands.test.cjs` — new static test (CULL-04).
- `integration/helpers/agent-parity.cjs` — new helper module (TEST-02).
- `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json` (multiple files, ~22 agents × N fixtures each — see "Baseline scope" below).
- `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` (the recorded outputs; populated by the baseline-capture commit) (TEST-03).
- `integration/lifecycle-steps/step-1-discuss-phase.cjs` (and step-2/3/4 for plan/execute/verify) — extracted from `gsd-lifecycle.test.cjs` (TEST-04).
- `integration/test-fixtures/lifecycle-shapes/<scenario>.json` — JSON shape fixtures for the lifecycle composer (TEST-04).
- `integration/test-fixtures/walltime-ledger.jsonl` — empty-but-present JSONL file plus the writer wired into `integration/helpers/claude-runner.cjs` (or a new helper). Phase 1 sets up the file and writer; consumers (XCUT-03 dashboards / XCUT-04 trend test) come later.

**Wave 1 — cull artifacts:**
- `commands/gsd/review.md` — new consolidated command file with `--code | --code-fix | --security | --coverage | --critique | --converge` flag handling (CULL-03, CULL-05).
- `commands/gsd/phase.md` — new consolidated command file with `add | insert | remove` subcommand handling (CULL-04).
- 6 deprecation-stub files at `commands/gsd/secure-phase.md`, `commands/gsd/validate-phase.md`, `commands/gsd/code-review.md`, `commands/gsd/code-review-fix.md`, `commands/gsd/critique.md`, `commands/gsd/plan-review-convergence.md` — each prints deprecation message and dispatches.

**Wave 1 — files modified:**
- `install-manifest.json` — Update to list 37 commands + 22 agents; remove all deleted entries; add `review.md` and `phase.md`.
- `commands/gsd/help.md` — Add migration table (CULL-07).
- `CHANGELOG.md` — Add migration table mirror + Phase 1 entry (CULL-07).
- `integration/gsd-lifecycle.test.cjs` — Convert to thin composer; reference `integration/lifecycle-steps/step-N-*.cjs`; update for post-cull spine (TEST-04).
- `integration/BUILD.bazel` — Add `phase-1-cull` tag to all new live tests in this phase (XCUT-02).
- `tests/BUILD.bazel` — Add Bazel targets for the new static tests.
- `bin/install.js` — Update if needed to handle the new manifest shape (likely no change, but verify).

**Wave 1 — files deleted:**
- 49 command files at `commands/gsd/<command>.md` per the deletion list (minus the 6 stubs listed above).
- 17 agent files at `agents/gsd-<agent>.md` per the agent deletion list.
- Any `tests/<deleted-command>-*.test.cjs` files paired with deleted commands (per design spec testing strategy: "Delete tests for cut commands along with their commands").

**Wave 1 — git tag:**
- `gsd-slim-phase-1-cull` — applied at phase exit only after both static and live test suites pass (XCUT-01).

### Baseline scope (TEST-03)

Capture baselines for these agents in Wave 0 (count ≈ 22 agents × 1+ fixture each):

- 6 critics (`critic-plan`, `critic-code`, `critic-scope`, `critic-verify`, `critic-discuss`, `critic-strategy`) — schema: `critic-findings`. Phase 2 consumer.
- `planner` — schema: `plan-structural`. Phase 3 consumer (compare merged-planner output to pre-merge baseline).
- `research-synthesizer` — schema: `schema-conformance`. Phase 3 consumer (synthesizer is being deleted; baseline is for archival/audit, not active comparison).
- 15 spine agents that Phase 6 will trim: `pattern-mapper`, `phase-researcher`, `plan-checker`, `verifier`, `executor`, `project-researcher`, `roadmapper`, `code-reviewer`, `code-fixer`, `integration-checker`, `security-auditor`, `assumptions-analyzer`, `advisor-researcher`, `user-profiler` — schema: `schema-conformance`. Phase 6 consumer. (Note: `planner` already captured above; the union is exactly the 15 listed in PROJECT.md Must-have 6 + 6 critics + research-synthesizer.)

Each agent gets at least one canonical fixture input. Where an agent has multiple distinct invocation modes (e.g., `planner` runs in standard / gap-closure / reviews modes; `executor` runs against different plan shapes), capture one fixture per mode. The fixture inputs themselves should be small, representative, and committed alongside the outputs in the same single commit.

### Test inventory mapping (XCUT-05)

Per-phase test inventory required in PLAN.md:

| Test file | Layer | REQ-IDs verified |
|---|---|---|
| `tests/cull-no-orphan-references.test.cjs` | static | TEST-01 |
| `tests/parity-baselines-stale.test.cjs` | static | TEST-05 |
| `tests/install-manifest-matches-surviving.test.cjs` | static | CULL-01, CULL-02, CULL-08 |
| `tests/consolidated-review-flags.test.cjs` | static | CULL-03, CULL-05 |
| `tests/consolidated-phase-subcommands.test.cjs` | static | CULL-04 |
| `integration/gsd-lifecycle.test.cjs` (decomposed) + `lifecycle-steps/step-N-*.cjs` | live | TEST-04, CULL-06 |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` (corpus) + `agent-parity.cjs` (helper) | live infra | TEST-02, TEST-03 |
| `commands/gsd/help.md` and `CHANGELOG.md` (assertion test) | static (or grep-based) | CULL-07 |

8 test entries total. The PLAN.md must mirror this table (XCUT-05), or a tighter version that the planner derives.

### Concrete dispatch wording for deprecation stubs (suggested, not locked)

```
⚠ DEPRECATED: /gsd-secure-phase has been consolidated into /gsd-review.
  Use: /gsd-review --security <phase-id>
  This stub will be removed after milestone N+1. See CHANGELOG.md for the full migration table.

  Dispatching now...
```

(Apply the same template to all 6 stubs, swapping in the appropriate flag.)

### Sequenced commit groups (Wave 1)

Per the design spec ("Commit per command/agent group for easy revert") and the 7-step sequencing in `<decisions>`:

1. (Wave 0) test infra commits — orphan-reference test + fixtures, parity helper, baseline corpus (single commit), staleness test, lifecycle decomposition.
2. (Wave 1, group 1) Build consolidated `/gsd-review` command file + flag handling. Commit alone.
3. (Wave 1, group 2) Build consolidated `/gsd-phase` command file + subcommand handling. Commit alone.
4. (Wave 1, group 3) Add 6 deprecation stubs for the consolidated quality-gate commands. Commit alone.
5. (Wave 1, groups 4-13) One commit per deletion-list category (audit/diagnostic = 9 commands → 1 commit; specialty phases = 8 → 1 commit; debug/explore = 2 → 1 commit; etc.). Each commit removes those command/agent files AND updates `install-manifest.json` for those entries AND keeps the orphan-reference test green. Sequence is freely orderable except where reference rot crosses categories — the planner should validate and adjust.
6. (Wave 1, group 14) Update `commands/gsd/help.md` and `CHANGELOG.md` migration table.
7. (Wave 1, group 15) Update `integration/gsd-lifecycle.test.cjs` composer to use post-cull spine; full live lifecycle pass.
8. Tag `gsd-slim-phase-1-cull` (only after all static + live tests pass).

</specifics>

<deferred>
## Deferred Ideas

These appear in the design spec or research but are NOT in scope for Phase 1. The planner must NOT include them; they are listed here so it is unambiguous what does not belong.

### Deferred to Phase 2

- Critic refactor (extracting `agents/_shared/critic-base.md`, shrinking each critic to a 50-80 line addendum).
- Parallel critic batch (single-message Task fan-out, walltime test, parallel-Task hallucination mitigation).
- Phase 2 commit-0 spike for `@`-reference resolution in agent prompts.
- 1-of-N critic failure injection.
- Critic parity test using Phase 1 baselines as the contract.

### Deferred to Phase 3

- `gsd-research-synthesizer` merge into `gsd-planner.md` under `<synthesis-step>` anchor (synthesizer survives Phase 1 untouched; baseline IS captured for it in Phase 1).
- Parallel `pattern-mapper` + `phase-researcher` spawn from plan-phase orchestrator.
- Plan-phase chain merge with token-headroom calculation gating Phase 3 exit.
- Plan-phase parity test using Phase 1 planner baseline as the contract.

### Deferred to Phase 4

- TDD layer 1: `gsd-executor.md` invokes SP `test-driven-development` skill + adds `<gsd-tdd-rules>` section.
- TDD layer 1: `gsd-planner.md` emits "RED test first" sub-step in every implementation task. **Important:** Phase 1 plans will NOT include RED sub-steps in their implementation tasks. Plan-checker must not block on this in Phase 1.
- TDD layer 2: `gsd-plan-checker.md` adds `TDD-STRUCTURE` rule rejecting plans without RED sub-steps.
- TDD layer 3: `hooks/tdd-gate.sh` with `strict | warn | off` modes, 30-day warn-mode auto-sunset, CI mirror, synthetic staged-diff fixture tests.
- The functional replacement for the deleted `add-tests` command (covered by Layer 1 + Layer 3 above; not by anything in Phase 1).

### Deferred to Phase 5

- `get-shit-done/bin/lib/spec-reader.cjs` and the `parseSpec` / `toPromptFragment` exports.
- `--from-spec <path>` flag wiring on `/gsd-new-milestone`, `/gsd-phase add`, `/gsd-discuss-phase`.
- `assumptions-analyzer` and `advisor-researcher` gap-skipping when consuming a spec.
- `.planning/SP-BRAINSTORM-ADDENDUM.md` and the `@`-import in project-root `CLAUDE.md`.
- Multi-signal `.planning/` detection (`.planning/` + `config.json` + at least one user dir).
- `.planning/SPEC-CONSUMED.json` provenance recording.
- `## Recommended next step` section emitted by SP brainstorming.
- `gsd-lifecycle.test.cjs` start-from-`/sp brainstorm` update (Phase 1 only updates the lifecycle for the post-cull spine; Phase 5 layers the brainstorm-start update on top).

### Deferred to Phase 6

- Per-agent line-count trim ≥10% against Phase 1 baselines.
- `agents/_shared/agent-conventions.md` with patterns appearing in 3+ agents.
- `agent-trim-parity.test.cjs` consuming Phase 1 baselines.
- `walltime-trend.test.cjs` reading the cumulative ledger.

### Deferred to Phase 7+ (out of milestone scope)

- Critic conditional-spawn (only run relevant critics per artifact type) — measure first.
- Aggressive agent rewrite (Posture B/C) — measurement-driven escalation.
- TDD coverage thresholds and mutation testing.
- Real-world false-positive rate measurement on TDD gate.
- Empirical measurement of critic finding-overlap.
- Forking SP brainstorming skill, bidirectional GSD↔SP planning, auto-running recommended commands, marketplace plugins, mode-based UI, telemetry, in-tool bug tracker, heavy GUI, async/background agent execution, iterative critic-debate loops.

### Specifically excluded from Phase 1 (would be in scope but for sequencing)

- Trimming any surviving agent's line count. Trim is Phase 6 work; Phase 1 only captures baselines.
- Refactoring the critic prompts. Phase 2 only.
- Modifying `gsd-planner.md` or `gsd-research-synthesizer.md`. Phase 3 only.
- Adding any pre-commit hook beyond what the project already has. Phase 4 only.
- Modifying `agents/gsd-executor.md` to invoke SP TDD skill or add `<gsd-tdd-rules>`. Phase 4 only.

</deferred>

---

*Phase: 01-cull-with-wave-0-test-infrastructure*
*Context gathered: 2026-04-29 — synthesized from PROJECT.md + ROADMAP.md + REQUIREMENTS.md + design spec + research/SUMMARY.md (PRD-equivalent path; discuss-phase not run because all decisions were locked during the SP brainstorm dialogue captured in commit f1b3e7ae).*
