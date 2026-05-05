# Phase 1: Cull (with Wave 0 test infrastructure) — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** ~35 new files + ~12 modified files (40+ total)
**Analogs found:** 35+ / 35 new files (every new file has a strong analog)

> **Source-of-truth correction (carried forward from RESEARCH.md §2.5 and §1.1):**
>
> 1. `install-manifest.json` is a **copy-rule manifest**, not an inventory. CULL-08 cannot be satisfied by editing it. The pragmatic enforcement is filesystem-count + `docs/INVENTORY.md` row equality, leveraging the existing `tests/inventory-counts.test.cjs` and `tests/inventory-source-parity.test.cjs` family. The new `tests/install-manifest-matches-surviving.test.cjs` should be a **filesystem-count assertion** (37 commands + 22 agents) — NOT a parser of `install-manifest.json`.
> 2. **Static tests are NOT Bazel.** `tests/` runs under `node --test` driven by `scripts/run-tests.cjs` (auto-discovers any `tests/*.test.cjs`). There is no `tests/BUILD.bazel` and Phase 1 should not create one — adding new files to `tests/` is sufficient. Live tests in `integration/` ARE Bazel via `js_test`. CONTEXT.md `<specifics>` ("Add Bazel targets for the new static tests") is incorrect on this point — the planner should drop that task.

---

## File Classification

### NEW FILES (Wave 0 — test infrastructure)

