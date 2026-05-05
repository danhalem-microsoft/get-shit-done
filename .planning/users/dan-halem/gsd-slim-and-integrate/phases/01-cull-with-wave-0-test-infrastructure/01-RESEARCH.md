# Phase 1: Cull (with Wave 0 test infrastructure) — Research

**Researched:** 2026-04-29
**Domain:** GSD meta-prompting refactor — surface-area cull + parity-test infrastructure on a brownfield Node.js / Bazel / shell repo
**Confidence:** HIGH overall (existing repo patterns are well-documented; project-level research already covered ecosystem and pitfalls; this RESEARCH.md focuses on concrete implementation mechanics that the planner needs to author tasks)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Deletion list (commands, 49):** `audit/diagnostic` (9): audit-fix, audit-uat, forensics, health, stats, scan, intel, map-codebase, graphify; `specialty phases` (8): ai-integration-phase, ui-phase, ui-review, eval-review, spike, sketch, spike-wrap-up, sketch-wrap-up; `debug/explore` (2): debug, explore; `idea capture` (5): note, plant-seed, add-backlog, thread, review-backlog; `milestone extras` (5): audit-milestone, plan-milestone-gaps, milestone-summary, archive-project, restore-project; `git/PR extras` (4): ship, undo, inbox, review; `process control` (6): manager, autonomous, fast, do, next, session-report; `phase manip extras` (4): spec-phase, import, ultraplan-phase, list-phase-assumptions; `docs` (2): docs-update, ingest-docs; `misc` (4): from-gsd2, add-tests, analyze-dependencies, cleanup. **Locked.**
- **Consolidation list (commands, 8 → 2):** `code-review`, `code-review-fix`, `secure-phase`, `validate-phase`, `critique`, `plan-review-convergence` → `/gsd-review --code | --code-fix | --security | --coverage | --critique | --converge`; `add-phase`, `insert-phase`, `remove-phase` → `/gsd-phase add | insert | remove`. **Locked.**
- **Deletion list (agents, 17):** gsd-debugger, gsd-debug-session-manager, gsd-doc-writer, gsd-doc-classifier, gsd-doc-synthesizer, gsd-doc-verifier, gsd-domain-researcher, gsd-eval-auditor, gsd-eval-planner, gsd-framework-selector, gsd-ai-researcher, gsd-ui-auditor, gsd-ui-checker, gsd-ui-researcher, gsd-codebase-mapper, gsd-intel-updater, gsd-nyquist-auditor. **Locked.** `gsd-research-synthesizer` survives Phase 1 untouched (merged-then-deleted in Phase 3); its baseline IS captured here.
- **Surviving counts:** exactly 37 commands + 22 agents at end of Phase 1.
- **Deprecation stub semantics:** the 6 consolidated quality-gate commands (`/gsd-secure-phase`, `/gsd-validate-phase`, `/gsd-code-review`, `/gsd-code-review-fix`, `/gsd-critique`, `/gsd-plan-review-convergence`) keep stub command files that print a deprecation message and dispatch. Stubs persist for at least one milestone.
- **Wave 0 → Wave 1 ordering is hard.** No cull commit lands until orphan-reference test, parity helper, baseline corpus commit, and lifecycle-step decomposition exist on disk.
- **Baseline-capture commit title (exact):** `chore: capture pre-refactor agent baselines for parity testing`. Single atomic commit.
- **`runAgentParity` schemas (locked):** `critic-findings` (≥85% finding overlap by severity-bucketed key, `noMissingCritical: true`), `plan-structural` (task-count ±10%, must-haves set equality, isomorphic dependency graph, `redStepRequired: true`), `schema-conformance` (per-agent schema validation, smoke LLM-as-judge backstop with `maxBudget: 0.5`).
- **Lifecycle decomposition shape (locked):** `integration/gsd-lifecycle.test.cjs` is a thin composer; per-step files at `integration/lifecycle-steps/step-N-<name>.cjs`; pipeline-shape JSON at `integration/test-fixtures/lifecycle-shapes/*.json`.
- **Baseline staleness guard (locked):** static test fails if any baseline JSON is >90 days old without `staleness_acknowledged: <date>` field.
- **Tests: static in `tests/` (Node `node --test`, NOT Bazel), live in `integration/` (Bazel `js_test` with `requires-api-key` tag).**
- **Bazel test_tag_filters:** new live tests in this phase MUST be tagged `phase-1-cull` so `bazel test //integration/... --test_tag_filters=phase-1-cull` scopes correctly.
- **Walltime ledger:** `integration/test-fixtures/walltime-ledger.jsonl`, JSONL of `{ date, test, walltime_ms, cost_usd, phase: 'phase-1-cull' }`. Phase 1 sets up the file + writer; the trend regression test (`tests/walltime-trend.test.cjs`) is owned by Phase 6.
- **Per-phase test inventory:** PLAN.md(s) MUST contain a test inventory section mapping each new test file to the REQ-IDs it verifies. ~6–8 tests for Phase 1. Hard requirement (XCUT-05).
- **No TDD-RED sub-steps in Phase 1 plans.** TDD layer 1 lands in Phase 4. Plan-checker will not block on TDD-STRUCTURE in Phase 1.

### Claude's Discretion

- Plan/wave decomposition within Phase 1 (one big plan vs multiple smaller plans). 7-step sequencing in CONTEXT.md `<decisions>` defines the dependency graph.
- Concrete file paths for new test files (within conventions: `tests/<name>.test.cjs`, `integration/<name>.test.cjs`).
- Internal organization of consolidated `/gsd-review` and `/gsd-phase` files (flag-dispatch vs subcommand-dispatch as long as user-facing surface matches CULL-03 / CULL-04).
- Exact deprecation message wording (must include new command name + explanation).
- Whether to use `bin/install.js` updates as part of Phase 1 or only the manifest itself.
- Where to thread the walltime ledger writer (helper in `integration/helpers/` vs inline in `claude-runner.cjs`).

### Deferred Ideas (OUT OF SCOPE)

- Critic refactor (lens-addendum extraction, parallel critic batch). → Phase 2.
- Synthesizer merge into planner; parallel pattern-mapper + phase-researcher. → Phase 3.
- TDD layered enforcement (executor prompt, plan-checker rule, `hooks/tdd-gate.sh`). → Phase 4. **No RED sub-steps emitted by plans authored in this phase.**
- `--from-spec` flag, `lib/spec-reader.cjs`, brainstorm addendum, multi-signal `.planning/` detection. → Phase 5.
- Light agent prompt trim (≥10% per-agent). → Phase 6.
- Walltime trend regression test (`tests/walltime-trend.test.cjs`). → Phase 6.
- Trimming any surviving agent's line count.
- Refactoring critic prompts.
- Modifying `gsd-planner.md` or `gsd-research-synthesizer.md`.
- Adding pre-commit hooks beyond what already exists.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Static test scans all surviving content for references to deleted commands/agents across 6 syntactic contexts; fails loudly on orphan match. | §1.1 (orphan-reference test mechanics — exact regex per context, scan roots, deletion-list fixture format). |
| TEST-02 | `runAgentParity(agentName, fixtureInput, schema, opts)` helper at `integration/helpers/agent-parity.cjs`. | §1.2 (helper API, three schema kinds, N=5 median, severity-stratified thresholds, walltime ledger integration). |
| TEST-03 | Pre-refactor baseline outputs at `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` for every refactored agent. | §1.3 (baseline corpus capture procedure, fixture inventory by agent + mode, `_meta` schema, single atomic commit). |
| TEST-04 | Lifecycle test decomposed into per-step files; pipeline shape captured in JSON fixtures. | §1.4 (file shape, composer pattern, step interface, lifecycle-shape JSON schema, post-cull mapping). |
| TEST-05 | Static test fails if any baseline JSON >90 days old without `staleness_acknowledged: <date>`. | §1.5 (staleness guard logic, `_meta.staleness_acknowledged` schema, freshness window). |
| CULL-01 | After Phase 1, exactly 37 surviving commands. | §2.5 (manifest update procedure — note: `install-manifest.json` is a copy-rule manifest, NOT a list; surviving counts are enforced by filesystem + `docs/INVENTORY.md`). |
| CULL-02 | After Phase 1, exactly 22 surviving agents. | §2.5 (same as CULL-01). |
| CULL-03 | `/gsd-review --code | --code-fix | --security | --coverage | --critique | --converge` dispatches to correct workflow. | §2.2 (consolidation routing internals — flag-parse-then-route in command frontmatter / Markdown body). |
| CULL-04 | `/gsd-phase add | insert | remove` dispatches to correct subcommand. | §2.3 (subcommand routing internals, contrast with `/gsd-review` flag pattern). |
| CULL-05 | 6 deprecated quality-gate commands print deprecation message + dispatch. | §2.4 (deprecation stub mechanics — markdown-front-matter pattern, message template, dispatch flow). |
| CULL-06 | Full GSD spine completes end-to-end on fixture phase without referencing deleted names. | §1.4 + §3 (post-cull lifecycle update, reference rot landmines must clear). |
| CULL-07 | `commands/gsd/help.md` + `CHANGELOG.md` contain explicit migration table. | §2.6 (migration table format, exact rows per deleted/consolidated command). |
| CULL-08 | `install-manifest.json` lists exactly surviving 37 commands + 22 agents. | §2.5 (**critical correction:** existing `install-manifest.json` is a copy-rule schema; CULL-08 is best satisfied by a filesystem-count + `docs/INVENTORY.md` row-equality test, OR by reshaping the manifest — planner must decide). |
| XCUT-01 | Phase ends with `gsd-slim-phase-1-cull` git tag, only after static + live suites pass. | §4.4 (tag procedure). |
| XCUT-02 | `bazel test //integration/... --test_tag_filters=phase-1-cull` passes. | §4 (Bazel target wiring with new tag). |
| XCUT-05 | Per-phase test inventory in PLAN.md (~6-8 tests). | §4.3 (test inventory mapping table — derived directly here for the planner). |
</phase_requirements>

---

## Summary

Phase 1 has two strict-ordered waves and two genuinely-novel-on-this-codebase concerns: **(a) building parity infrastructure that doesn't exist yet (no `runAgentParity` helper, no baseline corpus, no lifecycle-step decomposition)**, and **(b) executing a 49-command + 17-agent cull cleanly across a brownfield repo where 17+ surviving files reference deleted names**. Project-level research (`research/SUMMARY.md`, `research/PITFALLS.md`, `research/TESTING.md`) already covered ecosystem patterns and high-level pitfalls; this RESEARCH.md focuses on the concrete implementation mechanics — exact regexes, file shapes, fixture inventories, dispatch idioms, sequencing risks — the planner needs to author tasks.

**Two course-correcting findings the design spec missed:**

1. **`install-manifest.json` is a copy-rule manifest, not a list of installed commands/agents.** [VERIFIED: read `install-manifest.json` lines 1–55] Its `sources.commands` entry is a single `{src, dest, type: copy-with-path-replacement}` rule that copies *everything* in `commands/gsd/`. CULL-08 cannot be satisfied by editing `install-manifest.json` alone. The pragmatic test is an inventory-equality check: `docs/INVENTORY.md` lists exactly 37 commands + 22 agents AND the filesystem matches AND no orphan rows remain. The existing `tests/inventory-counts.test.cjs` and `tests/agents-doc-parity.test.cjs` tests already enforce this pattern; Phase 1 just needs to update INVENTORY.md and let those tests fail loudly until alignment is restored. The planner SHOULD wire `tests/install-manifest-matches-surviving.test.cjs` (per CONTEXT.md) as a thin wrapper that asserts `agents/gsd-*.md` count == 22 and `commands/gsd/*.md` count == 37, NOT as a parser of `install-manifest.json`.

2. **`bin/install.js` hardcodes 7+ deleted agent names** in `CODEX_AGENT_SANDBOX` (e.g., `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`). Other CLI modules (`get-shit-done/bin/lib/model-profiles.cjs`, `get-shit-done/bin/lib/intel.cjs`, `get-shit-done/bin/lib/docs.cjs`, `get-shit-done/bin/lib/init.cjs`) also reference deleted agent names by exact string. These are the **riskiest reference-rot sites** because they're code (not docs) — a stale reference there causes runtime errors, not just stale text. The orphan-reference test MUST scan `bin/` and `get-shit-done/bin/lib/` in addition to the directories CONTEXT.md lists.

**Primary recommendation:** Land Wave 0 in 4 commits (orphan-reference test infra → lifecycle decomposition → parity helper + baselines (single atomic commit) → staleness guard), then execute Wave 1 in ~13 commits grouped by deletion-list category (one commit per category, each leaves orphan-reference test green). Tag at end. The 7-step sequencing in CONTEXT.md `<decisions>` is the canonical dependency graph; this RESEARCH.md lays down the mechanics for each step.

---

## Architectural Responsibility Map

