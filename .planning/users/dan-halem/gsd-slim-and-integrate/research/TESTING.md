# Testing Architecture — GSD Slim + SP Integration + TDD Hardening

**Researched:** 2026-04-28
**Mode:** Project research (testing dimension)
**Domain:** Behavior-parity testing of refactored AI agent prompts; layered TDD enforcement testing; pre-commit hook gate testing; live Claude API integration tests at scale
**Overall confidence:** HIGH for areas grounded in the existing repo's patterns; MEDIUM for parity-measure thresholds (those are project policy, not externally verifiable)

> **Project context anchors used throughout this document:**
> - 248 static/unit tests in `tests/*.test.cjs` (Node native test runner via `npm test`, **not** in Bazel graph) [VERIFIED: read `tests/` directory listing + `package.json` `scripts.test` → `node scripts/run-tests.cjs`]
> - 3-tier integration in `integration/` (Bazel `js_test`): fast (no API), moderate (single skill, real API), enormous (full lifecycle) [VERIFIED: read `integration/BUILD.bazel`]
> - `runClaudeWithTools(prompt, opts)` in `integration/helpers/claude-runner.cjs` is the canonical live runner; uses `--dangerously-skip-permissions`, `--output-format json`, `--max-budget-usd` [VERIFIED: read `integration/helpers/claude-runner.cjs`]
> - `createSandbox(name, opts)` produces a self-contained `.claude/` + `.planning/users/{slug}/` test repo [VERIFIED: same file, lines 139–200]
> - Existing assertion framework: `node:test` + `node:assert/strict` exclusively. No Jest, Mocha, Sinon. Filesystem isolation via temp dirs, not module mocks [CITED: `.planning/codebase/TESTING.md` lines 752–771]

---

## Executive Summary

This refactor needs **five test layers**, each with a clear purpose and a clear "when does this run" trigger:

1. **Static structural tests** (`tests/*.test.cjs`, no API) — file existence, line budgets, frontmatter, reference-rot, regex audits. Run every commit via `npm test`. Fast (<2 min for whole suite).
2. **Static hook tests** (`tests/tdd-gate-*.test.cjs`, no API) — invoke `hooks/tdd-gate.sh` with synthetic staged-diff fixtures. The hook is shell + the diff is a fixture; no actual git mutation needed.
3. **Integration fast tests** (`integration/*-fast.test.cjs`, no API) — sandbox plumbing, helper validation, fixture parsing. Bazel `tags=["integration","local"]`. Run every commit.
4. **Integration moderate tests** (`integration/*-parity.test.cjs`, real API, single agent or single command) — the heart of behavior-parity testing. Bazel `tags=["integration","local","requires-api-key","parity"]`. Run on PRs touching agents.
5. **Integration enormous tests** (`integration/gsd-lifecycle.test.cjs`, real API, full pipeline) — keep one canonical end-to-end test, refresh per phase. Bazel `tags=["...","lifecycle"]`. Run nightly + on-demand.

**Primary recommendation:** Build the parity infrastructure (fixture corpus + `runAgentParity` helper + walltime ledger) **as Phase 0 work in Phase 1's first wave**, before any actual cull is done. Every subsequent phase consumes that infrastructure. If you build cull first, you'll discover parity gaps when it's already too late to compare against the pre-cull baseline.

---

## 1. Behavior-Parity Testing for Refactored Prompts

### Confidence: HIGH (mechanism); MEDIUM (specific thresholds — those are project-policy choices, not externally verifiable)

### The Core Problem

Three distinct refactor patterns need different parity strategies:

| Refactor pattern | Phase | What can drift | Right measure |
|---|---|---|---|
| **Critic shared-base extraction** | 2 | Severity classifications, finding categories, missed criticals | Severity-bucketed key overlap |
| **Planner with merged synthesis** | 3 | Task count, RED-step presence, dependency graph, must-have coverage | Structural fields (count ±10%, must-have set equality) |
| **Light-trim spine agents** | 6 | Section structure, key field presence, output schema conformance | Schema validation + smoke critique |

**Anti-pattern to avoid:** Trying to use one parity measure for all three. Critics emit findings (a list); planner emits PLAN.md (a structured doc); trimmed agents emit varied artifacts. A single measure is either too loose (passes broken refactors) or too tight (fails legitimate variation).

### Prescription: `runAgentParity(agentName, fixtureInput, expectedOutputSchema, opts)`

Add to `integration/helpers/agent-parity.cjs`. Signature:

```javascript
/**
 * Runs the named agent twice — once against the pre-refactor baseline checked
 * into integration/test-fixtures/baselines/<agent>/<fixture-id>.json, once
 * against the live (post-refactor) agent — and asserts equivalence per the
 * supplied schema.
 *
 * @param {string} agentName     — e.g. 'gsd-critic-plan' or 'gsd-planner'
 * @param {object} fixtureInput  — { fixtureId, sandboxFiles, prompt, env }
 * @param {object} schema        — { kind, fields, threshold } — see below
 * @param {object} opts          — { walltimeBudgetMs, maxCostUsd, recordTimings }
 * @returns {ParityResult}       — { pass, baseline, current, deltas, walltime }
 */
function runAgentParity(agentName, fixtureInput, schema, opts) { ... }
```

**Schema kinds** (one per refactor pattern):

```javascript
// For critics — Phase 2
{
  kind: 'critic-findings',
  threshold: 0.85,                    // ≥85% finding overlap by severity-bucketed key
  severities: ['critical', 'major', 'minor'],
  noMissingCritical: true,            // hard fail if any critical baseline finding absent
  fields: ['severity', 'category', 'lane']  // bucketing key
}

// For planner — Phase 3
{
  kind: 'plan-structural',
  taskCountTolerance: 0.10,           // ±10%
  requireMustHaveCoverage: 'set-equality',
  dependencyGraphCheck: 'isomorphic-by-content',
  redStepRequired: true               // every impl task has a RED sub-step
}

// For trimmed agents — Phase 6
{
  kind: 'schema-conformance',
  expectedSections: [...],            // headings present in baseline output
  fieldsPresent: [...],               // YAML frontmatter keys
  smokeCritiqueModel: 'cheap'         // run a tiny LLM-as-judge as a backstop
}
```

### Why Severity-Bucketed Key, Not Exact Match or Free-Form Semantic

Source: design spec Section 6 line 219 (locked at ≥85% overlap by severity-bucketed key).

