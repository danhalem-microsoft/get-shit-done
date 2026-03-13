---
name: gsd:add-taste
description: Create a taste entry from guided input
argument-hint: [optional domain or title hint]
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Create a taste entry (user preference pattern) via guided Q&A, write it to
.planning/taste/ with structured YAML frontmatter and body sections, and commit.

Routes to the add-taste workflow which handles:
- Guided Q&A for domain, title, pattern, tags, when-to-apply
- Auto-generated slug from title (lowercase, hyphenated)
- Collision detection with incrementing suffix (-2, -3)
- YAML frontmatter (9 required fields) + 2 body sections
- Manual entries start at HIGH confidence with decision_count: 3
- Git commit
</objective>

<execution_context>
@.planning/STATE.md
@~/.claude/get-shit-done/workflows/add-taste.md
</execution_context>

<process>
**Follow the add-taste workflow** from `@~/.claude/get-shit-done/workflows/add-taste.md`.

The workflow handles all logic including:
1. Init context loading (existing taste entries)
2. Guided Q&A for entry content
3. Slug generation and collision checking
4. File creation with validated frontmatter + body sections
5. Git commit
</process>
