# GSD Slim + SP Integration + TDD Hardening

## What This Is

A coordinated trim-and-integrate pass on the Get Shit Done (GSD) meta-prompting system itself. GSD has accumulated significant surface area — 93 commands, 39 agents, ~16k lines of agent prompts — leading to context bloat and per-invocation slowness. This project culls the surface to ~37 commands and ~21 agents, optimizes the surviving command spine for fewer sequential hops and smaller prompts, integrates Superpowers (SP) brainstorming as a first-class on-ramp into milestone/phase creation, and hardens TDD with three layers of enforcement (executor prompt + plan-checker structural validation + pre-commit hook).

## Core Value

GSD's discuss → plan → execute → verify spine is fast, disciplined, and seamlessly fed by SP brainstorming. If everything else fails, that core flow must run faster, force real test-first discipline, and accept a brainstorm spec as a first-class input.

## Requirements

### Validated

<!-- Inherited from GSD itself — the brownfield baseline these requirements build on. -->

- ✓ Orchestrator-agent architecture with multi-stage execution pipeline — existing
- ✓ Thin orchestrator + specialized subagent pattern across all workflows — existing
- ✓ Atomic git commits per task — existing
- ✓ Markdown + YAML frontmatter for all planning artifacts — existing
- ✓ All state mutations go through `gsd-tools.cjs` — existing
- ✓ Multi-user monorepo support with per-user planning roots — existing (v1.0)
- ✓ Codebase mapping subsystem (`.planning/codebase/`) — existing
- ✓ Mistake registry + taste library subsystems — existing
- ✓ Bazel + integration test harnesses (248 static + 3-tier integration including live Claude API tests) — existing
- ✓ SP brainstorming skill produces design docs at `docs/superpowers/specs/` — existing (SP plugin)
- ✓ SP `test-driven-development` skill with iron-law red→green→refactor — existing (SP plugin)

### Active

<!-- Six must-haves from the design spec. Each maps to one phase. -->

- [ ] **Cull and consolidate surface area.** Delete 49 commands outright + consolidate 8 into 2 (`/gsd-review`, `/gsd-phase`). Delete 17 agents outright. Net: 93 → ~37 commands, 39 → ~22 agents at end of Phase 1.
- [ ] **Critic refactor.** Extract shared base into `agents/_shared/critic-base.md` (~200 lines); each critic shrinks to a 50–80-line lens addendum. All 6 critics fire as a single parallel batch. Net: 1,731 → ~600 lines.
- [ ] **Plan-phase chain merge.** Merge `gsd-research-synthesizer` into `gsd-planner`; parallelize `pattern-mapper` + `phase-researcher`. Net: 1 fewer agent, 1 fewer hop.
- [ ] **TDD hardening with layered enforcement.** Layer 1 — executor invokes SP TDD skill + GSD anti-mock/anti-skip rules. Layer 2 — plan-checker rejects plans whose implementation tasks lack a "RED test first" sub-step. Layer 3 — pre-commit hook (`hooks/tdd-gate.sh`) rejects untested-source commits, `*.skip` patterns, and unannotated internal-module mocks.
- [ ] **SP↔GSD integration.** All three GSD entry points (`/gsd-new-milestone`, `/gsd-phase add`, `/gsd-discuss-phase`) accept `--from-spec <path>` and consume brainstorm output appropriately. Brainstorm recommends the right next GSD command at the end of its dialogue when `.planning/` is detected in the repo. Discuss-phase skips questions already answered by the spec.
- [ ] **Light agent prompt trim (Posture A).** For each surviving spine agent, cut stale references, duplicated section headers, repeated examples, dead `.planning/` paths. Extract patterns appearing in 3+ agents to `agents/_shared/agent-conventions.md`. Target: 10–15% per-agent reduction with no behavior drift.

### Out of Scope

<!-- Explicit boundaries from the design spec. -->

- ~~Aggressive agent rewrite (Posture B/C)~~ — deferred to a future measurement-driven phase. Posture A first; escalate only if evidence demands it.
- ~~Critic conditional-spawn (only run relevant critics per artifact type)~~ — deferred. Parallelization may eliminate the need.
- ~~TDD coverage thresholds and mutation testing~~ — let plan-phase derive coverage requirements per phase, not as a project-wide gate.
- ~~Bidirectional GSD↔SP planning~~ — only SP→GSD direction is in scope. SP-side `writing-plans` for non-GSD repos remains unchanged.
- ~~Auto-running the recommended GSD command from brainstorm~~ — too fragile if scope is misjudged. User runs the recommendation manually.
- ~~Forking the SP brainstorming skill~~ — using a project-local addendum instead, conditional on `.planning/` detection.
- ~~Any feature work in GSD beyond the four concerns above~~ — explicitly excluded to keep the project bounded.

