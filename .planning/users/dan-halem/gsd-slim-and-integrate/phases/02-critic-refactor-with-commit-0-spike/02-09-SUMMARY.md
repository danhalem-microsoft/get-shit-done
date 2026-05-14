---
phase: "02-critic-refactor-with-commit-0-spike"
plan: "09"
subsystem: agents/_shared/critic-base.md import-form drift
tags: [phase-2-critic, wave-5, CRIT-03, gap_closure]
requirements: [CRIT-03]
provides:
  - agents/gsd-critic-{code,discuss,plan,scope,strategy,verify}.md restored to @~/.claude form
affects:
  - tests/critic-line-budget.test.cjs CRIT-03 sub-test (now GREEN)
  - Plan 02-08 Step B static suite (29/30 → 30/30 on node-direct)
status: complete
completed: "2026-05-14"
---

# Plan 02-09 — Revert critic @-import drift

## Problem

Six trimmed critic files (`agents/gsd-critic-{code,discuss,plan,scope,strategy,verify}.md`) had an unstaged 1-line rewrite swapping the import line from `@~/.claude/get-shit-done/agents/_shared/critic-base.md` to `@$HOME/.claude/get-shit-done/agents/_shared/critic-base.md`. Origin unknown — not from any committed Phase 2 plan. The `critic-line-budget.test.cjs:60` CRIT-03 reachability sub-test asserts the literal `~` form (matches Plan 02-04 and 02-05 output).

Surfaced during Plan 02-08 Wave 6 status check: node-direct static suite was 29/30 with this single failure.

## Action

```bash
git checkout HEAD -- agents/gsd-critic-{code,discuss,plan,scope,strategy,verify}.md
```

## Verification

```
$ for f in agents/gsd-critic-*.md; do head -10 "$f" | grep -E "^@~/.claude"; done
@~/.claude/get-shit-done/agents/_shared/critic-base.md   × 6

$ node --test tests/critic-line-budget.test.cjs
# tests 4
# pass 4
# fail 0
```

## Result

Working tree clean for 6 critic files. CRIT-03 reachability sub-test GREEN. Node-direct static suite now 30/30 (when paired with 02-10's BUILD entries it will be 30/30 in bazel too). Phase 2 exit-gate (Plan 02-08) gap #2 of 5 closed.

## What this DOES NOT verify

- The actual `@`-resolver behavior in spawned Task subagents. That is covered by the live `integration/critic-spike-passes.test.cjs` (`requires-api-key`), which can only run with `ANTHROPIC_API_KEY` available — outside the scope of this gap-closure plan.

## Follow-ups

- Plan 02-10 (next): Add BUILD entries for `cull-no-orphan-references` and `gsd-sdk-query-registry-integration`.
- Plan 02-11 (after 02-10): Add data deps so bazel-tagged static tests find their input files in sandbox.
- Plan 02-08 (Phase 2 exit): runs after the user provides API keys in their shell + re-invokes.
