---
name: gsd:mistakes
description: List all mistake registry entries
allowed-tools:
  - Read
  - Bash
---

<objective>
Display all mistake registry entries in a formatted table, sorted newest first.

Routes to the list-mistakes workflow which handles:
- Entry scanning via init mistakes
- Table formatting (ID | Title | Created)
- Empty state messaging
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/list-mistakes.md
</execution_context>

<process>
**Follow the list-mistakes workflow** from `@~/.claude/get-shit-done/workflows/list-mistakes.md`.

The workflow handles all logic including:
1. Init context loading
2. Empty directory handling
3. Table rendering
</process>