| New file | Role | Data flow | Closest analog | Match quality |
|---|---|---|---|---|
| `tests/cull-no-orphan-references.test.cjs` | static test | file-content scan | `tests/anti-pattern-enforcement.test.cjs` (multi-context grep) + `tests/agent-frontmatter.test.cjs` (multi-file iteration) | role-match (no exact analog of "deletion-list orphan scan") |
| `tests/parity-baselines-stale.test.cjs` | static test | file-mtime / JSON-field scan | `tests/inventory-counts.test.cjs` (filesystem walk + assertion) | role-match (no time-window precedent in repo) |
| `tests/install-manifest-matches-surviving.test.cjs` | static test | filesystem count | `tests/inventory-counts.test.cjs` (exact pattern: filesystem count → assertion) | **exact** |
| `tests/consolidated-review-flags.test.cjs` | static test | command-file shape | `tests/audit-fix-command.test.cjs` (frontmatter + body assertions on a single `commands/gsd/<name>.md`) | **exact** |
| `tests/consolidated-phase-subcommands.test.cjs` | static test | command-file shape | `tests/audit-fix-command.test.cjs` | **exact** |
| `tests/agent-parity-helper-shape.test.cjs` | static test | helper API shape | `tests/code-review-command.test.cjs` (`require()` the module + assert exports + smoke-call signature) | role-match |
| `tests/parity-baselines-shape.test.cjs` | static test | fixture-shape JSON walk | `tests/inventory-source-parity.test.cjs` (walk a directory, assert each file matches a schema) | role-match |
| `tests/lifecycle-decomposed.test.cjs` | static test | structural-shape | `tests/agent-frontmatter.test.cjs` (iterate files in a dir, assert each file has required exports/sections) | role-match |
| `tests/migration-table-present.test.cjs` | static test | markdown-content grep | `tests/anti-pattern-enforcement.test.cjs` (multi-`includes()` content scan against a single .md file) | **exact** |
| `tests/fixtures/cull-deletion-list.cjs` | static fixture (CJS data export) | none (data) | `get-shit-done/bin/lib/model-profiles.cjs` lines 9-34 (CJS module exporting a literal map) — the project's idiomatic CJS-export-fixture pattern. There is no precedent in `tests/` itself; `tests/fixtures/` is empty. | role-match |
| `integration/helpers/agent-parity.cjs` | live-test helper | wraps `runClaudeWithTools` | `integration/helpers/claude-runner.cjs` lines 270-326 (`runClaudeWithTools`) | **exact** (sibling helper, same module) |
| `integration/helpers/lifecycle-utils.cjs` | live-test helper | shared utilities | `integration/helpers/claude-runner.cjs` (sibling helper conventions: `'use strict'`, top-level `module.exports`, `getRepoRoot`) + `integration/gsd-lifecycle.test.cjs` lines 50-137 (helpers currently inlined: `findFiles`, `readFrontmatter`, `walkForDir`, `findPhaseDir`, `findPlans`, `findSummaries`, `findRoadmap` — extract these verbatim) | **exact** (literal extraction from existing test) |
| `integration/helpers/walltime-recorder.cjs` | live-test helper | JSONL append | `get-shit-done/bin/lib/profile-pipeline.cjs` lines 357 + 519 (`fs.appendFileSync(outputPath, JSON.stringify(msg) + '\n')` — the project's idiomatic JSONL append) | **exact** |
| `integration/lifecycle-steps/step-N-<name>.cjs` × 9 | per-step composer module | request-response (Claude API) | `integration/gsd-lifecycle.test.cjs` lines 187-460 (each `test(...)` block becomes one step file with `name`, `run`, `assertArtifacts` exports) | **exact** (literal extraction) |
| `integration/test-fixtures/lifecycle-shapes/post-cull.json` | shape fixture (JSON) | none (data) | No precise analog (`integration/test-fixtures/` is empty save for `.gitkeep`). Closest: `install-manifest.json` (small declarative JSON config in repo root). | partial — new file shape |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json` | input fixture (JSON) | none (data) | Same as above — no analog. Modeled on the JSON shape Claude API responses use (consume `runClaudeWithTools` output). | partial — new file shape |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` | recorded-output fixture (JSON, has `_meta` block) | none (data) | Same as above. | partial — new file shape |
| `integration/test-fixtures/walltime-ledger.jsonl` | append-only JSONL ledger | none (data) | No precedent in repo. | partial — new file shape |

### NEW FILES (Wave 1 — cull artifacts)

| New file | Role | Data flow | Closest analog | Match quality |
|---|---|---|---|---|
| `commands/gsd/review.md` | slash-command (consolidated) | flag-dispatch | `commands/gsd/plan-phase.md` lines 1-52 (frontmatter + flag list in `<context>` + `<process>` body that delegates to a workflow) | **exact** |
| `commands/gsd/phase.md` | slash-command (consolidated) | subcommand-dispatch | `commands/gsd/plan-phase.md` (same — flag list reused for subcommand list) + `commands/gsd/add-phase.md` lines 1-44 (smaller, subcommand-shaped command) | **exact** |
| `commands/gsd/secure-phase.md` (deprecation stub) | slash-command (deprecation stub) | print-then-dispatch | `commands/gsd/secure-phase.md` (current, lines 1-36) — keep frontmatter + structure, replace `<process>` body with deprecation message + dispatch | **exact** (overwrites existing file in place) |
| `commands/gsd/validate-phase.md` (stub) | same | same | same | **exact** |
| `commands/gsd/code-review.md` (stub) | same | same | same | **exact** |
| `commands/gsd/code-review-fix.md` (stub) | same | same | same | **exact** |
| `commands/gsd/critique.md` (stub) | same | same | same | **exact** |
| `commands/gsd/plan-review-convergence.md` (stub) | same | same | same | **exact** |

### MODIFIED FILES

| Modified file | Role | What changes | Pattern to preserve |
|---|---|---|---|
| `install-manifest.json` | manifest | **No change to copy rules; the manifest is structurally generic.** Optional: add a comment / `_phase_1_post_cull_count` informational field. CULL-08 is enforced via filesystem count, not this file. | Keep all 7 source-rule blocks (`workflows`, `researchers`, `bin`, `references`, `templates`, `agents`, `commands`) intact — they are directory-level copy rules, not per-file enumerations. |
| `commands/gsd/help.md` | slash-command (help) | Add migration table section (CULL-07) | Existing structure: frontmatter (lines 1-6) + `<objective>` + `<execution_context>` + `<process>` (delegates to workflow). The migration table goes into `get-shit-done/workflows/help.md`, not into `commands/gsd/help.md` directly — `help.md` only delegates. |
| `CHANGELOG.md` | changelog | Append `## [Unreleased]` entry per Keep-a-Changelog format (current `[Unreleased]` block is empty at line 7); include migration table | Section headers: `### BREAKING CHANGES`, `### Removed`, `### Changed`, `### Added`. See `[6.0.0]` and `[5.0.0]` blocks at lines 9-79 for canonical formatting. |
| `integration/gsd-lifecycle.test.cjs` | live test (composer) | Becomes thin (~50 lines): `before(() => {...})` + iterates over imported steps, calling `step.run(ctx)` then `step.assertArtifacts(ctx)` | Preserve `before(() => { sandbox = createSandbox('lifecycle'); })`, the `claudeOpts(...)` factory, the `runSkill(...)` helper, and step ordering 1→10. Each `test(...)` block becomes `test(step.name, () => step.run(ctx) && step.assertArtifacts(ctx))`. Helpers extract to `integration/helpers/lifecycle-utils.cjs`. |
| `integration/BUILD.bazel` | Bazel BUILD | Add `phase-1-cull` to `tags = [...]` of every new live test added in this phase | Existing pattern: `tags = ["integration", "local", "requires-api-key", "lifecycle"]` (lines 41). New tests use `tags = ["integration", "local", "requires-api-key", "phase-1-cull"]`. The lifecycle target keeps its existing tags + adds `phase-1-cull`. |
| `tests/BUILD.bazel` | (does not exist) | **Do not create.** Static tests are auto-discovered by `scripts/run-tests.cjs` lines 11-15 (`readdirSync(testDir).filter(f => f.endsWith('.test.cjs'))`). New `tests/*.test.cjs` files are picked up automatically. | n/a |
| `bin/install.js` | CLI installer | Remove deleted-agent entries from `CODEX_AGENT_SANDBOX` (lines 26-46): `gsd-codebase-mapper` (line 33), `gsd-debugger` (line 35), `gsd-nyquist-auditor` (line 39) | Keep the `CODEX_AGENT_SANDBOX = { ... }` map literal shape. Surrounding install logic (lines 47+) is untouched. |
| `get-shit-done/bin/lib/model-profiles.cjs` | CLI module | Remove deleted-agent rows from `MODEL_PROFILES` literal (lines 9-34): `gsd-debugger` (16), `gsd-codebase-mapper` (17), `gsd-nyquist-auditor` (21), `gsd-ui-researcher` (23), `gsd-ui-checker` (24), `gsd-ui-auditor` (25), `gsd-doc-writer` (26), `gsd-doc-verifier` (27) | Keep the `MODEL_PROFILES = { ... }` map literal shape. Note `VALID_PROFILES` is derived from `MODEL_PROFILES['gsd-planner']` (line 35) — `gsd-planner` survives, so this is safe. The companion docstring (lines 1-8) referencing `references/model-profiles.md` may need a sync update too. |
| `get-shit-done/bin/lib/intel.cjs` | CLI module | Replace deleted-agent reference at line 319: `'Run gsd-tools intel update or spawn gsd-intel-updater agent for full refresh'` → `'Run gsd-tools intel update for full refresh'` (drop the agent reference; `gsd-intel-updater` is deleted) | The function `intelUpdate()` (lines 314-321) keeps its return-shape `{ action, message }`. Caller behavior on the `'spawn_agent'` action is itself worth verifying — if no surviving caller branches on it, simplify to `{ action: 'manual', message: '...' }`. |
| `get-shit-done/bin/lib/docs.cjs` | CLI module | Two reference-rot sites: line 15 `GSD_MARKER = '<!-- generated-by: gsd-doc-writer -->'` and line 251 `doc_writer_model: resolveModelInternal(cwd, 'gsd-doc-writer')`. **Both are likely dead code** (the `gsd-doc-*` agents are deleted; this module probably no longer runs). The planner should grep for callers and decide: delete the dead branch OR rename the marker to a generic string + remove the `doc_writer_model` field. | If the entire docs.cjs codepath is dead, it is in `bin/lib/` and would survive surface-area cull only if `inventory-counts.test.cjs` shows it in INVENTORY.md. Check first. |
| `get-shit-done/bin/lib/init.cjs` | CLI module | Line 922 `mapper_model: resolveModelInternal(cwd, 'gsd-codebase-mapper')` references a deleted agent. Remove the `mapper_model` field from the init output object. | Verify no caller reads `mapper_model` (it would error after removal). Likely safe — the codebase mapper agent is being deleted entirely. |

---

## Pattern Assignments (concrete excerpts per new file)

### `tests/cull-no-orphan-references.test.cjs` (static test, multi-context grep)

**Primary analog:** `tests/anti-pattern-enforcement.test.cjs` (multi-`includes()` scan against multiple files); **structural analog:** `tests/agent-frontmatter.test.cjs` (multi-file iteration with per-file describe blocks).

**Imports + boilerplate** (`tests/anti-pattern-enforcement.test.cjs` lines 1-17 — copy verbatim, just retarget paths):

```javascript
'use strict';

/**
 * Cull orphan-reference enforcement (TEST-01).
 *
 * Reads tests/fixtures/cull-deletion-list.cjs and scans every surviving
 * surface (agents/, commands/, workflows/, templates/, tests/, integration/,
 * docs/, bin/install.js, get-shit-done/bin/lib/*.cjs) for any mention of
 * a deleted command or agent name across the 6 syntactic contexts.
 *
 * The deletion-list fixture is the source of truth.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { deletedCommands, deletedAgents } = require('./fixtures/cull-deletion-list.cjs');
```

**Allow-list pattern** (RESEARCH.md §1.1 lines 196-211 — copy verbatim into the test):

```javascript
const ALLOW_LIST = new Set([
  'tests/fixtures/cull-deletion-list.cjs',
  'commands/gsd/secure-phase.md',
  'commands/gsd/validate-phase.md',
  'commands/gsd/code-review.md',
  'commands/gsd/code-review-fix.md',
  'commands/gsd/critique.md',
  'commands/gsd/plan-review-convergence.md',
  'commands/gsd/help.md',
  'CHANGELOG.md',
  'tests/cull-no-orphan-references.test.cjs',  // self-reference
]);
```

**Multi-file iteration pattern** (`tests/agent-frontmatter.test.cjs` lines 20-30 — copy verbatim, change directory list):

```javascript
const SCAN_ROOTS = [
  'agents',
  'commands/gsd',
  'get-shit-done/workflows',
  'get-shit-done/templates',
  'tests',
  'integration',
  'docs',
  'bin/install.js',                  // single file, not directory
  'get-shit-done/bin/lib',           // CRITICAL — RESEARCH.md §1.1 #9
  'CHANGELOG.md',
];

function* walkFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) { yield rel; return; }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) yield* walkFiles(path.join(rel, entry.name));
    else if (entry.isFile()) yield path.join(rel, entry.name);
  }
}
```

**Test failure-output pattern** (RESEARCH.md §1.1 lines 215-220 — produce file:line + context):

```javascript
test(`no orphan references to deleted command "${cmd}"`, () => {
  const findings = [];
  for (const rel of walkFiles(/* ... */)) {
    if (ALLOW_LIST.has(rel)) continue;
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Context 2: slash-mention with negative-lookbehind
      if (new RegExp(`(?<![A-Za-z0-9_-])\\/gsd-${cmd}\\b`).test(line)) {
        findings.push(`${rel}:${i + 1} (slash-mention) → ${line.trim()}`);
      }
      // ... contexts 1, 3, 4, 5, 6
    });
  }
  assert.strictEqual(findings.length, 0,
    `Orphan references to /${cmd}:\n  ` + findings.join('\n  '));
});
```

---

### `tests/parity-baselines-stale.test.cjs` (static test, time-window scan)

**Primary analog:** `tests/inventory-counts.test.cjs` (filesystem walk + structural assertion). No exact time-window precedent — invent the pattern.

**Imports + walk** (`tests/inventory-counts.test.cjs` lines 1-20 — copy verbatim, retarget):

```javascript
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINES_DIR = path.join(ROOT, 'integration', 'test-fixtures', 'baselines');
const STALE_DAYS = 90;
const ACK_GRACE_DAYS = 30;
```

**Per-file iteration + JSON-field assertion** (combine `inventory-counts.test.cjs` walk pattern + `audit-fix-command.test.cjs` field-assertion pattern):

```javascript
function* walkBaselines() {
  if (!fs.existsSync(BASELINES_DIR)) return;
  for (const agent of fs.readdirSync(BASELINES_DIR)) {
    const agentDir = path.join(BASELINES_DIR, agent);
    if (!fs.statSync(agentDir).isDirectory()) continue;
    for (const file of fs.readdirSync(agentDir)) {
      if (file.endsWith('.input.json')) continue;     // input fixtures, not baselines
      if (!file.endsWith('.json')) continue;
      yield { agent, file, abs: path.join(agentDir, file) };
    }
  }
}

describe('TEST-05: baselines fresh within 90 days OR explicitly acknowledged', () => {
  for (const { agent, file, abs } of walkBaselines()) {
    test(`${agent}/${file}`, () => {
      const baseline = JSON.parse(fs.readFileSync(abs, 'utf-8'));
      const captured = new Date(baseline._meta.captured_at);
      const ageDays = (Date.now() - captured.getTime()) / 86_400_000;
      if (ageDays <= STALE_DAYS) return;
      assert.ok(baseline._meta.staleness_acknowledged,
        `${agent}/${file}: ${Math.floor(ageDays)} days old; set _meta.staleness_acknowledged or refresh`);
      const acked = new Date(baseline._meta.staleness_acknowledged);
      const ackAgeDays = (Date.now() - acked.getTime()) / 86_400_000;
      assert.ok(ackAgeDays <= ACK_GRACE_DAYS,
        `${agent}/${file}: staleness_acknowledged expired (${Math.floor(ackAgeDays)} days ago)`);
    });
  }
});
```

---

### `tests/install-manifest-matches-surviving.test.cjs` (static test, filesystem count)

**Primary analog:** `tests/inventory-counts.test.cjs` lines 23-59 — copy verbatim, narrow to two families with hardcoded targets.

**Per RESEARCH.md §2.5 correction:** This test is a **filesystem-count assertion** (37 commands + 22 agents), NOT a parser of `install-manifest.json`.

```javascript
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('CULL-01/02/08: surviving counts match Phase 1 cull targets', () => {
  test('exactly 37 commands in commands/gsd/', () => {
    const files = fs.readdirSync(path.join(ROOT, 'commands', 'gsd'))
      .filter((f) => f.endsWith('.md'));
    assert.strictEqual(files.length, 37,
      `Expected 37 commands after Phase 1 cull, found ${files.length}: ${files.sort().join(', ')}`);
  });

  test('exactly 22 agents in agents/', () => {
    const files = fs.readdirSync(path.join(ROOT, 'agents'))
      .filter((f) => /^gsd-.*\.md$/.test(f));
    assert.strictEqual(files.length, 22,
      `Expected 22 agents after Phase 1 cull, found ${files.length}: ${files.sort().join(', ')}`);
  });
});
```

---

### `tests/consolidated-review-flags.test.cjs` and `tests/consolidated-phase-subcommands.test.cjs` (static, command-file shape)

**Primary analog:** `tests/audit-fix-command.test.cjs` lines 1-60 — copy verbatim, retarget the file.

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'commands', 'gsd');

