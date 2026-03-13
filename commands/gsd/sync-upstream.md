---
name: gsd:sync-upstream
description: Sync fork with upstream get-shit-done changes
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

<objective>
Sync this fork with the upstream get-shit-done repository. Provides a guided
merge workflow with conflict resolution guidance for known high-conflict files.

Routes to the sync-upstream workflow which handles:
- Upstream remote verification and setup
- Fetch and change review
- Merge strategy selection (merge all, cherry-pick, abort)
- Conflict resolution guidance
- Post-merge install verification
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/sync-upstream.md
</execution_context>

<process>
**Follow the sync-upstream workflow** from `@~/.claude/get-shit-done/workflows/sync-upstream.md`.

The workflow handles all logic including:
1. Verify upstream remote exists (or add it)
2. Fetch upstream changes
3. Show change log for review
4. User selects merge strategy
5. Handle conflicts with guidance
6. Post-merge verification
</process>
