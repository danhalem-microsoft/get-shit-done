# Phase 2: Critic refactor (with commit-0 spike) — Research

**Researched:** 2026-05-04
**Domain:** Claude Code agent prompt architecture, parallel `Task()` orchestration, behavior-parity testing
**Confidence:** HIGH on infrastructure (Phase 1 outputs verified on disk), HIGH on existing critic shape (all 6 prompts read), MEDIUM on Claude Code spawn-time `@`-resolution semantics (documented behavior + strong empirical evidence already in repo, but still requires the spike), LOW on absolute walltime targets (depends on Claude Code's internal Task scheduler which is opaque).

## Summary

Phase 2 has three orthogonal concerns the planner must wire together:
(1) **Format change** — extract a shared base prompt at `agents/_shared/critic-base.md` and shrink each of the 6 critics to a 50–100 line lens addendum, total ≤700 lines (down from 1,731 verified `wc -l`).
(2) **Orchestration change** — build the critic-batch orchestrator from scratch (it does not exist today; `get-shit-done/workflows/critique.md` is empty, 0 bytes) so that all 6 critics fire as one parallel `Task` batch from a single assistant message, with disk-based aggregation via a new `gsd-tools.cjs critic-aggregate` subcommand to mitigate the parallel-Task hallucination bug ([anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181)).
(3) **Test infrastructure** — implement the `critic-findings` schema's `computeCriticFindingsDeltas` function in `integration/helpers/agent-parity.cjs` (it is currently a Phase-2-deferred stub at line 192) and wire 5 new tests that gate the phase exit.

The phase begins with a **commit-0 spike** (`tests/critic-spike-passes.test.cjs`). Strong empirical evidence already exists that `@`-references work in Task-spawned agent prompts (16+ existing inline references in `gsd-planner.md`, `gsd-executor.md`, `gsd-verifier.md`, `gsd-plan-checker.md`, etc., all currently functioning in production), so the spike is expected to PASS — but it must still be verified explicitly before committing to the `@`-reference path. Fallback is install-time inlining via `bin/install.js` (already does path-rewriting at lines 4188–4197; would need to add content-inlining).

**Primary recommendation:** Plan as 2 waves — Wave 0 = the spike (1 commit) + the `critic-findings` schema delta function (unblocks parity tests). Wave 1 = base/addendum extraction + orchestrator + the 5 tests + walltime ledger phase tag. Phase 2 is dense; expect 6–8 plans. Lock the parallel-Task pattern (single assistant message, 6 `Task` calls in one block) by reference to a verified spawn-timestamp test (CRIT-08) — this is the load-bearing assertion that distinguishes "real parallel" from the [#7406 "claims parallel, executes serial"](https://github.com/anthropics/claude-code/issues/7406) failure mode.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRIT-01 | `tests/critic-spike-passes.test.cjs` verifies `@`-reference resolution in Task-spawned agent prompts | §4 spike design; §3 evidence that 16+ existing agents already use this syntax in production (high prior on PASS) |
| CRIT-02 | `agents/_shared/critic-base.md` ≤250 lines, contains role framing + severity rubric + CRITIQUE.md schema + cross-flag rules + evidence requirements | §5 content map (5 sections × ~30–50 lines each = ~200 lines budget) |
| CRIT-03 | Each critic ≤100 lines, begins with `@`-reference to base, contains only lens-specific content | §5 content map (per-critic deltas table) |
| CRIT-04 | Total critic line-count ≤700, enforced by `tests/critic-line-budget.test.cjs` | §9.1 test design (single grep+wc test, sums 7 files) |
| CRIT-05 | No base-shadowing in addendums, enforced by `tests/critic-no-base-shadowing.test.cjs` | §9.2 test design (extract base section headings, assert none reappear in addendums) |
| CRIT-06 | All 6 critics spawn in one assistant message as parallel `Task` calls | §6 orchestrator wiring sketch |
| CRIT-07 | Orchestrator reads CRITIQUE files from disk via `gsd-tools.cjs critic-aggregate` | §7 CLI subcommand spec |
| CRIT-08 | `integration/critic-batch-walltime.test.cjs` — spawn-timestamp delta <2s, total walltime ≈ max(critic) | §6 timing instrumentation + §9.5 |
| CRIT-09 | 1-of-N failure injection — orchestrator skip-and-continue, missing critic logged as info-severity | §6 fault-injection mechanism + §9.6 |
| CRIT-10 | `integration/critic-parity.test.cjs` — N=5 median, ≥85% finding overlap, no missing critical findings | §9.4 parity test design + §3 schema infrastructure ready to consume |
| XCUT-03 | Walltime ledger entries with `phase: "phase-2-critic"`, scoped via `bazel test --test_tag_filters=phase-2-critic` | §8 ledger consumption (Phase 1 wrote infrastructure; Phase 2 first heavy consumer) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shared prompt content (role, rubric, schema) | Static markdown file (`agents/_shared/critic-base.md`) | — | Loaded by Claude Code's `@`-reference resolver at agent-prompt-load time; no runtime logic |
| Lens-specific content (per-critic checklists, anti-patterns) | Static markdown file (`agents/gsd-critic-*.md`) | — | One file per critic; loaded after base via the leading `@` reference |
| Critic orchestration (parallel batch, fault injection, aggregation) | Workflow markdown + slash command (`workflows/critique.md` body, called by `commands/gsd/review.md --critique`) | — | Workflow body is the orchestrator prompt; runs as the parent assistant turn that emits 6 `Task` calls |
| Disk-based aggregation | Node CLI (`get-shit-done/bin/gsd-tools.cjs critic-aggregate`) | — | Pure file-system operation: glob `CRITIQUE-*.md` in phase dir, parse YAML frontmatter, return JSON for the orchestrator to format. Stays out of the prompt context to avoid hallucination of CRITIQUE contents |
| Spawn-timestamp + walltime measurement | Test harness (Node.js, integration tests) | Claude Code JSON output via `runClaudeWithTools` | `runClaudeWithTools` already returns `duration_ms` per Task spawn; aggregating across 6 spawns requires reading transcript or sub-task output objects |
| Walltime ledger appender | Node helper (`integration/helpers/walltime-recorder.cjs`) | Phase 1 owner; Phase 2 caller | Helper exists; Phase 2 just calls it with `phase: "phase-2-critic"` |
| Parity comparison (severity-bucketed key, ≥85% overlap, no-missing-critical) | Node helper (`integration/helpers/agent-parity.cjs::computeCriticFindingsDeltas`) | — | Currently a stub at line 192–202; Phase 2 implements the production logic |

## Standard Stack

This is an in-repo refactor — no new external dependencies. The "stack" is GSD's own infrastructure layered on Claude Code's runtime.

### Core (already present, used directly)

| Component | Path | Purpose | Why Standard |
|-----------|------|---------|--------------|
| Claude Code agent prompt format | YAML frontmatter + XML sections in `.md` | Defines agent identity, tools, color, role | Repo convention across all 22 surviving agents post-Phase-1 [VERIFIED: read all 6 critic files] |
| `@`-reference syntax | `@~/.claude/get-shit-done/...` and `@$HOME/.claude/...` in agent body | Inline-import shared content at prompt-load time | [VERIFIED: 16+ existing references in `gsd-planner.md`, `gsd-executor.md`, `gsd-verifier.md`, `gsd-plan-checker.md`, `gsd-phase-researcher.md`, `gsd-user-profiler.md`]; [CITED: Claude Code docs — recursive imports up to depth 5, both relative and absolute paths supported, https://code.claude.com/docs/en/memory] |
| `runClaudeWithTools(prompt, opts)` | `integration/helpers/claude-runner.cjs:270` | Spawns `claude` CLI subprocess with `--print --output-format json`, returns `{success, result, turns, cost, duration_ms, raw}` | Used by every existing live integration test [VERIFIED: read file] |
| `runAgentParity(name, fixture, schema, opts)` | `integration/helpers/agent-parity.cjs:84` | N-iteration runner with per-run walltime recording + median selection + schema-aware delta computation | Phase 1 owner; three schema kinds locked: `critic-findings`, `plan-structural`, `schema-conformance` [VERIFIED: read file] |
| `recordWalltime(entry)` | `integration/helpers/walltime-recorder.cjs:23` | Append `{date, test, walltime_ms, cost_usd, phase}` JSONL to `integration/test-fixtures/walltime-ledger.jsonl` | Phase 1 wrote it; 26 entries already present from Phase 1 baselines [VERIFIED: read file + ledger] |
| `gsd-tools.cjs` dispatcher | `get-shit-done/bin/gsd-tools.cjs:545` | Top-level `switch (command)` block, 4-space-indented `case 'name':` pattern; ~50 existing top-level cases | Pattern enforced by `tests/gsd-tools-dispatcher-reachable.test.cjs` (CR-03 guard) [VERIFIED: read both files] |
| Pre-refactor critic baselines | `integration/test-fixtures/baselines/critic-{plan,code,scope,verify,discuss,strategy}/*.json` | N=1 capture of each critic's pre-refactor output on canonical fixture, with `_meta.schema_kind: "critic-findings"` | Captured Phase 1 commit `2dff30fc` per `_meta.json` [VERIFIED: read corpus] |

### Supporting (created in Phase 2)

| Component | Path | Purpose | When to Use |
|-----------|------|---------|-------------|
| Critic base prompt | `agents/_shared/critic-base.md` | Shared role framing, severity rubric, CRITIQUE.md output schema, cross-flag rule, evidence requirements | Loaded via leading `@` reference in each of the 6 critic files |
| Critique workflow body | `get-shit-done/workflows/critique.md` | Orchestrator prompt that emits 6 parallel `Task` calls, calls `gsd-tools.cjs critic-aggregate`, formats merged report | Today this file is **empty (0 bytes)** [VERIFIED: `wc -l`]; Phase 2 authors it |
| `critic-aggregate` CLI subcommand | New top-level case in `get-shit-done/bin/gsd-tools.cjs` | Glob `CRITIQUE-*.md` in phase dir, parse YAML frontmatter, return aggregated JSON | Called by orchestrator after `Task` batch returns; mitigates [#29181](https://github.com/anthropics/claude-code/issues/29181) |
| `computeCriticFindingsDeltas` real implementation | `integration/helpers/agent-parity.cjs:192` (currently stub) | Severity-bucketed-key set diff against baseline, returns `{pass, overlap, missingCritical, extraFindings}` | Called by `runAgentParity` when `schema.kind === 'critic-findings'`; consumed by `integration/critic-parity.test.cjs` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@`-reference at agent-load time | Install-time inlining via `bin/install.js` (read `_shared/critic-base.md`, splice content into each critic during `install` step) | Inlining produces self-contained installed files (no `@`-reference resolution needed at runtime — works even if Claude Code's `@`-resolver has Task-spawn edge cases). **Cost:** the source repo's `agents/gsd-critic-*.md` files would no longer be the artifacts users see; updating base requires re-running install. **Decision:** prefer `@`-reference (simpler, source = artifact); fall back to inlining only if the spike fails. |
| Single CRITIQUE.md per critic | Single merged CRITIQUE.md across all 6 | Per-critic files preserve each critic's identity and let the orchestrator distinguish missing critics (CRIT-09); merge step happens AFTER aggregation. Existing critic prompts already write per-critic files (`CRITIQUE-plan.md`, `CRITIQUE-code.md`, etc., per the `<output>` blocks in each critic) [VERIFIED: read all 6]. **Decision:** keep per-critic files; merge is presentation only. |
| Spawn 6 `Task` calls from a workflow markdown | Spawn from a Node script | Workflow markdown is the established pattern for slash-command orchestration in GSD; Claude Code parses the workflow body, sees 6 `Task` calls in one assistant turn, and (per its parallel-Task scheduler) launches them concurrently. A Node script would have to invoke Claude Code as a subprocess and trade off simplicity for less-tested infrastructure. **Decision:** workflow markdown, with the `Task()` examples written explicitly so the orchestrator knows what shape to emit. |
| `@$HOME/.claude/get-shit-done/agents/_shared/critic-base.md` | `@~/.claude/get-shit-done/agents/_shared/critic-base.md` | Both forms are documented as equivalent [CITED: Claude Code docs]. **Existing repo convention** (16+ inline refs) uses `@~/...` — Phase 2 should match for consistency. |

**Installation note:** No `npm install` for new packages — Phase 2 uses only existing infrastructure.

**Version verification:** N/A — no external packages added or upgraded. Confirmed by reading `package.json`: no Phase 2 plan adds dependencies.

## Architecture Patterns

### System Architecture Diagram

```
                           User runs /gsd-review --critique <phase>
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ commands/gsd/review.md (slash command file)  │
                   │   - parses --critique flag                   │
                   │   - dispatches to workflows/critique.md      │
                   └──────────────────────┬───────────────────────┘
                                          │ @-reference
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │ get-shit-done/workflows/critique.md          │  ← THE ORCHESTRATOR PROMPT
                   │   (currently 0 bytes; Phase 2 authors)       │
                   │                                              │
                   │   1. Resolve phase artifacts (PLAN, SUMMARY, │
                   │      VERIFICATION, CRITIQUE prior runs)      │
                   │   2. Emit 6 Task() calls in ONE message ──┐  │
                   │   3. Wait for batch return                │  │
                   │   4. Run gsd-tools.cjs critic-aggregate   │  │
                   │   5. Format merged report                 │  │
                   └────────────────────────────────────────────┼──┘
                                                                │
              ╔══════════════ PARALLEL TASK BATCH ════════════════╗
              ║         (single assistant turn, 6 Task calls)     ║
              ║                                                   ║
              ║  Task("gsd-critic-plan",  prompt+context)         ║
              ║  Task("gsd-critic-code",  prompt+context)         ║
              ║  Task("gsd-critic-scope", prompt+context)  ──┐    ║
              ║  Task("gsd-critic-verify", prompt+context)   │    ║
              ║  Task("gsd-critic-discuss", prompt+context)  │    ║
              ║  Task("gsd-critic-strategy", prompt+context) │    ║
              ╚══════════════════════════════════════════════╪════╝
                                                             │
                              each Task spawn loads agent ◀──┘
                              prompt; agent prompt's first
                              non-frontmatter line is:
                              @~/.claude/get-shit-done/agents/_shared/critic-base.md
                                                             │
              ┌──────────────────────────────────────────────┴────┐
              │ Each critic agent (in its own sub-context):        │
              │   - Loads base via @-reference (resolved at        │
              │     prompt-load by Claude Code, depth ≤ 5)         │
              │   - Reads phase artifacts via Read tool            │
              │   - Writes CRITIQUE-{lens}.md to phase_dir         │
              │   - Returns short text summary (NOT trusted)       │
              └────────────────────────────┬───────────────────────┘
                                           │
                              files on disk (truth):
                              {phase_dir}/CRITIQUE-plan.md
                              {phase_dir}/CRITIQUE-code.md
                              {phase_dir}/CRITIQUE-scope.md
                              {phase_dir}/CRITIQUE-verify.md
                              {phase_dir}/CRITIQUE-discuss.md
                              {phase_dir}/CRITIQUE-strategy.md
                                           │
                                           ▼
                   ┌──────────────────────────────────────────────┐
                   │ gsd-tools.cjs critic-aggregate --phase <N>   │
                   │   - glob CRITIQUE-*.md in phase_dir          │
                   │   - parse YAML frontmatter                   │
                   │   - return JSON: { critics: [...], missing:  │
                   │     [...], severity_counts: {...}, status }  │
                   └──────────────────────┬───────────────────────┘
                                          │
                                          ▼
                              Orchestrator emits human-
                              readable merged report;
                              missing critics → info finding (CRIT-09)
```

### Recommended Project Structure

```
agents/
├── _shared/
│   └── critic-base.md             ← NEW (CRIT-02, ~200 lines, ≤250 cap)
├── gsd-critic-plan.md             ← TRIM to ~80 lines (CRIT-03)
├── gsd-critic-code.md             ← TRIM to ~95 lines (largest pre-cut: 341)
├── gsd-critic-scope.md            ← TRIM to ~70 lines
├── gsd-critic-verify.md           ← TRIM to ~75 lines
├── gsd-critic-discuss.md          ← TRIM to ~80 lines
├── gsd-critic-strategy.md         ← TRIM to ~70 lines (most-different lens)
└── (other 16 agents, untouched)

get-shit-done/workflows/
└── critique.md                    ← AUTHOR (currently 0 bytes; Phase 2 fills)

get-shit-done/bin/
└── gsd-tools.cjs                  ← ADD case 'critic-aggregate' top-level switch

integration/helpers/
└── agent-parity.cjs               ← REPLACE stub at line 192 with real
                                     computeCriticFindingsDeltas

integration/
└── critic-batch-walltime.test.cjs ← NEW (CRIT-08, live)
└── critic-parity.test.cjs         ← NEW (CRIT-10, live, expensive)
└── critic-fault-injection.test.cjs ← NEW (CRIT-09, live)

tests/
└── critic-spike-passes.test.cjs   ← NEW Wave-0 commit-0 (CRIT-01)
└── critic-line-budget.test.cjs    ← NEW (CRIT-04, static)
└── critic-no-base-shadowing.test.cjs ← NEW (CRIT-05, static)
└── critic-aggregate-shape.test.cjs ← NEW (unit test for the new CLI sub)

integration/BUILD.bazel             ← ADD `phase-2-critic` tag to live tests
tests/BUILD.bazel                   ← ADD `phase-2-critic` tag to static tests
```

### Pattern 1: Lens-addendum agent file

**What:** Each critic file becomes a thin overlay on top of the shared base.
**When to use:** All 6 critics in this phase.
**Source:** Existing pattern from `agents/gsd-planner.md:26` and similar.

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
**Output file:** `{phase_dir}/CRITIQUE-plan.md` with `critique_type: plan` in frontmatter.
</lens>

<plan_specific_checklist>
### Critical-tier (plan-only)
- [ ] Requirement coverage complete: every phase requirement has ≥1 covering task
- [ ] No contradiction with locked CONTEXT.md decisions
- [ ] Dependencies acyclic and valid (no cycles, all targets exist)
- [ ] Deferred ideas not included
- [ ] No dead code plans (every artifact is referenced)
- [ ] Task files exist or are created by the task

### Warning-tier (plan-only)
- [ ] Task actions specific enough to execute without questions
- [ ] Scope within budget (2-3 tasks target, 4 warning, ≥5 critical)
- [ ] must_haves.truths user-observable
- [ ] key_links cover critical wiring
- [ ] Verify steps are runnable (have a command)
- [ ] Done criteria are measurable
</plan_specific_checklist>

<plan_calibration_examples>
GOOD: "Task 2 at 05-01-PLAN.md:38 says 'implement auth' without specifying mechanism, hash algorithm, or token strategy. Per CONTEXT.md line 12 the user decided JWT with refresh rotation. Task action should reference this decision."

BAD: "Plan looks incomplete." (no evidence, no file:line, no fix)
</plan_calibration_examples>
```

Lens addendum target: 50–100 lines including frontmatter (5 lines), the `@`-import (1 line), `<lens>` (~10 lines), domain checklist (~30–60 lines), and 1–2 calibration examples (~10–25 lines).

### Pattern 2: Single-message parallel `Task` batch

**What:** The orchestrator emits all 6 `Task` calls inside a single assistant message so Claude Code's scheduler launches them concurrently.
**When to use:** Once per `/gsd-review --critique` invocation.
**Source:** Same pattern Phase 3 will use for `pattern-mapper` + `phase-researcher` (per ROADMAP Phase 3 §2). No GSD example today — Phase 2 establishes the pattern.

```markdown
<!-- Inside workflows/critique.md, the orchestrator's <process> block -->

<process>
1. Resolve `phase_dir` from `$PHASE_ARG` via `gsd-tools.cjs find-phase $PHASE_ARG`.
2. Read PLAN.md, SUMMARY.md (if exists), VERIFICATION.md (if exists), CONTEXT.md (if exists), and prior CRITIQUE-*.md (for dismissed-finding carry-forward).
3. **In a SINGLE message, emit 6 Task() calls — DO NOT split across messages.** Each Task spawns one critic with the phase context plus its lens-specific entry directives. Claude Code launches them in parallel because they are in one assistant turn.

   Task tool calls (write all 6 in one block):

   - Task(subagent_type="gsd-critic-plan",    prompt="<phase context>; review PLAN.md")
   - Task(subagent_type="gsd-critic-code",    prompt="<phase context>; review src files")
   - Task(subagent_type="gsd-critic-scope",   prompt="<phase context>; review for scope creep")
   - Task(subagent_type="gsd-critic-verify",  prompt="<phase context>; review VERIFICATION.md")
   - Task(subagent_type="gsd-critic-discuss", prompt="<phase context>; review CONTEXT.md")
   - Task(subagent_type="gsd-critic-strategy",prompt="<phase context>; review milestone")

4. After all 6 Tasks return, **DO NOT trust their text summaries** (parallel-Task hallucination bug, [anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181)). Instead, run:

   ```bash
   gsd-sdk query critic-aggregate --phase $PHASE_ARG
   ```

   which globs `CRITIQUE-*.md` in `phase_dir`, parses YAML frontmatter, and returns JSON.

5. If any of the 6 expected critics is missing from disk, treat as a 1-of-N failure (CRIT-09): emit an `info`-severity entry into the merged report (`{ severity: "info", lane: "orchestrator", title: "<critic-name> did not produce CRITIQUE", evidence: "<critic> CRITIQUE-{lens}.md absent in phase_dir", fix: "rerun /gsd-review --critique <phase> for <critic-name> only" }`) and continue with the surviving 5.

6. Merge per-critic findings into `{phase_dir}/CRITIQUE.md` (final aggregated file): YAML frontmatter with combined `severity_counts`, body sections by severity → critic.

7. Emit human-readable summary to stdout.
</process>
```

### Pattern 3: gsd-tools.cjs subcommand registration

**Source:** Existing dispatcher convention in `get-shit-done/bin/gsd-tools.cjs:545–870` (verified: 50+ top-level cases like `state`, `phase`, `roadmap`, `verify`, `template`, `commit`).

```javascript
// In get-shit-done/bin/gsd-tools.cjs, top-level switch block.
// Add new top-level case at consistent indent (4 spaces).

    case 'critic-aggregate': {
      // Args: --phase <N> [--phase-dir <path>] [--json]
      const { phase: phaseArg, 'phase-dir': phaseDirOverride } = parseNamedArgs(args, ['phase', 'phase-dir']);
      const useJson = args.includes('--json');
      criticAggregate.cmdCriticAggregate(cwd, { phase: phaseArg, phaseDirOverride, useJson, raw });
      break;
    }
```

The handler module (new file `get-shit-done/bin/lib/critic-aggregate.cjs`) globs `CRITIQUE-*.md` in the phase dir, parses the YAML frontmatter of each, returns:

```json
{
  "phase": "02-critic-refactor-with-commit-0-spike",
  "phase_dir": ".planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/",
  "critics_expected": ["plan", "code", "scope", "verify", "discuss", "strategy"],
  "critics_present": ["plan", "code", "scope", "verify", "strategy"],
  "critics_missing": ["discuss"],
  "severity_counts_total": { "critical": 2, "warning": 7, "info": 4, "total": 13 },
  "status": "fail",
  "files": [
    { "path": ".../CRITIQUE-plan.md", "critique_type": "plan", "severity_counts": { ... }, "status": "warn" }
    // ...
  ]
}
```

### Pattern 4: Bazel `phase-N-name` tag pattern

**Source:** `integration/BUILD.bazel:50` (from Phase 1's 01-09).

```python
# Add to integration/BUILD.bazel for each new live test:
js_test(
    name = "critic-batch-walltime",
    entry_point = "critic-batch-walltime.test.cjs",
    data = ["//integration/helpers:test_helpers"],
    size = "large",
    tags = ["integration", "local", "requires-api-key", "phase-2-critic"],
    timeout = "long",
)
```

Critically the existing `gsd-lifecycle` target may need `"phase-2-critic"` added too if the lifecycle test exercises critic batch — confirm by reading lifecycle step 4 (already does — `step-4-review-critique.cjs` calls `/gsd-review --critique`). Recommendation: keep `phase-1-cull` on `gsd-lifecycle` AND add `phase-2-critic` to it (multi-tagged) so both phase scopes pick it up.

### Anti-Patterns to Avoid

- **Trust the parent's text summary.** Each `Task` returns text the parent agent uses to describe what happened, but the parent may hallucinate findings under parallel load (#29181). **Always read CRITIQUE files from disk.**
- **Split `Task` calls across messages.** If the orchestrator emits Task 1, waits, emits Task 2, that's serial — kills the walltime gain. **One message, all 6 calls in one block.**
- **Re-state base content in addendums.** If `critic-base.md` says "every finding has a file:line reference" and the addendum repeats that, the addendum is shadowing — `tests/critic-no-base-shadowing.test.cjs` will fail. **Addendum is lens-only.**
- **Hand-roll fault injection by editing critic prompts.** The clean way to misconfigure a critic for CRIT-09 is to override the agent name in the test (e.g., `Task(subagent_type="gsd-critic-DOES-NOT-EXIST")` so it returns an error), not to mutate critic markdown on disk. **Never edit prompts to fail-test.**
- **Use the `gsd-tools.cjs` subcommand from inside the parent's prompt context.** The whole point of the disk read is to avoid hallucination — calling it via `gsd-sdk query` (which the orchestrator can do via Bash tool) keeps the disk-read out of the prompt parsing path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Severity-bucketed key set diff | Custom Set comparison logic in tests | `computeCriticFindingsDeltas` in `agent-parity.cjs` (currently stub, fill in) | Single source of truth; tests just call `runAgentParity(name, fixture, schema)` and assert `result.pass`. The stub knows the contract — fill it in, don't reimplement |
| N=5 median run | Custom loop in each test | `runAgentParity(opts={n: 5, mode: 'compare'})` | Already implemented in `agent-parity.cjs:84`; calls `recordWalltime` for each run, computes `median(walltimes)` and `pickMedianByDuration(successful)` |
| Walltime ledger append | Direct `fs.appendFileSync` | `recordWalltime({test, walltime_ms, cost_usd, phase})` from `walltime-recorder.cjs` | Schema validation built-in (CR-05 fix in Phase 1: rejects entries missing `cost_usd` instead of silent-zero coercion) |
| Phase-dir lookup | Custom path joining | `gsd-tools.cjs find-phase <N>` | Existing top-level case at line 613 |
| YAML frontmatter parse | Custom regex | Existing `frontmatter get/set/merge` cases at line 679 | Already handles edge cases (multi-line strings, nested objects); see `--field` and `--data` flags in CLI help |
| File globbing for CRITIQUE-*.md | Custom `fs.readdirSync` filter | Use the same pattern as `verify-summary` and `frontmatter` handlers — they read files via existing helpers in `bin/lib/` | Consistency with dispatcher contract; testable via `gsd-tools-dispatcher-reachable.test.cjs` |
| Bazel test tag enforcement | Custom CI script | `--test_tag_filters=phase-2-critic` (Bazel built-in) | Phase 1 established this pattern in `integration/BUILD.bazel:50` and `tests/BUILD.bazel:14` |
| Cost-USD computation | Hardcoded pricing tables | `runClaudeWithTools` returns `cost: parsed.total_cost_usd || 0` from Claude Code's own JSON output (line 305 of `claude-runner.cjs`) | Claude Code surfaces `total_cost_usd` directly in its `--output-format json` mode; no API token-counting needed [VERIFIED] |

**Key insight:** Phase 1 spent significant effort designing parity infrastructure that Phase 2 inherits as ready-to-use. The biggest temptation is to build a lightweight "just for critics" parity check — resist it. The `runAgentParity` helper is designed exactly for this; the only Phase-2-specific work is filling in the `computeCriticFindingsDeltas` stub.

## Runtime State Inventory

This is a refactor phase (rename + content extraction + new files). Runtime state to consider:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | None — Phase 2 doesn't change any database, key-value store, or persistent state. CRITIQUE files written by critics are per-invocation and live in phase dirs (not persistent state). | None |
| **Live service config** | None — Phase 2 has no external service integration. Spike mitigation: if `@`-references fail at Task-spawn time, the fallback (install-time inlining) modifies how `bin/install.js` writes installed agent files; this is build-time, not runtime config. | None |
| **OS-registered state** | None — Phase 2 doesn't register cron jobs, daemons, or system services. | None |
| **Secrets and env vars** | `CLAUDE_BIN` (already used by `claude-runner.cjs:7`); `BUILD_WORKSPACE_DIRECTORY` (Bazel sandbox path, already used at `claude-runner.cjs:209`). No new secrets or env vars introduced. | None |
| **Build artifacts / installed packages** | `bin/install.js` writes copies of agent files into user's `~/.claude/agents/` (verified: lines 4156–4234). After Phase 2, users on existing installs need to re-run `npm i -g @gsd-build/sdk` (or local install) to pick up new `agents/_shared/critic-base.md` AND the trimmed critic files. | **Document in CHANGELOG.md** that Phase 2 graduation requires re-install for existing users. The orphan-reference test from Phase 1 will catch any installed-but-stale critic files referencing the new base path; existing reapply-patches infrastructure should handle the swap. |

**Critical:** the existing `tests/cull-no-orphan-references.test.cjs` (Phase 1) scans `agents/gsd-*.md` only (per Phase 1 RESEARCH §5.6). Phase 2 introduces `agents/_shared/critic-base.md` which is NOT a `gsd-*.md` file. Phase 2 must extend the scan to include `agents/_shared/` so the orphan-reference test continues to enforce reachability after the refactor. **Do not skip this — Phase 1 RESEARCH explicitly flagged this as a Phase 2 task.**

## Common Pitfalls

### Pitfall 1: Spike-test gives false-positive on plain prompt-load

**What goes wrong:** The spike test verifies `@`-resolution by checking that the agent prompt loads without error and produces output. But Claude Code's `@`-resolver might be silently *failing* (skipping the import) and the agent still produces plausible output from its lens-only addendum, hiding the failure.

**Why it happens:** `@`-references that fail to resolve don't necessarily error — they may be left as literal text in the prompt. An agent missing its base prompt but still capable of vague critique would appear to "work."

**How to avoid:** The spike must verify *content actually appears* in the spawned agent's context, not just "no error." Concrete test design:
1. Put a **canary string** in `critic-base.md` (e.g., `<!-- SPIKE-CANARY: 7d8e9f0-base-loaded -->` in a comment).
2. Spawn a single critic via `Task(subagent_type="gsd-critic-spike", prompt="...print the spike canary literally...")` (or use the existing critic-plan with a one-shot prompt).
3. Assert the canary appears in the agent's text output.
4. Inverse test: temporarily delete `critic-base.md`, rerun, assert canary does NOT appear (proves the test has signal).

**Warning signs:** Agent output looks generic / lacks lens-specific severity calibration; spike test passes "trivially" without canary check.

### Pitfall 2: Parallel-Task scheduler downgrades to serial

**What goes wrong:** Even with 6 `Task` calls in one assistant message, Claude Code may execute them serially under certain conditions (large context, rate limiting, or [#7406](https://github.com/anthropics/claude-code/issues/7406)) — the orchestrator still completes, but walltime ≈ sum(critics) instead of max.

**Why it happens:** The Task scheduler's parallelism is not a hard guarantee; it's an optimization. When degraded, no error fires.

**How to avoid:** CRIT-08 makes this non-recoverable: `integration/critic-batch-walltime.test.cjs` measures spawn-timestamp delta and fails if >2s, AND fails if total walltime > max(critic) × 1.3 (allows ~30% scheduler variance). The 2s spawn-delta is the load-bearing assertion. **Spawn-timestamp source:** Claude Code's `--output-format json` returns `duration_ms` per Task; for 6 parallel Tasks the orchestrator collects 6 such records — pull the start-time markers from each (Claude Code emits these in the parsed JSON `raw` field as `started_at` ISO timestamps in event sub-objects). Verify by inspecting one real Task output during the spike commit and confirming the timestamp data is present; if not, fall back to instrumenting via stderr capture.

**Warning signs:** All 6 critics return successfully but the test takes ~6× as long as a single critic.

### Pitfall 3: Disk read happens BEFORE all critics finish writing

**What goes wrong:** Orchestrator runs `gsd-tools.cjs critic-aggregate` immediately after the `Task` block, but a slow critic is still finalizing its `CRITIQUE-{lens}.md` write. The aggregate sees N-1 files and treats the slow critic as missing.

**Why it happens:** Claude Code returns from a Task once the agent's last assistant message lands, but a Bash-tool write may still be flushing to disk.

**How to avoid:** Each critic prompt's `<output>` block should END with an explicit "verify the file exists" step before returning. Pattern: after writing CRITIQUE, run `test -f "$PHASE_DIR/CRITIQUE-${lens}.md" || exit 1` so the agent doesn't return success until the write is committed. The existing critic prompts already write CRITIQUE.md but don't verify post-write — Phase 2 should add this to the base prompt's output contract.

**Warning signs:** Intermittent test flakes where 1-2 critics show up missing on slow CI but all 6 pass locally.

### Pitfall 4: Severity-bucketed key collisions across critics

**What goes wrong:** Two different critics produce findings with the same `(severity, category, lane)` key but different evidence. The set-diff treats them as the same finding and miscounts overlap.

**Why it happens:** The bucket key from Phase 1 RESEARCH is `${severity}:${category}:${lane}` — but `category` is not currently a frontmatter field on findings; it's prose-only in the `<role>` blocks. Two critics could both emit a `critical:requirement-coverage:primary` finding with completely different content.

**How to avoid:** Phase 1 RESEARCH §1.2 line 278 deferred this: "if Phase 2 calibration shows this is too coarse, we add a secondary `file_path` bucket — but baselines captured in Phase 1 are forward-compatible because they record the full finding object." The Phase 2 implementation of `computeCriticFindingsDeltas` should: (1) primary key `(severity, category, lane)`, (2) secondary disambiguator `file_path` from the finding's `File:` field (already structured in critic output), (3) tertiary disambiguator hash of `Suggested Fix:` (a stable salient string per finding). Document the chosen scheme in `agent-parity.cjs` block comment.

**Warning signs:** Parity test passes ≥85% but the merged CRITIQUE.md has visibly missing findings the user expects.

### Pitfall 5: `agents/_shared/` not included in install/runtime path

**What goes wrong:** Critic files have `@~/.claude/get-shit-done/agents/_shared/critic-base.md` but the installer doesn't copy `agents/_shared/` to the user's `.claude/agents/` directory.

**Why it happens:** `bin/install.js:4766` enumerates `agents/` files matching `gsd-*.md` only, not subdirectories.

**How to avoid:** Audit `bin/install.js` for the `agents/` install logic. Either (a) add explicit handling for `agents/_shared/` (preferred), or (b) place the base file as `agents/gsd-critic-base.md` (so the file pattern matches) — but this conflicts with the agent enumeration logic that lists installed agents (e.g., manifest count tests). **Recommendation:** option (a), and add a static test `tests/critic-base-installed.test.cjs` that verifies the shared file is installed alongside the agents.

**Warning signs:** Spike passes locally but fails on a fresh install.

### Pitfall 6: Reference path `~` vs `$HOME` mismatch with installer rewriting

**What goes wrong:** `bin/install.js:4189–4194` does `~/.claude/` → pathPrefix and `$HOME/.claude/` → pathPrefix and `./.claude/` → `./{dirName}/`. If Phase 2 critics use `@~/.claude/get-shit-done/agents/_shared/critic-base.md`, the installer rewrites `~/.claude/` → e.g. `~/.cline/` for Cline runtime, leaving `@~/.cline/get-shit-done/agents/_shared/critic-base.md`. Then it scans subdirectories — does it copy `agents/_shared/` to the destination? Only if its dir-walking handles it.

**Why it happens:** The `copyWithPathReplacement` function (line 4156) recurses into subdirectories (line 4183: `if (entry.isDirectory())`) so `agents/_shared/` *will* get copied for runtimes using `copyWithPathReplacement`. But the manifest-builder at line 5313 only enumerates top-level `gsd-*.md` files. So the file is copied but not tracked in `install-manifest.json`. The reapply-patches flow then can't detect user modifications to `_shared/critic-base.md`.

**How to avoid:** Update the manifest builder (line 5313–5318) to ALSO enumerate `agents/_shared/*.md` and add them under `agents/_shared/<file>` keys. Add a static test `tests/install-manifest-includes-shared.test.cjs` to enforce.

**Warning signs:** Updates to `critic-base.md` survive update flows because they're not tracked.

### Pitfall 7: Per-run cost in N=5 parity test exceeds Bazel timeout

**What goes wrong:** N=5 × 6 critics × ~$0.30/run × ~45 sec/run = ~$9 and ~22 minutes for one parity invocation. Bazel `timeout = "long"` is 15 minutes; `"eternal"` is 60 minutes. Default `requires-api-key` tests use `"long"` per Phase 1 BUILD.bazel.

**Why it happens:** N=5 is Phase 1's locked decision (CRIT-10) for statistical stability of medians.

**How to avoid:** Tag `critic-parity.test.cjs` with `timeout = "eternal"`. Document in the test header that this test costs ~$9/run and is intended for nightly + phase-exit runs only, NOT for every PR. Add `tags = ["nightly", ...]` so per-PR CI excludes it.

**Warning signs:** CI hits walltime budget; test gets disabled in frustration.

## Code Examples

### Example 1: New critic prompt (lens addendum)

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

**Finding ID prefix:** `plan-` (per CR-001 finding ID rule from base; addendum specifies the prefix only).

**Output file:** `{phase_dir}/CRITIQUE-plan.md`. Frontmatter `critique_type: plan`.

**Primary input:** PLAN.md files for the phase being reviewed.
</lens>

<plan_specific_checklist>
### Critical-tier (plan)
- [ ] Requirement coverage complete: every phase requirement has ≥1 covering task (cross-reference `requirements:` frontmatter against ROADMAP.md requirement IDs)
- [ ] No contradiction with locked CONTEXT.md decisions (each `## Decisions` entry honored by some task)
- [ ] Dependencies acyclic and valid (`depends_on` targets exist, no cycles, wave numbers consistent)
- [ ] Deferred ideas not included (CONTEXT.md `## Deferred Ideas` items absent from tasks)
- [ ] No dead code plans (every task artifact referenced by another task or existing code)
- [ ] Task `<files>` paths exist OR are created by the task

### Warning-tier (plan)
- [ ] Task actions specific enough to execute without questions
- [ ] Scope within budget (2-3 tasks target, ≥4 warning, ≥5 critical-cost)
- [ ] `must_haves.truths` user-observable
- [ ] `must_haves.key_links` cover wiring (component-to-API, etc.)
- [ ] `<verify>` commands are runnable
- [ ] `<done>` criteria measurable
</plan_specific_checklist>

<plan_calibration_examples>
GOOD: "Task 2 at 05-01-PLAN.md:38 says 'implement auth' without specifying mechanism, hash algorithm, or token strategy. Per CONTEXT.md line 12 the user decided JWT with refresh rotation. Task action should reference this decision."
BAD: "Plan looks incomplete." (no evidence, no file:line, no fix — REJECT per base finding-format rules)
</plan_calibration_examples>
```

Approximate lines: 3 (frontmatter) + 1 (`@`-import) + 9 (`<lens>`) + 25 (checklist) + 6 (calibration) = ~75 lines including blank-line padding. Well under 100.

### Example 2: `tests/critic-line-budget.test.cjs` (CRIT-04)

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'agents', '_shared', 'critic-base.md');
const CRITICS = [
  'gsd-critic-plan', 'gsd-critic-code', 'gsd-critic-scope',
  'gsd-critic-verify', 'gsd-critic-discuss', 'gsd-critic-strategy',
];

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

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
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${name}.md`), 'utf8');
    // After frontmatter (--- ... ---), the first non-blank non-comment line
    // must be the @-import.
    const afterFrontmatter = content.split(/^---\s*$/m).slice(2).join('---').trim();
    const firstLine = afterFrontmatter.split('\n').find(l => l.trim().length > 0);
    assert.match(firstLine || '', /^@~?\/?\.claude\/get-shit-done\/agents\/_shared\/critic-base\.md\s*$/,
      `${name}.md must begin (after frontmatter) with @-reference to critic-base.md, got: "${firstLine}"`);
  }
});
```

### Example 3: `tests/critic-no-base-shadowing.test.cjs` (CRIT-05)

```javascript
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'agents', '_shared', 'critic-base.md');
const CRITICS = [
  'gsd-critic-plan', 'gsd-critic-code', 'gsd-critic-scope',
  'gsd-critic-verify', 'gsd-critic-discuss', 'gsd-critic-strategy',
];

// Section headings (XML tags + markdown ##) that base owns — addendums must NOT
// re-define any of these.
function extractBaseSections(content) {
  const xmlTags = [...content.matchAll(/<([a-z_][a-z0-9_-]*)>/gi)].map(m => m[1]);
  const mdHeadings = [...content.matchAll(/^##+\s+(.+)$/gm)].map(m => m[1].trim());
  return { xmlTags: new Set(xmlTags), mdHeadings: new Set(mdHeadings) };
}

test('addendums do not re-define base XML tag sections (CRIT-05)', () => {
  const baseContent = fs.readFileSync(BASE, 'utf8');
  const baseSections = extractBaseSections(baseContent);
  const violations = [];
  for (const name of CRITICS) {
    const file = path.join(ROOT, 'agents', `${name}.md`);
    const content = fs.readFileSync(file, 'utf8');
    const addendumSections = extractBaseSections(content);
    for (const tag of addendumSections.xmlTags) {
      // Whitelist: lens-specific tag containers are allowed (lens, plan_specific_checklist, ...)
      if (tag === 'lens' || tag.endsWith('_specific_checklist') || tag.endsWith('_calibration_examples')) continue;
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
    'base-shadowing detected — addendums must contain only lens-specific content:\n' + violations.join('\n'));
});
```

### Example 4: Filling the `computeCriticFindingsDeltas` stub

```javascript
// In integration/helpers/agent-parity.cjs, REPLACE lines 192–202.

function computeCriticFindingsDeltas(schema, baseline, runs) {
  // Pick median run as the comparison candidate.
  const candidate = pickMedianByDuration(runs);
  if (!candidate) return { pass: false, error: 'no successful runs' };

  // Extract findings from baseline and candidate. Both are objects with a
  // 'findings' array per the critic output schema (each finding has
  // {id, severity, lane, title, evidence, fix, file: 'path:line'}).
  const baseFindings = (baseline.result?.findings) || extractFindingsFromText(baseline.result || '');
  const currFindings = (candidate.result?.findings) || extractFindingsFromText(candidate.result || '');

  // Severity-bucketed key with disambiguators per RESEARCH §Pitfall-4 advice.
  function bucketKey(f) {
    const sev = (f.severity || 'unknown').toLowerCase();
    const lane = (f.lane || 'primary').toLowerCase();
    const cat = (f.category || extractCategoryFromTitle(f.title)).toLowerCase();
    const file = f.file || 'N/A';
    return `${sev}:${cat}:${lane}|${file}`;
  }

  const baseKeys = new Set(baseFindings.map(bucketKey));
  const currKeys = new Set(currFindings.map(bucketKey));
  const intersection = [...baseKeys].filter(k => currKeys.has(k));
  const overlap = baseKeys.size === 0 ? 1.0 : intersection.length / baseKeys.size;

  // Hard fail: any critical-severity baseline finding NOT in current.
  const missingCritical = [...baseFindings]
    .filter(f => (f.severity || '').toLowerCase() === 'critical')
    .filter(f => !currKeys.has(bucketKey(f)));

  // Extra findings (not in baseline) — informational, not pass/fail.
  const extra = [...currKeys].filter(k => !baseKeys.has(k));

  const pass = (overlap >= schema.threshold) && (missingCritical.length === 0);

  return {
    pass,
    overlap,
    threshold: schema.threshold,
    missingCritical: missingCritical.map(f => ({ id: f.id, title: f.title, severity: f.severity })),
    extraFindings: extra,
    baseFindingCount: baseFindings.length,
    currFindingCount: currFindings.length,
  };
}

// Helper: parse findings out of textual result if structured object isn't returned.
function extractFindingsFromText(text) {
  // Matches finding cards: "### [SEVERITY] Title" + "**ID:** id" + "**File:** path" + "**Severity:** sev" + "**Lane:** lane"
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
  // Heuristic: first 2 words of title, kebab-cased.
  return (title || 'unknown').toLowerCase().split(/\s+/).slice(0, 2).join('-');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 1,731 lines of duplicated critic scaffolding (each critic re-states severity rubric, output schema, finding format, evidence rules) | Shared base + lens addendums (~700 lines total target) | Phase 2 | 60% reduction; addendum changes are local; base changes propagate to all 6 |
| Sequential critic invocation | Parallel `Task` batch in single message | Phase 2 | walltime: max(critic) instead of sum; 6× theoretical speedup at Claude Code scheduler-limit |
| Trust parent's text summary of Task results | Read each `CRITIQUE-{lens}.md` from disk via `gsd-tools.cjs critic-aggregate` | Phase 2 | Mitigates [#29181](https://github.com/anthropics/claude-code/issues/29181) parallel-Task hallucination bug |
| (Implicit) — no critic batch existed | `/gsd-review --critique` consolidated entry point | Phase 1 dispatched, Phase 2 actually wires the critique workflow | Empty `workflows/critique.md` file finally gets a body |
| `phase-1-cull` Bazel tag only | Add `phase-2-critic` tag to relevant tests | Phase 2 (XCUT-03) | `bazel test --test_tag_filters=phase-2-critic` resolves; nightly + per-phase scoping work |

**Deprecated/outdated:**
- The legacy `/gsd-critique` slash command is a deprecation stub from Phase 1 that forwards to `/gsd-review --critique`. Phase 2 wires the actual orchestration; the stub stays as a forward.
- N/A — no other libraries, frameworks, or APIs are deprecated by Phase 2.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude Code's `@`-resolver inlines referenced content into a Task-spawned agent's prompt at agent-load time (not just for the parent agent's prompt) | §3 spike rationale | If wrong: spike fails, fall back to install-time inlining via `bin/install.js` (well-understood pattern, additional ~50 lines in install.js). Phase 2 adds 1–2 days but doesn't blow up. **Mitigation:** the spike IS the test for this. |
| A2 | Spawn-timestamp delta is observable from Claude Code's `--output-format json` mode | §6 walltime test design | If wrong: CRIT-08 needs alternative instrumentation. Fallback: wrap `Task` calls in shell timestamps via Bash tool, or measure end-to-end walltime and assume < (max × 1.3) implies parallel. **Mitigation:** verify during the spike commit by inspecting one real Task JSON output. |
| A3 | `Task(subagent_type="invalid-name")` returns an error the orchestrator can detect, suitable for CRIT-09 fault injection | §6 fault injection mechanism | If wrong: alternative is to delete one critic file pre-test (then restore), or use a flag in the orchestrator prompt to skip one. **Mitigation:** the test itself can be implemented multiple ways; the requirement is "deliberately misconfigure," any of the three approaches satisfies it. |
| A4 | Cost-USD per critic run is in the same range as Phase 1 baselines (~$0.30 per critic per fixture) | §Pitfall-7 budget concerns | If wrong: parity test is more expensive, may need N=3 instead of N=5. CRIT-10 locks N=5 — if cost forces a change, requires CONTEXT.md reopening. **Mitigation:** measure cost during Wave 0 spike + first few critic runs; flag if >2× expectation. |
| A5 | The existing `critic-findings` baseline corpus (`baselines/critic-*/`) is sufficient for the parity test — no new fixtures needed | §3 schema infrastructure | If wrong: parity test needs additional fixtures (cost: ~$0.30 each + capture commit). Phase 1 captured 6 critic baselines (one per lens) on canonical fixtures. **Mitigation:** if Phase 2 wants additional fixtures, add them as `chore: capture additional critic baselines` commit before parity test wires up. |
| A6 | The 6 critics, after refactor, produce findings on the Phase 1 fixtures with the same lens-specific identity (e.g., trimmed `critic-plan` still flags `REQ-AUTH-02 missing` as critical) | §9.4 parity test | If wrong: CRIT-10's no-missing-critical hard-fail trips. This IS the success criterion. **Mitigation:** if the parity gap is in clear lens content (not base), iterate on the addendum until parity holds; if it's structural, the refactor needs revision. |
| A7 | `bin/install.js`'s `copyWithPathReplacement` recursion handles `agents/_shared/` correctly for at least the Claude Code runtime (the primary target) | §Pitfall-5/6 | If wrong: critics ship pointing at a base file that doesn't exist on installed systems. **Mitigation:** add `tests/install-manifest-includes-shared.test.cjs` to enforce; verify by running `bin/install.js` against a temp dir during Wave 0. |
| A8 | `runClaudeWithTools` reliably surfaces `total_cost_usd` per Task spawn (not aggregated across the parent's whole conversation) | §6 walltime ledger entries | If wrong: cost-per-critic is wrong in ledger; XCUT-04 trend test (Phase 6) compares against bad data. **Mitigation:** verify cost reporting granularity during Wave 0 spike inspection of JSON output. |
| A9 | Existing critic prompts' `<output>` sections write to `CRITIQUE-{lens}.md` (per-critic file), not a single shared `CRITIQUE.md` | §3 alternatives considered | VERIFIED by reading all 6 prompts: critic-plan writes `CRITIQUE-plan.md` (line 243), critic-code writes `CRITIQUE-code.md` (line 295), critic-verify writes `CRITIQUE-verify.md` (line 219), critic-scope writes `CRITIQUE-scope.md` (line 216), critic-discuss writes `CRITIQUE-discuss.md` (line 239), critic-strategy writes `CRITIQUE-strategy.md` (line 205). **Confirmed — not an assumption.** |

## Open Questions / Blockers (RESOLVED at planning time)

> Each open question below is resolved by a specific Plan task. See "RESOLVED:" line per question.

1. **Spawn-timestamp data shape from Claude Code JSON output** (Pitfall 2 / A2)
   - What we know: `runClaudeWithTools` returns `{success, result, turns, cost, duration_ms, raw}` where `duration_ms` is end-to-end. The `raw` field is the parsed Claude Code JSON object.
   - What's unclear: Does the JSON contain start/end timestamps for nested Task spawns, or only the top-level invocation's duration?
   - Recommendation: Plan a 30-minute Wave-0 reconnaissance task — invoke any current critic via `Task` and dump `raw` to disk. Phase 2 plans should NOT block on this — if the data isn't there, the fallback is `bash + date +%s%N` wrapping each Task call, capturing into stdout, parsing in the test harness.
   - **RESOLVED:** Plan 02-02 Task 2 captures `result.raw` to `integration/test-fixtures/spawn-timestamp-shape.txt` during the live spike. Plan 02-07 Task 1 reads that fixture to choose between `extractTaskStartTimes` Path 1 (JSONPath extraction) or Path 2 (bash-wrap fallback).

2. **`category` field in critic findings is informal** (Pitfall 4)
   - What we know: Severity, lane, file:line, ID prefix are explicitly required fields in current critic prompts. `category` is implicit — usually appears in finding titles ("requirement coverage", "verify gap", etc.).
   - What's unclear: Should base prompt mandate a structured `category:` field on every finding (CRIT-02 base addition), or should `computeCriticFindingsDeltas` derive it heuristically?
   - Recommendation: Add **`category`** as an explicit required field in the new `critic-base.md` `<finding_format>` section. Existing baselines were captured before this change — backfill via heuristic in `extractCategoryFromTitle` (see §Code-Examples Example 4) so old baselines remain comparable. Document the policy in `agent-parity.cjs` block comment.
   - **RESOLVED:** `category` is required in `agents/_shared/critic-base.md` finding format (Plan 02-02 Task 1 acceptance criteria). Phase 1 baselines are heuristically backfilled by `extractCategoryFromTitle` in `computeCriticFindingsDeltas` (Plan 02-03 Task 1).

3. **1-of-N failure injection mechanism** (A3)
   - Three viable options; planner should pick one:
     a. **Bad agent name:** `Task(subagent_type="gsd-critic-DOESNOTEXIST")` — test harness asserts the Task returns an error, orchestrator handles gracefully.
     b. **Pre-test delete + post-test restore:** Test setup deletes `agents/gsd-critic-discuss.md`, runs the orchestrator, asserts the missing critic is logged as info, restores the file.
     c. **Orchestrator flag:** Add a debug flag `--skip-critic <name>` to `/gsd-review --critique` for testing only. Simplest but adds production surface.
   - Recommendation: Option (a) — least intrusive, no file mutation, most realistic (matches what would actually happen if a critic agent file got corrupted).
   - **RESOLVED at revision time (planner):** Plan 02-07 will lock to a single mechanism with concrete `files_modified` list (resolved in plan-checker revision iteration 1). See Plan 02-07 frontmatter and Task 1 acceptance criteria post-revision.

4. **Cost of the 7th file in `agents/_shared/`** (A7, Pitfall 5/6)
   - What we know: `bin/install.js:4156` has a recursive `copyWithPathReplacement` that handles subdirs, BUT the manifest builder at line 5313 only enumerates top-level `agents/gsd-*.md`.
   - What's unclear: For the non-Claude runtimes (Codex, Copilot, Cursor, Windsurf, Cline, Augment, Gemini, OpenCode, Kilo, Antigravity, Trae, Qwen — verified from install.js handling), do their installation paths handle `agents/_shared/` correctly? 12 runtimes is a wide test surface.
   - Recommendation: Phase 2 plans MUST include a `tests/install-shared-dir.test.cjs` that runs `bin/install.js` against a temp dir for at least the Claude runtime (the primary spike target) AND verifies `agents/_shared/critic-base.md` lands in the expected location. Multi-runtime parity is out of scope for this phase (deferred); flag it as a Phase 7+ concern in `STATE.md` deferred items.
   - **RESOLVED:** Plan 02-03 Task 2 ships `tests/install-shared-dir.test.cjs` for the Claude runtime. Multi-runtime parity (Codex/Cursor/etc.) is explicitly deferred to a future phase per the test-header comment.

5. **Empty workflow body for `critique.md`** (architecture diagram)
   - What we know: `get-shit-done/workflows/critique.md` is 0 bytes. The `commands/gsd/review.md` slash command dispatches `--critique` to `@~/.claude/get-shit-done/workflows/critique.md` (verified from review.md line 48).
   - What's unclear: Is there a reason this is empty? (Phase 1 plan 01-07 added the dispatcher but didn't author the workflow body — likely intentional, as Phase 2 owns the orchestrator.)
   - Recommendation: Phase 2 authors this from scratch following the §6 pattern. Write the workflow body BEFORE the integration tests run, otherwise the lifecycle test's step-4 will fail (which is its current expected-RED state per `step-4-review-critique.cjs:8`).
   - **RESOLVED:** Plan 02-06 Task 3 authors the orchestrator prompt body (was 0 bytes). Plan 02-06 depends on the spike GO/NO-GO checkpoint (Plan 02-02) so the architecture (`@`-references vs install-time inlining) is decided before the workflow body locks in.

## Environment Availability

Phase 2 is in-repo refactor + tests; the only external runtime is `claude` CLI (via `runClaudeWithTools`).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `claude` CLI | All live tests (spike, batch-walltime, parity, fault-injection) | Assumed yes (Phase 1 used it) | n/a — runtime check via `--version` (line 38 of claude-runner.cjs) | None — without `claude` CLI no live test runs. Static tests work without it. |
| `node` runtime | All tests + helpers + dispatcher | Yes | Node 18+ assumed | None |
| `bazel` | Test orchestration via `--test_tag_filters` | Yes (Phase 1 verified) | n/a | Direct `node --test` invocation works for all `.test.cjs` files |
| Existing `integration/helpers/*.cjs` | All Phase 2 tests | Yes (Phase 1 outputs) | committed in commit `2dff30fc` | None — Phase 1 is a hard prerequisite |
| Pre-refactor critic baselines | Parity test (CRIT-10) | Yes (`baselines/critic-*/`) | committed in commit `2dff30fc` per `_meta.json` | None — without baselines parity has nothing to compare against |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — Phase 1 produced all infrastructure. Phase 2 inherits clean.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Static unit framework | `node:test` + `node:assert` (built-in) — pattern matches all 30+ existing `tests/*.test.cjs` files |
| Live integration framework | `node:test` + custom helpers (`runClaudeWithTools`, `runAgentParity`) |
| Config file | `vitest.config.ts` exists at repo root but is for vitest-based tests; the GSD pattern is `node:test` |
| Bazel test runner | `js_test` from `@aspect_rules_js//js:defs.bzl` (verified in `tests/BUILD.bazel:1` and `integration/BUILD.bazel:1`) |
| Quick run command | `node --test tests/critic-line-budget.test.cjs` (single file, ~50ms) |
| Full static suite command | `node --test 'tests/*.test.cjs'` |
| Full live suite command | `bazel test //integration/... --test_tag_filters=phase-2-critic` (matches XCUT-02 pattern) |
| Bazel scope flag | `--test_tag_filters=phase-2-critic` (consistent with Phase 1's `phase-1-cull`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRIT-01 | `@`-reference resolves in Task-spawned agent context | live, Wave-0 spike | `bazel test //tests:critic-spike-passes` | ❌ Wave 0 — `tests/critic-spike-passes.test.cjs` |
| CRIT-02 | `agents/_shared/critic-base.md` exists, ≤250 lines | unit (static) | `node --test tests/critic-line-budget.test.cjs` | ❌ Wave 0 — `tests/critic-line-budget.test.cjs` |
| CRIT-03 | Each critic ≤100 lines, begins with `@`-import | unit (static) | `node --test tests/critic-line-budget.test.cjs` | ❌ same file as CRIT-02 |
| CRIT-04 | Total ≤700 lines | unit (static) | `node --test tests/critic-line-budget.test.cjs` | ❌ same file |
| CRIT-05 | No base-shadowing in addendums | unit (static) | `node --test tests/critic-no-base-shadowing.test.cjs` | ❌ Wave 0 — new test |
| CRIT-06 | All 6 spawn in single message (orchestrator structural) | unit (static) | `node --test tests/critique-workflow-structure.test.cjs` (NEW: greps `workflows/critique.md` for 6 `Task(` calls in one block) | ❌ Wave 1 — new static test (cheap proxy for live walltime test) |
| CRIT-07 | Orchestrator reads CRITIQUE from disk via `critic-aggregate` | unit (static) — orchestrator structural; live — end-to-end | `node --test tests/critique-workflow-structure.test.cjs` (greps for `gsd-tools.cjs critic-aggregate` invocation) + included in critic-batch-walltime live | ❌ Wave 1 |
| CRIT-08 | Spawn-timestamp delta <2s, walltime ≈ max | live | `bazel test //integration:critic-batch-walltime --test_tag_filters=phase-2-critic` | ❌ Wave 1 — new live test |
| CRIT-09 | 1-of-N failure: skip-and-continue, log info | live | `bazel test //integration:critic-fault-injection --test_tag_filters=phase-2-critic` | ❌ Wave 1 — new live test |
| CRIT-10 | N=5 median, ≥85% finding overlap, no missing critical | live (expensive, ~$9, ~22min) | `bazel test //integration:critic-parity --test_tag_filters=phase-2-critic` | ❌ Wave 1 — new live test |
| XCUT-03 | Walltime ledger gets `phase-2-critic` entries | unit (assertion in static `walltime-ledger-shape.test.cjs` + observation in live tests) | Existing `tests/walltime-recorder.test.cjs` covers shape; live tests append entries | ✅ shape test exists; live appends are observation, not assertion |

**Aggregate Wave 0 vs Wave 1 split:**

- **Wave 0 (gates everything else):** spike test + line-budget test + no-base-shadowing test + `computeCriticFindingsDeltas` real implementation. Wave 0 also creates `agents/_shared/critic-base.md` (the file the spike needs to load) and trims at least one critic to a lens addendum (the file the spike loads on the OTHER side of the `@`-import). Cost: minimal (1 spike run ~$0.30, then static).
- **Wave 1 (depends on Wave 0):** trim remaining 5 critics + author `workflows/critique.md` + add `gsd-tools.cjs critic-aggregate` + Bazel tag + 4 live tests. Cost: ~$15–25 across all 4 live tests one-time.

### Sampling Rate

- **Per task commit:** `node --test 'tests/critic-*.test.cjs'` (≤300ms total). Static tests run on every commit.
- **Per wave merge:** Full static suite + 1 live spike + 1 live walltime test (CRIT-08, ~$1, ~3min). Skip CRIT-10 parity (too expensive).
- **Per phase exit (gate for `gsd-slim-phase-2-critic` tag):** Full live suite including CRIT-10 parity (`bazel test //integration/... --test_tag_filters=phase-2-critic`). Cost ~$25, time ~30min.
- **Sampling rationale (Nyquist):** the Phase 2 risk surface has 3 distinct failure modes — (1) format regression caught by static budget+shadowing tests (cheap, run constantly); (2) orchestration regression caught by walltime+fault-injection tests (medium cost, run per-wave); (3) behavior regression caught by parity test (expensive, run per-phase-exit). N=5 median on parity addresses critic-output stochasticity (LLM nondeterminism); N=1 on spike+walltime+fault-injection is sufficient because these test deterministic infrastructure (`@`-resolution, spawn timing, error handling), not LLM output quality.

### Wave 0 Gaps

- [ ] `tests/critic-spike-passes.test.cjs` — Wave 0 commit-0 (CRIT-01); needs `agents/_shared/critic-base.md` with canary string and ONE trimmed critic (`gsd-critic-plan` is the natural pick — it's the most-referenced critic in lifecycle test step 4)
- [ ] `tests/critic-line-budget.test.cjs` — Wave 0 (CRIT-02, 03, 04); single file, no shared fixture needed
- [ ] `tests/critic-no-base-shadowing.test.cjs` — Wave 0 (CRIT-05); reads agents/ directly, no fixture
- [ ] `integration/helpers/agent-parity.cjs::computeCriticFindingsDeltas` — REPLACES the stub at lines 192–202 (Wave 0 — unblocks CRIT-10 in Wave 1)
- [ ] `agents/_shared/critic-base.md` — Wave 0 (CRIT-02 source-of-truth artifact)
- [ ] At least 1 trimmed critic in Wave 0 (e.g., `gsd-critic-plan`) — Wave 0 (CRIT-03 + spike fixture)
- [ ] Update `tests/cull-no-orphan-references.test.cjs` (Phase 1 owner) to scan `agents/_shared/` in addition to `agents/gsd-*.md` — Wave 0 (per Phase 1 RESEARCH §5.6 explicit handoff)
- [ ] Update `bin/install.js` manifest builder (line 5313) to enumerate `agents/_shared/*.md` — Wave 0 if Pitfall 6 manifests, otherwise Wave 1
- [ ] `tests/critique-workflow-structure.test.cjs` (NEW static, grep-based proxy for parallel-Task wiring) — Wave 1
- [ ] `tests/critic-aggregate-shape.test.cjs` (NEW unit test for the new CLI subcommand) — Wave 1
- [ ] `integration/critic-batch-walltime.test.cjs` — Wave 1 (CRIT-08)
- [ ] `integration/critic-fault-injection.test.cjs` — Wave 1 (CRIT-09)
- [ ] `integration/critic-parity.test.cjs` — Wave 1 (CRIT-10)
- [ ] `agents/gsd-critic-{code,scope,verify,discuss,strategy}.md` trims — Wave 1 (the other 5 critics)
- [ ] `get-shit-done/workflows/critique.md` body — Wave 1 (the orchestrator prompt)
- [ ] `get-shit-done/bin/gsd-tools.cjs` — Wave 1 (add `critic-aggregate` case + `bin/lib/critic-aggregate.cjs` handler module)
- [ ] `integration/BUILD.bazel` and `tests/BUILD.bazel` — Wave 1 (add `phase-2-critic` tag entries; multi-tag the lifecycle target)
- [ ] `docs/INVENTORY.md` — Wave 1 (document `critic-aggregate` if not picked up by surviving-caller test; required by CR-03 dispatcher-reachable guard)

**Type-II error analysis (what could pass tests but still be broken):**

- A trimmed critic could pass line-budget AND no-shadowing AND still produce empty/garbage critiques because lens content was over-trimmed. **Mitigation:** parity test (CRIT-10) catches this — if findings drop below 85% overlap, parity fails.
- The orchestrator could spawn 6 Tasks correctly AND `critic-aggregate` could read 6 files AND the merged report could still mis-attribute findings (e.g., critic-plan findings appear under critic-code section). **Mitigation:** include in `critique-workflow-structure.test.cjs` a check that the orchestrator's merge step preserves `critique_type` from each frontmatter.
- The walltime test could pass at 1.9s spawn delta but be at the edge — flake risk under load. **Mitigation:** budget margin is intentional (the threshold is 2s, observations should land near 0.1–0.5s; 1.9s would be a yellow flag). Add a soft-warning at 1s in addition to hard-fail at 2s.

## Phase Constraints (from CLAUDE.md / global memory)

- **MEMORY:** "One question at a time during brainstorming" — N/A here (no brainstorming in Phase 2; CONTEXT.md is locked from Phase 1's research). Phase 2 has discretionary decisions in §Open Questions that the planner can decide; do not chain a discuss-phase for them unless a question lands as an explicit user-call.
- **MEMORY:** "Streamline decisions; more homework is usually better" — Reflected in Wave 0 reconnaissance step (verify Claude Code JSON shape during spike commit instead of asking the user).
- **NEVER commit MODULE.bazel.lock without running tests** — Phase 2 doesn't add Bazel modules; should not affect MODULE.bazel.lock. If a `bazel build` step regenerates the lockfile as a side effect, do NOT stage it; reset with `git checkout HEAD -- MODULE.bazel.lock`.

## Sources

### Primary (HIGH confidence — verified on disk)

- `/home/danhalem/personal/get-shit-done/agents/gsd-critic-{plan,code,scope,verify,discuss,strategy}.md` — line counts, output paths, existing checklist structure, finding format, output `<output>` blocks
- `/home/danhalem/personal/get-shit-done/.planning/users/dan-halem/gsd-slim-and-integrate/REQUIREMENTS.md` lines 41–50 (CRIT-01..10), line 103 (XCUT-03), line 221 (cross-cutting note)
- `/home/danhalem/personal/get-shit-done/.planning/users/dan-halem/gsd-slim-and-integrate/ROADMAP.md` lines 51–62 (Phase 2)
- `/home/danhalem/personal/get-shit-done/integration/helpers/agent-parity.cjs` (227 lines) — runAgentParity contract, schema map, computeCriticFindingsDeltas stub at line 192
- `/home/danhalem/personal/get-shit-done/integration/helpers/walltime-recorder.cjs` (60 lines) — recordWalltime contract, ledger path
- `/home/danhalem/personal/get-shit-done/integration/helpers/claude-runner.cjs` (329 lines) — runClaudeWithTools returns duration_ms, addDirs, --output-format json
- `/home/danhalem/personal/get-shit-done/integration/test-fixtures/walltime-ledger.jsonl` — 26 entries from Phase 1 baselines, all `phase: "phase-1-cull"`
- `/home/danhalem/personal/get-shit-done/integration/test-fixtures/baselines/_meta.json` and `baselines/critic-*/{plan,code,scope,verify,discuss,strategy}-with-*.{json,input.json}` — 6 critic baselines captured Phase 1
- `/home/danhalem/personal/get-shit-done/get-shit-done/bin/gsd-tools.cjs` — dispatcher pattern (50+ cases at 4-space indent), header docstring (CLI subcommands list)
- `/home/danhalem/personal/get-shit-done/bin/install.js` lines 4156–4234 (copyWithPathReplacement), lines 5313–5318 (manifest builder)
- `/home/danhalem/personal/get-shit-done/get-shit-done/workflows/critique.md` — confirmed 0 bytes via `wc -l`
- `/home/danhalem/personal/get-shit-done/commands/gsd/review.md` — dispatches `--critique` to workflow at line 48
- `/home/danhalem/personal/get-shit-done/integration/BUILD.bazel:50` — phase-1-cull tag pattern
- `/home/danhalem/personal/get-shit-done/tests/BUILD.bazel:14` — same pattern for static tests
- `/home/danhalem/personal/get-shit-done/tests/gsd-tools-dispatcher-reachable.test.cjs` — CR-03 guard, defines reachability contract for new top-level cases
- `/home/danhalem/personal/get-shit-done/integration/lifecycle-steps/step-4-review-critique.cjs` — lifecycle expects `/gsd-review --critique 1` to produce CRITIQUE.md (currently expected-RED)
- `/home/danhalem/personal/get-shit-done/.planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-RESEARCH.md` §1.2, §5.6, §5.9, lines 277, 287, 1170, 1242 (Phase 2 prep notes from Phase 1 research)
- `/home/danhalem/personal/get-shit-done/.planning/users/dan-halem/gsd-slim-and-integrate/phases/01-cull-with-wave-0-test-infrastructure/01-CONTEXT.md` lines 32, 108, 135 (Phase 2 deferred items)
- 16+ existing `@~/.claude/get-shit-done/...` references in `gsd-planner.md`, `gsd-executor.md`, `gsd-verifier.md`, `gsd-plan-checker.md`, `gsd-phase-researcher.md`, `gsd-user-profiler.md` — empirical evidence the syntax works in production today

### Secondary (MEDIUM confidence — documented or cross-source verified)

- [Claude Code memory docs — `@`-reference syntax + recursive imports up to depth 5](https://code.claude.com/docs/en/memory) — documents both `~` and `$HOME` form, and absolute/relative path support
- [Steve Kinney — Referencing Files and Resources in Claude Code](https://stevekinney.com/courses/ai-development/referencing-files-in-claude-code) — corroborates `@`-syntax behavior
- [The Complete Guide to AI Agent Memory Files (CLAUDE.md, AGENTS.md, and Beyond)](https://medium.com/data-science-collective/the-complete-guide-to-ai-agent-memory-files-claude-md-agents-md-and-beyond-49ea0df5c5a9) — third-party confirmation
- [anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181) — parallel-Task hallucination bug (cited in REQUIREMENTS.md line 47, mitigated by disk-read pattern)
- [anthropics/claude-code#7406](https://github.com/anthropics/claude-code/issues/7406) — "claims parallel, executes serial" bug (cited in REQUIREMENTS.md line 48, mitigated by walltime test)

### Tertiary (LOW confidence — inferred, flagged for verification)

- Spawn-timestamp data shape in Claude Code's JSON output for nested Task calls — assumed but not verified; reconnaissance task in Wave 0 should confirm.
- Cost reporting granularity per Task vs aggregated (A8) — assumed but not verified during research.
- 12-runtime install.js handling of `agents/_shared/` (Pitfall 6, A7) — only tested implicitly via Phase 1 outputs; explicit test for at least the Claude runtime should land in Wave 0.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all inherited from Phase 1, verified on disk
- Architecture: HIGH on what exists, MEDIUM on the new orchestrator wiring (no working example in repo today)
- Pitfalls: HIGH on enumerated risks, MEDIUM on probability estimates (LLM stochasticity is hard to bound a priori)
- Spike outcome: MEDIUM-HIGH — strong empirical signal that `@`-references work in Task-spawn (existing agents in production use them), but the spike still needs to verify content actually injects vs literal-text-pass-through
- Cost estimates: MEDIUM — based on Phase 1 baselines (~$0.30/critic-run), N=5 × 6 critics extrapolation could be ±50%

**Research date:** 2026-05-04
**Valid until:** 30 days for stable infrastructure (Phase 1 outputs); 7 days for Claude Code behavior assumptions (the platform iterates fast; spike commit re-verifies)

## RESEARCH COMPLETE