describe('CULL-03: /gsd-review consolidated command', () => {
  const cmdPath = path.join(COMMANDS_DIR, 'review.md');

  test('command file exists', () => {
    assert.ok(fs.existsSync(cmdPath), 'review.md must exist');
  });

  test('frontmatter has name gsd:review', () => {
    const fm = fs.readFileSync(cmdPath, 'utf-8').split('---')[1] || '';
    assert.ok(fm.includes('name: gsd:review'));
  });

  test('argument-hint enumerates all 6 flags', () => {
    const content = fs.readFileSync(cmdPath, 'utf-8');
    for (const flag of ['--code', '--code-fix', '--security', '--coverage', '--critique', '--converge']) {
      assert.ok(content.includes(flag), `argument-hint must list ${flag}`);
    }
  });

  // ... per-flag dispatch assertion
});
```

---

### `tests/agent-parity-helper-shape.test.cjs` (static, helper API shape)

**Primary analog:** `tests/code-review-command.test.cjs` lines 18-28 (the `require()` + `VALID_CONFIG_KEYS.has(...)` pattern — assert exports without invoking).

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const HELPER_PATH = require('path').join(__dirname, '..', 'integration', 'helpers', 'agent-parity.cjs');

describe('TEST-02: runAgentParity helper shape', () => {
  test('module exports runAgentParity', () => {
    const helper = require(HELPER_PATH);
    assert.strictEqual(typeof helper.runAgentParity, 'function');
  });

  test('runAgentParity has 4-arg signature (agentName, fixture, schema, opts)', () => {
    const helper = require(HELPER_PATH);
    assert.ok(helper.runAgentParity.length >= 3);  // opts has default
  });

  test('exports SCHEMAS with critic-findings, plan-structural, schema-conformance', () => {
    const helper = require(HELPER_PATH);
    assert.ok(helper.SCHEMAS);
    for (const k of ['critic-findings', 'plan-structural', 'schema-conformance']) {
      assert.ok(helper.SCHEMAS[k], `missing schema kind: ${k}`);
    }
  });
});
```

