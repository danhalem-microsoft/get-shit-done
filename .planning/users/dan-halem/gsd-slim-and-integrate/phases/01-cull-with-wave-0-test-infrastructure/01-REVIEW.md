---
phase: 01-cull-with-wave-0-test-infrastructure
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - bin/install.js
  - get-shit-done/bin/lib/docs.cjs
  - get-shit-done/bin/lib/gsd2-import.cjs
  - get-shit-done/bin/lib/init.cjs
  - get-shit-done/bin/lib/intel.cjs
  - get-shit-done/bin/lib/model-profiles.cjs
  - get-shit-done/bin/lib/profile-output.cjs
  - get-shit-done/bin/lib/verify.cjs
  - integration/BUILD.bazel
  - integration/gsd-lifecycle.test.cjs
  - integration/helpers/agent-parity.cjs
  - integration/helpers/lifecycle-utils.cjs
  - integration/helpers/walltime-recorder.cjs
  - integration/lifecycle-steps/step-1-new-project.cjs
  - integration/lifecycle-steps/step-2-discuss-phase.cjs
  - integration/lifecycle-steps/step-3-plan-phase.cjs
  - integration/lifecycle-steps/step-4-review-critique.cjs
  - integration/lifecycle-steps/step-5-execute-phase.cjs
  - integration/lifecycle-steps/step-6-add-mistake.cjs
  - integration/lifecycle-steps/step-7-add-taste.cjs
  - integration/lifecycle-steps/step-8-verify-work.cjs
  - integration/lifecycle-steps/step-9-progress.cjs
  - integration/skill-execution.test.cjs
  - tests/agent-parity-helper-shape.test.cjs
  - tests/agent-skills-awareness.test.cjs
  - tests/claude-md.test.cjs
  - tests/consolidated-phase-subcommands.test.cjs
  - tests/consolidated-review-flags.test.cjs
  - tests/copilot-install.test.cjs
  - tests/cull-no-orphan-references.test.cjs
  - tests/fixtures/cull-deletion-list.cjs
  - tests/install-manifest-matches-surviving.test.cjs
  - tests/inventory-counts.test.cjs
  - tests/lifecycle-decomposed.test.cjs
  - tests/migration-table-present.test.cjs
  - tests/parity-baselines-shape.test.cjs
  - tests/parity-baselines-stale.test.cjs
findings:
  blocker: 5
  warning: 11
  total: 16
status: issues_found
---

# Phase 1 (cull-with-wave-0-test-infrastructure): Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

The cull and Wave 0 test infrastructure ships substantial work, but the deliverable has multiple defects that escape its own gating tests. The headline issues:

1. The orphan-reference test (`cull-no-orphan-references.test.cjs`) allow-lists `get-shit-done/workflows/help.md`, and the file body still **advertises three deleted commands** (`/gsd-map-codebase`, `/gsd-list-phase-assumptions`, `/gsd-do`) as if they were live — full Usage blocks, not migration table entries. The migration table at the bottom of the same file lists them as Removed, contradicting the body. Users running `/gsd-help` post-cull will see live documentation pointing at commands that no longer exist (BLOCKER).

2. `tests/copilot-install.test.cjs` references **two deleted source commands** (`gsd-health` and `autonomous`) — the test asserts that `commands/gsd/autonomous.md` exists as a source file, and verifies that a `gsd-health/SKILL.md` is produced from the copilot install pipeline. Both `health` and `autonomous` are in the `deletedCommands` fixture, so the source files no longer exist. These tests will fail post-cull (BLOCKER).

3. The CLI dispatcher (`gsd-tools.cjs`) still routes `intel`, `docs-init`, `from-gsd2`, and `init map-codebase` to `lib/intel.cjs`, `lib/docs.cjs`, `lib/gsd2-import.cjs`, and `cmdInitMapCodebase` respectively — even though the user-facing commands and agents that called these are deleted. The handlers + lib files are now unreachable dead surface. The orphan-reference test does not detect this because its `slashMentionExcludes` carve-out and dispatcher-case scanning are silent on routed cases (BLOCKER).

