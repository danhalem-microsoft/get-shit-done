---
name: gsd:switch
description: Switch active project context
argument-hint: "[project-name]"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---
<context>
**Usage:**
- `/gsd-switch my-api` — Switch to project "my-api" (exact or fuzzy match)
- `/gsd-switch` — List all projects with status, pick from numbered list

**Multi-user:** Switches the active project for the current user by updating `.planning/users/<user>/.active`.
</context>

<objective>
Switch the active project context so subsequent GSD commands operate on the selected project.

**With argument:** Resolves the project name (exact match, then fuzzy substring match) and switches to it.
**Without argument:** Lists all projects with status info (phase, progress, last activity, description), lets user pick by number.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/switch.md
</execution_context>

<process>
Execute the switch workflow from @~/.claude/get-shit-done/workflows/switch.md end-to-end.
Handle both with-args and without-args modes.
</process>