---

### `tests/lifecycle-decomposed.test.cjs` (static, structural shape)

**Primary analog:** `tests/agent-frontmatter.test.cjs` lines 20-43 (iterate files in directory, assert each conforms to a shape).

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const STEPS_DIR = path.join(__dirname, '..', 'integration', 'lifecycle-steps');

const stepFiles = fs.readdirSync(STEPS_DIR)
  .filter((f) => /^step-\d+-[a-z-]+\.cjs$/.test(f))
  .sort();

describe('TEST-04: each lifecycle step exports {name, run, assertArtifacts}', () => {
  for (const file of stepFiles) {
    test(file, () => {
      const step = require(path.join(STEPS_DIR, file));
      assert.strictEqual(typeof step.name, 'string');
      assert.strictEqual(typeof step.run, 'function');
      assert.strictEqual(typeof step.assertArtifacts, 'function');
    });
  }

  test('composer references every step file', () => {
    const composer = fs.readFileSync(
      path.join(__dirname, '..', 'integration', 'gsd-lifecycle.test.cjs'), 'utf-8');
    for (const file of stepFiles) {
      assert.ok(composer.includes(file),
        `gsd-lifecycle.test.cjs must require lifecycle-steps/${file}`);
    }
  });
});
```

---

### `tests/migration-table-present.test.cjs` (static, markdown grep)

**Primary analog:** `tests/anti-pattern-enforcement.test.cjs` lines 19-54 — copy the multi-`includes()` pattern verbatim.

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HELP_WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'help.md');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const { deletedCommands, consolidatedCommands } = require('./fixtures/cull-deletion-list.cjs');

describe('CULL-07: migration table in help.md and CHANGELOG.md', () => {
  test('every deleted command appears in help workflow migration table', () => {
    const content = fs.readFileSync(HELP_WORKFLOW, 'utf-8');
    for (const cmd of deletedCommands) {
      assert.ok(content.includes(cmd), `help.md missing migration row for /${cmd}`);
    }
  });

  test('every consolidated command lists its replacement', () => {
    const content = fs.readFileSync(HELP_WORKFLOW, 'utf-8');
    for (const [old, replacement] of Object.entries(consolidatedCommands)) {
      assert.ok(content.includes(old) && content.includes(replacement),
        `help.md missing /${old} → ${replacement}`);
    }
  });

  test('CHANGELOG [Unreleased] block contains migration mirror', () => {
    const content = fs.readFileSync(CHANGELOG, 'utf-8');
    const unreleased = content.split('## [Unreleased]')[1]?.split('## [')[0] || '';
    for (const cmd of deletedCommands.slice(0, 5)) {  // spot-check
      assert.ok(unreleased.includes(cmd), `CHANGELOG [Unreleased] missing /${cmd}`);
    }
  });
});
```