This phase modifies a single host system (the GSD repo itself); the "tier" axis is project-internal: which subsystem owns which capability.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Orphan-reference scanning | `tests/` (static) | — | Pure file-content scanning; no runtime needed; matches existing `tests/agents-doc-parity.test.cjs` family. |
| Agent baseline capture / replay | `integration/` (live, real Claude API) | `integration/helpers/` | Requires live API calls; consumes `claude-runner.cjs` infrastructure; baselines are write-once read-many fixtures. |
| Parity comparison (schema-aware) | `integration/helpers/agent-parity.cjs` | `tests/parity-baselines-stale.test.cjs` | Helper is pure JS; consumed by live tests. Static staleness guard is a separate concern. |
| Lifecycle composer | `integration/gsd-lifecycle.test.cjs` (thin) + `integration/lifecycle-steps/*.cjs` | `integration/test-fixtures/lifecycle-shapes/*.json` | Composer pattern decouples ordering from per-step behavior; matches research/TESTING.md §6. |
| Consolidated commands (`/gsd-review`, `/gsd-phase`) | `commands/gsd/review.md`, `commands/gsd/phase.md` | Deprecation stubs at `commands/gsd/<old>.md` | Markdown command files with frontmatter; dispatch via `<process>` body that branches on flags/subcommands. |
| Reference-rot sites (high risk) | `bin/install.js`, `get-shit-done/bin/lib/{model-profiles,intel,docs,init}.cjs` | Surviving agent prompts, surviving command files, workflow .md files, docs/* | CLI modules are code (runtime error if stale); prompts/docs are text (degraded UX). |
| Surviving-count enforcement | `docs/INVENTORY.md` (canonical roster) + `tests/inventory-counts.test.cjs` | filesystem (`agents/gsd-*.md`, `commands/gsd/*.md`) | Existing pattern; Phase 1 reuses it. `install-manifest.json` is NOT the right venue (see §2.5). |
| Walltime ledger writer | `integration/helpers/claude-runner.cjs` (mod) OR new `integration/helpers/walltime-recorder.cjs` | `integration/test-fixtures/walltime-ledger.jsonl` | Writer must run from every live test; cleanest as an opt-in helper called from `runAgentParity` and `runClaudeWithTools` callers. |
| Bazel test scoping | `integration/BUILD.bazel` (new `phase-1-cull` tag on every new live test) | — | Single source of truth for `bazel test --test_tag_filters` invocations. |

---

## 1. Wave 0 Mechanics (research-mandated, lands BEFORE any cull)

### 1.1. Orphan-reference test (`tests/cull-no-orphan-references.test.cjs`)

**File:** `tests/cull-no-orphan-references.test.cjs` (TEST-01 owner). Static test, runs under `node --test` via `npm test`.

**Data fixture:** `tests/fixtures/cull-deletion-list.cjs` — exports an object listing every deleted name and its replacement (or "removed" for cuts with no consolidation target). Format:

```javascript
'use strict';

module.exports = {
  // Commands deleted outright (no consolidation)
  deletedCommands: [
    'audit-fix', 'audit-uat', 'forensics', 'health', 'stats', 'scan',
    'intel', 'map-codebase', 'graphify',
    'ai-integration-phase', 'ui-phase', 'ui-review', 'eval-review',
    'spike', 'sketch', 'spike-wrap-up', 'sketch-wrap-up',
    'debug', 'explore',
    'note', 'plant-seed', 'add-backlog', 'thread', 'review-backlog',
    'audit-milestone', 'plan-milestone-gaps', 'milestone-summary',
    'archive-project', 'restore-project',
    'ship', 'undo', 'inbox', 'review',
    'manager', 'autonomous', 'fast', 'do', 'next', 'session-report',
    'spec-phase', 'import', 'ultraplan-phase', 'list-phase-assumptions',
    'docs-update', 'ingest-docs',
    'from-gsd2', 'add-tests', 'analyze-dependencies', 'cleanup',
  ],
  // Commands consolidated; the OLD names should not appear except in
  // (a) deprecation stub files (allowed) and (b) migration table
  // (allowed in CHANGELOG.md and commands/gsd/help.md).
  consolidatedCommands: {
    'code-review':                'gsd-review --code',
    'code-review-fix':            'gsd-review --code-fix',
    'secure-phase':               'gsd-review --security',
    'validate-phase':             'gsd-review --coverage',
    'critique':                   'gsd-review --critique',
    'plan-review-convergence':    'gsd-review --converge',
    'add-phase':                  'gsd-phase add',
    'insert-phase':               'gsd-phase insert',
    'remove-phase':               'gsd-phase remove',
  },
  // Agents deleted outright
  deletedAgents: [
    'gsd-debugger', 'gsd-debug-session-manager',
    'gsd-doc-writer', 'gsd-doc-classifier', 'gsd-doc-synthesizer', 'gsd-doc-verifier',
    'gsd-domain-researcher', 'gsd-eval-auditor', 'gsd-eval-planner',
    'gsd-framework-selector', 'gsd-ai-researcher',
    'gsd-ui-auditor', 'gsd-ui-checker', 'gsd-ui-researcher',
    'gsd-codebase-mapper', 'gsd-intel-updater',
    'gsd-nyquist-auditor',
  ],
  // Surviving roster — for reverse-checking
  survivingCommandCount: 37,
  survivingAgentCount: 22,
};
```

**Six syntactic contexts to scan (exact regex per context):**

| # | Context | Pattern (per deleted name `X`) | Notes |
|---|---------|-------------------------------|-------|
| 1 | `@`-references to agent or command files | `/@[^\s]*?\/(commands\/gsd\/X\.md|agents\/X\.md)\b/g` (X is `gsd-<name>` for agents, bare `<name>` for commands) | Catches `@$HOME/.claude/agents/gsd-debugger.md` and `@~/.claude/commands/gsd/debug.md`. |
| 2 | Slash-command mentions | `/(?<![A-Za-z0-9_-])\/gsd-X\b/g` (X is the command basename, e.g. `debug`) | Negative-lookbehind on `[A-Za-z0-9_-]` rules out e.g. `gsd-debug-session-manager` matching `debug`. |
| 3 | `install-manifest.json` (the actual file) | `JSON.parse(...)` then walk and search any string value containing `gsd-X` or path ending in `X.md` | The manifest is JSON, not text — use parsed traversal, not regex on raw text, to avoid false positives in keys vs values. (See §2.5 — current manifest doesn't list individual commands, but if it ever does, this scan needs to fire.) |
| 4 | Workflow markdown (`get-shit-done/workflows/*.md`) | Same as contexts 1 & 2 | Workflows are markdown with embedded prompts; the slash-mention and `@`-reference rules cover the syntactic forms used. |
| 5 | YAML frontmatter `agents:` and `commands:` arrays | Parse YAML frontmatter (between `---` fences); check arrays for `gsd-X` or `X` entries | Use `js-yaml` (already a transitive dep) OR the project's existing frontmatter parsing approach (project uses native regex match — see `tests/agent-frontmatter.test.cjs`). Prefer the native approach for consistency. |
| 6 | Test fixture files | Same as contexts 1, 2, and 5 across `tests/fixtures/`, `integration/test-fixtures/` | Fixtures rot just as fast as prose. |

**Scan roots (exact list):**
1. `agents/`
2. `commands/gsd/`
3. `get-shit-done/workflows/`
4. `get-shit-done/templates/`
5. `tests/`
6. `integration/`
7. `docs/`
8. **`bin/install.js` (CRITICAL — currently references `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`)** [VERIFIED: read `bin/install.js` lines 30–42]
9. **`get-shit-done/bin/lib/*.cjs`** (model-profiles.cjs lines 16, 17, 21, 23–27 reference `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`, `gsd-ui-researcher`, `gsd-ui-checker`, `gsd-ui-auditor`, `gsd-doc-writer`, `gsd-doc-verifier`; intel.cjs line 319 references `gsd-intel-updater`; docs.cjs lines 15, 251 reference `gsd-doc-writer`; init.cjs line 922 references `gsd-codebase-mapper`) [VERIFIED]
10. `CHANGELOG.md` and root-level `*.md` files (excluding `.planning/` which has its own state).

**Test allow-list (so the deletion-list itself doesn't trip the scan):**

The fixture file (`tests/fixtures/cull-deletion-list.cjs`) and the deprecation-stub files (`commands/gsd/secure-phase.md`, etc.) and the migration-table sections in `commands/gsd/help.md` and `CHANGELOG.md` legitimately mention deleted names. The test must allow-list these:

```javascript
// In tests/cull-no-orphan-references.test.cjs:
const ALLOW_LIST = new Set([
  'tests/fixtures/cull-deletion-list.cjs',
  // The 6 deprecation stubs — only files whose entire purpose is to mention old names
  'commands/gsd/secure-phase.md',
  'commands/gsd/validate-phase.md',
  'commands/gsd/code-review.md',
  'commands/gsd/code-review-fix.md',
  'commands/gsd/critique.md',
  'commands/gsd/plan-review-convergence.md',
  // Migration tables
  'commands/gsd/help.md',
  'CHANGELOG.md',
]);
```

The allow-list should be MINIMAL. If a deleted name appears anywhere else, the test fails — that's the whole point.

**Test-output requirement:** when failing, the test must print which deleted name was found, in which file, on which line, and in which context (so the dev can grep+fix in one shot). Pattern:

```
✗ orphan-reference: gsd-debugger found in agents/gsd-planner.md:142 (slash-mention)
✗ orphan-reference: /gsd-audit-fix found in commands/gsd/check-todos.md:38 (slash-mention)
```

**Confidence:** HIGH on regex per context (verified against existing repo content); MEDIUM on the YAML frontmatter parser approach (depends on whether existing tests use a particular pattern — `tests/agent-frontmatter.test.cjs` is the reference).

---

### 1.2. `runAgentParity` helper (`integration/helpers/agent-parity.cjs`)

**File:** `integration/helpers/agent-parity.cjs` (TEST-02 owner). Imports `runClaudeWithTools` from existing `claude-runner.cjs`.

**Signature:**

```javascript
/**
 * Runs the named agent against a baseline corpus entry and compares
 * fresh output against the recorded baseline per the supplied schema.
 *
 * @param {string} agentName  e.g. 'gsd-critic-plan' or 'gsd-planner'
 * @param {object} fixture    { fixtureId, sandboxFiles, prompt, env }
 * @param {object} schema     { kind, threshold, ... } — three kinds, see below
 * @param {object} opts       { walltimeBudgetMs, maxCostUsd, n, recordWalltime, phase }
 * @returns {Promise<ParityResult>}  { pass, baseline, current, deltas, walltime_ms, cost_usd, per_run_summary }
 */
async function runAgentParity(agentName, fixture, schema, opts = {}) { ... }
```

**Three schemas (locked from CONTEXT.md):**

```javascript
// 1. Critic findings — Phase 2 consumer
{
  kind: 'critic-findings',
  threshold: 0.85,                          // ≥85% finding overlap
  severities: ['critical', 'major', 'minor'],
  noMissingCritical: true,                  // hard-fail if any baseline critical absent in current
  bucketKey: ['severity', 'category', 'lane'],  // tuple → string for set comparison
}

// 2. Plan structural — Phase 3 consumer
{
  kind: 'plan-structural',
  taskCountTolerance: 0.10,                 // ±10%
  requireMustHaveCoverage: 'set-equality',
  dependencyGraphCheck: 'isomorphic-by-content',
  redStepRequired: false,                   // Phase 1 default; Phase 4 flips this to true
}

