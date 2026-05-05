# Phase 2: Critic refactor (with commit-0 spike) — Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 18 (8 CREATE + 10 MODIFY/EXTEND)
**Analogs found:** 18 / 18 (every Phase 2 file has at least a role-match analog in tree)

Phase 1 is the dominant analog source. The biggest patterns Phase 2 must replicate verbatim:
1. `node:test` + `node:assert` static test scaffold (mirrors `tests/walltime-recorder.test.cjs`, `tests/agent-parity-helper-shape.test.cjs`)
2. `runClaudeWithTools` live-test scaffold (mirrors `integration/skill-execution.test.cjs`, `integration/lifecycle-steps/step-4-review-critique.cjs`)
3. `runAgentParity` schema-aware delta consumer pattern (Phase 1 stub at `integration/helpers/agent-parity.cjs:192–202` is the literal slot to fill)
4. `gsd-tools.cjs` top-level `case 'name':` dispatcher pattern (lines 545–870; 50+ existing cases at 4-space indent)
5. `Task(subagent_type=...)` workflow-spawn pattern (analog: `get-shit-done/workflows/research-phase.md` Step 4.4 for parallel-wave + `discuss-phase-assumptions.md` for single-Task)
6. `tags = ["...", "phase-N-cull"]` Bazel tag pattern (`integration/BUILD.bazel:50`, `tests/BUILD.bazel:14`)

---

## File Classification

| File | Action | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `agents/_shared/critic-base.md` | CREATE | shared agent prompt fragment | static markdown — read by Claude `@`-resolver at agent-load time | `agents/gsd-critic-plan.md` (extract common content) | partial — same role, novel split (no shared-fragment exists today) |
| `agents/gsd-critic-plan.md` | MODIFY (trim) | agent prompt | static markdown — loaded by Task spawn | `agents/gsd-planner.md:26` (existing `@`-import addendum shape) | exact role |
| `agents/gsd-critic-code.md` | MODIFY (trim) | agent prompt | static markdown | same as critic-plan post-trim | exact role |
| `agents/gsd-critic-scope.md` | MODIFY (trim) | agent prompt | static markdown | same | exact role |
| `agents/gsd-critic-verify.md` | MODIFY (trim) | agent prompt | static markdown | same | exact role |
| `agents/gsd-critic-discuss.md` | MODIFY (trim) | agent prompt | static markdown | same | exact role |
| `agents/gsd-critic-strategy.md` | MODIFY (trim) | agent prompt | static markdown | same | exact role |
| `get-shit-done/workflows/critique.md` | CREATE (file is 0 bytes today) | orchestrator workflow body | request-response — single-message parallel `Task` batch + Bash-tool aggregate | `get-shit-done/workflows/research-phase.md` (parallel Task wave + sub-agent registry pattern) + `discuss-phase-assumptions.md` (single Task spawn template) | partial (no in-tree workflow does 6 simultaneous Tasks; closest is research-phase wave-of-4) |
| `get-shit-done/bin/gsd-tools.cjs` | MODIFY (add case) | CLI dispatcher entry | top-level `switch` case → handler module | existing `case 'verify':` (line 697) and `case 'frontmatter':` (line 679) | exact pattern (4-space indent + parseNamedArgs + raw + break) |
| `get-shit-done/bin/lib/critic-aggregate.cjs` | CREATE | handler module | file-system glob + YAML parse + JSON output | `get-shit-done/bin/lib/verify.cjs` (cmdVerifySummary) | exact role (file-glob → parse → output) |
| `integration/helpers/agent-parity.cjs` | MODIFY (replace stub at L192–202) | parity delta computer | object diff — schema-bucketed Set comparison | `pickMedianByDuration` (same file, lines 56–62) + RESEARCH §Code-Examples Example 4 | exact slot — code is literally written next to the stub |
| `tests/critic-spike-passes.test.cjs` | CREATE (Wave-0 commit-0) | live integration test | `runClaudeWithTools` → assert canary string in agent output | `integration/skill-execution.test.cjs` (uses runClaudeWithTools, asserts on output content) | exact role |
| `tests/critic-line-budget.test.cjs` | CREATE | static line-count guard | read-only fs scan | `tests/agent-size-budget.test.cjs` (reads `agents/gsd-*.md`, line-counts, asserts under per-tier budget) | exact role |
| `tests/critic-no-base-shadowing.test.cjs` | CREATE | static structure guard | read-only fs scan + regex-extract section headings | `tests/agent-size-budget.test.cjs` + `tests/cull-no-orphan-references.test.cjs` (read-only multi-file scan with violation list) | exact role |
| `tests/critic-aggregate-shape.test.cjs` | CREATE | unit test for new dispatcher case | spawns `gsd-tools.cjs critic-aggregate` against fixture phase dir, asserts JSON shape | `tests/walltime-recorder.test.cjs` (unit test for an integration helper) + `tests/gsd-tools-dispatcher-reachable.test.cjs` (case-name discovery) | role-match |
| `tests/critique-workflow-structure.test.cjs` | CREATE (cheap proxy for CRIT-06/07) | static structure guard | read-only fs scan of workflow markdown + grep for Task/aggregate references | `tests/cull-no-orphan-references.test.cjs` (multi-pattern grep across workflows + violations array) | role-match |
| `integration/critic-batch-walltime.test.cjs` | CREATE | live integration test | `runClaudeWithTools` invokes the critique workflow, parses raw JSON for spawn-timestamps | `integration/skill-execution.test.cjs` + `integration/lifecycle-steps/step-4-review-critique.cjs` (live invocation of `/gsd-review --critique`) | exact role |
| `integration/critic-fault-injection.test.cjs` | CREATE | live integration test | bad subagent_type override → assert orchestrator emits info-severity finding | `integration/skill-execution.test.cjs` (output assertion) + `integration/lifecycle-steps/step-4-review-critique.cjs` (critique-workflow invocation) | role-match (no in-tree fault-injection test today) |
| `integration/critic-parity.test.cjs` | CREATE | live parity test (N=5, expensive) | `runAgentParity(name, fixture, schema, opts={n:5, mode:'compare'})` → assert `result.pass` | `integration/test-fixtures/baselines/_capture.cjs` (one-and-only existing call site of `runAgentParity`); RESEARCH §Don't-Hand-Roll table line 1 | role-match (existing capture-mode call site is the one-line analog for compare-mode) |
| `integration/test-fixtures/walltime-ledger.jsonl` | APPEND (data file) | append-only JSONL ledger | live tests append via `recordWalltime({phase:"phase-2-critic"})` | existing 26 entries from Phase 1 (`phase: "phase-1-cull"`) | exact pattern (only the `phase` value differs) |
| `tests/walltime-ledger-schema.test.cjs` | CREATE (optional — XCUT-03 shape gate) | static schema validator | read-only JSONL parse + per-line shape check | `tests/walltime-recorder.test.cjs` (validates shape via the recorder; this test would validate the on-disk ledger directly) | role-match |
| `integration/BUILD.bazel` | MODIFY (add tag) | Bazel test config | declarative — Bazel reads at query time | existing `tags = [..., "phase-1-cull"]` at line 50 | exact pattern |
| `tests/BUILD.bazel` | MODIFY (add tag + new entries) | Bazel test config | declarative | existing list-comprehension `js_test(...)` block lines 7–20 | exact pattern |
| `bin/install.js` | MODIFY (extend manifest builder + maybe `copyWithPathReplacement`) | install manifest builder | filesystem walk + hash → JSON manifest | lines 5313–5318 (`agents/gsd-*.md` enumeration) | exact slot — adjacent code |

---

## Pattern Assignments

### `agents/_shared/critic-base.md` (NEW shared agent prompt fragment)

**Analog:** `agents/gsd-critic-plan.md` (extract the common content; the lens-specific bits split off into addendums)
**Match reasoning:** No shared-fragment file exists today. The pattern is "extract the union of `<role>`, `<context_loading>`, base `<checklist>` items, `<finding_format>`, base `<anti_patterns>`, base `<success_criteria>` from all 6 critics." Use critic-plan as the cleanest source: it has the canonical `<role>` framing and the most complete `<finding_format>` block.