4. The agent-parity helper (`integration/helpers/agent-parity.cjs`) has a misleading "median run" pick (line 153) — `successful[Math.floor(successful.length / 2)]` is documented as "median run by index after sort", but `successful` is **never sorted**. It's the array of successful runs in the order they completed. Compare-mode (Phase 2+) will use this `current` field for delta computation; reading "median" semantics from it will silently produce wrong comparisons (BLOCKER).

5. `recordWalltime` in `walltime-recorder.cjs` claims to require `cost_usd` in its error message, but the validation block does **not** check `typeof entry.cost_usd`. Callers that pass `cost: 0.5` (the field name `claude-runner.cjs` actually returns) will silently write `cost_usd: 0` to the ledger; downstream trend analysis (Phase 6) will see uniformly zero costs (BLOCKER).

The remaining warnings cluster around: (a) tautological assertions that check string length instead of structure (the exact mistake step-6 captures into the registry), (b) silent test mutation that hides planner bugs (step-3 renames PLAN files instead of failing), (c) the agent-skills-awareness test exercises 3 of 22 surviving agents and is mis-named, and (d) several baseline-shape regex/contract issues.

---

## Critical Issues

### CR-01: help.md still advertises 3 deleted commands as live commands

**File:** `get-shit-done/workflows/help.md:51-59`, `:85-92`, `:123-133`

**Issue:** The "Available Commands" body of help.md contains full live-command documentation (header, description, "Usage: " line) for three commands that are in `deletedCommands` per `tests/fixtures/cull-deletion-list.cjs`:

- Line 51-59: `**`/gsd-map-codebase`**` with `Usage: `/gsd-map-codebase``
- Line 85-92: `**`/gsd-list-phase-assumptions <number>`**` with `Usage: `/gsd-list-phase-assumptions 3``
- Line 123-133: `**`/gsd-do <description>`**` with three `Usage: /gsd-do …` examples

Lines 712, 718, 683 of the same file list these commands in the "Removed" migration table. The body and the migration table directly contradict each other. The orphan-reference test (`tests/cull-no-orphan-references.test.cjs`) allow-lists `get-shit-done/workflows/help.md` (line 65 of the test) for the migration table use case, so this drift ships silently.

`/gsd-help` users post-cull will read live documentation pointing at commands that no longer resolve. This is the user-visible regression Phase 1 was supposed to prevent.

**Fix:** Strip the three live-command sections from `help.md` body. The "Removed" migration table is the only place these names should appear. Tighten the orphan-reference allow-list scan to also flag `Usage: /gsd-<deleted-command>` patterns inside allow-listed files, OR add a separate test that asserts the help body never contains `Usage: /gsd-<deleted-command>` for any name in `deletedCommands` minus `slashMentionExcludes`.

---

### CR-02: copilot-install.test.cjs references 2 deleted source commands — tests will fail post-cull

**File:** `tests/copilot-install.test.cjs:617-618`, `:633`, `:635`, `:644-647`, `:698`

**Issue:** Two tests assume source command files that have been deleted in this phase:

1. Lines 617-618, 633, 635, 698 reference `gsd-health` skill output, derived from `commands/gsd/health.md`. `health` is in `deletedCommands`. `commands/gsd/health.md` does not exist. The skill folder will not be created; assertions on its existence and content will fail.
2. Lines 644-669 explicitly assert `assert.ok(fs.existsSync(srcFile), 'commands/gsd/autonomous.md must exist as source')` — but `autonomous` is in `deletedCommands`. `commands/gsd/autonomous.md` does not exist. Test fails on its own fail-fast assertion.

These are not theoretical — verified via `ls /home/danhalem/personal/get-shit-done/commands/gsd/health.md` returning "No such file or directory".

**Fix:** Replace `gsd-health`/`autonomous` with surviving command source files (e.g., `progress.md`, `quick.md`, `discuss-phase.md`). The conversion-logic tests (lines 364, 456, 465, 571, 587 — pure string conversion with synthetic inputs) are fine and don't need changes.