| Equivalence measure | Suitable? | Why |
|---|---|---|
| **Exact text match** | ✗ | LLMs vary wording deterministically-enough to break exact match while behavior is identical |
| **Embedding similarity** | ✗ | Two findings can be 0.95 cosine-similar yet describe different issues; threshold tuning is a research project of its own |
| **Severity-bucketed key** (`severity:category:lane`) | ✓ | Critics already classify findings by severity + category — match those buckets, count overlap. Coarse enough to absorb wording drift, fine enough to catch semantic drift |
| **LLM-as-judge** | ✓ as a **backstop only** | Run a cheap-model judge ("are these two outputs functionally equivalent? answer YES or NO") **only when** structural check passes but you want a sanity backstop. **Not** as the primary measure — too noisy, too costly to run on every refactor |

The repo already does LLM-as-judge for content-quality validation in `gsd-lifecycle.test.cjs` (lines 376–383, 401–410 — Claude validates mistake/taste entries with a `maxBudget: 0.5` call). Reuse that pattern as a backstop, not a primary measure. [VERIFIED: read `gsd-lifecycle.test.cjs` lines 376–411]

### Realistic Confidence Threshold

The spec mandates **≥85% finding overlap by severity-bucketed key** for critics (locked decision, line 81 of PROJECT.md). For planner structural parity, the spec mandates **task count within ±10%, all must-haves covered, dependency graph equivalent** (line 234 of design spec).

These are **policy thresholds**, not externally validated. They are workable because:
- 85% allows ~1 finding per critic to drift without blocking
- 10% task-count allows the planner to merge or split a task without blocking
- The "no missing critical" hard rule prevents the loose thresholds from masking real regressions

Document these thresholds in `runAgentParity`'s schema and **fail loudly** when they're violated — do not auto-relax.

### Fixture Stability Strategy (the part that bites in practice)

Baselines are recorded **once** before any refactor work begins. The discipline:

1. **Phase 0 baseline capture**: in Phase 1 wave 0, run each agent that will be refactored (critics, planner, every spine agent) against a corpus of fixture inputs and **record the output verbatim** to `integration/test-fixtures/baselines/<agent>/<fixture-id>.json`.
2. **Commit the baselines** in their own commit titled `chore: capture pre-refactor agent baselines for parity testing`. They are now the contract.
3. **Refactor work runs `runAgentParity` against the recorded baseline**, not against a fresh re-run. Fresh re-runs would be "post-refactor vs post-refactor" and miss drift.
4. **When a parity test legitimately needs a baseline update** (e.g., the refactor is a deliberate behavior change), update the baseline file in the **same commit** as the refactor, with a comment explaining why. The PR review process catches accidental rewrites.

**Anti-rot mechanism:** add `tests/parity-baselines-stale.test.cjs` that fails if any baseline is older than 90 days **without** an explicit `staleness_acknowledged: <date>` field. Forces deliberate refresh, prevents silent rot.

**Sources:**
- Existing precedent for canned-output validation: `gsd-lifecycle.test.cjs` lines 376–411 use Claude-as-judge with `maxBudget: 0.5` for content validation [VERIFIED]
- Severity-bucketed threshold rationale: design spec Section 6 line 219, locked decision in PROJECT.md line 81 [CITED]

---

## 2. Pre-Commit Hook Gate Testing (`hooks/tdd-gate.sh`)

### Confidence: HIGH

### The Core Problem

The new `hooks/tdd-gate.sh` rejects:
- Untested-source commits (new source file with no paired test)
- `*.skip` / `*.todo` / `.only(` patterns in staged tests
- `vi.mock(` / `jest.mock(` calls importing from project's own `src/` namespace without `// MOCK: <reason>` annotation within 2 lines

The test for this hook needs to:
1. Be **deterministic** (no flake, no order dependency, no global state pollution)
2. Be **fast** (every test runs in <100ms; no real `git commit` overhead)
3. Cover **both directions** — should-reject AND should-pass (so we know the hook isn't a no-op)

### Prescription: Synthetic Staged-Diff Fixtures (Not Real Git Commits)

The hook reads staged diffs, not the working tree. So **mock the staged diff at the input layer**, not the git repo state.

**Mechanism:** the hook script accepts a `--staged-diff <file>` flag in test mode. The flag is implementation-internal (regular use does not specify it). Tests pass a fixture file containing the exact output of `git diff --cached --name-status` plus an optional `git diff --cached -- <file>` for content-level checks.

```bash
# Production invocation (pre-commit context — gets staged diff from git)
./hooks/tdd-gate.sh

# Test invocation
./hooks/tdd-gate.sh --staged-diff integration/test-fixtures/tdd-gate/skip-pattern.diff
```

**Fixture layout** (`integration/test-fixtures/tdd-gate/`):

```
integration/test-fixtures/tdd-gate/
├── reject/
│   ├── new-source-no-test.diff
│   ├── it-skip-in-test.diff
│   ├── xit-in-test.diff
│   ├── describe-skip.diff
│   ├── only-pattern.diff
│   ├── todo-pattern.diff
│   ├── internal-mock-no-annotation.diff
│   └── catch-all-truthy-assert.diff
└── pass/
    ├── source-with-paired-test.diff
    ├── refactor-existing-source-no-new-test.diff   (carve-out)
    ├── tests-only-commit.diff                       (always allowed)
    ├── internal-mock-with-annotation.diff
    ├── external-mock-no-annotation-required.diff
    └── generated-code-glob-skipped.diff             (per .planning/settings.json)
```

**Why fixtures, not real `git commit`:**
- Real `git commit` requires real git state setup (slow, flaky, OS-dependent)
- Real commits leave artifacts that other tests may see
- `git diff --cached` is a string — capturing strings is the unit of work, so test against strings

This is the same philosophy `tests/hook-validation.test.cjs` uses: it tests the `validateHookFields` function with in-memory fixtures, not by spawning real Claude Code. [VERIFIED: read `tests/hook-validation.test.cjs` lines 41–80]

### Test Layout

Two static tests (in `tests/`, run via `npm test`, no Bazel needed):

```javascript
// tests/tdd-gate-rejects.test.cjs
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HOOK = path.resolve(__dirname, '..', 'hooks', 'tdd-gate.sh');
const FIXTURES = path.resolve(__dirname, '..', 'integration', 'test-fixtures', 'tdd-gate');

function runHook(diffFixture) {
  try {
    execFileSync('bash', [HOOK, '--staged-diff', diffFixture], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '' };
  } catch (err) {
    return { exitCode: err.status || 1, stderr: err.stderr?.toString() || '' };
  }
}

describe('tdd-gate.sh rejects bad commits', () => {
  const rejectDir = path.join(FIXTURES, 'reject');
  for (const f of fs.readdirSync(rejectDir)) {
    test(`rejects: ${f}`, () => {
      const result = runHook(path.join(rejectDir, f));
      assert.notStrictEqual(result.exitCode, 0,
        `Expected ${f} to be rejected; got exit 0. stderr: ${result.stderr}`);
      // Each reject fixture has a `# expect-message: <regex>` directive in line 1
      const expected = fs.readFileSync(path.join(rejectDir, f), 'utf-8')
        .split('\n')[0].match(/# expect-message: (.+)$/)?.[1];
      if (expected) {
        assert.match(result.stderr, new RegExp(expected),
          `Expected stderr to match /${expected}/; got: ${result.stderr}`);
      }
    });
  }
});