---

### `tests/fixtures/cull-deletion-list.cjs` (static fixture, CJS data export)

**Primary analog:** `get-shit-done/bin/lib/model-profiles.cjs` lines 1-35 — the project's idiomatic CJS-export-of-literal-map pattern. (`tests/fixtures/` is empty save for `.gitkeep`, so no in-test precedent exists.)

**Pattern (`model-profiles.cjs` lines 9-35 — preserve `'use strict'` + jsdoc + literal + `module.exports`):**

```javascript
'use strict';

/**
 * Source of truth for Phase 1 cull. Read by tests/cull-no-orphan-references.test.cjs
 * and (read-only) by tests/migration-table-present.test.cjs.
 */
module.exports = {
  deletedCommands: [
    'audit-fix', 'audit-uat', /* ...49 entries — see CONTEXT.md `<decisions>` */
  ],
  consolidatedCommands: {
    'code-review':              'gsd-review --code',
    'code-review-fix':          'gsd-review --code-fix',
    /* ...9 entries */
  },
  deletedAgents: [
    'gsd-debugger', /* ...17 entries */
  ],
  survivingCommandCount: 37,
  survivingAgentCount: 22,
};
```

**Note:** RESEARCH.md §1.1 lines 117-167 contains a complete fixture file already drafted. The planner can lift it verbatim.

---

### `integration/helpers/agent-parity.cjs` (live-test helper)

**Primary analog:** `integration/helpers/claude-runner.cjs` lines 270-326 (`runClaudeWithTools`) — the helper this one wraps.

**Module shape** (`claude-runner.cjs` lines 1-10 + 270-326 + 328 — preserve structure):