**Role-framing pattern to copy** (from `agents/gsd-critic-plan.md:8–28`, BUT strip lens-specific phrasing — replace "plan critic" / "Plan quality, requirement coverage" with `{{LENS}}` / `{{PRIMARY_LANE}}` placeholder language OR drop both and let the addendum's `<lens>` block fill them):

```markdown
<role>
You are an adversarial {{LENS}} critic. Your job is to find problems BEFORE they're acted on — problems the producer missed, assumptions that won't hold, requirements that aren't covered.

You are NOT a helper. You are NOT a co-planner. You are an adversary whose job is to stress-test {{ARTIFACT}} and find the weaknesses the producer's optimism bias hides.

**Tone:** Tough code reviewer. Direct, explains reasoning, constructive. Every finding explains WHAT is wrong, WHY it matters, and HOW to fix it.

**Philosophy:** Cast a wide net. Flag anything suspicious. The user can dismiss false positives — that's cheap. Missing a real issue is expensive. Recall over precision for FINDING things. But be disciplined about SEVERITY — over-classifying warnings as critical erodes trust just as badly as missing findings.

**Cross-flag guidance:** You may flag obvious issues outside your primary lane. Label these as `cross-flag` with the Lane field. Keep cross-flags under 30% of total findings. Cross-flags with thin evidence default to info severity.
</role>
```

**Finding-format pattern to copy** (from `agents/gsd-critic-plan.md:154–191` — verbatim, replace `plan-` ID prefix with `{{LENS_PREFIX}}-` placeholder):

```markdown
<finding_format>
Each finding MUST include ALL required fields. A finding missing any required field MUST be rejected before inclusion in the report.

### [{SEVERITY}] Finding Title — one-liner summary

**ID:** `{{LENS_PREFIX}}-{severity_abbrev}-{seq}`
**File:** `path/to/file.md:42` (or `N/A — phase-level finding`)
**Severity:** critical | warning | info
**Lane:** primary | cross-flag
**Category:** <kebab-case-category>   ← NEW per RESEARCH §Open-Q-2 (mandates explicit category field)

**Evidence:**
[100-200 words for critical/warning, 50-150 words for info. Include file:line refs. For critical/warning: include external research (OWASP/CWE/NIST/style guides). Explain WHY this matters.]

**Suggested Fix:**
[Concrete, actionable. Name files, line numbers, task numbers.]

REJECT findings that lack file:line, evidence, fix, or duplicate another finding.
</finding_format>
```

**Output contract pattern (POST-WRITE VERIFY — new vs existing):**

The existing critic prompts write `CRITIQUE-{lens}.md` but do not verify the write committed. Per RESEARCH §Pitfall 3 the base must add a final step:

```bash
# After writing CRITIQUE-{lens}.md, verify the file exists before returning:
test -f "${PHASE_DIR}/CRITIQUE-${lens}.md" || { echo "CRITIQUE-${lens}.md not flushed"; exit 1; }
```

**Differences from analog:**
- Pull the COMMON sections out (role/finding_format/severity/cross-flag/output) — drop everything lens-specific.
- Add explicit `category:` field (RESEARCH §Open-Q-2 — locks the bucket-key for the parity helper).
- Add post-write verify step (RESEARCH §Pitfall-3 — closes the disk-flush race).
- Target: ≤250 lines (analog is 299 lines including all lens content; the union-of-shared content alone fits in ~200).

---

### `agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md` (MODIFY/trim — 6 files)

**Analog (post-trim shape):** `agents/gsd-planner.md:26` and the 16+ other agents that already use `@`-import addendums (per RESEARCH §3 — verified `gsd-executor.md`, `gsd-verifier.md`, `gsd-plan-checker.md`, `gsd-phase-researcher.md`, `gsd-user-profiler.md` all use this syntax).

**Match reasoning:** the post-trim shape exists today as a class — agents that lead with `@~/.claude/get-shit-done/...` and add only their unique content. The 6 critic files just need to be reshaped into this class.

**Required excerpt — opening shape** (from RESEARCH.md §Pattern-1 / §Code-Example-1, verified against existing `@`-import refs):

```markdown
---
name: gsd-critic-plan
description: Adversarial plan critic. Reviews GSD plans for gaps, contradictions, missing requirements, and scope issues. Read-only. Produces CRITIQUE-plan.md with severity-classified findings.
tools: Read, Bash, Grep, Glob
color: red
---

@~/.claude/get-shit-done/agents/_shared/critic-base.md

<lens>
**Primary lane:** Plan quality, requirement coverage, scope estimation, task specificity, dependency correctness, must_haves derivation.

**Finding ID prefix:** `plan-`

**Output file:** `{phase_dir}/CRITIQUE-plan.md`. Frontmatter `critique_type: plan`.

**Primary input:** PLAN.md files for the phase being reviewed.
</lens>
```

**Lens-specific checklist pattern** — keep ONLY the parts of `<checklist>` that are unique to this critic. For critic-plan, keep the items at `agents/gsd-critic-plan.md:67–105` that mention `requirement coverage`, `dependencies acyclic`, `must_haves`, `key_links`, `verify steps runnable`, `done criteria measurable`. Wrap them in `<plan_specific_checklist>`. Drop everything that duplicates base (severity rubric, finding format, anti-patterns, success criteria).

**Calibration example pattern** (from `agents/gsd-critic-plan.md:17–22`):

```markdown
<plan_calibration_examples>
GOOD: "Task 2 at 05-01-PLAN.md:38 says 'implement auth' without specifying mechanism, hash algorithm, or token strategy. Per CONTEXT.md line 12 the user decided JWT with refresh rotation. Task action should reference this decision."
BAD: "Plan looks incomplete." (no evidence, no file:line, no fix — REJECT per base finding-format rules)
</plan_calibration_examples>
```

**Differences from analog (pre-trim shape):**
- Pre-trim is 263–341 lines per critic; post-trim ≤100 lines (CRIT-03).
- Pre-trim duplicates `<role>`, `<finding_format>`, severity rubric across all 6 files; post-trim has a single 1-line `@`-import.
- Adds `<lens>` block with `Primary lane`, `Finding ID prefix`, `Output file`, `Primary input` (4 lines).
- Drops `<context_loading>`, `<output>`, base `<checklist>` items, `<anti_patterns>`, `<success_criteria>` — all owned by base.
- Allowed XML tags in the addendum: ONLY `<lens>`, `<{lens}_specific_checklist>`, `<{lens}_calibration_examples>` (whitelisted in `tests/critic-no-base-shadowing.test.cjs`).

---

### `get-shit-done/workflows/critique.md` (CREATE — workflow body, currently 0 bytes)

**Analog (closest in-tree):** `get-shit-done/workflows/research-phase.md` Step 4.4 (lines 189–252) — parallel `Task` wave with same-message spawn semantics. Phase 2 differs in that ALL 6 critics fire as a SINGLE wave (not chunked into waves of 4).

**Match reasoning:** No existing workflow spawns 6 Tasks in one block. The closest analog is research-phase's `wave_size = 4` chunking pattern; Phase 2 uses `wave_size = 6` (one wave). The Task-call shape is identical.

**Imports / context-loading pattern** (from `discuss-phase-assumptions.md:1–11`):

```markdown
<purpose>
Run all 6 critic agents in parallel against a phase, aggregate per-critic CRITIQUE files from disk, emit merged report. Mitigates the parallel-Task hallucination bug (anthropics/claude-code#29181) by reading critic output from disk via `gsd-tools.cjs critic-aggregate` instead of trusting the parent agent's text summary.
</purpose>

<available_agent_types>
Valid GSD critic subagent types — use exact names:
- gsd-critic-plan
- gsd-critic-code
- gsd-critic-scope
- gsd-critic-verify
- gsd-critic-discuss
- gsd-critic-strategy
</available_agent_types>
```

**Single-message parallel `Task` batch pattern** (from RESEARCH.md §Pattern-2, structurally identical to `research-phase.md:225–250` but with `wave_size = 6`):

```markdown
<process>
1. Resolve `phase_dir` from `$PHASE_ARG` via `gsd-sdk query find-phase $PHASE_ARG`.
2. Read PLAN.md, SUMMARY.md, VERIFICATION.md, CONTEXT.md, prior CRITIQUE-*.md.
3. **In a SINGLE assistant message, emit 6 Task() calls — DO NOT split across messages.**

   Task(subagent_type="gsd-critic-plan",     prompt="<phase context>; review PLAN.md")
   Task(subagent_type="gsd-critic-code",     prompt="<phase context>; review src files")
   Task(subagent_type="gsd-critic-scope",    prompt="<phase context>; review for scope creep")
   Task(subagent_type="gsd-critic-verify",   prompt="<phase context>; review VERIFICATION.md")
   Task(subagent_type="gsd-critic-discuss",  prompt="<phase context>; review CONTEXT.md")
   Task(subagent_type="gsd-critic-strategy", prompt="<phase context>; review milestone strategy")

4. After all 6 Tasks return, **DO NOT trust their text summaries** (#29181). Run:

   gsd-sdk query critic-aggregate --phase $PHASE_ARG

5. If any expected critic is missing from disk, emit info-severity orchestrator finding (CRIT-09) and continue with surviving critics.

6. Merge per-critic findings into {phase_dir}/CRITIQUE.md (final aggregated file).

7. Emit human-readable summary to stdout.
</process>
```

**Single-Task spawn shape** (from `discuss-phase-assumptions.md:257–280`, adapt for each of the 6 critic spawns):

```markdown
Task(subagent_type="gsd-critic-plan", prompt="""
First, read $HOME/.claude/agents/gsd-critic-plan.md for your role and instructions.

<phase_context>
Phase: {phase_number} - {phase_name}
Phase dir: {phase_dir}
Artifacts to review: PLAN.md, SUMMARY.md (if exists), prior CRITIQUE-plan.md (for dismissed-finding carry-forward).
</phase_context>

<output>
Write to: {phase_dir}/CRITIQUE-plan.md
Verify post-write: test -f {phase_dir}/CRITIQUE-plan.md || exit 1
</output>
""")
```

**Differences from analog:**
- Wave size: research-phase uses `wave_size = 4` and chunks; critique uses single wave of 6 (RESEARCH explicitly: "Single-message parallel `Task` batch — DO NOT split across messages").
- Aggregate step: research-phase reads per-type files via Read tool from inside its own context; critique reads CRITIQUE files via OUT-OF-CONTEXT shell call (`gsd-sdk query critic-aggregate`) to avoid the parallel-Task hallucination bug (#29181).
- Output: research-phase calls a synthesizer Task; critique calls a deterministic Node CLI subcommand.

---

### `get-shit-done/bin/gsd-tools.cjs` (MODIFY — add `case 'critic-aggregate':` to top-level switch)

**Analog (case shape):** `case 'verify-summary':` at line 646–652 — single-handler case with `parseNamedArgs` + `raw` pass-through.
**Analog (multi-subcommand):** `case 'frontmatter':` at line 679–695 — when more verbs grow, this is the fallback shape. For `critic-aggregate`, single-action is sufficient (no subcommand verbs).

**Imports pattern** (top of file, around line 1–20 — add the new module require alongside existing `state`, `verify`, `frontmatter` requires):

```javascript
const state = require('./lib/state.cjs');
const verify = require('./lib/verify.cjs');
const frontmatter = require('./lib/frontmatter.cjs');
// Phase 2: new handler module
const criticAggregate = require('./lib/critic-aggregate.cjs');
```

**Top-level case insertion** (RESEARCH.md §Pattern-3 — slot between two adjacent existing cases, e.g., after line 652's `verify-summary` close brace):

```javascript
    case 'critic-aggregate': {
      // Args: --phase <N> [--phase-dir <path>] [--json]
      const { phase: phaseArg, 'phase-dir': phaseDirOverride } =
        parseNamedArgs(args, ['phase', 'phase-dir']);
      const useJson = args.includes('--json');
      criticAggregate.cmdCriticAggregate(cwd, {
        phase: phaseArg,
        phaseDirOverride,
        useJson,
        raw,
      });
      break;
    }
```

**Differences from analog:**
- `verify-summary` reads ONE file and validates; `critic-aggregate` GLOBs `CRITIQUE-*.md` in a phase dir and aggregates 6.
- `verify-summary` outputs pass/fail status; `critic-aggregate` outputs structured JSON `{phase, phase_dir, critics_expected, critics_present, critics_missing, severity_counts_total, status, files: [...]}`.

**Per CR-03 dispatcher-reachable test:** new case must EITHER be invoked by a surviving caller (Phase 2 caller: `get-shit-done/workflows/critique.md` via `gsd-sdk query critic-aggregate`) OR documented in `docs/INVENTORY.md` under `## CLI Subcommands`. Phase 2 wires the workflow caller, so reachability is satisfied. The test that enforces this — `tests/gsd-tools-dispatcher-reachable.test.cjs` (extracted in §Shared Patterns below) — must pass after Phase 2 lands.

---

### `get-shit-done/bin/lib/critic-aggregate.cjs` (CREATE — handler module)

**Analog:** `get-shit-done/bin/lib/verify.cjs::cmdVerifySummary` (lines 12–60) — single exported handler that reads files, parses content, returns structured JSON via `output(result, raw, status)`.

**Imports pattern** (from `verify.cjs:1–11`):

```javascript
/**
 * Critic-aggregate — glob CRITIQUE-*.md in a phase dir, parse YAML frontmatter,
 * return aggregated JSON for the critique workflow orchestrator.
 *
 * Mitigates anthropics/claude-code#29181 (parallel-Task hallucination): the
 * orchestrator reads critic output from disk via this CLI subcommand instead
 * of trusting the parent agent's text summary.
 */

const fs = require('fs');
const path = require('path');
const { findPhaseInternal, planningDir, output, error } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
```

**Handler-shape pattern** (extract from `verify.cjs:12–35` — `function cmd*(cwd, ..., raw)` exported via `module.exports = { cmd* }`):

```javascript
function cmdCriticAggregate(cwd, { phase, phaseDirOverride, useJson, raw }) {
  if (!phase && !phaseDirOverride) {
    error('--phase <N> or --phase-dir <path> required');
  }

  const phaseDir = phaseDirOverride
    ? path.resolve(cwd, phaseDirOverride)
    : findPhaseInternal(cwd, phase).dir;   // existing helper from core.cjs

  const expected = ['plan', 'code', 'scope', 'verify', 'discuss', 'strategy'];
  const files = [];
  const missing = [];

  for (const lens of expected) {
    const file = path.join(phaseDir, `CRITIQUE-${lens}.md`);
    if (!fs.existsSync(file)) {
      missing.push(lens);
      continue;
    }
    const content = fs.readFileSync(file, 'utf-8');
    const fm = extractFrontmatter(content);   // existing helper
    files.push({
      path: file,
      critique_type: fm.critique_type || lens,
      severity_counts: fm.severity_counts || { critical: 0, warning: 0, info: 0, total: 0 },
      status: fm.status || 'unknown',
    });
  }

  const totals = files.reduce((acc, f) => {
    for (const k of Object.keys(f.severity_counts)) {
      acc[k] = (acc[k] || 0) + (f.severity_counts[k] || 0);
    }
    return acc;
  }, {});

  const result = {
    phase: phase || path.basename(phaseDir),
    phase_dir: phaseDir,
    critics_expected: expected,
    critics_present: files.map((f) => f.critique_type),
    critics_missing: missing,
    severity_counts_total: totals,
    status: totals.critical > 0 ? 'fail' : (totals.warning > 0 ? 'warn' : 'pass'),
    files,
  };

  output(result, raw, result.status);
}

module.exports = { cmdCriticAggregate };
```

**Differences from analog:**
- `verify.cjs::cmdVerifySummary` reads ONE file; `cmdCriticAggregate` globs N files (fixed N=6).
- Uses existing `extractFrontmatter` from `lib/frontmatter.cjs` (Don't-Hand-Roll: no custom YAML regex).
- Uses existing `findPhaseInternal` + `planningDir` from `core.cjs` (Don't-Hand-Roll: no custom phase-dir lookup).
- Output shape per RESEARCH §Pattern-3: keys `phase`, `phase_dir`, `critics_expected`, `critics_present`, `critics_missing`, `severity_counts_total`, `status`, `files`.

---

### `integration/helpers/agent-parity.cjs` (MODIFY — replace stub at lines 192–202)

**Analog (in same file):** `pickMedianByDuration` at lines 56–62 (existing CR-04 fix; production-ready function in same module).
**Reference implementation:** RESEARCH.md §Code-Example-4 (full ~70-line block at lines 612–683 — verbatim spec, not invented).

**Stub being replaced** (lines 192–202, current content):

```javascript
function computeCriticFindingsDeltas(schema, baseline, runs) {
  // Stub for Phase 2 calibration. Returns shape that Phase 2 will exercise;
  // for Phase 1 (capture mode only) this is not invoked at runtime.
  return {
    pass: true,
    overlap: 1.0,
    missingCritical: [],
    extraFindings: [],
    note: 'stub — Phase 2 implements full critic-findings comparison',
  };
}
```

**Replacement implementation pattern** (from RESEARCH.md §Code-Example-4, lines 615–683 — copy verbatim, do not re-derive):

```javascript
function computeCriticFindingsDeltas(schema, baseline, runs) {
  const candidate = pickMedianByDuration(runs);
  if (!candidate) return { pass: false, error: 'no successful runs' };

  const baseFindings = (baseline.result?.findings) || extractFindingsFromText(baseline.result || '');
  const currFindings = (candidate.result?.findings) || extractFindingsFromText(candidate.result || '');

  function bucketKey(f) {
    const sev  = (f.severity || 'unknown').toLowerCase();
    const lane = (f.lane || 'primary').toLowerCase();
    const cat  = (f.category || extractCategoryFromTitle(f.title)).toLowerCase();
    const file = f.file || 'N/A';
    return `${sev}:${cat}:${lane}|${file}`;
  }

  const baseKeys = new Set(baseFindings.map(bucketKey));
  const currKeys = new Set(currFindings.map(bucketKey));
  const intersection = [...baseKeys].filter((k) => currKeys.has(k));
  const overlap = baseKeys.size === 0 ? 1.0 : intersection.length / baseKeys.size;

  const missingCritical = [...baseFindings]
    .filter((f) => (f.severity || '').toLowerCase() === 'critical')
    .filter((f) => !currKeys.has(bucketKey(f)));

  const extra = [...currKeys].filter((k) => !baseKeys.has(k));
  const pass = (overlap >= schema.threshold) && (missingCritical.length === 0);

  return {
    pass,
    overlap,
    threshold: schema.threshold,
    missingCritical: missingCritical.map((f) => ({ id: f.id, title: f.title, severity: f.severity })),
    extraFindings: extra,
    baseFindingCount: baseFindings.length,
    currFindingCount: currFindings.length,
  };
}
```

**Helpers to add adjacent** (extract from RESEARCH §Code-Example-4 lines 661–683 — these belong in the same file, not exported):

```javascript
function extractFindingsFromText(text) {
  // Matches: "### [SEVERITY] Title" + "**ID:** id" + "**File:** path" + "**Severity:** sev" + "**Lane:** lane"
  const findings = [];
  const cardRe = /###\s+\[([A-Z]+)\][^\n]*?\n[\s\S]*?\*\*ID:\*\*\s+`?([^`\s]+)`?[\s\S]*?\*\*File:\*\*\s+`?([^`\n]+)`?[\s\S]*?\*\*Severity:\*\*\s+(\w+)[\s\S]*?\*\*Lane:\*\*\s+(\w+)/g;
  let m;
  while ((m = cardRe.exec(text)) !== null) {
    findings.push({
      id: m[2].trim(),
      severity: m[4].toLowerCase(),
      file: m[3].trim(),
      lane: m[5].toLowerCase(),
      title: m[0].split('\n')[0].replace(/###\s+\[[A-Z]+\]\s+/, '').replace(/\s+—.*$/, '').trim(),
    });
  }
  return findings;
}

function extractCategoryFromTitle(title) {
  return (title || 'unknown').toLowerCase().split(/\s+/).slice(0, 2).join('-');
}
```

**Cross-cutting note (RESEARCH §Pitfall-4):** add a block comment near `bucketKey` documenting the chosen scheme: primary `(severity, category, lane)`, secondary disambiguator `file_path`. Forward-compatible with Phase 1 baselines because `extractCategoryFromTitle` heuristic backfills missing `category` fields.

**Differences from stub:**
- Stub returns `pass: true` always; replacement computes set-diff against baseline.
- Stub has no helpers; replacement adds two private helpers (`extractFindingsFromText`, `extractCategoryFromTitle`) NOT exported (only `pickMedianByDuration` is exported per existing module.exports at line 226).
- Update `module.exports` line 226 ONLY if the parity test directly imports `extractFindingsFromText` (recommendation: keep private; test via the public `runAgentParity` contract).

---

### `tests/critic-line-budget.test.cjs` (CREATE — static line-count guard)

**Analog:** `tests/agent-size-budget.test.cjs` (line-counts every `agents/gsd-*.md` file, asserts under per-tier budget; uses `node:test` + `node:assert/strict`).
**Reference implementation:** RESEARCH.md §Code-Example-2 (lines 503–557 — verbatim spec).

**Imports + helper pattern** (from `tests/agent-size-budget.test.cjs:20–63`):

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'agents', '_shared', 'critic-base.md');
const CRITICS = [
  'gsd-critic-plan', 'gsd-critic-code', 'gsd-critic-scope',
  'gsd-critic-verify', 'gsd-critic-discuss', 'gsd-critic-strategy',
];

function lineCount(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.length === 0) return 0;
  const trailingNewline = content.endsWith('\n') ? 1 : 0;
  return content.split('\n').length - trailingNewline;
}
```

**Per-test pattern** (from RESEARCH.md §Code-Example-2 — 4 tests, one per CRIT-02..04 + the @-import reachability check):

```javascript
test('critic-base.md ≤ 250 lines (CRIT-02)', () => {
  assert.ok(fs.existsSync(BASE), 'agents/_shared/critic-base.md must exist');
  const lines = lineCount(BASE);
  assert.ok(lines <= 250, `critic-base.md is ${lines} lines, max 250`);
});

test('each critic addendum ≤ 100 lines (CRIT-03)', () => {
  for (const name of CRITICS) {
    const file = path.join(ROOT, 'agents', `${name}.md`);
    const lines = lineCount(file);
    assert.ok(lines <= 100, `${name}.md is ${lines} lines, max 100`);
  }
});

test('total critic line-count ≤ 700 (CRIT-04)', () => {
  let total = lineCount(BASE);
  for (const name of CRITICS) {
    total += lineCount(path.join(ROOT, 'agents', `${name}.md`));
  }
  assert.ok(total <= 700, `total critic lines = ${total}, max 700 (down from 1731 baseline)`);
});

test('each critic begins with the @-import to base (CRIT-03 reachability)', () => {
  for (const name of CRITICS) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${name}.md`), 'utf-8');
    const afterFrontmatter = content.split(/^---\s*$/m).slice(2).join('---').trim();
    const firstLine = afterFrontmatter.split('\n').find((l) => l.trim().length > 0);
    assert.match(firstLine || '',
      /^@~?\/?\.claude\/get-shit-done\/agents\/_shared\/critic-base\.md\s*$/,
      `${name}.md must begin (after frontmatter) with @-reference to critic-base.md, got: "${firstLine}"`);
  }
});
```

**Differences from analog:**
- `agent-size-budget.test.cjs` uses tiered budgets (XL=1600, LARGE=1000, DEFAULT=500); `critic-line-budget` uses 3 fixed budgets (BASE≤250, each≤100, total≤700).
- Analog reads `agents/gsd-*.md` flat list; this test reads `agents/_shared/critic-base.md` + 6 specific critic files.
- Analog has no @-import reachability check; this test adds the regex-match for the leading `@~/.claude/get-shit-done/agents/_shared/critic-base.md` line.

---

### `tests/critic-no-base-shadowing.test.cjs` (CREATE — static structure guard)

**Analog:** `tests/cull-no-orphan-references.test.cjs` (multi-file scan, builds violations array, asserts `deepStrictEqual(violations, [])`).
**Reference implementation:** RESEARCH.md §Code-Example-3 (lines 559–608 — verbatim spec).

**Section-extraction helper pattern** (from RESEARCH §Code-Example-3, lines 578–582):

```javascript
function extractBaseSections(content) {
  const xmlTags = [...content.matchAll(/<([a-z_][a-z0-9_-]*)>/gi)].map((m) => m[1]);
  const mdHeadings = [...content.matchAll(/^##+\s+(.+)$/gm)].map((m) => m[1].trim());
  return { xmlTags: new Set(xmlTags), mdHeadings: new Set(mdHeadings) };
}
```

**Violations-array pattern** (from `cull-no-orphan-references.test.cjs:140–162` style — accumulate, assert empty at end):

```javascript
test('addendums do not re-define base XML tag sections (CRIT-05)', () => {
  const baseContent = fs.readFileSync(BASE, 'utf-8');
  const baseSections = extractBaseSections(baseContent);
  const violations = [];

  for (const name of CRITICS) {
    const file = path.join(ROOT, 'agents', `${name}.md`);
    const content = fs.readFileSync(file, 'utf-8');
    const addendumSections = extractBaseSections(content);

    for (const tag of addendumSections.xmlTags) {
      // Whitelist lens-specific containers
      if (tag === 'lens') continue;
      if (tag.endsWith('_specific_checklist')) continue;
      if (tag.endsWith('_calibration_examples')) continue;
      if (baseSections.xmlTags.has(tag)) {
        violations.push(`${name}.md re-defines <${tag}> already in base`);
      }
    }
    for (const heading of addendumSections.mdHeadings) {
      if (baseSections.mdHeadings.has(heading)) {
        violations.push(`${name}.md re-defines "${heading}" heading already in base`);
      }
    }
  }

  assert.deepStrictEqual(violations, [],
    'base-shadowing detected — addendums must contain only lens-specific content:\n' +
    violations.join('\n'));
});
```

**Differences from analog:**
- `cull-no-orphan-references.test.cjs` uses an ALLOW_LIST of file paths; this test uses a tag-shape WHITELIST (`tag === 'lens'`, `tag.endsWith('_specific_checklist')`, `tag.endsWith('_calibration_examples')`).
- Analog scans for deleted-name mentions via regex patterns; this test extracts XML tags + MD headings via regex and computes set membership.

---

### `tests/critic-aggregate-shape.test.cjs` (CREATE — unit test for new dispatcher case)

**Analog:** `tests/walltime-recorder.test.cjs` (unit tests for an integration helper using `node:test`; uses temp file + restore pattern to avoid polluting shared state).
**Secondary analog:** `tests/gsd-tools-dispatcher-reachable.test.cjs` (case-name discovery in dispatcher source).

**Temp-fixture + restore pattern** (from `walltime-recorder.test.cjs:23–35`):

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function withTempPhaseDir(critiques, fn) {
  const tmp = path.join(
    os.tmpdir(),
    `critic-aggregate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tmp, { recursive: true });
  for (const [lens, content] of Object.entries(critiques)) {
    fs.writeFileSync(path.join(tmp, `CRITIQUE-${lens}.md`), content);
  }
  try {
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
```

**Subprocess-invoke + JSON-parse pattern** (the obvious shape for invoking `gsd-tools.cjs critic-aggregate --phase-dir <tmp> --json`):

```javascript
const TOOLS = path.resolve(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');

test('critic-aggregate emits expected JSON shape with all 6 critics present', () => {
  withTempPhaseDir({
    plan:     '---\ncritique_type: plan\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 1, total: 1}\n---\n',
    code:     '---\ncritique_type: code\nstatus: warn\nseverity_counts: {critical: 0, warning: 2, info: 0, total: 2}\n---\n',
    scope:    '---\ncritique_type: scope\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
    verify:   '---\ncritique_type: verify\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
    discuss:  '---\ncritique_type: discuss\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
    strategy: '---\ncritique_type: strategy\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
  }, (tmp) => {
    const out = execFileSync('node', [TOOLS, 'critic-aggregate', '--phase-dir', tmp, '--json'], {
      encoding: 'utf-8',
    });
    const result = JSON.parse(out);
    assert.deepStrictEqual(result.critics_expected.sort(),
      ['code', 'discuss', 'plan', 'scope', 'strategy', 'verify']);
    assert.deepStrictEqual(result.critics_missing, []);
    assert.strictEqual(result.severity_counts_total.warning, 2);
    assert.strictEqual(result.status, 'warn');
  });
});

test('critic-aggregate flags missing critics (CRIT-09 disk read)', () => {
  withTempPhaseDir({
    plan:    '---\ncritique_type: plan\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
    code:    '---\ncritique_type: code\nstatus: pass\nseverity_counts: {critical: 0, warning: 0, info: 0, total: 0}\n---\n',
    // 4 critics deliberately missing
  }, (tmp) => {
    const out = execFileSync('node', [TOOLS, 'critic-aggregate', '--phase-dir', tmp, '--json'], {
      encoding: 'utf-8',
    });
    const result = JSON.parse(out);
    assert.deepStrictEqual(result.critics_missing.sort(),
      ['discuss', 'scope', 'strategy', 'verify']);
  });
});
```

**Differences from analog:**
- `walltime-recorder.test.cjs` invokes the helper directly (in-process); this test invokes the dispatcher subprocess (out-of-process) — closer to how the workflow uses it.
- Uses `--phase-dir <tmp>` override flag rather than the natural `--phase <N>` flag, so the test does not require a real planning tree.

---

### `tests/critique-workflow-structure.test.cjs` (CREATE — static proxy for CRIT-06/07)

**Analog:** `tests/cull-no-orphan-references.test.cjs` (multi-pattern grep + violations array).

**Greps to assert against `get-shit-done/workflows/critique.md`:**

```javascript
const WORKFLOW = path.join(ROOT, 'get-shit-done', 'workflows', 'critique.md');

test('critique workflow contains 6 Task() calls in a single block (CRIT-06 static proxy)', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf-8');
  // Count Task(subagent_type="gsd-critic-...") occurrences
  const matches = content.match(/Task\(\s*subagent_type\s*=\s*"gsd-critic-(plan|code|scope|verify|discuss|strategy)"/g) || [];
  assert.strictEqual(matches.length, 6,
    `Expected 6 Task(subagent_type="gsd-critic-*") spawns, found ${matches.length}`);
});

test('critique workflow calls critic-aggregate via gsd-sdk (CRIT-07)', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf-8');
  assert.match(content, /gsd-sdk\s+query\s+critic-aggregate/,
    'workflow must invoke `gsd-sdk query critic-aggregate` (out-of-context disk read)');
});

test('critique workflow does not split Task spawns across messages (CRIT-06)', () => {
  // Cheap proxy: assert all 6 Task() calls appear within a single contiguous block (no
  // intervening "Wait" / "After ... returns" / "Step N+1" lines between them).
  const content = fs.readFileSync(WORKFLOW, 'utf-8');
  const taskBlock = content.match(/(Task\(\s*subagent_type[\s\S]*?){6}/);
  assert.ok(taskBlock, 'all 6 Task() calls must appear in a contiguous block');
});
```

**Differences from analog:**
- Analog scans a corpus of files for forbidden-name mentions; this test scans ONE file for required structural markers.

---

### `integration/critic-batch-walltime.test.cjs` (CREATE — live test, CRIT-08)

**Analog:** `integration/skill-execution.test.cjs:20–36` (uses `runClaudeWithTools`, asserts `result.success`, asserts on `result.turns` and content) + `integration/lifecycle-steps/step-4-review-critique.cjs` (live `/gsd-review --critique` invocation against a sandbox).

**Imports + scaffold pattern** (from `integration/skill-execution.test.cjs:1–17`):

```javascript
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');
```

**Live invocation pattern** (from `step-4-review-critique.cjs:28–39` — exact target command):

```javascript
describe('CRIT-08: critic batch walltime is parallel-shaped', () => {
  test('all 6 critics spawn within 2s of each other; total walltime ≈ max(critic) × 1.3', async () => {
    const result = await runClaudeWithTools(
      'Run /gsd-review --critique 1 to review the phase 1 plans.',
      {
        cwd: getRepoRoot(),
        timeout: 600_000,
        maxBudget: 30,
      }
    );

    assert.ok(result.success, `critique failed: ${result.error || result.result.slice(0, 300)}`);

    // Record walltime ledger entry (XCUT-03)
    recordWalltime({
      test: 'integration:critic-batch-walltime',
      walltime_ms: result.duration_ms,
      cost_usd: result.cost,
      phase: 'phase-2-critic',
    });

    // Pull spawn-timestamp deltas from result.raw (per RESEARCH §Pitfall-2 Wave-0
    // reconnaissance — verify shape during spike before locking this assertion)
    const taskTimestamps = extractTaskStartTimes(result.raw);   // helper below
    const spawnDelta = Math.max(...taskTimestamps) - Math.min(...taskTimestamps);
    assert.ok(spawnDelta < 2000,
      `spawn-timestamp delta ${spawnDelta}ms exceeds 2s — Tasks may be running serially (#7406)`);

    // Sanity: total walltime should be near max-per-critic, not sum
    // (a serial-degraded run would be 6× a single critic)
    assert.ok(result.duration_ms < 6 * 60_000,
      `walltime ${result.duration_ms}ms suggests serial execution (max-parallel target: ~60s × 1.3)`);
  });
});

function extractTaskStartTimes(raw) {
  // Walk raw.events / raw.messages / raw.turns for Task spawn start markers.
  // Exact path TBD via Wave-0 spike inspection (RESEARCH §Pitfall-2);
  // fallback: parse stderr timestamps if JSON shape lacks per-Task timing.
  // ...
}
```

**Differences from analog:**
- `skill-execution.test.cjs` asserts on `result.turns >= 2` and content markers; this test asserts on parallel timing.
- `step-4-review-critique.cjs` is a lifecycle step with `assertArtifacts` callback; this test inlines artifact + timing assertions.
- Adds `recordWalltime({phase: "phase-2-critic"})` — first heavy XCUT-03 consumer.

---

### `integration/critic-fault-injection.test.cjs` (CREATE — live test, CRIT-09)

**Analog (closest):** `integration/skill-execution.test.cjs` (live invocation + output assertion); no in-tree fault-injection test exists.
**Mechanism:** RESEARCH §Open-Q-3 picks Option (a) — bad subagent_type. Test assertion: orchestrator emits info-severity finding for the missing critic and CRITIQUE.md still aggregates the surviving 5.

**Scaffold pattern** (extends `skill-execution.test.cjs:1–36` shape):

```javascript
test('CRIT-09: orchestrator skip-and-continue when 1-of-N critic fails', async () => {
  // Inject a fault by overriding the workflow context with a deliberately bad
  // subagent_type. Use a temp-prompt approach that the workflow body honors:
  //   "/gsd-review --critique 1 --inject-fault discuss"
  // (Phase 2 wires --inject-fault as a debug-only flag in the workflow OR the
  // test pre-mutates a local copy of critique.md to use a bad name. RESEARCH
  // recommends Option-a.)

  const result = await runClaudeWithTools(
    'Run /gsd-review --critique 1 with --inject-fault discuss',   // exact flag TBD by planner
    { cwd: getRepoRoot(), timeout: 600_000, maxBudget: 30 }
  );

  assert.ok(result.success, `orchestrator must continue even when 1 critic errors`);

  // Read merged CRITIQUE.md from the phase dir
  const phaseDir = findPhaseDir(getRepoRoot(), 1);
  const merged = fs.readFileSync(path.join(phaseDir, 'CRITIQUE.md'), 'utf-8');

  // Assert: surviving 5 critics aggregated
  for (const lens of ['plan', 'code', 'scope', 'verify', 'strategy']) {
    assert.match(merged, new RegExp(`critique_type:\\s*${lens}|CRITIQUE-${lens}`),
      `merged CRITIQUE.md must reference surviving critic ${lens}`);
  }

  // Assert: failed critic logged as info finding
  assert.match(merged, /\[INFO\][\s\S]*discuss[\s\S]*did not produce CRITIQUE/i,
    'orchestrator must log missing critic as info-severity finding');

  recordWalltime({
    test: 'integration:critic-fault-injection',
    walltime_ms: result.duration_ms,
    cost_usd: result.cost,
    phase: 'phase-2-critic',
  });
});
```

**Differences from analog:**
- No analog asserts on a missing-component info finding; this is a novel pattern.
- Reads merged `CRITIQUE.md` from disk to verify the orchestrator's continue-and-log path (NOT trusting the parent's text return).

---

### `integration/critic-parity.test.cjs` (CREATE — live test, CRIT-10, expensive ~$9 ~22min)

**Analog:** `integration/test-fixtures/baselines/_capture.cjs` (the only existing in-tree call site of `runAgentParity` — capture mode N=1). Phase 2 inverts to compare mode N=5.
**Reference baselines:** `integration/test-fixtures/baselines/critic-{plan,code,scope,verify,discuss,strategy}/*.json` (6 baseline files captured Phase 1, commit `2dff30fc`).

**`runAgentParity` invocation pattern** (compare mode, N=5 — extract from `agent-parity.cjs:84` JSDoc + the helper's switch on `mode`):

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { runAgentParity, SCHEMAS } = require('./helpers/agent-parity.cjs');

const FIXTURES = {
  'gsd-critic-plan':     { fixtureId: 'plan-with-known-issues',     prompt: '...' },
  'gsd-critic-code':     { fixtureId: 'code-with-smells',           prompt: '...' },
  'gsd-critic-scope':    { fixtureId: 'scope-with-creep',           prompt: '...' },
  'gsd-critic-verify':   { fixtureId: 'verify-with-gaps',           prompt: '...' },
  'gsd-critic-discuss':  { fixtureId: 'discuss-with-assumptions',   prompt: '...' },
  'gsd-critic-strategy': { fixtureId: 'strategy-with-tradeoffs',    prompt: '...' },
};

for (const [agentName, fixture] of Object.entries(FIXTURES)) {
  test(`CRIT-10: ${agentName} parity (N=5, ≥85% overlap, no missing critical)`, async () => {
    const result = await runAgentParity(
      agentName,
      { ...fixture, cwd: process.cwd() },
      SCHEMAS['critic-findings'],
      {
        n: 5,
        mode: 'compare',
        phase: 'phase-2-critic',
        walltimeBudgetMs: 600_000,
        maxCostUsd: 30,
      }
    );

    assert.ok(result.pass,
      `parity FAIL for ${agentName}: overlap=${result.deltas?.overlap?.toFixed(2)}, ` +
      `missingCritical=${JSON.stringify(result.deltas?.missingCritical)}`);
  });
}
```

**Fixture-prompt source:** Phase 1 captured baselines via `integration/test-fixtures/baselines/_capture.cjs`. Pull the EXACT prompts from there — same input → same baseline → comparable output.

**Differences from analog:**
- Capture mode (`mode: 'capture'`, N=1) writes baseline; compare mode (`mode: 'compare'`, N=5) reads baseline + asserts.
- 6 tests in one file (one per critic) — Bazel runs each as a separate test case but billed under one `js_test` target.

**BUILD.bazel entry (per RESEARCH §Pitfall-7):**

```python
js_test(
    name = "critic-parity",
    entry_point = "critic-parity.test.cjs",
    data = [
        "//integration/helpers:test_helpers",
        "//integration/test-fixtures/baselines:critic_baselines",
    ],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "phase-2-critic", "nightly"],
    timeout = "eternal",   # RESEARCH §Pitfall-7: ~$9, ~22min — needs eternal not long
)
```

---

### `integration/test-fixtures/walltime-ledger.jsonl` (APPEND — data file)

**Analog:** the existing 26 entries from Phase 1. The schema is locked in `integration/helpers/walltime-recorder.cjs:36–42`.

**Existing schema (per Phase 1 Plan 09-fix CR-05):**

```jsonl
{"date":"2026-04-29","test":"agent-parity:critic-plan:plan-with-known-issues","walltime_ms":73558,"cost_usd":0.56025425,"phase":"phase-1-cull"}
{"date":"2026-04-29","test":"agent-parity:critic-code:code-with-smells","walltime_ms":56194,"cost_usd":0.34580825,"phase":"phase-1-cull"}
```

**Phase 2 entries differ ONLY in `phase`:**

```jsonl
{"date":"2026-05-04","test":"agent-parity:gsd-critic-plan:plan-with-known-issues","walltime_ms":...,"cost_usd":...,"phase":"phase-2-critic"}
{"date":"2026-05-04","test":"integration:critic-batch-walltime","walltime_ms":...,"cost_usd":...,"phase":"phase-2-critic"}
{"date":"2026-05-04","test":"integration:critic-fault-injection","walltime_ms":...,"cost_usd":...,"phase":"phase-2-critic"}
```

**Append helper** — `integration/helpers/walltime-recorder.cjs::recordWalltime` (Don't-Hand-Roll: NEVER `fs.appendFileSync` directly — use `recordWalltime({test, walltime_ms, cost_usd, phase})` so the CR-05 schema validation runs).

---

### `tests/walltime-ledger-schema.test.cjs` (CREATE — optional, XCUT-03 shape gate)

**Analog:** `tests/walltime-recorder.test.cjs` (validates shape via the recorder API; this test would validate the on-disk JSONL directly).

**Pattern:**

```javascript
const LEDGER = path.resolve(__dirname, '..', 'integration', 'test-fixtures', 'walltime-ledger.jsonl');

test('every walltime-ledger line has {date, test, walltime_ms, cost_usd, phase}', () => {
  const lines = fs.readFileSync(LEDGER, 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  for (const [i, line] of lines.entries()) {
    let entry;
    assert.doesNotThrow(() => { entry = JSON.parse(line); }, `line ${i+1} not valid JSON`);
    assert.strictEqual(typeof entry.date, 'string');
    assert.strictEqual(typeof entry.test, 'string');
    assert.strictEqual(typeof entry.walltime_ms, 'number');
    assert.strictEqual(typeof entry.cost_usd, 'number');
    assert.strictEqual(typeof entry.phase, 'string');
    assert.match(entry.phase, /^phase-\d+-[a-z]+$/, `phase tag malformed: ${entry.phase}`);
  }
});

test('phase-2-critic entries appear after Phase 2 lands', () => {
  const lines = fs.readFileSync(LEDGER, 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const phases = new Set(lines.map((l) => JSON.parse(l).phase));
  // After Phase 2, both tags exist; before Phase 2, only phase-1-cull.
  // This test is permissive — it just checks the shape contract.
  assert.ok(phases.has('phase-1-cull'), 'phase-1-cull entries must persist');
});
```

---

### `integration/BUILD.bazel` (MODIFY — add `phase-2-critic` tag + new live-test entries)

**Analog:** existing tag list at line 50 (`tags = ["integration", "local", "requires-api-key", "lifecycle", "phase-1-cull"]`).

**New entries pattern** (per RESEARCH §Pattern-4):

```python
# Phase 2 critic batch — live tests (added Phase 2)
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = [
        "//integration/helpers:test_helpers",
        "//integration/test-fixtures/baselines:critic_baselines",
    ],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-2-critic"],
    timeout = "long",
) for test_file in [
    "critic-batch-walltime.test.cjs",
    "critic-fault-injection.test.cjs",
]]

# CRIT-10 parity — expensive (~$9, ~22min); nightly + phase-exit only
js_test(
    name = "critic-parity",
    entry_point = "critic-parity.test.cjs",
    data = [
        "//integration/helpers:test_helpers",
        "//integration/test-fixtures/baselines:critic_baselines",
    ],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "phase-2-critic", "nightly"],
    timeout = "eternal",
)
```

**Multi-tag the lifecycle target** (per RESEARCH §Pattern-4 closing — keep `phase-1-cull` AND add `phase-2-critic`):

```python
# Modify line 50:
tags = ["integration", "local", "requires-api-key", "lifecycle", "phase-1-cull", "phase-2-critic"],
```

---

### `tests/BUILD.bazel` (MODIFY — add new static-test entries with `phase-2-critic` tag)

**Analog:** existing list-comprehension block at lines 7–20.

**New entries** (slot inside the existing list-comprehension or a new block):

```python
[js_test(
    name = test_file.replace(".test.cjs", ""),
    entry_point = test_file,
    data = ["//integration/helpers:test_helpers"],
    size = "small",
    tags = ["unit", "local", "phase-2-critic"],
    timeout = "short",
) for test_file in [
    "critic-line-budget.test.cjs",
    "critic-no-base-shadowing.test.cjs",
    "critic-aggregate-shape.test.cjs",
    "critique-workflow-structure.test.cjs",
    "critic-spike-passes.test.cjs",   # if static; see note below
]]
```

**Note on `critic-spike-passes.test.cjs`:** The spike test is LIVE (calls `runClaudeWithTools`), so it belongs in `integration/BUILD.bazel` with `requires-api-key` tag, not `tests/BUILD.bazel`. RESEARCH §Wave-0-Gaps lists it under `tests/` by name but its semantics are integration. Recommendation: file the test under `tests/` but tag it `requires-api-key` and ensure it only runs with the API-key Bazel filter (or move it to `integration/`). Planner decides.

---

### `bin/install.js` (MODIFY — extend manifest builder + (maybe) `copyWithPathReplacement`)

**Analog (manifest-builder slot):** lines 5313–5318 — current code enumerates `agents/gsd-*.md`:

```javascript
if (fs.existsSync(agentsDir)) {
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('gsd-') && file.endsWith('.md')) {
      manifest.files['agents/' + file] = fileHash(path.join(agentsDir, file));
    }
  }
}
```

**Extension pattern** (per RESEARCH §Pitfall-6, add a parallel block for `agents/_shared/`):

```javascript
if (fs.existsSync(agentsDir)) {
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('gsd-') && file.endsWith('.md')) {
      manifest.files['agents/' + file] = fileHash(path.join(agentsDir, file));
    }
  }
  // Phase 2: track agents/_shared/*.md so reapply-patches can detect user mods
  const sharedDir = path.join(agentsDir, '_shared');
  if (fs.existsSync(sharedDir)) {
    for (const file of fs.readdirSync(sharedDir)) {
      if (file.endsWith('.md')) {
        manifest.files['agents/_shared/' + file] = fileHash(path.join(sharedDir, file));
      }
    }
  }
}
```

**Cross-cutting test** (RESEARCH §Pitfall-5 explicit recommendation — add `tests/install-shared-dir.test.cjs` and/or `tests/install-manifest-includes-shared.test.cjs`):

- Run `bin/install.js` against a temp dir for the Claude runtime
- Assert `agents/_shared/critic-base.md` lands in the destination
- Assert `manifest.files['agents/_shared/critic-base.md']` exists with a hash

**Note on `copyWithPathReplacement` (lines 4156–4234):** Per RESEARCH §Pitfall-6 the recursion at line 4183 (`if (entry.isDirectory())`) ALREADY handles `agents/_shared/` for Claude runtime. Verify during Wave-0 by inspecting one install output. ONLY add explicit handling if the recursion does not pick it up (Pitfall-5 fallback).

---

## Shared Patterns

### Pattern A: `node:test` + `node:assert` static test scaffold

**Source:** every `tests/*.test.cjs` file (verified: `walltime-recorder.test.cjs`, `agent-parity-helper-shape.test.cjs`, `agent-size-budget.test.cjs`, `cull-no-orphan-references.test.cjs`).

**Apply to:** `tests/critic-line-budget.test.cjs`, `tests/critic-no-base-shadowing.test.cjs`, `tests/critic-aggregate-shape.test.cjs`, `tests/critique-workflow-structure.test.cjs`, `tests/walltime-ledger-schema.test.cjs`.

**Boilerplate:**

```javascript
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');   // OR: 'node:assert' for non-strict (both used in repo)
const fs = require('node:fs');                    // OR: require('fs') — both work; prefer 'node:' prefix in new code
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
```

---

### Pattern B: `runClaudeWithTools` live-test scaffold

**Source:** `integration/skill-execution.test.cjs:1–17` and `integration/lifecycle-steps/step-4-review-critique.cjs:17–39`.
**Helper signature:** `runClaudeWithTools(prompt, opts) → { success, result, turns, cost, duration_ms, raw, error? }` (claude-runner.cjs:264–326).

**Apply to:** `tests/critic-spike-passes.test.cjs`, `integration/critic-batch-walltime.test.cjs`, `integration/critic-fault-injection.test.cjs`.

**Boilerplate:**

```javascript
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { runClaudeWithTools, getRepoRoot } = require('./helpers/claude-runner.cjs');
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');

test('<requirement-id>: <behavior>', async () => {
  const result = await runClaudeWithTools(
    '<exact prompt to send to claude>',
    {
      cwd: getRepoRoot(),
      timeout: 600_000,
      maxBudget: 30,
    }
  );

  assert.ok(result.success, `failed: ${result.error || result.result.slice(0, 300)}`);

  recordWalltime({
    test: 'integration:<test-name>',
    walltime_ms: result.duration_ms,
    cost_usd: result.cost,                       // NOT `cost: result.cost` — CR-05 silent-zero bug
    phase: 'phase-2-critic',
  });

  // ...assertion-specific logic
});
```

---

### Pattern C: Walltime-ledger append (XCUT-03)

**Source:** `integration/helpers/walltime-recorder.cjs:23–45`. The CR-05 fix at lines 24–32 is the load-bearing constraint: caller MUST pass `cost_usd: number` (not `cost`, not `undefined`, not `string`). Existing producer at `agent-parity.cjs:106–112` shows the exact call shape.

**Apply to:** every Phase 2 LIVE test (`tests/critic-spike-passes.test.cjs`, `integration/critic-batch-walltime.test.cjs`, `integration/critic-fault-injection.test.cjs`, `integration/critic-parity.test.cjs` — though the parity test gets free walltime ledger entries via `runAgentParity`, the others must call `recordWalltime` directly).

**Boilerplate:**

```javascript
const { recordWalltime } = require('./helpers/walltime-recorder.cjs');   // path adjusts by file location

recordWalltime({
  test: 'integration:critic-batch-walltime',
  walltime_ms: result.duration_ms,
  cost_usd: result.cost,                  // CR-05: use cost_usd, not cost
  phase: 'phase-2-critic',                // XCUT-03: phase tag locks ledger to this phase
});
```

---

### Pattern D: Bazel `phase-N-name` tag

**Source:** `integration/BUILD.bazel:50` (`phase-1-cull` on lifecycle), `tests/BUILD.bazel:14` (`phase-1-cull` on static-test list-comprehension).

**Apply to:** all new Phase 2 test entries in both BUILD.bazel files; ALSO multi-tag `gsd-lifecycle` (line 50) since step-4 exercises critic batch.

**Tag set per test class:**

| Test class | Tags |
|------------|------|
| Static (unit) | `["unit", "local", "phase-2-critic"]` |
| Live (cheap) | `["integration", "local", "requires-api-key", "phase-2-critic"]` |
| Live (expensive — parity) | `["integration", "local", "requires-api-key", "phase-2-critic", "nightly"]` |
| Lifecycle (multi-phase) | `["integration", "local", "requires-api-key", "lifecycle", "phase-1-cull", "phase-2-critic"]` |

**Filter command:** `bazel test //integration/... //tests/... --test_tag_filters=phase-2-critic` runs the entire Phase 2 surface.

---

### Pattern E: `gsd-tools.cjs` dispatcher case + handler module

**Source:**
- Top-level case shape: `case 'verify-summary':` lines 646–652 (single action) or `case 'verify':` lines 697–718 (multi-subcommand).
- Handler module shape: `get-shit-done/bin/lib/verify.cjs` lines 1–60.
- Reachability test: `tests/gsd-tools-dispatcher-reachable.test.cjs` (every new top-level case must be invoked by a surviving caller OR documented in `docs/INVENTORY.md ## CLI Subcommands`).

**Apply to:** `case 'critic-aggregate':` + `get-shit-done/bin/lib/critic-aggregate.cjs`.

**Reachability for `critic-aggregate`:** invoked by `get-shit-done/workflows/critique.md` via `gsd-sdk query critic-aggregate`. The reachable-test regex at `tests/gsd-tools-dispatcher-reachable.test.cjs:108–121` matches `\bgsd-sdk\b[^\n]{0,80}?\bcritic-aggregate\b` — so as long as the workflow body contains the literal `gsd-sdk query critic-aggregate`, the test passes without an INVENTORY entry. Recommendation: add an INVENTORY entry anyway (`docs/INVENTORY.md ## CLI Subcommands`) to make this discoverable for future agents (per the post-CR-03 Option-A precedent that documented other internal subcommands).

---

### Pattern F: `Task(subagent_type=...)` sub-agent spawn

**Source:**
- Single-Task spawn: `get-shit-done/workflows/discuss-phase-assumptions.md:257–280`.
- Parallel-wave spawn: `get-shit-done/workflows/research-phase.md:225–250` (wave_size=4 chunking; Phase 2 collapses to single wave of 6).

**Apply to:** `get-shit-done/workflows/critique.md` `<process>` block — emit ALL 6 Task() calls in ONE assistant message (no `for wave in waves` loop; just 6 inline Task calls between two markdown headers).

**Hard constraint (RESEARCH §Anti-Patterns):** "Split `Task` calls across messages → kills the walltime gain. **One message, all 6 calls in one block.**"

---

## No Analog Found

| File | Why no analog | Mitigation |
|------|---------------|------------|
| `integration/critic-fault-injection.test.cjs` | No in-tree fault-injection test exists. | Build from `integration/skill-execution.test.cjs` scaffold + RESEARCH §Open-Q-3 mechanism (Option-a: bad subagent_type). Cite RESEARCH §Open-Q-3 in test header. |
| `agents/_shared/critic-base.md` (the file as a whole — its content sections have analogs in critic-plan, but the file's *role* as a shared-import target has no analog) | First file under `agents/_shared/` ever; no precedent for the install-manifest path. | Rely on RESEARCH §Pitfall-5/6 explicit guidance + new `tests/install-shared-dir.test.cjs`. Verify install during Wave-0 spike. |
| Spawn-timestamp extraction from `result.raw` (used in `critic-batch-walltime.test.cjs`) | Phase 1 used `duration_ms` (end-to-end) only; per-Task timing not previously extracted. | RESEARCH §Pitfall-2 calls out a Wave-0 reconnaissance task: dump one critic's `result.raw` to disk during the spike commit, inspect for `started_at` markers. Fallback: bash-tool timestamp wrapping per RESEARCH §Pitfall-2. |

---

## Metadata

**Analog search scope:**
- `agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md` (6 files — pre-trim shape source)
- `agents/gsd-{planner,executor,verifier,plan-checker,phase-researcher,user-profiler}.md` (post-trim @-import shape evidence)
- `get-shit-done/workflows/{research-phase,discuss-phase-assumptions,plan-phase}.md` (Task-spawn patterns)
- `get-shit-done/bin/gsd-tools.cjs` (dispatcher pattern, lines 545–1100)
- `get-shit-done/bin/lib/{verify,frontmatter,core,state}.cjs` (handler module patterns)
- `integration/helpers/{agent-parity,walltime-recorder,claude-runner}.cjs` (Phase 1 outputs)
- `tests/{walltime-recorder,agent-parity-helper-shape,agent-size-budget,cull-no-orphan-references,gsd-tools-dispatcher-reachable,parity-baselines-shape}.test.cjs`
- `integration/{skill-execution,gsd-lifecycle}.test.cjs` + `integration/lifecycle-steps/step-4-review-critique.cjs`
- `integration/BUILD.bazel`, `tests/BUILD.bazel`
- `bin/install.js` lines 4156–4234 (copyWithPathReplacement) and 5313–5318 (manifest builder)
- `integration/test-fixtures/walltime-ledger.jsonl` (26 existing entries)
- `integration/test-fixtures/baselines/critic-{plan,code,scope,verify,discuss,strategy}/` (6 baseline corpora)

**Files scanned (read in full or targeted ranges):** ~25 files across agents, workflows, bin, lib, tests, integration, fixtures.

**Pattern extraction date:** 2026-05-04

## PATTERN MAPPING COMPLETE
