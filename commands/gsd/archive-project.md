---
name: gsd:archive-project
description: Archive a completed project
argument-hint: "<project-name>"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<context>
**Usage:**
- `/gsd-archive-project my-api` — Archive project "my-api" to `_archived/`

**Effect:** Moves the project directory from `.planning/users/<user>/<project>/` to `.planning/users/<user>/_archived/<project>/`. Archived projects are excluded from `/gsd-switch` listings. If the archived project was the active one, auto-selects another project (or clears active context).
</context>

<objective>
Archive a completed project by moving it to the `_archived/` subdirectory. Confirms with user before proceeding.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/archive-project.md
</execution_context>

<process>
Execute the archive-project workflow from @~/.claude/get-shit-done/workflows/archive-project.md end-to-end.
Always confirm with user before archiving.
</process>
