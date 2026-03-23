---
name: gsd:critique
description: Run adversarial critics against phase artifacts
argument-hint: "[phase] [--only=plan,code,scope,verify,discuss,strategy]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
---
<objective>
Run adversarial critique of a phase's artifacts. Spawn parallel critic agents, collect per-critic reports, merge with dedup, write CRITIQUE.md with diff tracking, and present inline summary.

**Default:** Runs all 5 phase-level critics (plan, code, scope, verify, discuss).
**--only:** Filter to specific critics. `strategy` is milestone-only and not included in the default set.

Valid --only values: plan, code, scope, verify, discuss, strategy
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/critique.md
</execution_context>

<context>
Phase number: $ARGUMENTS (optional -- auto-detects current phase from STATE.md if omitted)

**Flags:**
- `--only=plan,code,...` -- Run only the specified critics (comma-separated). Valid values: plan, code, scope, verify, discuss, strategy.
</context>

<process>
Execute the critique workflow from @~/.claude/get-shit-done/workflows/critique.md end-to-end.
Preserve all workflow gates (initialization, registry loading, critic spawning, merge, diff tracking, summary, commit).
</process>