// tests/tdd-gate-passes.test.cjs — symmetric, asserts exit 0 on each pass fixture
```

**Pattern note:** loop-generated tests (one `test()` per fixture file) means **adding a new bad-commit pattern requires only adding a fixture file** — no test code changes. This is the same pattern as `agents-doc-parity.test.cjs` (loops over `agentFiles`) [VERIFIED: read lines 32–42].

### Avoiding Flake

Three specific sources of flake to head off:

1. **Bash version differences**: hook uses `[[ ]]` and `set -euo pipefail`. Test on the CI bash version, not the local one. `MODULE.bazel` pins Node 22 [VERIFIED: read `MODULE.bazel` line 9]; pin bash similarly via a check at hook startup that warns if `BASH_VERSION` is < 4.0.
2. **Locale-sensitive regex**: hook regexes for `it.skip` use `\b`. On non-UTF-8 locales, `\b` behavior differs. Force `LC_ALL=C` at hook top.
3. **Path separators**: fixtures must use forward slashes; hook should not do path math (it operates on diff text). Don't introduce path manipulation logic in this hook.

### Layer 3 Completeness Check

Add `tests/tdd-gate-hook-installed.test.cjs`: assert the hook exists, is executable (`fs.statSync().mode & 0o111`), is registered in the project's pre-commit pipeline (`hooks/` directory plus a manifest entry — same shape as existing `tests/hooks-doc-parity.test.cjs` [VERIFIED: file present in `tests/`]).

**Sources:**
- Existing hook test pattern: `tests/hook-validation.test.cjs` (in-memory fixture, function-level test) [VERIFIED]
- Existing hook installation parity test: `tests/install-hooks-copy.test.cjs`, `tests/managed-hooks.test.cjs` [VERIFIED: file listing]
- Loop-generated tests: `tests/agents-doc-parity.test.cjs` lines 32–42 [VERIFIED]

---

## 3. Layered TDD Enforcement Testing (Per-Layer Isolation + Composed)

### Confidence: HIGH

### The Three Layers (recap from design spec lines 102–134)

| Layer | What it does | What enforces it | Failure mode if absent |
|---|---|---|---|
| **1. Prompt enforcement** | `gsd-executor.md` invokes SP TDD skill + `<gsd-tdd-rules>` section. `gsd-planner.md` emits "RED test first" sub-step | Static grep + live executor smoke test | Agent silently writes impl-first |
| **2. Structural validation** | `gsd-plan-checker.md` `TDD-STRUCTURE` rule rejects impl tasks lacking RED sub-step | Live plan-checker against deliberately-bad plan fixture | Plans pass review with no TDD discipline |
| **3. Pre-commit hook** | `hooks/tdd-gate.sh` rejects untested-source commits, skip patterns, internal mocks | Static fixture-based tests (Section 2 above) | Slip through into committed code |

### Per-Layer Isolation Tests (so we know which layer caught what)

The point of three independent layers is **independent failure detection**. Tests must verify each layer **in isolation**.

#### Layer 1 isolation tests — `tests/`

```javascript
// tests/executor-invokes-sp-tdd.test.cjs
//   grep gsd-executor.md for the SP TDD skill invocation marker.
//   Use exact-string check — not a fuzzy regex — so deletion is loud.

// tests/planner-emits-red-step.test.cjs
//   grep gsd-planner.md for "RED test first" emission template.
//   Plus: assert the template includes placeholders for { test_file_path,
//   asserted_behavior } — the design spec requires both (line 109).