## Context

GSD is the meta-prompting system installed in this repo (and in the user's `~/.claude/`). It uses an orchestrator-agent architecture: thin orchestrators coordinate work, specialized subagents do the heavy lifting in fresh 200k context windows. The user has accumulated four concerns over time:

1. **Bloat.** 93 commands and 39 agents mean cognitive load when picking the right command and context-window load when invoking any agent (gsd-debugger alone is 1,453 lines, gsd-planner is 1,252).
2. **Sequential hop tax.** Multi-stage workflows like `/gsd-plan-phase` chain 5+ agents serially. The user feels this as "I asked for a plan and Claude went away for 10 minutes."
3. **TDD drift.** Agents reach for `it.skip` and defensive mocks instead of writing real tests; agents write implementation first and tests after. The Nyquist auditor catches gaps post-hoc, not as a blocking gate.
4. **SP/GSD friction.** The user prefers SP's brainstorming for fuzzy ideation but GSD's research/plan/execute/verify spine for the rigorous part. Currently they have to mentally bridge between the two systems.

The brainstormed design at `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` (committed in `f1b3e7ae`) addresses all four with six concrete implementation phases.

### Test infrastructure baseline

The repo has substantial existing test infrastructure that this project will lean on heavily:

- **248 static/unit tests** in `tests/` (Bazel `js_test`), covering installer, agent frontmatter, hook guards, command validation
- **Three integration tiers** in `integration/`:
  - Fast (no API): fork-preservation, gsd-tools-workflow, multi-user-resolution
  - Moderate (real Claude API, single skill): `skill-execution.test.cjs`
  - Enormous (full lifecycle): `gsd-lifecycle.test.cjs` runs new-project → discuss → plan → execute → verify end-to-end
- **Live runner**: `integration/helpers/claude-runner.cjs` invokes real Claude CLI with `--dangerously-skip-permissions`

Each phase ships with both static and live tests; live test cost is not a budget constraint per user instruction.

## Constraints

- **Tech stack**: Pure Node.js built-ins (no runtime dependencies in installed code), JS for tests, shell for hooks. Bazel for the test build graph. Markdown + YAML frontmatter for planning artifacts.
- **Compatibility**: Existing GSD installs in user repos must not break catastrophically when a fresh GSD update lands. TDD gate hook defaults to `warn` mode for retrofits, `strict` for fresh installs.
- **SP plugin boundary**: The SP brainstorming skill lives in `~/.claude/plugins/cache/claude-plugins-official/superpowers/`. We do not fork it. SP-aware behavior is implemented as a project-local addendum that activates conditionally on `.planning/` detection.
- **Behavior parity**: For each refactored agent (critic shared-base, planner with merged synthesis, trimmed spine agents), behavior parity must be verified against a fixture before merging. ≥85% finding overlap by severity-bucketed key for critics; structural equivalence for plans.
- **Live test cost**: Not a constraint per user instruction. Phases run live tests freely as part of exit criteria.

## Key Decisions

<!-- Locked decisions from the brainstorm dialogue. Add new ones as the project progresses. -->

| Decision | Rationale | Outcome |
|---|---|---|
| One umbrella spec covering all four concerns (cull + speed + TDD + SP integration) | User chose this in brainstorm Q "scope and decomposition" — the four concerns share affected surface and decisions ripple across them | — Pending |
| SP brainstorm PRECEDES discuss-phase (option B) | Brainstorm explores fuzzy intent; discuss-phase tightens into structured CONTEXT.md. Two-stage pre-planning preserves the rigor user values in GSD | — Pending |
| Keep all 6 critics; optimize via parallelization + shared base prompt | User said critics are "critical" — speed comes from how they run, not which run | — Pending |
| Plan-phase chain Option B (merge synthesizer into planner, parallelize pattern-mapper + researcher) | Sweet spot — kills one hop, planner growth manageable, plan-checker stays as fresh-eyes review | — Pending |
| TDD enforcement = three layers (Option C) | Single layer too easy for agent to defeat. Prompt + structural plan validation + hook backstop = three independent gates | — Pending |
| Brainstorm → GSD via `--from-spec` flag on three commands (Option B from Q9) | Brainstorm recommends one of three; user runs it. Auto-chaining too fragile if scope is misjudged | — Pending |
| Light agent trim (Posture A) first | Conservative; measure results before escalating to Posture B/C | — Pending |
| Live test cost is not a budget constraint | User explicit instruction during testing strategy | — Pending |

## Source

Brainstormed design: `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` (commit `f1b3e7ae`)

---
*Last updated: 2026-04-29 after initialization from spec doc*