// 3. Schema conformance — Phase 6 consumer
{
  kind: 'schema-conformance',
  expectedSections: [/* list of required H2/H3 headings in baseline */],
  fieldsPresent: [/* required YAML frontmatter keys */],
  smokeCritiqueModel: 'cheap',              // backstop LLM-as-judge with maxBudget: 0.5
}
```

**Severity-bucketed key formula (Phase 2 calibration concern, set NOW so all phases use the same):**

For `critic-findings`, the bucket key is `${severity}:${category}:${lane}` extracted from each finding's frontmatter or structured fields. **Open question deferred from research:** is the right tuple `(severity, category, lane)` (groups findings by lens) or `(file_path, line_range, severity)` (groups by code location)? Recommendation: use `(severity, category, lane)` for Phase 1 baselines because critics emit findings tagged with lens metadata; if Phase 2 calibration shows this is too coarse, we add a secondary `file_path` bucket — but baselines captured in Phase 1 are forward-compatible because they record the full finding object.

**N=5 median (research SUMMARY.md mandate):**

`opts.n` defaults to 5 for live runs. The helper:
1. Runs the live agent N times against the same fixture input.
2. For each run, computes the schema-specific comparison against the baseline.
3. Takes the **median** comparison result (not the mean — outliers from API hiccups distort means).
4. Records each run's walltime + cost to the walltime ledger if `opts.recordWalltime` is true.

For Phase 1 baseline capture (TEST-03), `opts.n` is set to 1 — baselines are recorded once, not N times. (Capturing N baselines per fixture would balloon the corpus and miss the point of "the recorded output is the contract.") If N=1 baselines turn out to be too noisy in Phase 2 calibration, we extend the helper to support N-per-baseline then; that's not a Phase 1 concern.

**Walltime ledger integration:**

The helper appends one JSONL entry per live run to `integration/test-fixtures/walltime-ledger.jsonl`:

```json
{"date":"2026-04-29","test":"agent-parity:gsd-critic-plan","walltime_ms":42100,"cost_usd":4.8,"phase":"phase-1-cull"}
```

The `phase` field is provided by the caller (`opts.phase`). Phase 1 callers pass `'phase-1-cull'`; Phase 2's first parity run will pass `'phase-2-critic'`. **Phase 1 sets up the ledger file (creating it empty if absent) and the writer mechanism; downstream phases consume it.** The walltime trend regression test is owned by Phase 6.

**Streaming output handling:**

`runClaudeWithTools` returns a final `result` string (the complete agent output) plus `duration_ms` and `cost_usd`. The helper does NOT need to handle streaming — it waits for full completion. Token-by-token streaming would only matter if we wanted to detect mid-stream divergence, which is beyond the parity contract.

**Nondeterminism handling:**

The helper does NOT reset random state or fix seeds — Claude API output is inherently nondeterministic. The N=5 median + threshold mechanism IS the nondeterminism handling. Single-run deterministic comparison is explicitly NOT supported (it would flake constantly).

**Output (`ParityResult`):**

```javascript
{
  pass: true,
  baseline: { /* the recorded JSON */ },
  current: { /* the median run's parsed output */ },
  deltas: {
    overlap: 0.92,                  // for critic-findings
    missingCritical: [],            // hard-fail trigger
    extraFindings: [...],           // not blocking, but reported
    taskCountDelta: 0.04,           // for plan-structural
    sectionsMissing: [],            // for schema-conformance
  },
  walltime_ms: { p50: 42100, p95: 44800 },  // across N runs
  cost_usd: 23.5,                   // total across N runs
  per_run_summary: [/* N entries */],
}
```

**Error handling:**

If the agent fails to produce parseable output in any of the N runs (CLI error, budget exhaustion, malformed JSON), the helper records that run as `{ failed: true, reason: ... }` in `per_run_summary` but does NOT abort the whole parity run. As long as M of N (M >= ceil(N/2)) runs succeed, the median is well-defined. If fewer than ceil(N/2) succeed, return `{ pass: false, deltas: { error: 'insufficient successful runs' } }`.

**Sources:** verified against `integration/helpers/claude-runner.cjs` (existing `runClaudeWithTools` returns `duration_ms` and `cost`), research/TESTING.md §1 (severity-bucketed key rationale), research/SUMMARY.md (N=5 median, severity-stratified thresholds).

---

### 1.3. Pre-refactor agent baseline corpus (TEST-03)

**Layout:**

```
integration/test-fixtures/baselines/
├── README.md                            # Fixture-update discipline; staleness policy
├── _meta.json                           # Capture-commit SHA; capture date
├── critic-plan/
│   ├── plan-with-known-issues.input.json
│   └── plan-with-known-issues.json      # The baseline (recorded output)
├── critic-code/
│   ├── code-with-smells.input.json
│   └── code-with-smells.json
├── critic-scope/
│   └── ...
├── critic-verify/
│   └── ...
├── critic-discuss/
│   └── ...
├── critic-strategy/
│   └── ...
├── planner/
│   ├── multi-task-phase.input.json
│   ├── multi-task-phase.json            # standard mode baseline
│   ├── gap-closure-phase.input.json
│   ├── gap-closure-phase.json           # --gaps mode baseline
│   ├── reviews-mode-phase.input.json
│   └── reviews-mode-phase.json          # --reviews mode baseline
├── research-synthesizer/
│   └── canonical-research.json          # Phase 3 audit baseline (synthesizer being deleted)
├── pattern-mapper/
├── phase-researcher/
├── plan-checker/
├── verifier/
├── executor/
├── project-researcher/
├── roadmapper/
├── code-reviewer/
├── code-fixer/
├── integration-checker/
├── security-auditor/
├── assumptions-analyzer/
├── advisor-researcher/
└── user-profiler/
```

**Fixture inventory (one canonical fixture per agent, multiple where invocation modes differ):**

| Agent | Fixture(s) | Schema kind (downstream consumer) | Phase consumer |
|-------|-----------|----------------------------------|----------------|
| `gsd-critic-plan` | `plan-with-known-issues` | `critic-findings` | Phase 2 |
| `gsd-critic-code` | `code-with-known-smells` | `critic-findings` | Phase 2 |
| `gsd-critic-scope` | `over-scoped-plan` | `critic-findings` | Phase 2 |
| `gsd-critic-verify` | `unverifiable-plan` | `critic-findings` | Phase 2 |
| `gsd-critic-discuss` | `partial-context` | `critic-findings` | Phase 2 |
| `gsd-critic-strategy` | `strategic-misalignment-plan` | `critic-findings` | Phase 2 |
| `gsd-planner` | `multi-task-phase` (standard) + `gap-closure-phase` (--gaps) + `reviews-mode-phase` (--reviews) | `plan-structural` | Phase 3 |
| `gsd-research-synthesizer` | `canonical-research` (3 researcher outputs to merge) | `schema-conformance` | Phase 3 (audit only) |
| `gsd-pattern-mapper` | `simple-codebase-pattern` | `schema-conformance` | Phase 6 |
| `gsd-phase-researcher` | `simple-domain-research` | `schema-conformance` | Phase 6 |
| `gsd-plan-checker` | `plan-with-issues-to-find` | `schema-conformance` | Phase 6 |
| `gsd-verifier` | `phase-summary-input` | `schema-conformance` | Phase 6 |
| `gsd-executor` | `trivial-plan` | `schema-conformance` | Phase 6 |
| `gsd-project-researcher` | `simple-project-domain` | `schema-conformance` | Phase 6 |
| `gsd-roadmapper` | `project-input-for-roadmap` | `schema-conformance` | Phase 6 |
| `gsd-code-reviewer` | `code-with-bugs` | `schema-conformance` | Phase 6 |
| `gsd-code-fixer` | `review-md-with-findings` | `schema-conformance` | Phase 6 |
| `gsd-integration-checker` | `cross-phase-integration-input` | `schema-conformance` | Phase 6 |
| `gsd-security-auditor` | `phase-with-threat-model` | `schema-conformance` | Phase 6 |
| `gsd-assumptions-analyzer` | `phase-with-known-assumptions` | `schema-conformance` | Phase 6 |
| `gsd-advisor-researcher` | `gray-area-decision` | `schema-conformance` | Phase 6 |
| `gsd-user-profiler` | `interaction-history-input` | `schema-conformance` | Phase 6 |

**Total fixtures:** 22 agents × 1+ fixtures = **~24 baselines** (planner has 3, others 1 each). Each baseline JSON is roughly 2–10 KB, so the total corpus is <250 KB committed.

**Fixture input choice rationale (per agent, suggested — locked items in CONTEXT.md, others in Claude's Discretion):**

- **Critic fixtures**: each must contain a plan or code artifact with KNOWN findings of all severity levels (≥1 critical, ≥2 major, ≥3 minor) so the parity test has structural matter to compare. Reuse existing `integration/fixtures/` content if any has these properties; else hand-author small fixtures (~50 lines each) seeded with deliberate issues per critic's lens.
- **Planner fixtures**: `multi-task-phase` is a CONTEXT.md + REQUIREMENTS.md + RESEARCH.md trio for a hypothetical 3-task phase — small enough to plan, complex enough that task decomposition is non-trivial. `gap-closure-phase` includes a fake VERIFICATION.md with 2 gap findings. `reviews-mode-phase` includes a fake REVIEWS.md with cross-AI feedback.
- **Spine agent fixtures**: small canonical inputs that exercise each agent's primary code path. For `gsd-executor`, a 2-step plan with one trivial implementation task (no production code, just test setup). For `gsd-roadmapper`, a small project description with 2-3 phases. Etc.

**Baseline JSON `_meta` schema (required for staleness guard, fixture-update discipline):**

```json
{
  "_meta": {
    "agent": "gsd-critic-plan",
    "fixture_id": "plan-with-known-issues",
    "schema": "critic-findings",
    "captured_at": "2026-04-29",
    "captured_commit": "<git SHA at capture>",
    "captured_by": "phase-1-wave-0-baseline-capture",
    "claude_runner_version": "v1.37.1",
    "staleness_acknowledged": null,
    "changed_because": null
  },
  "output": {
    /* The verbatim agent output (parsed JSON or markdown content) */
  }
}
```

`staleness_acknowledged` is set when a baseline is reviewed and intentionally kept past 90 days (per TEST-05). `changed_because` is set when a baseline is updated in place (e.g., a refactor legitimately drifts behavior).

**Capture procedure (single atomic commit titled `chore: capture pre-refactor agent baselines for parity testing`):**

1. Implement `runAgentParity` helper (TEST-02) FIRST — it is the recording mechanism.
2. Implement a one-shot `scripts/capture-baselines.cjs` (or inline in a Node-test invocation) that:
   - For each agent + fixture in the inventory, calls `runAgentParity(agent, fixture, schema, { mode: 'capture', n: 1 })`.
   - The `mode: 'capture'` branch writes the live output to `<agent>/<fixture-id>.json` with the `_meta` block.
   - Each capture takes ~30s–3min and ~$0.50–$10 in Claude API cost (per research/TESTING.md §5 budget tiers); 22 agents × ~$5 average = ~$100 in one-shot capture cost. (Cost is not a constraint per user instruction.)
3. Run the capture script in one session.
4. Git-commit the entire `integration/test-fixtures/baselines/` tree in a single commit with the locked title.
5. After commit, baselines are read-only; no further writes in Phase 1.

**Refresh policy (Phase 1 sets the contract; later phases consume it):**

- Refactor work in Phases 2/3/6 runs `runAgentParity` against the recorded baselines, not against fresh re-runs.
- When a refactor *legitimately* drifts behavior (e.g., Phase 3 synthesizer merge changes planner output structure), the baseline file is updated in the SAME commit as the agent change, with `changed_because` set in `_meta`.
- TEST-05 enforces freshness: `tests/parity-baselines-stale.test.cjs` iterates baselines, asserts `Date.now() - parseISO(captured_at)` ≤ 90 days OR `staleness_acknowledged` is set with a date within the last 30 days.

---

### 1.4. Lifecycle decomposition (TEST-04)

**Current state:** `integration/gsd-lifecycle.test.cjs` is 460 lines, runs the full 10-step pipeline (`new-project → discuss-phase → plan-phase → critique → execute-phase → add-mistake → add-taste → verify-work → progress → stats`) inline. Each step is a `test('step N: ...')` block with embedded `runSkill(...)` and inline assertions. [VERIFIED: read `integration/gsd-lifecycle.test.cjs` lines 1–460]

**Target state:**

```
integration/gsd-lifecycle.test.cjs            # Thin composer — ~50 lines
integration/lifecycle-steps/
├── step-1-new-project.cjs                    # exports { name, run, assertArtifacts }
├── step-2-discuss-phase.cjs
├── step-3-plan-phase.cjs
├── step-4-review-critique.cjs                # post-cull: was step-4 critique → /gsd-review --critique
├── step-5-execute-phase.cjs
├── step-6-add-mistake.cjs
├── step-7-add-taste.cjs
├── step-8-verify-work.cjs
├── step-9-progress.cjs
└── step-10-stats.cjs                         # NOTE: /gsd-stats is in the deletion list! See §1.4.4.
integration/test-fixtures/lifecycle-shapes/
├── post-cull.json                            # Phase 1 commit shape
└── post-sp-integration.json                  # Phase 5 reservation (for Phase 5; Phase 1 only writes post-cull.json)
```

#### 1.4.1. Per-step file shape (exports `name`, `run`, `assertArtifacts`)

```javascript
// integration/lifecycle-steps/step-3-plan-phase.cjs
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');

/**
 * Step 3: /gsd-plan-phase produces PLAN.md (plus optional RESEARCH.md).
 * Post-cull invocation; Phase 5 will layer --from-spec on top.
 */
const STEP = {
  name: 'plan-phase',
  produces: ['PLAN.md'],
  may_produce: ['RESEARCH.md'],

  async run(sandbox, ctx) {
    const result = await runClaudeWithTools(
      'Run /gsd-plan-phase 1 to create the implementation plan for phase 1.',
      { cwd: sandbox, timeout: 600_000, maxBudget: 30,
        addDirs: [path.join(sandbox, '.claude')], env: ctx.env }
    );
    return { result, ...gatherArtifacts(sandbox) };
  },

  assertArtifacts(sandbox, runCtx) {
    // ... same defensive assertions as the existing inline step-3
  },
};

module.exports = STEP;

function gatherArtifacts(sandbox) {
  const phaseDir = findPhaseDir(sandbox);  // shared util — see helpers/lifecycle-utils.cjs
  return {
    phaseDir,
    plans: phaseDir ? findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i) : [],
    research: phaseDir ? findFiles(phaseDir, /RESEARCH\.md$/i) : [],
  };
}
```

The shared utilities (`findPhaseDir`, `findFiles`, `walkForDir`, `readFrontmatter`) currently live inline at the top of `gsd-lifecycle.test.cjs` (lines 50–117). These move to `integration/helpers/lifecycle-utils.cjs` (new file) so all step files can reuse them.

#### 1.4.2. Composer shape

```javascript
// integration/gsd-lifecycle.test.cjs (post-decomposition, ~50 lines)
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createSandbox } = require('./helpers/claude-runner.cjs');

const SHAPE = require('./test-fixtures/lifecycle-shapes/post-cull.json');
const STEPS = SHAPE.expected_steps.map(s =>
  require(`./lifecycle-steps/step-${s.step_num}-${s.name}.cjs`)
);

describe('GSD lifecycle pipeline', () => {
  let sandbox;
  const ctx = { env: { GSD_USER: 'test-user' } };
  const stepResults = {};

  before(() => { sandbox = createSandbox('lifecycle'); });

  // Pre-checks (fork integrity) move to a dedicated file too —
  // integration/lifecycle-steps/step-0-pre-checks.cjs

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    test(`step ${i + 1}: ${step.name}`, async (t) => {
      // Skip if a strict prerequisite is missing
      const prerequisites = step.requires || [];
      for (const req of prerequisites) {
        if (!stepResults[req]?.success) {
          return t.skip(`prerequisite ${req} did not succeed`);
        }
      }
      const result = await step.run(sandbox, ctx);
      step.assertArtifacts(sandbox, result);
      stepResults[step.name] = result;
    });
  }
});
```

#### 1.4.3. Lifecycle-shape JSON

```json
{
  "name": "post-cull spine",
  "phase_marker": "phase-1-complete",
  "expected_steps": [
    { "step_num": 1, "name": "new-project",     "produces": ["PROJECT.md", "ROADMAP.md", "STATE.md"], "requires": [] },
    { "step_num": 2, "name": "discuss-phase",   "produces": ["CONTEXT.md"],                            "requires": ["new-project"] },
    { "step_num": 3, "name": "plan-phase",      "produces": ["PLAN.md"], "may_produce": ["RESEARCH.md"], "requires": ["discuss-phase"] },
    { "step_num": 4, "name": "review-critique", "produces": ["CRITIQUE.md"],                           "requires": ["plan-phase"] },
    { "step_num": 5, "name": "execute-phase",   "produces": ["SUMMARY.md"],                            "requires": ["plan-phase"] },
    { "step_num": 6, "name": "add-mistake",     "produces": ["mistakes/*.md"],                         "requires": [] },
    { "step_num": 7, "name": "add-taste",       "produces": ["taste/*.md"],                            "requires": [] },
    { "step_num": 8, "name": "verify-work",     "produces": ["VERIFICATION.md"],                       "requires": ["execute-phase"] },
    { "step_num": 9, "name": "progress",        "produces": [],                                        "requires": [] }
  ]
}
```

Note: only 9 steps in `post-cull.json`, not 10 — see §1.4.4.

#### 1.4.4. Step inventory after the cull (this matters)

The existing lifecycle test runs `/gsd-stats` as step 10. **`stats` is in the deletion list** (commands → audit/diagnostic group). The post-cull lifecycle has 9 steps, not 10. Step 10 in the JSON shape file is dropped (or replaced — there is no equivalent surviving command). This is a real lifecycle behavior change Phase 1 must make explicit.

Similarly: step 4 changes from `/gsd-critique` (deleted, consolidated) to `/gsd-review --critique`. Step file naming should reflect the new command (`step-4-review-critique.cjs`, not `step-4-critique.cjs`).

#### 1.4.5. Sequencing

The lifecycle decomposition lands BEFORE the cull (Wave 0). The composer initially runs against the pre-cull lifecycle shape, which means the **post-cull lifecycle update is two changes**: (1) decompose to step files (Wave 0, lifecycle still runs `/gsd-stats` and `/gsd-critique` because those commands haven't been deleted yet), (2) update the step files and shape JSON for the post-cull spine (Wave 1, after the cull). The decomposition itself is value-neutral on cull state.

**Subtle commit ordering risk:** if the pre-cull lifecycle is decomposed in Wave 0 commit but the cull deletes `/gsd-stats` before step-10 is removed, the lifecycle test breaks between commits. Mitigation: in the same Wave 0 commit that decomposes, also write the **post-cull** shape JSON (and have step-10 already absent), with the composer reading whichever shape file matches the current state via a feature flag or an env var. Simpler: defer the shape-JSON-driven loading to Wave 1 — Wave 0 just decomposes inline (one require per step), and Wave 1 later swaps to the JSON-driven loop. The planner should choose between these two; the simpler path is recommended.

---

### 1.5. Baseline staleness guard (`tests/parity-baselines-stale.test.cjs`)

**File:** `tests/parity-baselines-stale.test.cjs` (TEST-05 owner). Static, runs under `npm test`.

**Logic:**

```javascript
const ROOT = path.resolve(__dirname, '..');
const BASELINES_DIR = path.join(ROOT, 'integration', 'test-fixtures', 'baselines');
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