```js
// Replace line 617-618:
assert.ok(fs.existsSync(path.join(tempDir, 'gsd-progress')), 'gsd-progress folder exists');
assert.ok(fs.existsSync(path.join(tempDir, 'gsd-progress', 'SKILL.md')), 'gsd-progress/SKILL.md exists');

// Replace test starting line 644 to use a surviving command, e.g. 'discuss-phase.md'
```

---

### CR-03: gsd-tools.cjs still routes deleted commands to surviving handlers (dead surface)

**File:** `get-shit-done/bin/gsd-tools.cjs:1179-1222`, `:1253-1256`, `:1380-1383`, `:999-1000`

**Issue:** Four dispatcher cases continue to route to handlers whose user-facing entry points (commands or agents) were deleted in this phase:

1. `case 'intel':` (line 1179-1222) routes to `lib/intel.cjs`. `/gsd-intel` is deleted (per `deletedCommands`); `gsd-intel-updater` agent is deleted (per `deletedAgents`). No surviving caller invokes this dispatcher case. `intel.cjs` (638 lines) is dead code.
2. `case 'docs-init':` (line 1253-1256) routes to `lib/docs.cjs:cmdDocsInit`. `/gsd-docs-update` and `/gsd-ingest-docs` are deleted; `gsd-doc-writer`, `gsd-doc-classifier`, `gsd-doc-synthesizer`, `gsd-doc-verifier` agents are deleted. No surviving caller. `docs.cjs` is dead code.
3. `case 'from-gsd2':` (line 1380-1383) routes to `lib/gsd2-import.cjs`. `/gsd-from-gsd2` is in `deletedCommands`. `gsd2-import.cjs` (511 lines) is dead code.
4. `init map-codebase` workflow (line 999-1000) routes to `init.cjs:cmdInitMapCodebase`. `/gsd-map-codebase` is in `deletedCommands`; `gsd-codebase-mapper` agent is in `deletedAgents`. The handler is dead code.

The `cull-no-orphan-references.test.cjs` does not catch this because its scan looks for `/gsd-<name>` slash mentions and `@<path>/commands/gsd/<name>.md` references — not dispatcher-case strings or `cmd*` symbol exports. The `inventory-counts.test.cjs` "CLI Modules" family counts surviving lib files, but does not validate that each module has a live caller.

This violates the Phase 1 cull contract: per RESEARCH.md §1.1, the cull must remove unreferenced surface. Leaving dispatcher routes plus lib files for deleted commands extends the maintenance surface and contradicts the "scrub didn't break behavior" claim in the focus brief.

**Fix:** For each dead dispatcher case, choose one of:
- Delete the case + delete the lib file (recommended — matches the Phase 1 cull intent for the deleted commands).
- Keep the lib file as a public CLI entry point but document in INVENTORY.md and add a test asserting `gsd-tools <case>` is a documented CLI invocation (not a removed command).

Add a structural test that, for each `case` in `gsd-tools.cjs`'s top-level `switch`, either (a) an agent under `agents/` invokes it via `gsd-tools <case>` literal, or (b) a surviving command/workflow invokes it, or (c) the case is documented in INVENTORY.md "CLI Subcommands" family.

---

### CR-04: agent-parity helper picks "median run" from unsorted array — silent wrong-comparison risk

**File:** `integration/helpers/agent-parity.cjs:153`

**Issue:**
```js
current: successful[Math.floor(successful.length / 2)],  // median run by index after sort
```

The comment claims this is the median run "by index after sort", but `successful` is **never sorted**. It is `runs.filter((r) => !r.failed && r.success)` — runs in completion order. For N=5 with three successful runs in order [run-1, run-3, run-5], `successful[1]` is run-3, picked because it happened to land at index 1, not because it's the median. There is no median sort happening anywhere on `successful`.

The `current` field is consumed by Phase 2/3/6 compare-mode delta computation (per the SCHEMAS contract). Computing deltas against a quasi-random "current" run versus the captured baseline will hide variance and silently approve regressions where the median run would have flagged them.

The comment also shows that the author intended median behavior — this is a bug, not a deliberate design. Walltimes ARE sorted (line 155 `walltimes.sort(...)` mutates in place — see CR-05 for that issue), but the run-payload array is not.

