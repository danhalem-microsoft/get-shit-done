---
name: gsd:restore-project
description: Restore an archived project
argument-hint: "<project-name>"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<context>
**Usage:**
- `/gsd-restore-project my-api` — Restore project "my-api" from `_archived/`

**Effect:** Moves the project directory from `.planning/users/<user>/_archived/<project>/` back to `.planning/users/<user>/<project>/` and sets it as the active project.
</context>

<objective>
Restore a previously archived project from `_archived/` back to the active projects directory.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/restore-project.md
</execution_context>

<process>
Execute the restore-project workflow from @~/.claude/get-shit-done/workflows/restore-project.md end-to-end.
</process>