```javascript
'use strict';

const { runClaudeWithTools } = require('./claude-runner.cjs');
const { recordWalltime } = require('./walltime-recorder.cjs');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMAS = {
  'critic-findings':    { kind: 'critic-findings', threshold: 0.85, /* ... */ },
  'plan-structural':    { kind: 'plan-structural', taskCountTolerance: 0.10, /* ... */ },
  'schema-conformance': { kind: 'schema-conformance', /* ... */ },
};

/**
 * @param {string} agentName
 * @param {object} fixture { fixtureId, sandboxFiles, prompt, env }
 * @param {object} schema  one of SCHEMAS values OR { kind, ...overrides }
 * @param {object} opts    { walltimeBudgetMs, maxCostUsd, n=5, recordWalltime, phase, mode='compare' }
 * @returns {Promise<ParityResult>}
 */
async function runAgentParity(agentName, fixture, schema, opts = {}) {
  const N = opts.n ?? (opts.mode === 'capture' ? 1 : 5);
  const runs = [];
  for (let i = 0; i < N; i++) {
    const result = runClaudeWithTools(fixture.prompt, {
      cwd: fixture.cwd,
      timeout: opts.walltimeBudgetMs ?? 300_000,
      maxBudget: opts.maxCostUsd ?? 5,
      env: fixture.env,
      addDirs: fixture.addDirs,
    });
    if (opts.recordWalltime !== false) {
      recordWalltime({
        test: `agent-parity:${agentName}`,
        walltime_ms: result.duration_ms,
        cost_usd: result.cost,
        phase: opts.phase ?? 'phase-1-cull',
      });
    }
    runs.push(result);
  }
  // ... median selection + schema-aware diff (RESEARCH.md §1.2 lines 308-326)
  return { pass, baseline, current, deltas, walltime_ms, cost_usd, per_run_summary: runs };
}

module.exports = { runAgentParity, SCHEMAS };
```

**`runClaudeWithTools` return shape to consume** (`claude-runner.cjs` lines 301-310):

```javascript
return {
  success: parsed.subtype === 'success',
  result: parsed.result || '',
  turns: parsed.num_turns || 0,
  cost: parsed.total_cost_usd || 0,
  duration_ms: parsed.duration_ms || 0,
  raw: parsed,
};
```

---

### `integration/helpers/lifecycle-utils.cjs` (live-test helper, extracted)

**Primary analog:** `integration/gsd-lifecycle.test.cjs` lines 50-137 (helpers currently inlined as closures).

**Pattern: lift these 7 functions verbatim** (preserve names so step files can require them as-is):
- `findFiles(dir, pattern)` (lines 50-61)
- `readFrontmatter(filePath)` (lines 63-68)
- `walkForDir(dir, target)` (lines 70-81)
- `findPhaseDir(sandbox, userSlug)` (lines 86-116) — currently closes over `sandbox`/`userSlug`; extract to take them as args
- `findPlans(sandbox, userSlug)` (lines 118-124)
- `findSummaries(sandbox)` (lines 126-130)
- `findRoadmap(sandbox)` (lines 132-137)

Add `module.exports = { findFiles, readFrontmatter, walkForDir, findPhaseDir, findPlans, findSummaries, findRoadmap };`.

---

### `integration/helpers/walltime-recorder.cjs` (JSONL append)

**Primary analog:** `get-shit-done/bin/lib/profile-pipeline.cjs` line 357 + line 519 — the project's exact JSONL-append idiom.

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEDGER = path.resolve(__dirname, '..', 'test-fixtures', 'walltime-ledger.jsonl');

