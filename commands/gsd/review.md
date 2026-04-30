---
name: gsd:review
description: Quality-gate review for a phase (consolidates code review, security, coverage, critique, converge)
argument-hint: "<phase> [--code | --code-fix | --security | --coverage | --critique | --converge] [other flags]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - AskUserQuestion
---
<objective>
Run a quality-gate review on a phase. Single entry point for code review, security audit, coverage validation, plan critique, and review convergence.

**Orchestrator role:** Parse the `--<flag>` argument, dispatch to the corresponding review workflow.

Flags (exactly one required):
- `--code` — Source code review (delegates to gsd-code-reviewer; replaces the legacy `/gsd-code-review` command)
- `--code-fix` — Apply fixes from a prior `--code` run (delegates to gsd-code-fixer; replaces the legacy `/gsd-code-review-fix` command)
- `--security` — Threat-model verification (delegates to gsd-security-auditor; replaces the legacy `/gsd-secure-phase` command)
- `--coverage` — Test coverage gap analysis (replaces the legacy `/gsd-validate-phase` command; integrates with the Phase 4 TDD layer)
- `--critique` — All-six-critic review (replaces the legacy `/gsd-critique` command; Phase 2 will parallelize)
- `--converge` — Reconcile cross-AI review feedback (replaces the legacy `/gsd-plan-review-convergence` command)
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/review.md
</execution_context>

<context>
Phase: $ARGUMENTS (first positional arg; auto-detects current phase if omitted).
</context>

<process>
Execute the workflow at `@~/.claude/get-shit-done/workflows/review.md`, dispatching on the supplied flag in `$ARGUMENTS`:

1. Parse `$ARGUMENTS` for exactly one of: `--code`, `--code-fix`, `--security`, `--coverage`, `--critique`, `--converge`.
2. If zero flags or multiple flags, error: "Specify exactly one review type."
3. Dispatch (the workflow files referenced are surviving workflow bodies; only the user-facing command surface is consolidated):
   - `--code`        → execute `@~/.claude/get-shit-done/workflows/code-review.md`
   - `--code-fix`    → execute `@~/.claude/get-shit-done/workflows/code-review-fix.md`
   - `--security`    → execute `@~/.claude/get-shit-done/workflows/secure-phase.md`
   - `--coverage`    → execute `@~/.claude/get-shit-done/workflows/validate-phase.md`
   - `--critique`    → execute `@~/.claude/get-shit-done/workflows/critique.md`
   - `--converge`    → execute `@~/.claude/get-shit-done/workflows/plan-review-convergence.md`
4. Pass remaining flags + the phase argument through to the dispatched workflow (strip the dispatched flag itself before forwarding).
</process>
</content>