**Fix:**
```js
// Sort successful runs by duration_ms before picking the median
const sortedSuccessful = [...successful].sort((a, b) => (a.duration_ms ?? 0) - (b.duration_ms ?? 0));
return {
  pass: deltas.pass,
  baseline,
  current: sortedSuccessful[Math.floor(sortedSuccessful.length / 2)],
  // ...
};
```

Also add a unit test that verifies, given 5 mock runs with deterministic durations, `current` is the run with the median duration (not the run at array index 2).

---

### CR-05: recordWalltime claims to require cost_usd but doesn't validate it; callers pass `cost` not `cost_usd`

**File:** `integration/helpers/walltime-recorder.cjs:23-40`, `integration/helpers/agent-parity.cjs:91-97`

**Issue:** Two coupled bugs:

1. `recordWalltime` validation:
```js
if (!entry || typeof entry.test !== 'string' ||
    typeof entry.walltime_ms !== 'number' ||
    typeof entry.phase !== 'string') {
  throw new Error('recordWalltime: entry must have {test, walltime_ms, cost_usd, phase}');
}
```
The error message names `cost_usd` as required, but the validation does not check `typeof entry.cost_usd`. Then line 36 reads `entry.cost_usd ?? 0`. So `cost_usd: undefined` silently writes 0 to the ledger.

2. The caller in `agent-parity.cjs:91-97` passes:
```js
recordWalltime({
  test: `agent-parity:${agentName}:${fixture.fixtureId}`,
  walltime_ms: result.duration_ms ?? 0,
  cost_usd: result.cost ?? 0,
  phase,
});
```
That call is correct (`cost_usd` is mapped from `result.cost`). But the contract is fragile: a future caller wiring up a Phase 6 trend test could pass `{ test, walltime_ms, cost: x, phase }` (the natural shape from `claude-runner.cjs`, see lines 306, 320 of `claude-runner.cjs` which expose `.cost` not `.cost_usd`) and silently get `cost_usd: 0` recorded.

Phase 6's trend test consumes this ledger. A uniform-zero cost field hides API spend regressions that the budget guards are supposed to detect.

**Fix:**
```js
if (!entry || typeof entry.test !== 'string' ||
    typeof entry.walltime_ms !== 'number' ||
    typeof entry.phase !== 'string' ||
    (entry.cost_usd !== undefined && typeof entry.cost_usd !== 'number')) {
  throw new Error('recordWalltime: entry must have {test: string, walltime_ms: number, cost_usd: number, phase: string}');
}
// Make cost_usd required if you want strict (consider risk vs. ergonomics):
if (typeof entry.cost_usd !== 'number') {
  throw new Error('recordWalltime: cost_usd is required');
}
```

Additionally, consider renaming `result.cost` to `result.cost_usd` in `claude-runner.cjs` so the field name is consistent across the helper boundary, eliminating the manual remapping.

---

## Warnings

### WR-01: agent-skills-awareness.test.cjs covers 3 of 22 surviving agents — name implies far more

**File:** `tests/agent-skills-awareness.test.cjs:18-22`

**Issue:** The test is named "project skills awareness" and the `for` loop iterates over `agentsRequiringSkills`, an array of exactly 3 agents:
```js
const agentsRequiringSkills = [
  'gsd-integration-checker',
  'gsd-security-auditor',
  'gsd-roadmapper',
];
```

The fixture has 22 surviving agents (per `survivingAgentCount` and `_meta.json`). The comment at the top of the test says "The skills-awareness contract still applies to surviving agents" — implying contract enforcement on all of them, not 3.

If the contract truly applies to surviving agents, this test under-enforces by 86%. If it only applies to 3, the comment is misleading and the test name is wrong.

**Fix:** Either expand `agentsRequiringSkills` to the full surviving list (and import from `cull-deletion-list.cjs` so it stays in sync), or rename the test and update the comment to accurately scope it ("agents that explicitly opt into skills awareness").

---

### WR-02: step-3 lifecycle test silently renames bad-format PLAN files instead of failing

**File:** `integration/lifecycle-steps/step-3-plan-phase.cjs:46-56`