// tests/executor-tdd-rules-section.test.cjs
//   Assert <gsd-tdd-rules> section exists in gsd-executor.md.
//   Assert it covers all four rules from design spec lines 110–113:
//   no-skip, no-internal-mock-without-annotation, no-catch-all,
//   watch-test-fail-with-message.
```

**Live verification of Layer 1** — `integration/executor-tdd-discipline.test.cjs` (`tags=["integration","local","requires-api-key","tdd-layer-1"]`):

Run `/gsd-execute-phase` on a fixture phase with one trivial implementation task. Assert:
- (a) executor produces a failing test first (test file exists in commit N, source file exists in commit N+1)
- (b) implementation comes after (commit ordering check)
- (c) tests pass at end of phase
- (d) no `*.skip` patterns in committed test file

This is described in design spec lines 369–371. [CITED]

#### Layer 2 isolation tests — `integration/`

```javascript
// integration/plan-checker-rejects-no-tdd.test.cjs
//   tags=["integration","local","requires-api-key","tdd-layer-2"]
//
//   Feed plan-checker a deliberately-bad plan from
//   integration/test-fixtures/plans/no-red-step.md (impl tasks with no RED).
//   Assert: TDD-STRUCTURE finding emitted at critical severity; plan
//   does not advance.
```

```javascript
// tests/plan-checker-tdd-rule.test.cjs
//   Static grep: gsd-plan-checker.md contains TDD-STRUCTURE rule.
//   Asserts the *prompt* has the rule; live test asserts the rule *fires*.
```

#### Layer 3 isolation tests — already covered in Section 2

### Composed End-to-End Test

After all three layers are tested in isolation, **one** composed live test runs all three together: feed a deliberately-bad plan into `/gsd-plan-phase` → expect Layer 2 rejection. Fix Layer 2 → feed clean plan → expect executor to write tests first (Layer 1). Try to commit untested source → expect Layer 3 rejection.

```javascript
// integration/tdd-layered-composition.test.cjs
//   tags=["integration","local","requires-api-key","tdd-composition","slow"]
//   Walltime budget: 8 min. Cost budget: $15.
```

### Failure Mode: Two Layers Both Reject (Over-Blocking)

This is a real risk. Example: Layer 2 rejects a plan because of missing RED step → user fixes plan → Layer 1 re-checks at executor invocation → executor's `<gsd-tdd-rules>` section also rejects because the plan-checker change wasn't propagated to the rendered plan.

**Mitigation in test design:** the composed test above asserts each layer fires **at most once per artifact**. After Layer 2 rejects the plan and the user fixes it, Layer 1 must accept on next run, not re-reject.

**Anti-pattern to avoid in implementation:** layers re-checking each other's invariants. Each layer has one specific job:
- Layer 1: agent prompt instructs the right behavior
- Layer 2: structural pre-flight catches plans that *would* lead to wrong behavior
- Layer 3: backstop catches any source-without-test that slipped through Layers 1 and 2

If a layer's test reveals it's checking something another layer also checks, **delete the duplication** rather than coordinate.

**Sources:**
- Design spec lines 102–134 (three-layer specification) [CITED]
- Design spec lines 369–371 (live executor TDD discipline test) [CITED]
- Existing structural-validation precedent: `tests/planner-decomposition.test.cjs` (file present) tests planner output structure without LLM call [VERIFIED: file listing]

---

## 4. Test Fixtures for AI Agent Inputs/Outputs

### Confidence: HIGH

### Prescription: `integration/test-fixtures/` with Strict Subdirectory Layout

```
integration/test-fixtures/
├── README.md                    # describes layout, freshness policy, baseline-update rules
├── specs/                       # canned brainstorm spec docs for SP→GSD integration tests
│   ├── well-formed-milestone.md
│   ├── well-formed-single-phase.md
│   ├── missing-success-criteria.md
│   ├── missing-recommended-next-step.md
│   └── malformed-sections.md
├── phases/                      # canned phase fixtures (CONTEXT.md, RESEARCH.md, PLAN.md trios)
│   ├── trivial-impl/            # one trivial task — used for executor TDD discipline test
│   │   ├── CONTEXT.md
│   │   └── PLAN.md
│   ├── multi-task/              # multi-task phase — used for planner parity
│   └── tdd-violator/            # plan with NO red sub-step — used for Layer 2 rejection
├── plans/                       # individual plan fixtures (used by plan-checker tests)
│   ├── no-red-step.md
│   └── all-impl-tasks-have-red.md
├── critiques/                   # canned plan + code artifacts for critic parity
│   ├── plan-with-known-issues.md
│   └── code-with-known-smells.cjs
├── tdd-gate/                    # see Section 2 for full layout
│   ├── reject/
│   └── pass/
└── baselines/                   # recorded pre-refactor agent outputs (the contract)
    ├── critic-plan/
    │   ├── plan-with-known-issues.json   # captured 2026-04-29
    │   └── ...
    ├── critic-code/
    ├── ...
    ├── planner/
    │   └── multi-task.json
    └── trimmed-agents/
```

**Why this layout:**
- **`specs/`, `phases/`, `plans/`, `critiques/`, `tdd-gate/`** = inputs (canonical, hand-authored, version-controlled forever)
- **`baselines/`** = outputs (recorded once before refactor begins; updated only with explicit reason)
- The two are kept separate because **inputs are the contract; outputs are the captured behavior under the contract**. Mixing them invites accidental input drift when updating an output.

### Pattern Already Present in Repo

The repo currently has `integration/fixtures/` (referenced in test files but mostly empty). [VERIFIED: directory exists per `ls integration/`.] Promote this to the structured layout above. Move existing fixture content into the appropriate subdirectory.

### Anti-Rot Mechanisms

Three concrete tests that prevent fixture rot:

```javascript
// tests/fixture-readme-current.test.cjs
//   Assert integration/test-fixtures/README.md mentions every subdirectory.
//   Forces README updates when adding a new fixture category.

// tests/fixture-naming-conventions.test.cjs
//   Assert every fixture file matches the naming convention for its directory.
//   E.g. tdd-gate/reject/*.diff each has a `# expect-message:` line.

// tests/parity-baselines-stale.test.cjs (mentioned in Section 1)
//   Assert no baseline JSON is older than 90 days without staleness_acknowledged.
```

### Fixture Update Discipline

When a refactor PR legitimately changes baseline behavior:
1. Update the baseline file **in the same commit** as the agent change.
2. Add a comment in the baseline JSON's top-level `_meta.changed_because` field explaining why.
3. The PR description must reference the baseline update.

This is documented in `integration/test-fixtures/README.md` and enforced by `tests/parity-baselines-stale.test.cjs` checking for `_meta.changed_because` on any baseline modified in the last 30 days.

**Sources:**
- Existing fixture directory: `integration/fixtures/` (present, partially populated) [VERIFIED]
- Project pattern of "captured-then-asserted" for canonical content: `tests/agents-doc-parity.test.cjs` enforces inventory rows match agent files [VERIFIED]

---

## 5. Live Claude API Tests at Scale

### Confidence: HIGH (mechanism is verified in existing code); MEDIUM (specific walltime budgets — needs first-pass calibration before locking)

### Walltime Budgeting Per Test

The existing pattern in `gsd-lifecycle.test.cjs` already demonstrates the right shape: each Claude call has its own `timeout` and `maxBudget`. [VERIFIED: lines 32–48]

**Prescriptive budget tiers:**

| Test tier | Walltime budget per Claude call | Cost budget per Claude call | Total walltime per test |
|---|---|---|---|
| Skill smoke (e.g., `/gsd-progress`) | 120s | $5 | <3 min |
| Single-agent parity (critics, plan-checker) | 180s | $10 | <5 min |
| Single-command live (e.g., `/gsd-plan-phase`) | 600s (10 min) | $30 | <12 min |
| Composed three-layer TDD test | 8 min total | $15 | <10 min |
| Full lifecycle (`gsd-lifecycle.test.cjs`) | 600s per step × 10 steps | $50 (`step 1`), $30 (most), $50 (`step 5`) | <30 min |

**These match what's already in `gsd-lifecycle.test.cjs`** — see lines 188 (`maxBudget: 50, timeout: 600_000`), 222 (`maxBudget: 30`), 248 (`maxBudget: 30`), 322 (`maxBudget: 50`). [VERIFIED] Prescription: codify these as named constants in `claude-runner.cjs`:

```javascript
// integration/helpers/claude-runner.cjs additions
const BUDGET_PRESETS = {
  smoke:           { timeout: 120_000, maxBudget: 5  },
  agentParity:     { timeout: 180_000, maxBudget: 10 },
  commandLive:     { timeout: 600_000, maxBudget: 30 },
  lifecycleHeavy:  { timeout: 600_000, maxBudget: 50 },
  judge:           { timeout:  30_000, maxBudget: 0.5 },
};
module.exports.BUDGET_PRESETS = BUDGET_PRESETS;
```

Tests then call:

```javascript
const { runClaudeWithTools, BUDGET_PRESETS } = require('./helpers/claude-runner.cjs');
const result = runClaudeWithTools(prompt, { ...BUDGET_PRESETS.agentParity, cwd: sandbox });
```

**Why named presets, not per-test magic numbers:** when the team decides to bump the budgets globally (e.g., new model is 2× faster), it's one file change, not 30.

### Test-Tagging Scheme for CI

The existing scheme uses Bazel `tags=[...]`. [VERIFIED: `integration/BUILD.bazel`] Extend it as follows:

```python
# integration/BUILD.bazel — extended tag taxonomy