function recordWalltime({ test, walltime_ms, cost_usd, phase }) {
  if (!fs.existsSync(path.dirname(LEDGER))) {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  }
  const entry = {
    date: new Date().toISOString().slice(0, 10),
    test,
    walltime_ms,
    cost_usd,
    phase,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
}

module.exports = { recordWalltime, LEDGER };
```

The `fs.appendFileSync(path, JSON.stringify(obj) + '\n')` line is a direct copy of `profile-pipeline.cjs:357`.

---

### `integration/lifecycle-steps/step-N-<name>.cjs` × 9

**Primary analog:** `integration/gsd-lifecycle.test.cjs` lines 187-460 — each `test('step N: ...')` block becomes one step file.

**Per-step file shape** (synthesizing the existing `test(...)` blocks + RESEARCH.md §1.4.1):

```javascript
// integration/lifecycle-steps/step-3-plan-phase.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runClaudeWithTools } = require('../helpers/claude-runner.cjs');
const { findFiles, findPhaseDir, findPlans } = require('../helpers/lifecycle-utils.cjs');

const STEP = {
  name: 'plan-phase',
  produces: ['PLAN.md'],

  async run(ctx) {
    return runClaudeWithTools(
      'Run /gsd-plan-phase 1 to create the implementation plan for phase 1.',
      { cwd: ctx.sandbox, timeout: 600_000, maxBudget: 30,
        addDirs: [path.join(ctx.sandbox, '.claude')], env: { GSD_USER: ctx.userSlug } });
  },

  assertArtifacts(ctx, result) {
    const phaseDir = findPhaseDir(ctx.sandbox, ctx.userSlug);
    const plans = findFiles(phaseDir, /PLAN.*\.md$|.*-PLAN\.md$/i);
    if (plans.length === 0) {
      // Skip-on-flake pattern from existing test (line 260-262)
      if (!result.success) return;
      throw new Error(`gsd-plan-phase reported success but created no plans in ${phaseDir}`);
    }
    // ... rename + content assertions (lines 263-294)
  },
};

module.exports = STEP;
```

The current test's CLI-error-tolerance pattern (lines 260-262, 267-273, 286-294) is preserved verbatim — those are battle-tested gracefully-skip-on-flake guards.

---

### `commands/gsd/review.md` (consolidated command)

**Primary analog:** `commands/gsd/plan-phase.md` lines 1-52 (frontmatter + flag list + `<process>` delegation).

```markdown
---
name: gsd:review
description: Quality-gate review (consolidates code-review, security, coverage, critique, converge)
argument-hint: "[phase] [--code | --code-fix | --security | --coverage | --critique | --converge]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
---
<objective>
Run a quality-gate review on a phase. Single entry point for code review, security audit,
coverage validation, plan critique, and review convergence.

**Orchestrator role:** Parse `--<flag>`, dispatch to the corresponding workflow.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/review.md
</execution_context>

<context>
Phase: $ARGUMENTS (optional — auto-detects current phase if omitted).

**Flags (exactly one required):**
- `--code` — Code review (was `/gsd-code-review`)
- `--code-fix` — Code review + auto-fix (was `/gsd-code-review-fix`)
- `--security` — Security audit (was `/gsd-secure-phase`)
- `--coverage` — Coverage validation (was `/gsd-validate-phase`)
- `--critique` — Plan critique (was `/gsd-critique`)
- `--converge` — Plan-review convergence (was `/gsd-plan-review-convergence`)
</context>

<process>
Execute @~/.claude/get-shit-done/workflows/review.md, dispatching on the supplied flag.
Preserve all workflow gates from the consolidated commands.
</process>
```

---

### `commands/gsd/phase.md` (consolidated subcommand command)

**Primary analog:** `commands/gsd/add-phase.md` lines 1-44 (smaller, subcommand-shaped command). Same skeleton as `review.md` above; argument-hint becomes `"<add | insert | remove> <description>"`.

---

### Deprecation stubs (6 files at `commands/gsd/<deprecated-name>.md`)

**Primary analog:** the existing `commands/gsd/secure-phase.md` lines 1-36 — the file is overwritten in place with a minimal stub.

**Stub template** (apply to all 6, swapping flag/old name):

```markdown
---
name: gsd:secure-phase
description: "[DEPRECATED] Use /gsd-review --security instead"
argument-hint: "[phase number]"
allowed-tools:
  - Read
  - Bash
---
<objective>
**DEPRECATED.** This command has been consolidated into `/gsd-review`.

Use: `/gsd-review --security <phase>`

This stub will be removed after milestone N+1.
See `CHANGELOG.md` for the full migration table.
</objective>

<process>
Print the deprecation message, then dispatch:

```
⚠ DEPRECATED: /gsd-secure-phase has been consolidated into /gsd-review.
  Use: /gsd-review --security <phase>
  This stub will be removed after milestone N+1.

  Dispatching now...
```

Then execute `/gsd-review --security $ARGUMENTS`.
</process>
```

The 6 stubs go to: `secure-phase.md`, `validate-phase.md`, `code-review.md`, `code-review-fix.md`, `critique.md`, `plan-review-convergence.md`. Each is in `ALLOW_LIST` of the orphan-reference test (so its own deprecation message doesn't trip the scan).

---

## Shared Patterns

### Static-test boilerplate
**Source:** `tests/agent-frontmatter.test.cjs` lines 11-15 + `tests/inventory-counts.test.cjs` lines 14-21
**Apply to:** Every new `tests/*.test.cjs` file.

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');  // or path.join(__dirname, '..')
```

### Test discovery
**Source:** `scripts/run-tests.cjs` lines 11-15
**Apply to:** All new `tests/*.test.cjs` files — they are auto-discovered. **No BUILD.bazel target needed.**

```javascript
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => join('tests', f));
```

### Live-test helper module conventions
**Source:** `integration/helpers/claude-runner.cjs` lines 1-7 + line 328
**Apply to:** `integration/helpers/agent-parity.cjs`, `integration/helpers/lifecycle-utils.cjs`, `integration/helpers/walltime-recorder.cjs`.

```javascript
'use strict';
// imports from node: + sibling helpers
// ...
module.exports = { /* exports */ };
```

### JSONL append (walltime ledger)
**Source:** `get-shit-done/bin/lib/profile-pipeline.cjs` line 357 (and line 519)
**Apply to:** `integration/helpers/walltime-recorder.cjs`.

```javascript
fs.appendFileSync(outputPath, JSON.stringify(msg) + '\n');
```

### Slash-command frontmatter shape
**Source:** `commands/gsd/plan-phase.md` lines 1-16
**Apply to:** `commands/gsd/review.md`, `commands/gsd/phase.md`, all 6 deprecation stubs.

```yaml
---
name: gsd:<name>
description: <one-liner>
argument-hint: "<arg shape>"
allowed-tools:
  - Read
  - Write
  - Bash
  - ...