**Issue:**
```js
// gsd-execute-phase requires *-PLAN.md suffix naming — fix any PLAN-* prefix files
for (const plan of plans) {
  const basename = path.basename(plan);
  if (basename.startsWith('PLAN-') && !basename.endsWith('-PLAN.md')) {
    // Rename PLAN-01-foo.md → 01-foo-PLAN.md
    const withoutPrefix = basename.replace(/^PLAN-/, '');
    const withoutExt = withoutPrefix.replace(/\.md$/, '');
    const newName = `${withoutExt}-PLAN.md`;
    fs.renameSync(plan, path.join(path.dirname(plan), newName));
  }
}
```

The integration test mutates the sandbox to coerce planner output into the expected naming convention (`*-PLAN.md`). If `gsd-plan-phase` (or its planner subagent) regresses and produces `PLAN-01-foo.md`, the lifecycle test silently renames the file and moves on. The next step (execute-phase) sees correctly-named files, and the bug never surfaces.

This is the exact tautological assertion pattern flagged by step-6's mistake registry entry ("Test assertions were too loose — checking only string length instead of structural correctness, which let broken skills pass silently"). It hides naming-convention regressions in `gsd-plan-phase`.

**Fix:** Remove the rename block. If the planner produces a file with the wrong naming convention, the test should fail with a clear assertion message — that's the contract being verified. If both naming conventions are legitimately accepted by `gsd-execute-phase`, that should be made an explicit feature decision (and asserted as such), not papered over with a rename.

---

### WR-03: step-3 length-only assertion is the exact mistake step-6 captures

**File:** `integration/lifecycle-steps/step-3-plan-phase.cjs:62-67`

**Issue:**
```js
const planContent = fs.readFileSync(renamedPlans[0], 'utf-8');
assert.ok(planContent.length > 200, `Plan ${plans[0]} has minimal content (${planContent.length} chars)`);
assert.ok(
  planContent.includes('## Tasks') || planContent.includes('<task') ||
  planContent.includes('## Step') || planContent.includes('- [ ]'),
  'Plan has no tasks/steps section');
```

The first assertion checks raw character count > 200. A plan stuffed with whitespace, copyright comments, or boilerplate frontmatter passes. The second assertion succeeds on any markdown with `- [ ]` checkboxes — including a TODO list with no actual implementation tasks.

This is the same loose-assertion pattern step-6 (`add-mistake.cjs:23`) explicitly asks Claude to add to the mistake registry: "Test assertions were too loose — checking only string length instead of structural correctness, which let broken skills pass silently."

The phase ships its own anti-pattern in the very tests that capture the anti-pattern.

**Fix:** Replace the length check with a structural assertion: parse the frontmatter, verify required fields (`phase`, `plan`, `type`, `wave`, etc., per `cmdVerifyPlanStructure` in `verify.cjs`), and assert the plan parses cleanly via the existing `verify plan-structure` CLI command. Length is not a quality signal.

---

### WR-04: step-5 git log assertion (>= 3 commits) is fragile

**File:** `integration/lifecycle-steps/step-5-execute-phase.cjs:54-58`

**Issue:**
```js
const log = execFileSync('git', ['log', '--oneline', '-20'], {
  cwd: sandbox, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
});
assert.ok(log.split('\n').length >= 3,
  `Expected multiple commits from execution, git log shows: ${log.slice(0, 300)}`);
```

`git log --oneline -20` followed by `.split('\n')` returns N+1 entries because the output ends with a newline (final empty entry). For a sandbox with 2 actual commits, `.split('\n').length === 3`, passing the >= 3 assertion. So the assertion is really "at least 2 actual commits" — which doesn't match the intent ("multiple commits from execution").

If sandbox setup pre-commits 1 file and execute-phase makes 1 commit, total = 2 commits, split-length = 3, test passes — but the actual signal (execute-phase made multiple commits) was not verified.

**Fix:**
```js
const commits = log.split('\n').filter(line => line.trim().length > 0);
// Capture pre-execute commit count and assert delta, OR assert >= N total
assert.ok(commits.length >= 3, `Expected >= 3 commits from execution, git log shows ${commits.length}: ${log.slice(0, 300)}`);
```