# Existing tier tags
"integration"          # all tests in this directory
"local"                # tests that need local resources
"requires-api-key"     # tests that call real Claude API

# Existing role tags
"lifecycle"            # the enormous full-pipeline test

# New role tags for this refactor
"parity"               # behavior-parity tests (Phase 2, 3, 6)
"tdd-layer-1"          # executor + planner prompt-level TDD enforcement
"tdd-layer-2"          # plan-checker structural TDD validation
"tdd-layer-3"          # pre-commit hook (most live coverage in tdd-composition)
"tdd-composition"      # composed three-layer test
"sp-integration"       # SP↔GSD integration tests (Phase 5)

# New phase tags — one per phase, used to scope CI runs
"phase-1-cull"
"phase-2-critic"
"phase-3-plan-merge"
"phase-4-tdd"
"phase-5-sp-integration"
"phase-6-trim"
```

**CI run patterns** (codified in `.github/workflows/` or wherever CI lives):

| When | What runs |
|---|---|
| Every commit / PR | `npm test` (all 248 static + new statics) + Bazel `test_tag_filters=integration,local,-requires-api-key` (fast tier only) |
| PRs touching `agents/` or `commands/` | + Bazel `test_tag_filters=parity,requires-api-key` |
| PRs touching `hooks/tdd-gate.sh` or `gsd-executor.md` or `gsd-planner.md` | + Bazel `test_tag_filters=tdd-layer-1,tdd-layer-2,tdd-layer-3,requires-api-key` |
| PRs touching SP integration code | + Bazel `test_tag_filters=sp-integration,requires-api-key` |
| Per-phase merge to main | + Bazel `test_tag_filters=phase-N-<name>` (N = phase being completed) |
| Nightly | + Bazel `test_tag_filters=lifecycle,requires-api-key` |
| On-demand (manual workflow_dispatch) | All tags, including `lifecycle` |

This is **the right amount of segmentation**. Each tag exists for a real CI scoping decision; no orphan tags.

### Recording Actual Times for Trend Tracking (Regression Detection on Slowness)

This is explicitly called for in design spec lines 220, 234 ("record actual time for trend tracking", "wall-clock budget … record + assert under threshold").

**Prescription: walltime ledger** — `integration/test-fixtures/walltime-ledger.jsonl`:

```jsonl
{"date":"2026-04-29","test":"critic-batch-walltime","walltime_ms":42100,"cost_usd":4.8,"phase":"baseline"}
{"date":"2026-05-12","test":"critic-batch-walltime","walltime_ms":18300,"cost_usd":2.1,"phase":"after-phase-2"}
{"date":"2026-05-12","test":"plan-phase-walltime","walltime_ms":154200,"cost_usd":18.4,"phase":"baseline"}
{"date":"2026-05-19","test":"plan-phase-walltime","walltime_ms":91800,"cost_usd":11.7,"phase":"after-phase-3"}
```

**Mechanism:** the helper records each live test's `duration_ms` (already returned by `runClaudeWithTools` — see line 308 of `claude-runner.cjs` [VERIFIED]) plus `cost_usd` and appends to the ledger.

```javascript
// integration/helpers/walltime-recorder.cjs
const fs = require('node:fs');
const path = require('node:path');
const LEDGER = path.join(__dirname, '..', 'test-fixtures', 'walltime-ledger.jsonl');

function recordWalltime({ test, walltime_ms, cost_usd, phase }) {
  const line = JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    test, walltime_ms, cost_usd, phase,
  });
  fs.appendFileSync(LEDGER, line + '\n');
}

module.exports = { recordWalltime };
```

**Trend regression test:** `tests/walltime-trend.test.cjs` reads the ledger and asserts that no test has gotten >50% slower over the last 5 entries. (Soft alert, not a hard fail — variance in API latency means strict thresholds will flake. >50% over 5 runs is a real trend.)

**Why JSONL:** append-only, git-friendly diffs, trivially parseable. The repo already uses git for everything; don't introduce a database.

### What to Mock vs Real

The repo's existing testing philosophy is **anti-mock**: filesystem isolation via temp dirs, not module mocks. [CITED: `.planning/codebase/TESTING.md` lines 558–581] Continue this for the refactor.

| Component | Mock or real? | Why |
|---|---|---|
| Claude API | **Real** for live tests; **not invoked at all** for static tests | Mocked Claude responses don't catch prompt drift. The whole point of live tests is to verify prompts work end-to-end. |
| Filesystem | **Real** (temp dirs) | Same as existing tests; mocks miss platform issues. |
| Git | **Real** (`createSandbox` already does this) | Same reason. |
| `gsd-tools.cjs` CLI | **Real** (`runGsdTools` helper) | Already the pattern. |
| SP brainstorming skill (Phase 5) | **Real** for the canonical flow test; **synthetic spec docs** for unit-level spec-reader tests | The spec-reader is a parser — test it with hand-authored fixtures. The actual SP→GSD handoff needs a real brainstorm to verify the addendum activates correctly. |
| Pre-commit hook (Layer 3) | **Synthetic diff fixtures** (Section 2) | The hook is a string processor; testing string processors with strings is faster and cleaner than testing them with real git. |

This is consistent with the project's **anti-mock TDD direction** in design spec lines 110–112 ("No mocking internal modules unless an explicit `// MOCK: <reason>` annotation").

