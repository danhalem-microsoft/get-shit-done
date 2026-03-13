---
name: gsd:add-mistake
description: Capture a mistake pattern as a registry entry for critic review
argument-hint: [optional description or "extract" for conversation mode]
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Capture a mistake pattern from conversation context or guided input, create
a structured entry in .planning/mistakes/, and commit.

Routes to the add-mistake workflow which handles:
- Two capture modes (conversation extraction, guided Q&A)
- Auto-generated MR-NNN IDs
- Slug generation and collision detection
- YAML frontmatter + 3 required body sections
- Inline preview and confirmation
- Git commit
</objective>

<execution_context>
@.planning/STATE.md
@~/.claude/get-shit-done/workflows/add-mistake.md
</execution_context>

<process>
**Follow the add-mistake workflow** from `@~/.claude/get-shit-done/workflows/add-mistake.md`.

The workflow handles all logic including:
1. Init context loading (next ID, existing entries)
2. Capture mode selection (conversation extraction vs guided Q&A)
3. Content extraction with area/files inference
4. Slug generation and collision checking
5. Inline preview with user confirmation
6. File creation with validated frontmatter + body sections
7. Git commit
</process>