Better: capture `git rev-list --count HEAD` before running the step in `ctx`, then assert the delta in the step's `assertArtifacts`.

---

### WR-05: agent-parity.cjs p95 calculation mutates source array via in-line sort

**File:** `integration/helpers/agent-parity.cjs:155`

**Issue:**
```js
walltime_ms: { p50: median(walltimes), p95: walltimes.sort((a,b)=>a-b)[Math.ceil(walltimes.length*0.95)-1] || median(walltimes) },
```

Three problems on this line:

1. `walltimes.sort(...)` mutates the source array in place. `walltimes` is local and not reused, so the mutation is harmless here, but the pattern is brittle. If a future change adds another consumer of `walltimes` after this line, that consumer will see sorted data unexpectedly.

2. The p95 indexing: for N=5, `Math.ceil(5 * 0.95) - 1 = Math.ceil(4.75) - 1 = 4`. `sorted[4]` is the max value, not the 95th percentile. For N=2, `Math.ceil(2 * 0.95) - 1 = 1`, also the max. p95 of 5 samples is undefined statistically; reporting "max" is conventional but the comment doesn't acknowledge this.

3. The `|| median(walltimes)` fallback fires when the indexed element is falsy (0). A walltime of 0 is plausible for a failed-but-not-thrown run (per `claude-runner.cjs:311` returning `duration_ms: 0`). So a parity result with one zero-duration successful run will fall back to median for p95 — a misleading "p95 = p50" output that hides the slow runs.

**Fix:**
```js
const sortedTimes = [...walltimes].sort((a, b) => a - b);
const p95Idx = Math.max(0, Math.ceil(sortedTimes.length * 0.95) - 1);
return {
  // ...
  walltime_ms: {
    p50: median(walltimes),
    p95: sortedTimes[p95Idx],  // no || fallback — if it's 0, that's the truth
  },
  // ...
};
```

---

### WR-06: agent-parity insufficient-runs branch returns 0 for cost_usd, ignoring failed-run costs

**File:** `integration/helpers/agent-parity.cjs:101-110`

**Issue:**
```js
if (successful.length < Math.ceil(N / 2)) {
  return {
    pass: false,
    deltas: { error: `insufficient successful runs (${successful.length} of ${N})` },
    walltime_ms: { p50: 0, p95: 0 },
    cost_usd: runs.reduce((s, r) => s + (r.cost ?? 0), 0),
    per_run_summary: runs,
  };
}
```

The cost reduction iterates over `runs` (all runs, including failed ones), summing `r.cost`. But on line 86, the catch branch pushes `{ failed: true, reason: err.message, walltime_ms: 0, cost: 0 }` — so thrown-error runs are correctly counted. But for `success: false` runs (CLI returned non-success exit, line 317 of claude-runner.cjs), `r.cost` is `parsed?.total_cost_usd || 0`, which IS set if Claude billed before erroring.

The bug is that `walltime_ms: { p50: 0, p95: 0 }` is hardcoded zero in the failure path even though some runs may have completed with valid durations. A test with 3-of-5 success would correctly be flagged as failure, but the walltime telemetry (used by Phase 6 trend analysis) is wiped to zero. Real data gets discarded.

**Fix:** Compute walltime stats from the successful runs (even if below threshold) before returning the failure shape, or omit `walltime_ms` from the failure return so Phase 6 doesn't index into bogus zeros.

---

### WR-07: cull-deletion-list comment inconsistency on ALLOW_LIST count

**File:** `tests/cull-no-orphan-references.test.cjs:75-80`

**Issue:**
```js
// ALLOW_LIST is exactly 16 entries — do not add more without re-discussion gate.
// (3 test infra + 6 deprecation stubs + 3 migration-table files + 4 consolidated
// command files/workflows = 16 entries.)
// Note: the plan body's arithmetic comment said "17" but the explicit enumeration
// in the plan listed exactly the 16 entries above; preserving the literal list per
// CONTEXT.md D-01 and treating the arithmetic as a plan-level off-by-one (Rule 1).
```