**Sources:**
- Existing budget patterns: `gsd-lifecycle.test.cjs` lines 32–48, 188, 222, 248, 322 [VERIFIED]
- Existing tag scheme: `integration/BUILD.bazel` lines 14, 27, 41 [VERIFIED]
- `runClaudeWithTools` returns `duration_ms`: `claude-runner.cjs` line 308 [VERIFIED]
- Anti-mock philosophy: `.planning/codebase/TESTING.md` lines 558–581, 752–771 [CITED]

---

## 6. Updating `gsd-lifecycle.test.cjs` Across Phases

### Confidence: HIGH

### The Core Problem

`gsd-lifecycle.test.cjs` is 460 lines [VERIFIED: `wc -l` output] and runs the FULL pipeline. The design spec mandates updates in two phases:

- **Phase 1**: use the post-cull spine (different command names, fewer agents)
- **Phase 5**: start from `/sp brainstorm` and use `--from-spec` throughout

Updating an enormous test in-place every phase is brittle. Three things to do.

### Prescription 1: Decompose into Per-Phase Smoke Tests First, Compose into Lifecycle Last

Each step in `gsd-lifecycle.test.cjs` (steps 1–10) currently does the same thing: invoke a skill, assert artifacts. Pull each step into its own free-standing test file, then call them from the lifecycle test.

```
integration/lifecycle-steps/
├── step-1-new-project.cjs        # exports { run, assert }
├── step-2-discuss-phase.cjs
├── step-3-plan-phase.cjs
├── step-4-critique.cjs
├── step-5-execute-phase.cjs
├── step-6-add-mistake.cjs
├── step-7-add-taste.cjs
├── step-8-verify-work.cjs
├── step-9-progress.cjs
└── step-10-stats.cjs
```

Each `step-N-*.cjs` exports:

```javascript
// integration/lifecycle-steps/step-3-plan-phase.cjs
'use strict';

async function run(sandbox, opts) {
  // Invoke /gsd-plan-phase, return { result, artifacts }
}

function assertArtifacts(sandbox, ctx) {
  // Assert plans exist, frontmatter correct, etc.
  // Throws on failure.
}

module.exports = { run, assertArtifacts };
```

Then `gsd-lifecycle.test.cjs` becomes a **composer**:

```javascript
// integration/gsd-lifecycle.test.cjs (post-refactor)
const steps = [
  require('./lifecycle-steps/step-1-new-project'),
  require('./lifecycle-steps/step-2-discuss-phase'),
  // ...
];

describe('GSD lifecycle pipeline', () => {
  let sandbox;
  before(() => { sandbox = createSandbox('lifecycle'); });

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    test(`step ${i + 1}: ${step.name}`, async (t) => {
      if (i > 0 && !steps[i - 1].lastResult) return t.skip(`step ${i} prerequisite missing`);
      const ctx = await step.run(sandbox, { /* opts */ });
      step.assertArtifacts(sandbox, ctx);
      step.lastResult = ctx;
    });
  }
});
```

**Why this matters for phase updates:**

- **Phase 1** changes command names → only modify step-1 through step-10's `run()` calls (each is ~30 lines).
- **Phase 5** changes pipeline shape (start from `/sp brainstorm`) → add `step-0-brainstorm.cjs`, modify `step-1-new-project.cjs` to use `--from-spec`. Lifecycle composer doesn't change.

This is the standard refactor for long-lived test files: extract steps, keep composer thin.

### Prescription 2: Snapshot the Expected Pipeline Shape, Not the Outputs

Don't snapshot the verbatim outputs of each step — those drift constantly. Instead snapshot the **pipeline shape**:

```javascript
// integration/test-fixtures/lifecycle-shapes/post-cull.json
{
  "name": "post-cull spine",
  "phase_marker": "phase-1-complete",
  "expected_steps": [
    { "name": "new-project",     "produces": ["PROJECT.md", "ROADMAP.md", "STATE.md"] },
    { "name": "discuss-phase",   "produces": ["CONTEXT.md"] },
    { "name": "plan-phase",      "produces": ["PLAN.md"], "may_produce": ["RESEARCH.md"] },
    { "name": "review-critique", "produces": ["CRITIQUE.md"] },
    { "name": "execute-phase",   "produces": ["SUMMARY.md"] },
    { "name": "add-mistake",     "produces": ["mistakes/*.md"] },
    { "name": "add-taste",       "produces": ["taste/*.md"] },
    { "name": "verify-work",     "produces": ["VERIFICATION.md"] },
    { "name": "progress",        "produces": [] },
    { "name": "stats",           "produces": [] }
  ]
}

// integration/test-fixtures/lifecycle-shapes/post-sp-integration.json
{
  "name": "post-SP-integration",
  "phase_marker": "phase-5-complete",
  "expected_steps": [
    { "name": "brainstorm",      "produces": ["docs/superpowers/specs/*.md"] },
    { "name": "new-milestone",   "from_spec": true, "produces": ["ROADMAP.md", "STATE.md"] },
    { "name": "discuss-phase",   "from_spec": true, "produces": ["CONTEXT.md"] },
    // ... rest unchanged
  ]
}
```

The lifecycle test reads the appropriate shape file based on the current state of the refactor (controlled by an env var or config flag) and runs the correct step list. This makes the **per-phase update a JSON edit** plus the affected step files, not a 460-line diff.

### Prescription 3: Keep One Lifecycle Test, Not Multiple

Resist the temptation to have `gsd-lifecycle-pre-cull.test.cjs` and `gsd-lifecycle-post-cull.test.cjs` and `gsd-lifecycle-post-sp.test.cjs`. The lifecycle test is the contract for "what the GSD pipeline currently is" — it should always reflect HEAD.

The git history of the lifecycle test (and the shape JSON files) is the record of how the pipeline evolved. PRs that change the lifecycle shape are the right place to review pipeline-level changes.

### Robustness to Per-Phase Changes

The existing `gsd-lifecycle.test.cjs` already has good resilience patterns: graceful skipping when a prerequisite is missing (lines 220, 248, 299, 320), CLI-error-vs-LLM-flakiness handling (lines 334–337), Claude-as-judge for content validation (lines 376–411). [VERIFIED] **Keep all of these.** They are what makes the test usable across multiple LLM-call iterations.