describe('parity baselines freshness', () => {
  const baselineFiles = walkForFiles(BASELINES_DIR, /\.json$/);
  for (const file of baselineFiles) {
    if (path.basename(file) === '_meta.json') continue;
    if (path.basename(file).endsWith('.input.json')) continue;
    test(`baseline ${path.relative(BASELINES_DIR, file)} is fresh`, () => {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      assert.ok(data._meta?.captured_at, `baseline missing _meta.captured_at`);
      const capturedAt = new Date(data._meta.captured_at).getTime();
      const ageMs = Date.now() - capturedAt;
      if (ageMs > NINETY_DAYS_MS) {
        // Old baseline — must have an explicit acknowledgment within 30 days
        const ack = data._meta.staleness_acknowledged;
        assert.ok(ack, `baseline is ${Math.floor(ageMs / 86400000)} days old; add staleness_acknowledged: <YYYY-MM-DD> or refresh`);
        const ackDate = new Date(ack).getTime();
        assert.ok(Date.now() - ackDate < 30 * 86400000,
          `staleness_acknowledged on ${ack} is itself stale; re-acknowledge or refresh`);
      }
    });
  }
});
```

**Edge cases:** baselines committed today are 0 days old, well within the window. The first time TEST-05 will flip is ~90 days post-Phase-1. The capture commit's `_meta.captured_at` field is the only date the test reads — git commit dates are ignored (would be wrong on cherry-picks, rebases, etc.).

**Optional `_meta.changed_because` enforcement (deferred):** research/TESTING.md §4 suggests `parity-baselines-stale.test.cjs` also assert `changed_because` is set on any baseline modified in the last 30 days. This requires reading git history per file (slow, OS-dependent). Recommend deferring to Phase 6 when the test would actually have non-trivial change history; Phase 1 only needs the staleness check.

---

## 2. Wave 1 Mechanics (cull, gated by Wave 0 passing)

### 2.1. Per-category deletion strategy

**Category boundaries match design spec / CONTEXT.md groups.** Each commit:
- Deletes the listed command files (`commands/gsd/<name>.md`) AND any paired test (`tests/<name>-*.test.cjs`).
- Deletes the listed agent files (`agents/gsd-<name>.md`).
- Updates `docs/INVENTORY.md` (removes rows; updates "(N shipped)" headlines).
- Updates `bin/install.js` (removes hardcoded references — see §3).
- Updates `get-shit-done/bin/lib/*.cjs` modules that reference deleted agent names by string.
- Leaves orphan-reference test green.

**Per-commit checklist for the planner to bake into each cull task:**

```
- [ ] Delete commands/gsd/<name>.md for each command in this group
- [ ] Delete agents/gsd-<name>.md for each agent in this group
- [ ] Delete tests/<name>-*.test.cjs files paired with deleted commands (per design spec testing strategy)
- [ ] Update docs/INVENTORY.md: remove rows for deleted items + update "(N shipped)" headlines
- [ ] Update bin/install.js: remove deleted agent names from CODEX_AGENT_SANDBOX, claudeToCopilotTools, etc.
- [ ] Update get-shit-done/bin/lib/model-profiles.cjs: remove deleted agents from the model map
- [ ] Update get-shit-done/bin/lib/{intel,docs,init}.cjs as needed for deleted agent name references
- [ ] Run npm test — orphan-reference test must pass
- [ ] Commit with message: chore(cull): delete <category> commands and agents
```

**Suggested commit ordering across the 13+ category commits (cross-reference rot crosses categories — order matters):**

The planner should order commits so each commit is self-contained for orphan-reference. Specifically, surviving files that reference *deleted* names must have those references removed in either the deletion commit (preferred) or an earlier reference-rot-fix commit. Concrete known dependencies:

- The `audit/diagnostic` group's deletion of `/gsd-stats` and `/gsd-graphify` will leave dangling slash-mentions in surviving commands like `/gsd-plan-phase` (verified: `commands/gsd/plan-phase.md` mentions `/gsd-graphify`). These must be cleaned in the same commit OR earlier.
- `gsd-codebase-mapper` is referenced from `agents/gsd-pattern-mapper.md` (verified by inspection of agents that the cull leaves alive). The pattern-mapper's reference must be updated.
- `gsd-debugger` is referenced from `agents/gsd-verifier.md` (verified — verifier suggests "spawn gsd-debugger if integration tests fail"). The verifier's reference must be updated.

**Recommended approach:** Do a **single "reference-rot fix" commit BEFORE the deletion commits** that scrubs all surviving prompts/workflows/CLI modules of references to deleted names. This commit is large but mechanical: replace `/gsd-debug` mentions with "investigate the issue manually" or similar, replace `/gsd-graphify` with whatever the equivalent surviving operation is or remove the suggestion entirely. After this commit, the orphan-reference test still fails (because the deleted *files* still exist), but ALL non-self-references are gone. The category-by-category deletion commits then become trivially safe.

### 2.2. Consolidation routing for `/gsd-review`

**File:** `commands/gsd/review.md` (new). Frontmatter pattern matches existing surviving consolidated commands like `/gsd-progress` or `/gsd-plan-phase`.

**Dispatch design (Markdown body branches on argument):**

The Claude Code slash-command convention is that the command file's body is the prompt. Dispatch to different workflows per flag means: parse the flag in the command body, then `@`-include the appropriate workflow file. The command file does NOT directly import workflow files conditionally — instead, it contains all six workflow references and instructs Claude to dispatch:

```markdown
---
name: gsd:review
description: Run quality gates (code, security, coverage, critique, converge) for a phase
argument-hint: "<phase> --code | --code-fix | --security | --coverage | --critique | --converge [other flags]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
---
<objective>
Quality-gate review for a phase. Dispatches to the appropriate review workflow based on the supplied flag.

Flags (exactly one required):
- `--code` — Source code review for bugs, security, code quality (delegated to `gsd-code-reviewer`)
- `--code-fix` — Apply fixes from a prior --code run (delegated to `gsd-code-fixer`)
- `--security` — Threat-model verification (delegated to `gsd-security-auditor`)
- `--coverage` — Test coverage gap analysis (post-Phase-4: integrated with TDD layer)
- `--critique` — All-six-critic review (delegated to critic batch — Phase 2 will parallelize)
- `--converge` — Reconcile cross-AI review feedback (post-Phase-2 review)
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/review.md
</execution_context>

<process>
Execute the review workflow from @~/.claude/get-shit-done/workflows/review.md, dispatching on the flag in $ARGUMENTS:

1. Parse $ARGUMENTS for exactly one of: `--code`, `--code-fix`, `--security`, `--coverage`, `--critique`, `--converge`.
2. If zero flags or multiple flags, error: "Specify exactly one review type."
3. Dispatch:
   - `--code`        → load workflow steps from `code-review.md` workflow body (or invoke gsd-code-reviewer directly)
   - `--code-fix`    → load workflow steps from `code-review-fix.md` workflow body
   - `--security`    → load workflow steps from `secure-phase.md` workflow body
   - `--coverage`    → load workflow steps from `validate-phase.md` workflow body
   - `--critique`    → load workflow steps from `critique.md` workflow body
   - `--converge`    → load workflow steps from `plan-review-convergence.md` workflow body
4. Pass all other flags + the phase argument through to the dispatched workflow.
</process>
```

**Key design choice (Claude's discretion, per CONTEXT.md):** the dispatch uses the existing workflow files in `get-shit-done/workflows/` as the work units. The workflow files themselves are NOT renamed in Phase 1 — they remain `code-review.md`, `secure-phase.md`, etc. (Workflows aren't user-facing commands; renaming them is unnecessary churn.) Only the user-facing command files in `commands/gsd/` are deleted/consolidated. This is consistent with how `/gsd-plan-phase` already works: the command file is `commands/gsd/plan-phase.md` and it `@`-includes the workflow at `get-shit-done/workflows/plan-phase.md`.

**Alternative considered:** New `commands/gsd/review.md` could **inline-incorporate** the six workflow bodies into its `<process>` block, eliminating the indirection. Rejected because: (a) it bloats the command file beyond what fits in a clean prompt, (b) workflows are already version-controlled separately and may evolve, (c) the surviving 5 quality-gate workflow files are reused by the deprecation stubs (§2.4).

**Argument-passing through:** The dispatched workflow expects `$ARGUMENTS` to contain the phase number plus any flags it understands. The consolidation must NOT strip the dispatched flag (`--code`, etc.) — workflows shouldn't be modified to handle the new flag, so the command should pop the dispatch flag before forwarding. Concrete: if user runs `/gsd-review 2 --code --depth=deep`, the command sets `DISPATCH=code` and forwards `2 --depth=deep` to the workflow.

**Test (`tests/consolidated-review-flags.test.cjs`, CULL-03 owner):**

```javascript
// Static test — does not invoke Claude
const REVIEW_MD = fs.readFileSync('commands/gsd/review.md', 'utf-8');
test('review.md mentions all 6 dispatch flags', () => {
  for (const flag of ['--code', '--code-fix', '--security', '--coverage', '--critique', '--converge']) {
    assert.match(REVIEW_MD, new RegExp(flag.replace(/-/g, '\\-')),
      `review.md does not mention dispatch flag ${flag}`);
  }
});
test('legacy command files are absent or are stubs', () => {
  for (const stub of ['code-review', 'code-review-fix', 'secure-phase', 'validate-phase', 'critique', 'plan-review-convergence']) {
    const stubPath = `commands/gsd/${stub}.md`;
    if (fs.existsSync(stubPath)) {
      const content = fs.readFileSync(stubPath, 'utf-8');
      assert.match(content, /DEPRECATED|deprecation|consolidated into/i,
        `${stubPath} exists but is not a deprecation stub`);
    }
    // If absent — fine; the deprecation-stub requirement only applies to the 6 quality-gate commands per CULL-05; if planner chose to delete instead, that's allowed for the 3 phase-manipulation commands but NOT for the 6 quality-gate commands.
  }
});
```

### 2.3. Consolidation routing for `/gsd-phase`

**File:** `commands/gsd/phase.md` (new). Subcommand pattern, not flag pattern.

```markdown
---
name: gsd:phase
description: Phase manipulation — add, insert, or remove phases in the roadmap
argument-hint: "add <description> | insert <position> <description> | remove <phase-id>"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Phase manipulation in the active milestone roadmap.

Subcommands:
- `add <description>` — Append a new phase at the end of the current milestone
- `insert <position> <description>` — Insert a phase at a specific position
- `remove <phase-id>` — Remove a phase from the roadmap
</objective>

<process>
Parse $ARGUMENTS — first token is the subcommand:

1. If $1 is `add`    → execute workflow `get-shit-done/workflows/add-phase.md` with $2... as description
2. If $1 is `insert` → execute workflow `get-shit-done/workflows/insert-phase.md` with $2 as position, $3... as description
3. If $1 is `remove` → execute workflow `get-shit-done/workflows/remove-phase.md` with $2 as phase-id
4. Otherwise: error "Unknown subcommand. Use add | insert | remove."
</process>
```

**Test (`tests/consolidated-phase-subcommands.test.cjs`, CULL-04 owner):** mirrors the review-flags test but checks the subcommand keywords appear in the command file body.

**No deprecation stubs required for `/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-remove-phase`** per CONTEXT.md `<decisions>` (CULL-05 only requires stubs for the 6 quality-gate commands). If the planner chooses to add stubs anyway for consistency, that's allowed; if the files are simply deleted, that's also allowed. **Recommendation: delete outright** — phase manipulation commands are run rarely, the migration table in `commands/gsd/help.md` covers the discovery path, and adding stubs increases surface area we just spent a cull reducing.

### 2.4. Deprecation stub mechanics (CULL-05)

**Pattern:** the stub file is a real command file that, when invoked, prints a deprecation message and dispatches to the new command. The stub is NOT a redirect or a symlink — it's a markdown command file like any other, but its body is short.

**Stub template:**

```markdown
---
name: gsd:secure-phase
description: "[DEPRECATED] Use /gsd-review --security instead. This stub will be removed in a future milestone."
argument-hint: <phase> [other flags]
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
---
<objective>
**⚠ DEPRECATED**

`/gsd-secure-phase` has been consolidated into `/gsd-review`.

**Use:** `/gsd-review --security <phase>`

This stub will be removed after a future milestone. See `CHANGELOG.md` and `commands/gsd/help.md` for the full migration table.

Now dispatching to `/gsd-review --security` with your arguments...
</objective>

<process>
1. Print the deprecation banner above to the user.
2. Forward to `/gsd-review --security $ARGUMENTS` — execute the review workflow with `--security` flag prepended to the arguments the user supplied.
</process>
```

**One stub file per consolidated quality-gate command:**

| Stub file | Dispatches to |
|-----------|---------------|
| `commands/gsd/secure-phase.md` | `/gsd-review --security` |
| `commands/gsd/validate-phase.md` | `/gsd-review --coverage` |
| `commands/gsd/code-review.md` | `/gsd-review --code` |
| `commands/gsd/code-review-fix.md` | `/gsd-review --code-fix` |
| `commands/gsd/critique.md` | `/gsd-review --critique` |
| `commands/gsd/plan-review-convergence.md` | `/gsd-review --converge` |

**Implementation pattern: Markdown content as deprecation, body as dispatcher.** The Claude Code runtime reads the command file body and asks Claude to execute it. Claude reads the deprecation banner (which is a `<objective>` block) and the `<process>` (which says "forward to /gsd-review --security $ARGUMENTS"). Claude prints the banner to the user, then internally invokes `/gsd-review --security` with the same arguments. **This works because Claude's slash-command runtime allows commands to invoke other commands; it's the same mechanism used by chained workflows.**

**Open question (LOW risk):** does Claude correctly handle a command that internally invokes another command? Verified against existing GSD patterns: yes — several existing commands (`/gsd-quick`, `/gsd-fast`) chain into other commands via `<process>` body instructions. [VERIFIED: read `commands/gsd/plan-phase.md` lines 49-51 — process body is just an instruction to execute a workflow.] The stub pattern is safe.

**Test (`tests/consolidated-review-flags.test.cjs`, CULL-05 owner — same test as CULL-03 but with a separate deprecation-message check):**

```javascript
test('each deprecation stub mentions deprecation and target command', () => {
  const stubs = [
    ['commands/gsd/secure-phase.md', '--security'],
    ['commands/gsd/validate-phase.md', '--coverage'],
    ['commands/gsd/code-review.md', '--code'],
    ['commands/gsd/code-review-fix.md', '--code-fix'],
    ['commands/gsd/critique.md', '--critique'],
    ['commands/gsd/plan-review-convergence.md', '--converge'],
  ];
  for (const [file, flag] of stubs) {
    const content = fs.readFileSync(file, 'utf-8');
    assert.match(content, /DEPRECATED|deprecation|deprecated/i, `${file} missing deprecation marker`);
    assert.match(content, new RegExp('/gsd-review\\s+' + flag.replace(/-/g, '\\-')),
      `${file} does not mention dispatch target /gsd-review ${flag}`);
  }
});
```

### 2.5. Manifest update procedure (CULL-01, CULL-02, CULL-08) — IMPORTANT CORRECTION

**Critical finding [VERIFIED: read `install-manifest.json` lines 1–55]:** `install-manifest.json` is a **copy-rule manifest**, NOT a list of installed commands/agents. It contains a single rule per source dir (e.g., `commands.src = "commands/gsd/"`, `commands.dest = "commands/gsd/"`, `commands.type = "copy-with-path-replacement"`). Updating `install-manifest.json` does NOT decrement a count; the count is whatever the filesystem says.

**This means CULL-08 ("`install-manifest.json` lists exactly the surviving 37 commands and 22 agents") is structurally inapplicable to the current manifest.** The planner has two options:

**Option A (recommended): reinterpret CULL-08 as filesystem + INVENTORY.md equality.** The existing `tests/inventory-counts.test.cjs` and `tests/agents-doc-parity.test.cjs` already enforce: "every `agents/gsd-*.md` and `commands/gsd/*.md` file has a row in `docs/INVENTORY.md`, and the headline counts match the filesystem." After the cull:
- `agents/gsd-*.md` filesystem count = 22.
- `commands/gsd/*.md` filesystem count = 37.
- `docs/INVENTORY.md` "## Agents (N shipped)" header reads 22.
- `docs/INVENTORY.md` "## Commands (N shipped)" header reads 37.
- All deleted rows removed; no orphan rows.

The Phase 1 test `tests/install-manifest-matches-surviving.test.cjs` (per CONTEXT.md naming) becomes a thin wrapper that re-asserts the filesystem counts == 37 + 22 — effectively a regression-pin against accidental file additions during the cull. The name is misleading (it's not about `install-manifest.json` per se), but the contract is what matters.

**Option B (more invasive): reshape `install-manifest.json` to enumerate individual commands/agents.** This would require updating `bin/install.js` to consume the new schema, plus updating all installer-related tests. Substantial work that goes beyond the cull. **Not recommended for Phase 1.**

**Recommendation:** go with Option A. Update CULL-08's interpretation in PLAN.md to read: "filesystem under `agents/gsd-*.md` is exactly 22; filesystem under `commands/gsd/*.md` is exactly 37; `docs/INVENTORY.md` headline counts and roster rows match the filesystem." Then write `tests/install-manifest-matches-surviving.test.cjs` as a thin assertion of those filesystem facts (plus, optionally, an extra check that `install-manifest.json`'s `sources.commands.src` and `sources.agents.src` paths still resolve to existing directories).

**Migration note for the planner:** rename the test file to `tests/cull-surviving-counts.test.cjs` if you prefer accuracy over naming continuity — CONTEXT.md is locked on the deletion list and stub semantics, but Claude's Discretion explicitly covers concrete file paths for new test files.

### 2.6. Migration table format (CULL-07)

**File 1:** `commands/gsd/help.md` — currently displays the GSD command reference from `get-shit-done/workflows/help.md`. The migration table is added either to `help.md` directly or to the workflow body.

**File 2:** `CHANGELOG.md` — root-level changelog. The migration table goes in a `### v1.X — Phase 1 Cull` section.

**Format (single canonical table — same in both files):**

```markdown
## Command Migration (Phase 1 Cull)

The following commands were removed in this milestone. Use the replacement listed below.

| Removed Command | Replacement | Notes |
|-----------------|-------------|-------|
| `/gsd-audit-fix`           | _(none)_                           | Removed; functionality not replaced. |
| `/gsd-audit-uat`           | _(none)_                           | Removed. |
| `/gsd-forensics`           | _(none)_                           | Removed. |
| `/gsd-health`              | _(none)_                           | Removed. |
| `/gsd-stats`               | _(none)_                           | Removed; use `git log` directly. |
| `/gsd-scan`                | _(none)_                           | Removed. |
| `/gsd-intel`               | _(none)_                           | Removed; intel subsystem retired. |
| `/gsd-map-codebase`        | _(none)_                           | Removed; use editor / Grep directly. |
| `/gsd-graphify`            | _(none)_                           | Removed. |
| `/gsd-debug`               | _(none)_                           | Removed; use a debugging tool of choice or `Task` with reasoning. |
| `/gsd-explore`             | _(none)_                           | Removed; use `/gsd-progress` or read `STATE.md`. |
| `/gsd-add-tests`           | _(none — new TDD discipline)_      | Removed. Phase 4 introduces tests-first discipline at executor level (no separate command needed). |
| ... (rows for each of the 49 deleted commands) ... |
| `/gsd-secure-phase`        | `/gsd-review --security`           | **Stub kept.** Dispatches automatically. |
| `/gsd-validate-phase`      | `/gsd-review --coverage`           | **Stub kept.** Dispatches automatically. |
| `/gsd-code-review`         | `/gsd-review --code`               | **Stub kept.** Dispatches automatically. |
| `/gsd-code-review-fix`     | `/gsd-review --code-fix`           | **Stub kept.** Dispatches automatically. |
| `/gsd-critique`            | `/gsd-review --critique`           | **Stub kept.** Dispatches automatically. |
| `/gsd-plan-review-convergence` | `/gsd-review --converge`       | **Stub kept.** Dispatches automatically. |
| `/gsd-add-phase`           | `/gsd-phase add`                   | Old command removed; no stub. |
| `/gsd-insert-phase`        | `/gsd-phase insert`                | Old command removed; no stub. |
| `/gsd-remove-phase`        | `/gsd-phase remove`                | Old command removed; no stub. |

## Agent Removals (Phase 1 Cull)

The following agents were deleted. Their functionality is either subsumed by surviving agents or removed entirely.

| Removed Agent | Replacement / Notes |
|---------------|---------------------|
| `gsd-debugger` | Removed. Use main thread reasoning + Task tool. |
| `gsd-debug-session-manager` | Removed. |
| `gsd-doc-writer` | Removed. Documentation work happens in main thread or via plan-phase tasks. |
| `gsd-doc-classifier` / `gsd-doc-synthesizer` / `gsd-doc-verifier` | Removed (doc subsystem retired). |
| `gsd-domain-researcher` / `gsd-eval-auditor` / `gsd-eval-planner` / `gsd-framework-selector` / `gsd-ai-researcher` | Removed (AI-integration subsystem retired). |
| `gsd-ui-auditor` / `gsd-ui-checker` / `gsd-ui-researcher` | Removed (UI subsystem retired). |
| `gsd-codebase-mapper` | Removed. Use editor + Grep + `gsd-pattern-mapper` for code analysis. |
| `gsd-intel-updater` | Removed (intel subsystem retired). |
| `gsd-nyquist-auditor` | Removed. Test-coverage gap detection lands in Phase 4 TDD layer. |
```

**Test (`tests/migration-table-present.test.cjs`, CULL-07 owner — minimal grep test):**

```javascript
test('commands/gsd/help.md (or its workflow body) contains migration table', () => {
  const helpMd = fs.readFileSync('commands/gsd/help.md', 'utf-8');
  const workflowMd = fs.readFileSync('get-shit-done/workflows/help.md', 'utf-8');
  const combined = helpMd + workflowMd;
  for (const removed of ['/gsd-audit-fix', '/gsd-secure-phase', '/gsd-add-phase']) {
    assert.match(combined, new RegExp(removed.replace(/-/g, '\\-')),
      `migration table missing entry for ${removed}`);
  }
});
test('CHANGELOG.md contains Phase 1 cull migration section', () => {
  const cl = fs.readFileSync('CHANGELOG.md', 'utf-8');
  assert.match(cl, /Phase 1 Cull|phase-1-cull|Command Migration/i,
    'CHANGELOG.md missing Phase 1 cull section');
  // Spot-check a few entries
  for (const removed of ['/gsd-audit-fix', '/gsd-secure-phase']) {
    assert.match(cl, new RegExp(removed.replace(/-/g, '\\-')),
      `CHANGELOG.md migration section missing ${removed}`);
  }
});
```

---

## 3. Reference-Rot Landmines (Specific Files Today That Reference Deleted Names)

This is the **highest-risk part of the cull**. Project-level PITFALLS.md §1.1 covers reference-rot at category level; this section pins down the specific files that need editing. Verified by inspection.

### 3.1. CRITICAL — CLI module reference-rot (causes runtime errors, not just stale prose)

| File | Line(s) | References | Action |
|------|---------|-----------|--------|
| `bin/install.js` | 30–42 | `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`, all 6 critic agents (which survive) | Remove the 3 deleted agents from `CODEX_AGENT_SANDBOX`. Keep critics. |
| `bin/install.js` | (further down — claudeToCopilotTools, etc.) | Multiple agent name references | Remove deleted agent entries. Verify with grep `grep -n 'gsd-(debugger|codebase|nyquist|doc-|ui-|domain-|eval-|framework|ai-research|intel-update)' bin/install.js`. |
| `bin/install.js` | 4331–4333 | `gsd-intel-index.js`, `gsd-intel-session.js`, `gsd-intel-prune.js` | These are already removed-flagged comments — no action, but verify the comments don't need deletion too. |
| `get-shit-done/bin/lib/model-profiles.cjs` | 16–27 | `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`, `gsd-ui-researcher`, `gsd-ui-checker`, `gsd-ui-auditor`, `gsd-doc-writer`, `gsd-doc-verifier` (all deleted) | Remove these 8 entries from the model-profiles map. |
| `get-shit-done/bin/lib/intel.cjs` | 319 | "Run gsd-tools intel update or spawn gsd-intel-updater agent for full refresh" | Remove the entire suggestion or the whole intel module if it's no longer used. |
| `get-shit-done/bin/lib/docs.cjs` | 15, 251 | `gsd-doc-writer` (deleted) | This file may be redundant entirely (was the doc subsystem) — check whether anything else uses it; if not, delete. If yes, replace with a non-agent-referencing fallback. |
| `get-shit-done/bin/lib/init.cjs` | 922 | `gsd-codebase-mapper` (deleted) | Remove the line; if `mapper_model` is consumed downstream, replace with `null` or remove the consumer too. |

**Discovery procedure:** `grep -rnE 'gsd-(debugger|debug-session|doc-(writer|classifier|synthesizer|verifier)|domain-researcher|eval-auditor|eval-planner|framework-selector|ai-researcher|ui-(auditor|checker|researcher)|codebase-mapper|intel-updater|nyquist-auditor)' bin/ get-shit-done/bin/`

**Risk:** if a CLI module references a deleted agent and the calling code path fires post-cull, the user gets a runtime "agent not found" error mid-workflow. The orphan-reference test catches the *file-level* match but does NOT catch *behavioral* runtime fallback. Mitigation: surviving CLI module logic that references deleted agents must be functionally rewired or the surrounding feature deleted.

**Check before merging Wave 1:** run `node bin/install.js --dry-run` (or equivalent) on a fresh sandbox and verify the installer completes without referring to deleted agents. If `bin/install.js` has integration tests (it does — see `tests/agent-install-validation.test.cjs`), these will catch CLI-level breakage.

### 3.2. HIGH — Surviving agent prompts referencing deleted commands/agents

`grep -lE '/gsd-(audit|forensics|health|stats|scan|intel|map-codebase|graphify|debug|explore|spike|sketch|note|inbox|review|fast|do|next|session-report|spec-phase|import|ultraplan|list-phase-assumptions|docs-update|ingest-docs|from-gsd2|add-tests|analyze-dependencies|cleanup|secure-phase|validate-phase|code-review|critique|plan-review-convergence|add-phase|insert-phase|remove-phase)' agents/*.md` reveals:

- `agents/gsd-verifier.md` (line ~ TBD): mentions `/gsd-debug` for fault investigation. Replace with: "investigate manually; debugger agent has been retired."
- `agents/gsd-pattern-mapper.md`: may reference `gsd-codebase-mapper`. Replace with self-contained guidance.
- `agents/gsd-roadmapper.md`: may reference deleted commands in examples. Update.

**Recommended scan command** (run before authoring tasks):

```bash
for name in audit-fix audit-uat forensics health stats scan intel map-codebase graphify ai-integration-phase ui-phase ui-review eval-review spike sketch spike-wrap-up sketch-wrap-up debug explore note plant-seed add-backlog thread review-backlog audit-milestone plan-milestone-gaps milestone-summary archive-project restore-project ship undo inbox review manager autonomous fast 'do' next session-report spec-phase import ultraplan-phase list-phase-assumptions docs-update ingest-docs from-gsd2 add-tests analyze-dependencies cleanup; do
  grep -l "/gsd-${name}\b" agents/*.md commands/gsd/*.md get-shit-done/workflows/*.md 2>/dev/null | grep -v "/gsd-${name}\.md$"
done
for agent in gsd-debugger gsd-debug-session-manager gsd-doc-writer gsd-doc-classifier gsd-doc-synthesizer gsd-doc-verifier gsd-domain-researcher gsd-eval-auditor gsd-eval-planner gsd-framework-selector gsd-ai-researcher gsd-ui-auditor gsd-ui-checker gsd-ui-researcher gsd-codebase-mapper gsd-intel-updater gsd-nyquist-auditor; do
  grep -l "${agent}" agents/*.md commands/gsd/*.md get-shit-done/workflows/*.md bin/install.js get-shit-done/bin/lib/*.cjs 2>/dev/null | grep -v "${agent}\.md$"
done
```

The planner should run this scan and either:
- (a) include each found file in the appropriate cull commit's reference-rot fix, or
- (b) include a single "Wave 1 commit 0: reference-rot scrub" task that handles all of them at once.

**Recommendation: (b) — single reference-rot scrub commit before any deletion.** Cleaner sequencing, single failure site to investigate if something breaks, and the orphan-reference test stays green continuously after the scrub commit.

### 3.3. MEDIUM — Workflow files referencing deleted commands/agents

`get-shit-done/workflows/*.md` contain orchestration prompts. After the cull:
- `get-shit-done/workflows/help.md` — main help text; absolutely needs the migration table.
- `get-shit-done/workflows/diagnose-issues.md` — may reference `/gsd-debug` (deleted).
- `get-shit-done/workflows/plan-phase.md` — may reference `/gsd-graphify`, `/gsd-stats` (deleted).
- `get-shit-done/workflows/execute-plan.md` — may reference `/gsd-add-tests` (deleted).
- `get-shit-done/workflows/verify-work.md` — may spawn `gsd-debugger` (deleted).
- `get-shit-done/workflows/audit-fix.md`, `audit-uat.md`, `audit-milestone.md`, `analyze-dependencies.md`, `cleanup.md`, etc. — these are the workflow bodies for the deleted commands. **Should also be deleted** (the workflow file is paired with the command file). The deletion list in the design spec covers commands; the planner should pair each command deletion with the corresponding workflow file deletion.

**Action:** the per-category deletion commits should each delete BOTH `commands/gsd/<name>.md` AND `get-shit-done/workflows/<name>.md` if the workflow exists and is unique to that command.

### 3.4. LOW — Documentation referencing deleted commands

`docs/AGENTS.md`, `docs/COMMANDS.md`, `docs/ARCHITECTURE.md` — these are user-facing docs that surface deleted names. Updates are mostly cosmetic but the orphan-reference test will fail until they're cleaned. The existing `tests/agents-doc-parity.test.cjs` and `tests/commands-doc-parity.test.cjs` already enforce parity between docs and the filesystem, so docs updates fall out of the same cleanup naturally.

### 3.5. LOW — Test fixtures and integration tests referencing deleted commands

`tests/<deleted-command>-*.test.cjs` files paired with deleted commands are deleted alongside their commands per design spec testing strategy. **Identified deletions:**

```bash
ls tests/ | grep -E '^(audit-fix|audit-uat|forensics|health|stats|scan|intel|graphify|map-codebase|debug|explore|note|spike|sketch|ai-integration|ui-phase|ui-review|eval-review|fast|do-|next|session-report|spec-phase|import|ultraplan|list-phase-assumptions|docs-update|ingest-docs|from-gsd2|add-tests|analyze-dependencies|cleanup|secure-phase|validate-phase|code-review|critique|plan-review|add-phase|insert-phase|remove-phase|inbox|undo|ship|review|archive|restore|manager|autonomous)'
```

The planner should run this `ls` exactly to enumerate each file before authoring deletion tasks.

`integration/skill-execution.test.cjs` and `integration/gsd-lifecycle.test.cjs` may exercise some commands directly; the lifecycle test's step 4 (`/gsd-critique`) and step 10 (`/gsd-stats`) need updating per §1.4.4.

---

## 4. Test Inventory and Bazel Target Wiring

### 4.1. Tests run via `npm test` (Node native), not Bazel, for `tests/`

[VERIFIED: `package.json` `scripts.test`, `scripts/run-tests.cjs` lines 1–35]

`tests/` test files use `node --test` directly. No Bazel target needed. New test files just need to be `.test.cjs` and live under `tests/`. The runner globs them automatically.

**Implication for Phase 1:** the four NEW static tests do NOT need a `tests/BUILD.bazel` update (there isn't one). They run automatically once the file exists.

### 4.2. Live tests run via Bazel `js_test` from `integration/BUILD.bazel`

[VERIFIED: read `integration/BUILD.bazel` lines 1–43]

The phase-1-cull tag must be added to all new live tests in this phase. Concrete `integration/BUILD.bazel` patch:

```python
load("@aspect_rules_js//js:defs.bzl", "js_test")

# Existing fast tier — no API
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers"],
    size = "large",
    tags = ["integration", "local"],
    timeout = "long",
) for test_file in [
    "fork-preservation.test.cjs",
    "gsd-tools-workflow.test.cjs",
    "multi-user-resolution.test.cjs",
]]

# Existing moderate tier — single skill, real API
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers"],
    size = "large",
    tags = ["integration", "local", "requires-api-key"],
    timeout = "long",
) for test_file in [
    "skill-execution.test.cjs",
]]

# NEW — Phase 1 cull live tests (added in this phase)
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = [
        "//integration/helpers:test_helpers",
        "//integration:test_fixtures",       # NEW js_library — see below
        "//integration:lifecycle_steps",      # NEW js_library — see below
    ],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-1-cull", "parity"],
    timeout = "long",
) for test_file in [
    "cull-spine-smoke.test.cjs",   # New: smoke-test post-cull spine
]]

# NEW — js_library targets so per-step files and fixtures are visible to tests
load("@aspect_rules_js//js:defs.bzl", "js_library")

js_library(
    name = "test_fixtures",
    srcs = glob(["test-fixtures/**"]),
    visibility = ["//integration:__subpackages__"],
)

js_library(
    name = "lifecycle_steps",
    srcs = glob(["lifecycle-steps/*.cjs"]),
    visibility = ["//integration:__subpackages__"],
)

# UPDATED — lifecycle test now depends on lifecycle_steps + test_fixtures + phase-1-cull tag
js_test(
    name = "gsd-lifecycle",
    entry_point = "gsd-lifecycle.test.cjs",
    data = [
        "//integration/helpers:test_helpers",
        "//integration:lifecycle_steps",
        "//integration:test_fixtures",
    ],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "lifecycle", "phase-1-cull"],
    timeout = "eternal",
)
```

**Why two new `js_library` targets:** Bazel `js_test` can only see files declared in `data`. Per-step files in `integration/lifecycle-steps/` and fixtures in `integration/test-fixtures/` need to be exposed to tests via library targets. Without them, the composer `require('./lifecycle-steps/step-3-plan-phase.cjs')` fails at Bazel runtime (the file isn't in the runfiles tree).

**`integration/helpers/BUILD.bazel`** — add `agent-parity.cjs`, `lifecycle-utils.cjs`, optionally `walltime-recorder.cjs` to the existing `test_helpers` library glob.

### 4.3. Per-phase test inventory (XCUT-05 — required in PLAN.md)

| Test file | Layer | REQ-IDs verified | Notes |
|-----------|-------|------------------|-------|
| `tests/cull-no-orphan-references.test.cjs` | static | TEST-01 | 6 syntactic contexts × 8 scan roots |
| `tests/parity-baselines-stale.test.cjs` | static | TEST-05 | 90-day window; `staleness_acknowledged` override |
| `tests/install-manifest-matches-surviving.test.cjs` | static | CULL-01, CULL-02, CULL-08 | Filesystem-count test (interpretation per §2.5); not a JSON-manifest parser |
| `tests/consolidated-review-flags.test.cjs` | static | CULL-03, CULL-05 | Asserts `review.md` mentions all 6 flags + 6 stubs are present with deprecation markers |
| `tests/consolidated-phase-subcommands.test.cjs` | static | CULL-04 | Asserts `phase.md` accepts add/insert/remove subcommands |
| `tests/migration-table-present.test.cjs` | static | CULL-07 | Asserts migration table exists in `commands/gsd/help.md` (or workflow body) and `CHANGELOG.md` |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` (corpus) + `integration/helpers/agent-parity.cjs` | live infra | TEST-02, TEST-03 | ~24 baseline files; helper supports 3 schemas + N=5 + walltime ledger |
| `integration/gsd-lifecycle.test.cjs` (decomposed) + `integration/lifecycle-steps/step-N-*.cjs` | live | TEST-04, CULL-06 | Composer + 9 step files (post-cull lifecycle); shape JSON at `test-fixtures/lifecycle-shapes/post-cull.json` |

**Total:** 8 distinct test entries (6 static + 2 live infra/lifecycle). This matches the design spec's "~6-8 tests per phase" target.

### 4.4. Walltime ledger writer setup (XCUT-03 setup; primary owner Phase 2)

**File:** either modify `integration/helpers/claude-runner.cjs` to append after each `runClaudeWithTools` call, or new `integration/helpers/walltime-recorder.cjs` exposing `recordWalltime({ test, walltime_ms, cost_usd, phase })`.

**Recommendation:** new helper file. Reasons: (a) existing `runClaudeWithTools` callers don't all want walltime recording (e.g., lifecycle test step 9 `/gsd-progress` is small), (b) opt-in via explicit `recordWalltime` call from tests is cleaner than auto-recording, (c) the helper can be unit-tested in isolation against a fake JSONL file.

**Phase 1 ledger entry shape (JSONL line):**

```json
{"date":"2026-04-29","test":"agent-parity:gsd-critic-plan","walltime_ms":42100,"cost_usd":4.8,"phase":"phase-1-cull"}
```

**Phase 1 callers:** `runAgentParity` calls `recordWalltime` for each of the N=5 runs. Lifecycle test does NOT need to call it (Phase 1 doesn't need lifecycle walltime data; Phase 2 critic-batch-walltime test will be the first heavy consumer).

### 4.5. Phase exit gate (XCUT-01)

```bash
# All static tests pass
npm test

# All Phase 1 live tests pass
bazel test //integration/... --test_tag_filters=phase-1-cull

# Full lifecycle test passes
bazel test //integration:gsd-lifecycle

# Tag the phase
git tag gsd-slim-phase-1-cull
```

The git tag is applied ONLY after all three commands pass. If a test fails, fix and re-run; do not tag.

---

## 5. Sequencing Risks and Mitigations

### 5.1. Wave 0 → Wave 1 ordering is hard

**Risk:** if Wave 1 starts before Wave 0 completes, baselines are captured against post-cull agents (which might already have orphan-reference fixes that subtly drift behavior); the parity contract becomes "post-cull vs post-cull" which is meaningless.

**Mitigation:** Wave 0 capture-baseline commit MUST land before any agent file is modified — even non-cull edits like reference-rot fixes inside surviving agent prompts. The capture-baseline commit's `_meta.captured_commit` SHA must precede every cull commit chronologically.

**Verification:** the planner should bake into Wave 1 plans an explicit gate that checks `git log <baseline-commit>..HEAD -- agents/` returns empty before the cull begins.

### 5.2. Reference-rot fix order vs deletion order

**Risk:** if the audit/diagnostic group (9 commands) is deleted before the agent prompts that mention `/gsd-stats`, `/gsd-graphify` are cleaned, the orphan-reference test fails between commits.

**Mitigation:** **Single "reference-rot scrub" commit BEFORE any deletion commits.** Land it at the start of Wave 1, then category-by-category deletions become reference-clean by definition. Per §3.2.

### 5.3. Group-N deletion before group-M deletion

**Risk:** some surviving files reference both audit-group commands AND specialty-phases commands; if the audit group is deleted first and the specialty group's references aren't yet cleaned, the orphan-reference test fails.

**Mitigation:** the reference-rot scrub commit (§5.2) cleans ALL references at once, so deletion order across groups is independent. Each category commit is internally consistent.

### 5.4. Lifecycle decomposition before vs after cull

**Risk:** decomposing the lifecycle test in Wave 0 while it still exercises pre-cull commands (`/gsd-stats`, `/gsd-critique`) means the per-step files reference deleted commands. The orphan-reference test won't fire on `integration/lifecycle-steps/step-10-stats.cjs` because that file is allow-listed... but it will fire on the test if the allow-list isn't comprehensive.

**Mitigation:** decompose with the pre-cull steps (10 of them) in Wave 0; in the Wave 1 group-15 commit (per CONTEXT.md sequencing), update the per-step files for the post-cull spine — delete `step-10-stats.cjs`, rename `step-4-critique.cjs` to `step-4-review-critique.cjs`, swap the prompt text. The shape JSON file gets created in the post-cull commit.

### 5.5. Capturing baseline against an already-modified agent file

**Risk:** if the planner accidentally edits `agents/gsd-planner.md` (e.g., to fix a reference-rot mention of `/gsd-graphify`) BEFORE the baseline-capture commit, the captured baseline reflects the post-edit version, defeating Phase 6's parity contract.

**Mitigation:** baseline capture is the very first Wave 0 deliverable AFTER the orphan-reference test (which can fail loudly without modifying agent files — it's a static scan). Order: orphan-test infra → parity helper → **baseline capture commit** → reference-rot scrub commit → cull commits.

**Test:** the baseline capture commit's `_meta.captured_commit` SHA can be cross-checked against `git log` to ensure no agent file modifications precede it.

### 5.6. `_shared/` directory does not exist yet

**Verified:** `agents/_shared/` does not exist as of this research. Phase 2 will create it for `critic-base.md`. **Phase 1 does NOT create the `_shared/` directory or its contents.** If the orphan-reference test scans `agents/`, it should be `agents/gsd-*.md` only (matching the existing surviving-agent count test), not `agents/**`. Future Phase 2 will need to update the scan to include `agents/_shared/`.

### 5.7. CLI module breakage from removing agent references

**Risk highlighted in §3.1:** removing `gsd-codebase-mapper` from `model-profiles.cjs` while `init.cjs` line 922 (`mapper_model: resolveModelInternal(cwd, 'gsd-codebase-mapper')`) still calls it produces a runtime error in any code path consuming `mapper_model`.

**Mitigation:** the cull commit must also remove the `mapper_model` resolution AND any caller of `mapper_model`. The orphan-reference test catches the string mention; existing CLI tests (`tests/agent-install-validation.test.cjs`, etc.) catch the behavior. Run both before declaring the commit safe.

### 5.8. Test count drift (existing 247 → +6 new = 253)

`scripts/run-tests.cjs` globs all `tests/*.test.cjs`. Adding 6 new test files just bumps the count. **No test runner config update needed.** [VERIFIED: read `scripts/run-tests.cjs` lines 11–18]

### 5.9. Lifecycle test cost during Wave 0 development

**Cost:** running the full lifecycle test (~$50/run, ~30min) repeatedly during decomposition is expensive. Per user instruction cost is not a constraint, but development velocity matters.

**Mitigation:** during Wave 0 decomposition, run individual step files via `node --test integration/lifecycle-steps/step-3-plan-phase.cjs` (each step file is independently runnable as long as the sandbox setup is shared). Only run the full composed lifecycle test as Phase 1 exit-gate verification.

---

## 6. Validation Architecture

`workflow.nyquist_validation` is not explicitly false in `.planning/config.json` (verified — the section is treated as enabled by default per researcher instructions). Phase 1 has substantial structural validation work; this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js native test runner (`node --test`), v22 (per `MODULE.bazel` line 9) |
| Config file | None — `scripts/run-tests.cjs` globs `tests/*.test.cjs` directly. Test concurrency is `--test-concurrency=4` by default. |
| Quick run command | `npm test` (runs all 247+ static tests in `tests/`); for a single new test file: `node --test tests/cull-no-orphan-references.test.cjs` |
| Full suite command | `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Static scan finds zero orphan references across all surviving content | static | `node --test tests/cull-no-orphan-references.test.cjs` | ❌ Wave 0 |
| TEST-02 | `runAgentParity` helper exists and exports correct API | static + integration | `node --test tests/agent-parity-helper-shape.test.cjs` (new — verifies the helper exports) + indirect via integration tests using it | ❌ Wave 0 |
| TEST-03 | Baseline corpus exists with `_meta` block per file | static | `node --test tests/parity-baselines-shape.test.cjs` (verifies every baseline has `_meta.captured_at`, `_meta.agent`, etc.) | ❌ Wave 0 |
| TEST-04 | Lifecycle decomposed; composer references step files; shape JSON exists | static + live | static via `node --test tests/lifecycle-decomposed.test.cjs`; live via `bazel test //integration:gsd-lifecycle` (full pipeline) | ❌ Wave 0 |
| TEST-05 | Baseline staleness guard fires on stale baselines | static | `node --test tests/parity-baselines-stale.test.cjs` | ❌ Wave 0 |
| CULL-01..02 | 37 commands + 22 agents on filesystem | static | `node --test tests/install-manifest-matches-surviving.test.cjs` | ❌ Wave 1 |
| CULL-03 | `/gsd-review` accepts 6 flags | static | `node --test tests/consolidated-review-flags.test.cjs` | ❌ Wave 1 |
| CULL-04 | `/gsd-phase` accepts 3 subcommands | static | `node --test tests/consolidated-phase-subcommands.test.cjs` | ❌ Wave 1 |
| CULL-05 | 6 deprecation stubs exist with deprecation markers | static | (covered by `tests/consolidated-review-flags.test.cjs`) | ❌ Wave 1 (combined) |
| CULL-06 | Full GSD spine completes end-to-end on fixture | live | `bazel test //integration:gsd-lifecycle` | Existing test file; updated for post-cull spine in Wave 1 |
| CULL-07 | Migration table present in help.md + CHANGELOG.md | static | `node --test tests/migration-table-present.test.cjs` | ❌ Wave 1 |
| CULL-08 | filesystem + INVENTORY.md surviving counts equal | static | (covered by `tests/install-manifest-matches-surviving.test.cjs` per §2.5 reinterpretation; existing `tests/inventory-counts.test.cjs` and `tests/agents-doc-parity.test.cjs` provide additional coverage) | ❌ Wave 1 |
| XCUT-01 | Git tag `gsd-slim-phase-1-cull` exists post-pass | manual | `git tag -l 'gsd-slim-phase-1-cull'` | n/a (tag applied after exit-gate) |
| XCUT-02 | Phase-tag-filtered Bazel run passes | live | `bazel test //integration/... --test_tag_filters=phase-1-cull` | n/a (existing harness; tag added in `integration/BUILD.bazel`) |
| XCUT-05 | PLAN.md contains test inventory section | static (manual review) | n/a | n/a (planner self-audit) |

### Sampling Rate

- **Per task commit:** `npm test` (the relevant tests only — but our CI doesn't yet support per-task scoping, so full `npm test` is the floor; ~2 min for the full static suite).
- **Per wave merge:** `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull`. Wave 0 merge can defer the live test until baselines are captured (live tests depend on baselines). Wave 1 merge includes the full lifecycle.
- **Phase gate:** full suite green: `npm test && bazel test //integration/... --test_tag_filters=phase-1-cull && bazel test //integration:gsd-lifecycle`.

### Wave 0 Gaps

- [ ] `tests/cull-no-orphan-references.test.cjs` — covers TEST-01
- [ ] `tests/fixtures/cull-deletion-list.cjs` — data fixture for the orphan-reference test
- [ ] `tests/parity-baselines-stale.test.cjs` — covers TEST-05
- [ ] `tests/agent-parity-helper-shape.test.cjs` (suggested, not in CONTEXT.md) — verifies `agent-parity.cjs` exports the right API; covers TEST-02
- [ ] `tests/parity-baselines-shape.test.cjs` (suggested, not in CONTEXT.md) — verifies every baseline file has the `_meta` block; covers TEST-03 structural part
- [ ] `tests/lifecycle-decomposed.test.cjs` (suggested, not in CONTEXT.md) — verifies composer references step files in `integration/lifecycle-steps/`; covers TEST-04 structural part
- [ ] `integration/helpers/agent-parity.cjs` — the helper itself
- [ ] `integration/helpers/lifecycle-utils.cjs` — shared utils for per-step files (extracted from current inline helpers in `gsd-lifecycle.test.cjs`)
- [ ] `integration/helpers/walltime-recorder.cjs` (recommended) — opt-in walltime ledger writer
- [ ] `integration/lifecycle-steps/step-N-<name>.cjs` × 9 (post-cull) — extracted from current inline lifecycle test
- [ ] `integration/test-fixtures/lifecycle-shapes/post-cull.json` — pipeline shape definition
- [ ] `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json` × ~24 — baseline fixture inputs
- [ ] `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` × ~24 — baseline outputs (committed in single named commit)
- [ ] `integration/test-fixtures/walltime-ledger.jsonl` — empty file, ready for first append
- [ ] `integration/BUILD.bazel` updates — `phase-1-cull` tag, new `js_library` targets for `lifecycle_steps` and `test_fixtures`

(If no gaps would have remained: "None — existing test infrastructure covers all phase requirements" — but every Phase 1 test file is new, so the gaps list is comprehensive above.)

---

## 7. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Orphan-reference scanning | A custom file walker + AST parser per file type | Plain `fs.readdirSync` recursion + per-syntactic-context regex over file content | Phase 1 cull is one-shot work; building a full AST scanner is over-engineering. Existing repo tests use exactly this pattern (e.g., `tests/agents-doc-parity.test.cjs` line 17–20). |
| Markdown frontmatter parsing | A YAML library install | Native regex `^---\n([\s\S]*?)\n---/` (already used in `integration/gsd-lifecycle.test.cjs` line 64) | Keeps the static test dep-free; matches existing repo style. |
| Baseline diffing | A custom JSON diff library | Schema-aware comparison logic in `runAgentParity` (set comparison for findings, structural compare for plans, schema validation for spine agents) | Generic JSON diff is too noisy for LLM output (wording variation breaks exact match); schema-aware comparison is the actual contract. |
| LLM-as-judge backstop | A new judge prompt / scaffolding | Reuse the existing pattern from `integration/gsd-lifecycle.test.cjs` lines 376–383 (Claude validates content with `maxBudget: 0.5`) | Already proven; same idiom; same cost ceiling. |
| Walltime trend regression | Build now in Phase 1 | Defer to Phase 6 (XCUT-04 owner); Phase 1 only sets up the ledger file + writer | Phase 6 needs accumulated data; building the trend test in Phase 1 would test against an empty ledger. |
| Subcommand parsing for `/gsd-phase add` | A real argument parser library | Inline `<process>` body branching on `$1` token (matches existing GSD slash-command idioms) | Slash commands are markdown prompts that Claude executes; argument parsing happens at prompt-execution time, not at parse time. Existing GSD commands use this idiom (verified in `commands/gsd/plan-phase.md`). |
| Reference rot detection at runtime | Custom agent-existence pre-checks in every orchestrator | The static `tests/cull-no-orphan-references.test.cjs` running on every commit | The static test is the cheaper, more reliable gate. Runtime pre-checks add complexity without catching anything the static test doesn't. |

**Key insight:** Phase 1 is mostly mechanical refactoring with one significant new infrastructure piece (the parity helper + baseline corpus). Resist the temptation to add scaffolding, abstractions, or libraries during the cull. Every line added is a line that needs maintenance.

---

## 8. Common Pitfalls (Phase 1-Specific)

These are project-research pitfalls (PITFALLS.md §1.1–1.4) crystallized into Phase 1 task-level guidance.

### Pitfall A — Reference rot in CLI modules causes runtime errors, not just stale prose

**Source:** §3.1 above. Verified in `bin/install.js`, `get-shit-done/bin/lib/model-profiles.cjs`, `get-shit-done/bin/lib/intel.cjs`, `get-shit-done/bin/lib/docs.cjs`, `get-shit-done/bin/lib/init.cjs`.
**Failure mode:** removing `gsd-codebase-mapper.md` from `agents/` while `init.cjs` line 922 still calls `resolveModelInternal(cwd, 'gsd-codebase-mapper')` produces a "no model profile for gsd-codebase-mapper" error in any code path that reads `mapper_model`.
**Prevention:** the orphan-reference scan MUST include `bin/` and `get-shit-done/bin/lib/` (per §1.1 scan roots). Each cull commit must remove not just the agent file but every CLI-module reference. Verify with the existing CLI integration tests.
**Warning sign:** static orphan-reference test passes but `bazel test //integration:skill-execution` fails with "agent not found" or "model profile undefined."

### Pitfall B — Baseline captured against post-edit agent file (defeats parity contract)

**Source:** PITFALLS.md §1 + §5.5 above.
**Failure mode:** if the planner edits `agents/gsd-planner.md` to fix a reference to `/gsd-graphify` BEFORE the baseline-capture commit, the baseline reflects the post-edit prose, not the original. Phase 6 trim parity then compares post-trim vs already-edited, missing real drift.
**Prevention:** baseline-capture commit lands FIRST in Wave 0 (after orphan-test infra and parity helper). NO agent file edits precede it. The reference-rot scrub commit lands AFTER baseline capture.
**Warning sign:** `_meta.captured_commit` SHA in any baseline file is later than commits that touch `agents/*.md`.

### Pitfall C — Workflow file deleted but command file kept (or vice versa)

**Source:** §3.3 above.
**Failure mode:** `commands/gsd/audit-fix.md` is deleted but `get-shit-done/workflows/audit-fix.md` lingers (or vice versa). Any Claude session that resolves the workflow path produces stale orchestration; if the command is gone but the workflow lingers, the workflow file becomes dead code that drifts.
**Prevention:** each per-category deletion commit deletes BOTH the command file AND its paired workflow file. Use `for f in audit-fix audit-uat ...; do git rm commands/gsd/$f.md get-shit-done/workflows/$f.md; done` pattern (with `2>/dev/null || true` for cases where one or the other doesn't exist).
**Warning sign:** `find get-shit-done/workflows/ -name "*.md" | sort` shows files matching deleted-command names after Wave 1.

### Pitfall D — `/gsd-stats` removed but lifecycle test still runs it

**Source:** §1.4.4 above.
**Failure mode:** the lifecycle test step 10 (`/gsd-stats`) is in the deletion list. If the lifecycle decomposition keeps step 10 at all, the post-cull lifecycle test fails because `/gsd-stats` doesn't exist.
**Prevention:** post-cull lifecycle has 9 steps (no step 10). Update `integration/test-fixtures/lifecycle-shapes/post-cull.json` accordingly.
**Warning sign:** lifecycle test exits with "command /gsd-stats not found" or hangs at step 10.

### Pitfall E — Deprecation stub recursively dispatches into itself

**Source:** general slash-command implementation pitfall.
**Failure mode:** if the stub `commands/gsd/secure-phase.md` body says "dispatch to /gsd-secure-phase" by accident (typo), it recurses infinitely.
**Prevention:** stub body explicitly names `/gsd-review --security` (not the deprecated name). Test (`tests/consolidated-review-flags.test.cjs`) regex-checks that each stub mentions `/gsd-review <flag>` and does NOT mention itself.
**Warning sign:** invoking the stub command hangs or produces "infinite dispatch" error.

### Pitfall F — Capture-baseline commit too large to review

**Source:** general code-review practice + research/TESTING.md §1.
**Failure mode:** the baseline-capture commit adds ~24 baseline files plus their inputs (~48 files), totaling ~250 KB. Code review can't reasonably eyeball each baseline output for sanity.
**Prevention:** the commit description should list each baseline captured plus its `_meta` block hash for spot-checking. Reviewers focus on the `_meta` blocks (does the date make sense? is the agent name right? is the schema kind right?), not the verbatim outputs.
**Warning sign:** PR review for the capture commit takes >2 hours or rubber-stamps without inspection.

---

## 9. Code Examples

### 9.1. Orphan-reference test core loop (TEST-01)

```javascript
// tests/cull-no-orphan-references.test.cjs
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DELETION_LIST = require('./fixtures/cull-deletion-list.cjs');

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['agents', 'commands/gsd', 'get-shit-done/workflows', 'get-shit-done/templates',
                     'tests', 'integration', 'docs', 'bin', 'get-shit-done/bin/lib'];
const ALLOW_LIST = new Set([
  'tests/fixtures/cull-deletion-list.cjs',
  'tests/cull-no-orphan-references.test.cjs',
  'commands/gsd/secure-phase.md', 'commands/gsd/validate-phase.md',
  'commands/gsd/code-review.md', 'commands/gsd/code-review-fix.md',
  'commands/gsd/critique.md', 'commands/gsd/plan-review-convergence.md',
  'commands/gsd/help.md', 'CHANGELOG.md',
]);

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

describe('orphan-reference scan: no surviving file references a deleted command', () => {
  for (const cmd of DELETION_LIST.deletedCommands) {
    test(`no orphan reference to /${cmd}`, () => {
      const reSlash = new RegExp(`(?<![A-Za-z0-9_-])\\/gsd-${cmd}\\b`, 'g');
      const reAt = new RegExp(`@[^\\s]*?\\/commands\\/gsd\\/${cmd}\\.md\\b`, 'g');
      const violations = [];
      for (const root of SCAN_ROOTS) {
        for (const f of walkFiles(path.join(ROOT, root))) {
          const rel = path.relative(ROOT, f);
          if (ALLOW_LIST.has(rel)) continue;
          const content = fs.readFileSync(f, 'utf-8');
          if (reSlash.test(content)) violations.push(`${rel} (slash-mention)`);
          if (reAt.test(content)) violations.push(`${rel} (@-reference)`);
        }
      }
      assert.deepStrictEqual(violations, [],
        `Found orphan references to /gsd-${cmd}: ${violations.join(', ')}`);
    });
  }
  // Same loop for DELETION_LIST.deletedAgents with agent-name regexes
});
```

### 9.2. Baseline capture call (TEST-03)

```javascript
// scripts/capture-baselines.cjs (one-shot script for the baseline-capture commit)
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { runAgentParity } = require('../integration/helpers/agent-parity.cjs');
const { execFileSync } = require('node:child_process');

const FIXTURE_INVENTORY = require('./fixtures/baseline-fixture-inventory.cjs');
const COMMIT_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();

(async () => {
  for (const { agent, fixtureId, schemaKind } of FIXTURE_INVENTORY) {
    console.log(`Capturing baseline for ${agent} / ${fixtureId} ...`);
    const result = await runAgentParity(agent, { fixtureId }, { kind: schemaKind }, {
      mode: 'capture',
      n: 1,
      maxCostUsd: 10,
      walltimeBudgetMs: 600_000,
      capturedAt: new Date().toISOString().slice(0, 10),
      capturedCommit: COMMIT_SHA,
    });
    if (!result.captured) {
      throw new Error(`Failed to capture baseline for ${agent}/${fixtureId}: ${result.error}`);
    }
  }
  console.log('All baselines captured. Now: git add integration/test-fixtures/baselines/ && git commit -m "chore: capture pre-refactor agent baselines for parity testing"');
})();
```

### 9.3. Lifecycle composer post-decomposition (TEST-04)

```javascript
// integration/gsd-lifecycle.test.cjs (post-decomposition shape)
'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createSandbox } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');
const SHAPE = require('./test-fixtures/lifecycle-shapes/post-cull.json');

const STEPS = SHAPE.expected_steps.map(s => {
  const file = `step-${s.step_num}-${s.name}.cjs`;
  return { meta: s, mod: require(path.join(__dirname, 'lifecycle-steps', file)) };
});

describe('GSD lifecycle pipeline', () => {
  let sandbox;
  const ctx = { env: { GSD_USER: 'test-user' }, results: {} };

  before(() => { sandbox = createSandbox('lifecycle'); });

  for (const { meta, mod } of STEPS) {
    test(`step ${meta.step_num}: ${meta.name}`, async (t) => {
      for (const req of (meta.requires || [])) {
        if (!ctx.results[req]?.success) return t.skip(`prerequisite ${req} did not succeed`);
      }
      const result = await mod.run(sandbox, ctx);
      mod.assertArtifacts(sandbox, result);
      ctx.results[meta.name] = result;
      // Phase 1 doesn't record lifecycle walltime; left as opt-in for downstream phases
    });
  }
});
```

---

## 10. State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 460-line monolithic lifecycle test | Composer + per-step files + JSON shape | Phase 1 Wave 0 | Per-phase update is JSON edit + per-step edit, not a 460-line diff. |
| Manual reference-rot grep at PR-review time | Static `tests/cull-no-orphan-references.test.cjs` running every commit | Phase 1 Wave 0 | Reference rot becomes a CI-blocking issue, not a runtime bug. |
| Live re-runs as parity contract | Recorded baselines in version control | Phase 1 Wave 0 (NEW INFRASTRUCTURE) | Refactor work compares against stable contract; behavior drift is detectable. |
| Single-shot LLM output comparison | N=5 median + severity-stratified thresholds | Phase 1 Wave 0 (NEW INFRASTRUCTURE) | Nondeterminism handled; thresholds calibrated. |
| `/gsd-secure-phase`, etc. as standalone commands | `/gsd-review --security` consolidated, with deprecation stub | Phase 1 Wave 1 | Surface area reduced; muscle memory preserved via stubs. |
| `bin/install.js` and `model-profiles.cjs` reference all 39 agents | Same files, references 22 surviving agents only | Phase 1 Wave 1 | CLI integrity preserved; runtime "agent not found" prevented. |

**Deprecated/outdated patterns retired in Phase 1:**

- The 49 deleted commands (audit/diagnostic, specialty phases, debug/explore, idea capture, milestone extras, git/PR extras, process control, phase manip extras, docs, misc) — replaced by either `/gsd-review`/`/gsd-phase` consolidation or removed outright with no replacement.
- `gsd-debugger`, `gsd-codebase-mapper`, `gsd-nyquist-auditor`, doc-subsystem agents, AI-integration agents, UI agents — replaced by main-thread reasoning + Task tool, or surviving spine agents.
- The 10-step lifecycle test (with `/gsd-stats`) — replaced by 9-step post-cull lifecycle.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The slash-command negative-lookbehind regex `(?<![A-Za-z0-9_-])\/gsd-X\b` correctly distinguishes `/gsd-debug` from `/gsd-debug-session-manager`. | §1.1 | Without the negative lookbehind, every match of `gsd-debug` would also match `gsd-debug-session-manager`, missing nothing but adding noise. With the negative lookbehind on the trailing word boundary, it correctly distinguishes. **Low risk; tested against real content samples.** |
| A2 | YAML frontmatter parsing via existing native regex (per `tests/agent-frontmatter.test.cjs` pattern) handles all current frontmatter styles in the repo. | §1.1 context 5 | If a frontmatter uses unusual indentation or multiline values, the regex misses entries. **Mitigation: orphan test fails loudly on partial matches; add edge-case fixtures during Wave 0.** |
| A3 | The 22 baseline-fixture inventory above is complete (one fixture per spine agent + multi-mode for planner). | §1.3 | If an agent has additional invocation modes not captured here (e.g., critic-plan running in --depth=quick vs --depth=deep), the baselines miss those modes; downstream parity tests don't catch drift in unbaselined modes. **Mitigation: planner reviews each agent's prompt for distinct invocation modes during PLAN.md authoring; adds fixtures as needed.** |
| A4 | Re-using `integration/helpers/claude-runner.cjs` patterns (`runClaudeWithTools`) is sufficient for `runAgentParity` — no new infrastructure for sandbox setup, retries, or budget enforcement is needed. | §1.2 | If specific Phase 2/3/6 parity scenarios require finer-grained control (e.g., per-run sandbox isolation, time-bounded retries), the helper would need extension. **Phase 1 only needs basic functionality; deferred extensions don't break Phase 1.** |
| A5 | Slash-command runtime correctly handles a stub command invoking another command via `<process>` body instructions. | §2.4 | If Claude's slash-command runtime doesn't support nested invocation, deprecation stubs become non-functional. **Mitigation: existing GSD commands use this pattern (verified). Static test asserts the stub mentions the dispatch target; live test (lifecycle smoke) implicitly confirms dispatch works.** |
| A6 | `install-manifest.json` does not need restructuring for CULL-08 to be satisfied; filesystem + INVENTORY.md equality covers the intent. | §2.5 | If the user later interprets CULL-08 strictly as "install-manifest.json contains exact lists of 37 + 22 entries," Option A doesn't satisfy it. **Mitigation: planner explicitly documents this reinterpretation in PLAN.md and the chosen approach. Section §2.5 above lays out both options.** |
| A7 | Removing deleted-agent string references from `bin/install.js` and CLI modules does NOT break the installer's functionality (i.e., the deleted agents are referenced but not dynamically loaded post-install). | §3.1 | If `bin/install.js` actually calls a function that processes the `CODEX_AGENT_SANDBOX` map and treats unknown entries as fatal, removing entries works. If it treats KNOWN entries as required (e.g., asserts all expected agents are installed), removing entries breaks it. **Mitigation: run `bin/install.js --dry-run` against a sandbox after each deletion commit. Existing `tests/agent-install-validation.test.cjs` likely catches this.** |
| A8 | The walltime ledger writer can be a new helper file without breaking existing live tests. | §4.4 | If existing tests' `runClaudeWithTools` callers want walltime auto-recorded, a new helper requires opt-in updates. **Mitigation: opt-in design is what we want; existing tests don't need walltime recording.** |
| A9 | A single "reference-rot scrub" commit before Wave 1 cull commits keeps subsequent commits reference-clean. | §5.2 | If a subsequent surviving file edit re-introduces a deleted-name reference (e.g., adds `/gsd-debug` to a help string), the orphan-reference test catches it on next commit. **Mitigation: the orphan-reference test is the standing safety net; the scrub commit is just a one-time cleanup, not the only check.** |
| A10 | `phase-1-cull` Bazel tag does not collide with other tags or test-tag-filter patterns. | §4.2 | Standard test-tag-filter behavior; tags are purely additive labels. **Confidence HIGH per existing `integration/BUILD.bazel` patterns.** |

---

## Open Questions (RESOLVED)

All questions below were resolved on 2026-04-29 by the orchestrator before plan finalization. Each carries an explicit `RESOLVED:` disposition.

1. **Severity-bucketed key formula final shape (deferred from research SUMMARY.md).**
   - What we know: bucket key is `severity:category:lane` per CONTEXT.md locked schemas.
   - What was unclear: whether `lane` field is reliably present in all 6 critic outputs (some may not emit a `lane` field).
   - **RESOLVED:** When capturing the 6 critic baselines, record whatever `severity`, `category`, and (if present) `lane` fields each critic actually emits. If `lane` is missing for some, fall back to `severity:category` for that critic's bucket key in `runAgentParity`. Plan 04 records the per-critic key formula in each baseline's `_meta.bucket_key_formula` field. The `runAgentParity` helper (Plan 03) treats this `_meta.bucket_key_formula` as the contract — no per-critic special-casing in the helper code itself.

2. **Whether to keep `gsd-research-synthesizer` baseline as `schema-conformance` or `plan-structural`.**
   - What we know: synthesizer is being deleted in Phase 3 but baseline IS captured in Phase 1.
   - What was unclear: synthesizer output is structurally similar to a planner's synthesis section, but it's freestanding markdown, not a PLAN.md.
   - **RESOLVED:** Capture as `schema-conformance` (matches CONTEXT.md decision: "synthesizer is being deleted; baseline is for archival/audit, not active comparison"). Phase 3's plan-merge parity test compares planner's NEW synthesis section against the synthesizer baseline as a sanity check, not a hard contract.

3. **Whether to delete `get-shit-done/bin/lib/intel.cjs` and `docs.cjs` outright.**
   - What we know: intel and docs subsystems are retired (their commands and agents are deleted).
   - What was unclear: are these CJS modules dead code (no callers), or do they have other consumers in surviving CLI flow?
   - **RESOLVED:** Plan 06 (reference-rot scrub) executes `grep -rE "require.*'(intel|docs)\.cjs'"` against the repo as a Task 1 sub-step before deciding. If zero consumers, the modules are removed in the corresponding cull commit (audit/diagnostic group for intel.cjs; docs group for docs.cjs). If consumers exist, only the deleted-agent references are scrubbed. Either disposition is acceptable; the orphan-reference test passes in both cases.

4. **Test concurrency interaction with new tests.**
   - What we know: `npm test` runs with `--test-concurrency=4`.
   - What was unclear: do the new static tests (orphan-reference, baseline-stale, etc.) have any inter-test state that breaks parallelism?
   - **RESOLVED:** Each new static test in this phase MUST use only `fs.readFileSync` (read-only) and own-scope local variables — this is now a constraint on Plan 01, 02, 05, 07, 08, 09 test authoring (not just a recommendation). Plan 09's checkpoint Task 4 includes `TEST_CONCURRENCY=8 npm test` as part of the exit-gate verification to detect any concurrency violation introduced during Wave 0/1.

---

## Environment Availability

> Phase 1 has minimal external dependencies — most work is filesystem manipulation in the GSD repo itself.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All static tests, Bazel JS tests, `runAgentParity` helper | ✓ | 22.x (per `MODULE.bazel` line 9) | — |
| Bazel | Live tests in `integration/` | ✓ (assumed — existing `integration/BUILD.bazel`) | per repo config | — |
| `claude` CLI binary | Baseline capture, live integration tests, lifecycle test | ✓ (verified by `claude-runner.cjs:ensureClaudeBinary` line 34–43) | per system | None — Wave 0 baseline-capture and Wave 1 lifecycle pass require `claude` binary working |
| Live Claude API key | `runAgentParity` actual runs, lifecycle test, smoke tests | ✓ (assumed — existing `requires-api-key`-tagged tests) | n/a | None — without API key, live tests skip; Phase 1 cannot exit |
| `git` | Baseline `_meta.captured_commit`, all commits | ✓ | per system | — |
| ripgrep (`rg`) | Optional faster orphan-reference scanning | likely ✓ (modern dev systems) | n/a | Falls back to `fs.readdirSync` + RegExp.test (already the recommended approach in §1.1) |

**Missing dependencies with no fallback:** Live Claude API access. If the API key is unavailable during Phase 1 execution, the baseline-capture commit cannot be made, blocking Wave 0 → Wave 1 transition. **Cost is not a constraint per user instruction**, so this is purely an availability concern.

**Missing dependencies with fallback:** None.

---

## Sources

### Primary (HIGH confidence — verified by reading project files)

- `/home/danhalem/personal/get-shit-done/install-manifest.json` — verified manifest is copy-rule, not list (lines 1–55); §2.5 correction.
- `/home/danhalem/personal/get-shit-done/bin/install.js` — verified `CODEX_AGENT_SANDBOX` references deleted agents at lines 30–42; §3.1.
- `/home/danhalem/personal/get-shit-done/get-shit-done/bin/lib/model-profiles.cjs` — verified deleted-agent references at lines 16–27; §3.1.
- `/home/danhalem/personal/get-shit-done/get-shit-done/bin/lib/intel.cjs`, `docs.cjs`, `init.cjs` — verified additional reference-rot sites; §3.1.
- `/home/danhalem/personal/get-shit-done/integration/gsd-lifecycle.test.cjs` — read in full (460 lines); §1.4 decomposition strategy verified against current shape.
- `/home/danhalem/personal/get-shit-done/integration/helpers/claude-runner.cjs` — verified `runClaudeWithTools` API, `createSandbox` shape, `duration_ms` return; §1.2 helper design.
- `/home/danhalem/personal/get-shit-done/integration/BUILD.bazel` — verified existing tag scheme; §4.2 patch design.
- `/home/danhalem/personal/get-shit-done/tests/inventory-counts.test.cjs` — verified existing filesystem-vs-INVENTORY.md count enforcement pattern; §2.5 reinterpretation.
- `/home/danhalem/personal/get-shit-done/tests/agents-doc-parity.test.cjs` — verified loop-generated test pattern; §1.1 test design.
- `/home/danhalem/personal/get-shit-done/tests/hook-validation.test.cjs` — verified in-memory fixture testing pattern; §1.1, §2.4.
- `/home/danhalem/personal/get-shit-done/scripts/run-tests.cjs` — verified test runner globs `tests/*.test.cjs`; §4.1.
- `/home/danhalem/personal/get-shit-done/commands/gsd/plan-phase.md` — verified slash-command frontmatter + body dispatch idiom; §2.2, §2.3.
- `/home/danhalem/personal/get-shit-done/commands/gsd/code-review.md`, `add-phase.md` — verified existing command file shapes; §2.2, §2.3.
- `/home/danhalem/personal/get-shit-done/agents/gsd-planner.md` — verified agent frontmatter + `<role>` + `@`-reference patterns; §1.3 fixture inputs.
- `/home/danhalem/personal/get-shit-done/docs/INVENTORY.md` — verified canonical roster file; §2.5.

### Secondary (MEDIUM confidence — project-level research already produced)

- `.planning/users/dan-halem/gsd-slim-and-integrate/research/SUMMARY.md` — Wave 0 mandates, parity threshold rationale, three schemas.
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/PITFALLS.md` §1.1–§1.4 — reference rot, agent-not-found degradation, consolidation hides functionality, parity-baseline unrecoverability.
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/TESTING.md` — five test layers, parity infrastructure design, hook test discipline, lifecycle decomposition rationale.
- `.planning/users/dan-halem/gsd-slim-and-integrate/research/ARCHITECTURE.md` — calibration of cull target.
- `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` — locked design spec.

### Tertiary (LOW — assumptions / extrapolations)

- A3 (22-fixture baseline inventory completeness) is an inferred catalog; planner should cross-check by reading each agent prompt for distinct invocation modes.
- A5 (stub command nested-dispatch behavior) is verified by existing patterns but not tested for this specific stub layout.
- A6 (CULL-08 reinterpretation) is a recommendation, not a user decision — needs validation in PLAN.md authoring.

---

## Metadata

**Confidence breakdown:**
- Wave 0 mechanics (orphan-reference test, parity helper, baseline corpus, lifecycle decomposition, staleness guard): HIGH — patterns well-aligned with existing repo idioms; reference research exists; gaps documented.
- Wave 1 mechanics (consolidation routing, deprecation stubs, manifest update, migration table): HIGH on consolidation and stubs (verified against existing slash-command idioms); MEDIUM-HIGH on manifest update (Option A reinterpretation needs explicit user/planner agreement); HIGH on migration table.
- Reference-rot landmines: HIGH — all major sites verified by direct grep + file inspection.
- Test inventory and Bazel wiring: HIGH — `integration/BUILD.bazel` patch is mechanical; `tests/` doesn't use Bazel.
- Sequencing risks: HIGH on the 7-step ordering; MEDIUM on the lifecycle-decomposition cross-cull risk (mitigation is feasible but the planner needs to choose between two paths in §1.4.5).

**Research date:** 2026-04-29
**Valid until:** 2026-07-29 (90 days; treat as stale if Phase 1 hasn't started by then because GSD codebase will have drifted).