Counting the ALLOW_LIST literal in the file: `cull-deletion-list.cjs`, `cull-no-orphan-references.test.cjs`, `migration-table-present.test.cjs` = 3 test infra files; 6 deprecation stubs; `help.md` (commands) + `help.md` (workflows) + `CHANGELOG.md` = 3 migration-table files; `review.md` (commands) + `phase.md` (commands) + `review.md` (workflows) + `phase.md` (workflows) = 4 consolidated files. Total = 16. Math checks.

But the comment self-acknowledges arithmetic drift in the plan body. This is the kind of paper-over that mistake-registry-style discipline asks teams to fix at the source. If "16 entries — do not add more without re-discussion gate" is the contract, that should be enforced structurally:

```js
test('ALLOW_LIST is exactly 16 entries', () => {
  assert.strictEqual(ALLOW_LIST.size, 16, 'ALLOW_LIST drift requires re-discussion gate per RESEARCH.md §1.1');
});
```

**Fix:** Add the structural assertion above and remove the prose-only comment guard. Fix the plan body too if it still says 17.

---

### WR-08: orphan-reference test sanity check is fail-soft (stderr warn, no test failure)

**File:** `tests/cull-no-orphan-references.test.cjs:128-136`

**Issue:**
```js
function sanityCheckCliCoverage(allFiles) {
  const required = ['model-profiles.cjs', 'intel.cjs', 'docs.cjs', 'init.cjs'];
  const found = required.filter((name) =>
    allFiles.some((f) => f === path.join('get-shit-done/bin/lib', name)));
  if (found.length < required.length) {
    const missing = required.filter((n) => !found.includes(n));
    process.stderr.write(`[cull-no-orphan-references] WARN: SCAN_ROOTS walk did not yield ${missing.join(', ')} from get-shit-done/bin/lib/. CLI-module reference rot may be skipped silently.\n`);
  }
}
```

The test author identified that the SCAN_ROOTS walk could silently skip CLI modules and added a "sanity check". But the check only writes to stderr — it does not fail the test. If the walk misses `init.cjs`, the test passes green and reference rot in `init.cjs` (the largest CLI file at 2114 lines) is undetected.

This is the same loose-assertion pattern as WR-03. A check whose only failure mode is "stderr output that nobody reads" is not a test.

**Fix:**
```js
function sanityCheckCliCoverage(allFiles) {
  const required = ['model-profiles.cjs', 'intel.cjs', 'docs.cjs', 'init.cjs'];
  const found = required.filter((name) =>
    allFiles.some((f) => f === path.join('get-shit-done/bin/lib', name)));
  assert.deepStrictEqual(found.sort(), required.sort(),
    `SCAN_ROOTS walk must yield all 4 known-stale CLI files. Missing: ${required.filter(n => !found.includes(n)).join(', ')}`);
}
```

Or move it into a separate `test()` block.

---

### WR-09: parity-baselines-stale.test.cjs allows future-dated baselines to pass silently

**File:** `tests/parity-baselines-stale.test.cjs:58-64`

**Issue:**
```js
const captured = new Date(baseline._meta.captured_at).getTime();
const ageMs = Date.now() - captured;

if (ageMs <= NINETY_DAYS_MS) {
  // Fresh — no acknowledgment needed.
  return;
}
```

If a baseline's `_meta.captured_at` is in the future (system clock skew, deliberate forward-dating, or copy-paste error), `ageMs` is negative and `<= NINETY_DAYS_MS` evaluates true. The test passes despite an obviously corrupt timestamp.

The `parity-baselines-shape.test.cjs:62` asserts `_meta.captured_at` is parseable as a Date but does not check that the date is in the past.

**Fix:**
```js
if (ageMs < 0) {
  assert.fail(`${agent}/${file}: _meta.captured_at "${baseline._meta.captured_at}" is in the future (${Math.abs(ageMs)}ms). Fix system clock or correct the baseline.`);
}
if (ageMs <= NINETY_DAYS_MS) {
  return;
}
```

Add the same check to `parity-baselines-shape.test.cjs`.

---

### WR-10: gsd-lifecycle composer pre-checks are LLM-cost-free but not run on `requires` skip