---
```

### Slash-command body shape
**Source:** `commands/gsd/plan-phase.md` lines 17-52 (`<objective>` → `<execution_context>` → `<context>` → `<process>` body that delegates to a workflow)
**Apply to:** `commands/gsd/review.md`, `commands/gsd/phase.md`.

### Bazel `js_test` tagging
**Source:** `integration/BUILD.bazel` lines 4-17 (existing tag pattern)
**Apply to:** `integration/BUILD.bazel` modifications for new live tests in this phase.

```python
tags = ["integration", "local", "requires-api-key", "phase-1-cull"]
```

The existing lifecycle target keeps its `lifecycle` tag and **adds** `phase-1-cull`.

### CHANGELOG entry shape
**Source:** `CHANGELOG.md` lines 9-79 (`[6.0.0]` block) and lines 7 (current `[Unreleased]` block)
**Apply to:** `CHANGELOG.md` `[Unreleased]` block update.

```markdown
## [Unreleased]

### BREAKING CHANGES

- **49 commands removed**: see migration table below.
- **17 agents removed**: see migration table below.

### Removed

- ...

### Changed

- **8 commands consolidated into 2** (`/gsd-review`, `/gsd-phase`).

### Migration table

| Old command | Replacement |
|---|---|
| `/gsd-code-review` | `/gsd-review --code` |
| ... | ... |
```

---

## No Analog Found

| File | Role | Data flow | Reason |
|---|---|---|---|
| `integration/test-fixtures/walltime-ledger.jsonl` | append-only JSONL | data | No precedent in repo for a test-fixture-as-state-file. The file starts empty (just touch it). |
| `integration/test-fixtures/lifecycle-shapes/post-cull.json` | shape contract | data | No precedent. Contents derive from the post-cull pipeline's expected step list (`['new-project', 'discuss-phase', 'plan-phase', 'review-critique', 'execute-phase', 'add-mistake', 'add-taste', 'verify-work', 'progress']` — **note `/gsd-stats` removed**, see RESEARCH.md §1.4 line 478). Schema is `{steps: [{name, produces, requires}]}`. |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.input.json` | API input fixture | data | No precedent. Contents are the prompt/sandbox/env triplet passed to `runClaudeWithTools`. |
| `integration/test-fixtures/baselines/<agent>/<fixture-id>.json` | API output fixture (with `_meta`) | data | No precedent. Schema specified in RESEARCH.md §1.3 lines 419-437. |

For the four "no analog" cases, the planner should reference RESEARCH.md sections cited above for the schema. These files are **data**, not **code** — there is no code idiom to copy; they are committed as JSON/JSONL with deterministic shapes.

---

## Modified-File Pattern Notes (CLI reference-rot)

For each of the five `bin/`-side modified files, the change is **localized to a literal map or string** — surrounding behavior is preserved.

### `bin/install.js`

**Pattern preserved:** `CODEX_AGENT_SANDBOX = { 'agent-name': 'sandbox-mode', ... }` map literal (lines 26-46).

**Edit:** Delete the three deleted-agent entries (lines 33, 35, 39). The map literal remains valid; downstream usage iterates `Object.entries(CODEX_AGENT_SANDBOX)` so removal is safe.

### `get-shit-done/bin/lib/model-profiles.cjs`

**Pattern preserved:** `MODEL_PROFILES = { 'agent-name': { quality, balanced, budget, adaptive }, ... }` map literal (lines 9-34).

**Edit:** Delete 8 deleted-agent rows. Caller-side `resolveModelInternal(cwd, 'agent-name')` returns undefined for missing keys — verify no surviving caller passes a deleted name.

### `get-shit-done/bin/lib/intel.cjs`

**Pattern preserved:** `intelUpdate()` function (lines 314-321) returns `{ action, message }`.

**Edit (line 319):** Drop the `gsd-intel-updater` reference from the message string. Consider returning `{ action: 'manual', message: 'Run gsd-tools intel update for full refresh' }`.

### `get-shit-done/bin/lib/docs.cjs`

**Two reference-rot sites** — line 15 (constant) and line 251 (field in returned object). Both reference `gsd-doc-writer`, deleted in Phase 1.

**Triage required (per RESEARCH.md note):** the entire `docs.cjs` codepath may be dead. The planner should `grep -r 'docs.cjs\|require.*docs' get-shit-done/bin/` to find callers. If dead, the simplest fix is to delete the module (and its INVENTORY.md row, and its tests). If alive, both reference sites get patched (rename marker, drop the `doc_writer_model` field).

### `get-shit-done/bin/lib/init.cjs`

**Pattern preserved:** `init()` returns an object with `<agent>_model` fields populated by `resolveModelInternal(cwd, '<agent>')`.

**Edit (line 922):** Remove `mapper_model: resolveModelInternal(cwd, 'gsd-codebase-mapper')`. Verify no caller reads `mapper_model` (likely a self-contained removal).

---

## Metadata

**Analog search scope:** `tests/`, `integration/`, `commands/gsd/`, `agents/`, `get-shit-done/bin/lib/`, `bin/`, `scripts/`, `docs/`, `CHANGELOG.md`, `install-manifest.json`.
**Files scanned:** ~40.
**Pattern extraction date:** 2026-04-29.
**RESEARCH.md sections cross-referenced:** §1.1 (orphan-reference), §1.2 (parity helper), §1.3 (baseline corpus), §1.4 (lifecycle decomposition), §1.5 (staleness), §2.5 (manifest correction).