**Sources:**
- Existing lifecycle test patterns: `gsd-lifecycle.test.cjs` lines 220, 248, 299, 320, 334–337, 376–411 [VERIFIED]
- Step decomposition is a standard refactor for monolithic E2E tests (general SE practice; the project's existing structure makes it natural here) [ASSUMED — general SE knowledge, no specific source]

---

## 7. Test Organization for Six Phases (~6–8 New Tests Per Phase)

### Confidence: HIGH

### File Location & Naming

**Two-axis naming convention:**

```
{layer}-{role}-{specific-thing}.test.cjs
```

Where:
- `{layer}` ∈ `{static}` (omitted; default for `tests/`), or `{integration}` (omitted; default for `integration/`)
- `{role}` ∈ `{cull, critic, plan-merge, tdd-gate, tdd-executor, tdd-plan-checker, sp-spec-reader, sp-from-spec, sp-discuss-skip, agent-trim, agent-conventions, walltime-trend, parity-baselines}`
- `{specific-thing}` is the most concrete part

**Phase-by-phase test inventory:**

#### Phase 1 (cull) — design spec lines 318–330

| File | Layer | Bazel tags |
|---|---|---|
| `tests/cull-no-orphan-references.test.cjs` | static | n/a |
| `tests/install-manifest-matches-surviving.test.cjs` | static | n/a |
| `tests/consolidated-review-flags.test.cjs` | static | n/a |
| `tests/consolidated-phase-subcommands.test.cjs` | static | n/a |
| `integration/cull-spine-smoke.test.cjs` | live | `phase-1-cull, requires-api-key, parity` |
| **Updates:** `integration/gsd-lifecycle.test.cjs` (use post-cull commands) | live | `lifecycle, phase-1-cull` |

#### Phase 2 (critic refactor) — design spec lines 332–342

| File | Layer | Bazel tags |
|---|---|---|
| `tests/critic-shared-base-loaded.test.cjs` | static | n/a |
| `tests/critic-line-budget.test.cjs` | static | n/a |
| `tests/critic-batch-invocation.test.cjs` | static | n/a |
| `integration/critic-parity.test.cjs` | live | `phase-2-critic, parity, requires-api-key` |
| `integration/critic-batch-walltime.test.cjs` | live | `phase-2-critic, requires-api-key` (records to walltime ledger) |

#### Phase 3 (plan-phase merge) — design spec lines 344–354

| File | Layer | Bazel tags |
|---|---|---|
| `tests/synthesizer-removed.test.cjs` | static | n/a |
| `tests/plan-phase-parallel-spawn.test.cjs` | static | n/a |
| `integration/plan-phase-parity.test.cjs` | live | `phase-3-plan-merge, parity, requires-api-key` |
| `integration/plan-phase-walltime.test.cjs` | live | `phase-3-plan-merge, requires-api-key` |

#### Phase 4 (TDD hardening) — design spec lines 356–371

| File | Layer | Bazel tags |
|---|---|---|
| `tests/tdd-gate-hook-installed.test.cjs` | static | n/a |
| `tests/tdd-gate-rejects.test.cjs` | static | n/a |
| `tests/tdd-gate-passes.test.cjs` | static | n/a |
| `tests/executor-invokes-sp-tdd.test.cjs` | static | n/a |
| `tests/planner-emits-red-step.test.cjs` | static | n/a |
| `tests/plan-checker-tdd-rule.test.cjs` | static | n/a |
| `integration/executor-tdd-discipline.test.cjs` | live | `phase-4-tdd, tdd-layer-1, requires-api-key` |
| `integration/plan-checker-rejects-no-tdd.test.cjs` | live | `phase-4-tdd, tdd-layer-2, requires-api-key` |
| `integration/tdd-layered-composition.test.cjs` | live | `phase-4-tdd, tdd-composition, requires-api-key` |

#### Phase 5 (SP integration) — design spec lines 373–386

| File | Layer | Bazel tags |
|---|---|---|
| `tests/spec-reader-unit.test.cjs` | static | n/a |
| `tests/from-spec-flag-wired.test.cjs` | static | n/a |
| `tests/brainstorm-addendum-detect.test.cjs` | static | n/a |
| `integration/brainstorm-to-gsd-handoff.test.cjs` | live | `phase-5-sp-integration, sp-integration, requires-api-key` |
| `integration/discuss-phase-gap-skipping.test.cjs` | live | `phase-5-sp-integration, sp-integration, requires-api-key` |
| **Updates:** `integration/gsd-lifecycle.test.cjs` (start from `/sp brainstorm`) | live | `lifecycle, phase-5-sp-integration` |

#### Phase 6 (light agent trim) — design spec lines 388–396

| File | Layer | Bazel tags |
|---|---|---|
| `tests/agent-line-budget.test.cjs` | static | n/a (extends existing `tests/agent-size-budget.test.cjs`) |
| `tests/agent-shared-conventions.test.cjs` | static | n/a |
| `integration/agent-trim-parity.test.cjs` | live | `phase-6-trim, parity, requires-api-key` |

### Bazel BUILD.bazel Structure

Update `integration/BUILD.bazel` to use the extended tag taxonomy from Section 5. Pattern:

```python
load("@aspect_rules_js//js:defs.bzl", "js_test")

# Fast tier — no API
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

# Parity tier — single agent or single command, real API
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers", "//integration:test_fixtures"],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "parity"] + extra_tags,
    timeout = "long",
) for test_file, extra_tags in [
    ("critic-parity.test.cjs",        ["phase-2-critic"]),
    ("critic-batch-walltime.test.cjs", ["phase-2-critic"]),
    ("plan-phase-parity.test.cjs",     ["phase-3-plan-merge"]),
    ("plan-phase-walltime.test.cjs",   ["phase-3-plan-merge"]),
    ("agent-trim-parity.test.cjs",     ["phase-6-trim"]),
]]

# TDD tier — three layers
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers", "//integration:test_fixtures"],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-4-tdd"] + extra_tags,
    timeout = "long",
) for test_file, extra_tags in [
    ("executor-tdd-discipline.test.cjs",     ["tdd-layer-1"]),
    ("plan-checker-rejects-no-tdd.test.cjs",  ["tdd-layer-2"]),
    ("tdd-layered-composition.test.cjs",      ["tdd-composition"]),
]]

# SP integration tier
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers", "//integration:test_fixtures"],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-5-sp-integration", "sp-integration"],
    timeout = "long",
) for test_file in [
    "brainstorm-to-gsd-handoff.test.cjs",
    "discuss-phase-gap-skipping.test.cjs",
]]

# Cull smoke
js_test(
    name = "cull-spine-smoke",
    entry_point = "cull-spine-smoke.test.cjs",
    data = ["//integration/helpers:test_helpers"],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-1-cull", "parity"],
    timeout = "long",
)

# Lifecycle (unchanged shape, updated content per phase)
js_test(
    name = "gsd-lifecycle",
    entry_point = "gsd-lifecycle.test.cjs",
    data = ["//integration/helpers:test_helpers", "//integration:lifecycle_steps", "//integration:test_fixtures"],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "lifecycle"],
    timeout = "eternal",
)
```

Add a `js_library` for `test_fixtures` and `lifecycle_steps`:

```python
# integration/BUILD.bazel — additional libraries
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
```

### Running Each Phase in Isolation

```bash
# Run only Phase 2's parity tests
bazel test //integration/... --test_tag_filters=phase-2-critic

# Run only Phase 4's three-layer tests
bazel test //integration/... --test_tag_filters=phase-4-tdd

# Run all parity tests for any phase
bazel test //integration/... --test_tag_filters=parity

# Run everything except the lifecycle test (the existing pattern)
bazel test //integration/... --test_tag_filters=-lifecycle
```

This means: per-phase development can run JUST that phase's live tests (cost-bounded, fast) without re-running every phase's tests on every commit. The full set runs at PR merge time and nightly.

**Sources:**
- Existing Bazel tag pattern: `integration/BUILD.bazel` [VERIFIED]
- Test file inventory mapped from design spec Section 6 lines 318–396 [CITED]

---

## Summary: Recommended Test Coverage Targets Per Layer

| Layer | Target | Mechanism |
|---|---|---|
| **Static (`tests/`)** | 100% of new structural invariants (line budgets, shared-base loaded, hook installed, manifest matches surviving) | Native `node:test`, run via `npm test` |
| **Hook fixtures (`tests/tdd-gate-*.test.cjs`)** | Every reject pattern + matching pass pattern, both directions | Synthetic staged-diff fixtures |
| **Integration fast (`integration/*.test.cjs`, no API)** | All sandbox plumbing + helper validation | Existing pattern; extend `createSandbox` |
| **Integration parity (`integration/*-parity.test.cjs`, real API)** | Every refactored agent (6 critics, planner, ~15 trimmed agents) | `runAgentParity` helper + baselines |
| **Integration composition (`integration/tdd-layered-composition.test.cjs`)** | One test exercising all three TDD layers in sequence | Live composed test |
| **Integration lifecycle (`integration/gsd-lifecycle.test.cjs`)** | One canonical end-to-end pipeline | Step-decomposed composer |

**Coverage gates per phase exit:**
- All static tests in `tests/` pass (existing `npm test`)
- All Bazel tests with phase-N tag pass
- Lifecycle test passes (when its current shape matches the post-phase pipeline)
- Walltime ledger entries recorded for all live tests run that phase

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | LLM-as-judge with cheap-model `maxBudget: 0.5` is accurate enough for backstop validation | §1 | False positives/negatives in parity backstop; mitigated by it being a backstop only — primary measure is structural |
| A2 | The 50% slowdown threshold for trend detection is a reasonable signal-to-noise tradeoff | §5 | Wrong threshold causes flaky CI; ledger lets you tune empirically |
| A3 | Bash version 4+ is available in CI | §2 | Hook tests fail on older bash; mitigated by version check at hook startup |
| A4 | Step decomposition is the right refactor for `gsd-lifecycle.test.cjs` | §6 | If LLM calls have more cross-step state than expected, decomposition is harder than expected; mitigated by composer keeping `lastResult` propagation |

---

## Sources

### Primary (HIGH confidence — verified by reading project files)
- `/home/danhalem/personal/get-shit-done/integration/BUILD.bazel` — Bazel test config, tag scheme
- `/home/danhalem/personal/get-shit-done/integration/helpers/claude-runner.cjs` — `runClaudeWithTools`, `createSandbox`, budget patterns, `duration_ms` return
- `/home/danhalem/personal/get-shit-done/integration/gsd-lifecycle.test.cjs` — existing lifecycle resilience patterns, budget per step
- `/home/danhalem/personal/get-shit-done/integration/skill-execution.test.cjs` — moderate-tier live test pattern
- `/home/danhalem/personal/get-shit-done/.planning/codebase/TESTING.md` — established testing philosophy (anti-mock, temp dirs, native `node:test`)
- `/home/danhalem/personal/get-shit-done/tests/hook-validation.test.cjs` — existing hook test pattern
- `/home/danhalem/personal/get-shit-done/tests/agents-doc-parity.test.cjs` — loop-generated parity test pattern
- `/home/danhalem/personal/get-shit-done/MODULE.bazel` — Node 22 pin
- `/home/danhalem/personal/get-shit-done/package.json` — `npm test` runs `node scripts/run-tests.cjs` with `node --test`

### Secondary (MEDIUM confidence — design spec citations)
- `/home/danhalem/personal/get-shit-done/docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` — Section 6 (testing strategy) lines 306–400, three-layer TDD lines 102–134, parity thresholds line 219, walltime-recording mandate lines 220, 234

### Tertiary (assumptions, no external source)
- General SE knowledge for step-decomposition pattern (§6, A4)
- Trend-detection threshold heuristics (§5, A2)

---

## Confidence Breakdown

| Area | Level | Reason |
|---|---|---|
| `runAgentParity` helper signature | HIGH | Mechanism mirrors existing `runClaudeWithTools` + design spec mandate |
| Severity-bucketed parity threshold (≥85%) | MEDIUM | Locked decision in PROJECT.md / design spec, but it's project policy not externally validated |
| Hook fixture-based testing | HIGH | Standard SE pattern + matches existing repo style for `tests/hook-validation.test.cjs` |
| Three-layer TDD per-layer isolation | HIGH | Design spec is explicit; mechanisms map cleanly to existing test patterns |
| Walltime ledger format (JSONL) | HIGH | Repo philosophy is git-friendly text; JSONL is append-only |
| Test tag taxonomy | HIGH | Extends existing `integration/BUILD.bazel` cleanly |
| Lifecycle step decomposition | MEDIUM | Sound general SE pattern; specific to this codebase's lifecycle file shape; first iteration may discover cross-step state issues |
| Per-phase test counts (6–8) | HIGH | Direct mapping from design spec Section 6 |

**Research date:** 2026-04-28
**Valid until:** ~2026-07-28 (90 days; project structure stable, only review when refactor completes)