**File:** `integration/gsd-lifecycle.test.cjs:66-77`

**Issue:**
```js
for (let i = 0; i < STEPS.length; i++) {
  const step = STEPS[i];
  test(`step ${i + 1}: ${step.name}`, async (t) => {
    for (const req of (step.requires || [])) {
      if (!stepResults[req]?.success) return t.skip(`prerequisite ${req} did not succeed`);
    }
    const result = await step.run(sandbox, ctx);
    result.userSlug = userSlug;
    step.assertArtifacts(sandbox, result);
    stepResults[step.name] = result;
  });
}
```

Two issues:

1. `result.success` is the field checked for prerequisite gate (`stepResults[req]?.success`). But when a step skips itself (e.g., step-2's "skip-on-flake" pattern returns early without throwing or setting `success`), `stepResults[step.name]` is never written (line `stepResults[step.name] = result;` only fires AFTER `assertArtifacts`). So a downstream step that requires step-2 will see `stepResults['discuss-phase']` as `undefined`, and skip itself unnecessarily. This cascades: if step-2 silently passes (artifacts didn't materialize but didn't fail either), steps 3, 4, 5 all skip even though they could have proceeded.

2. The `assertArtifacts` assertion itself can throw — but `stepResults[step.name] = result` runs only on success. If step-1 succeeds at running but `assertArtifacts` throws, the result is lost AND the stepResults is empty for downstream gates.

**Fix:** Persist `stepResults[step.name] = result;` BEFORE calling `assertArtifacts`. If assertArtifacts throws, still record the run output for downstream prerequisite checks. Optionally store a separate `stepResults[step.name].assertionPassed` boolean to distinguish "ran but assertions failed" from "didn't run".

---

### WR-11: install-manifest-matches-surviving.test.cjs name promises filesystem-manifest equality but tests INVENTORY.md instead

**File:** `tests/install-manifest-matches-surviving.test.cjs` (entire file)

**Issue:** The filename and the doc comment describe filesystem-vs-install-manifest equality. The actual tests parse `docs/INVENTORY.md` and assert it matches the filesystem. The install-manifest assertion (line 150-161) is a single test that only checks `manifest.sources.<key>.src` paths exist as directories — it does not verify that the manifest's copy rules actually copy the surviving files only. A manifest that copies `commands/gsd/` (entire directory) will continue to copy any deletion-stub or reference-rot file that happens to live there.

The test name lies about what it tests. The test contract is INVENTORY.md ↔ filesystem (covered also by `inventory-counts.test.cjs`). The "install manifest matches surviving" claim is unverified.

The doc comment on line 22-25 acknowledges this: "Filename note: per RESEARCH.md §2.5, the test asserts INVENTORY.md ↔ filesystem equality, not install-manifest.json content. The filename is preserved for git history…" — keeping a misleading filename for git history is a soft choice.

**Fix:** Either rename the file to `inventory-matches-surviving.test.cjs` (renaming is a flat history-rewrite gain — git tracks renames automatically) and remove the redundant install-manifest sanity check, OR add real install-manifest content tests (e.g., assert the manifest's copy rules don't pick up deleted command names from the source dirs after staging).

---

## Notes on the Cull Itself

A few non-blocking observations not in BLOCKER or WARNING but worth flagging for follow-on phases:

1. **`gsd-tools.cjs` dispatcher dispatch table is implicit** — there's no enumerable list of which `case` arms are reachable from surviving surfaces. CR-03's missing structural test is the right place to add this.

2. **`intel.cjs` exports include `intelExtractExports` and `intelPatchMeta`** — both gated as "Does not gate on isIntelEnabled — operates on arbitrary file paths for use by agents..." (lines 458, 497). If the agents calling these were deleted, the gate exception is also dead code. Worth re-evaluating in the dead-code sweep called for in CR-03.

3. **`copilot-install.test.cjs` is 1464 lines and highly redundant** — much of the conversion-logic testing (lines 251-345) duplicates branches with very similar synthetic inputs. Consider consolidating into table-driven tests when the broken `gsd-health` / `autonomous` references are fixed in CR-02.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
