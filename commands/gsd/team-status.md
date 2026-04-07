---
name: gsd:team-status
description: Show what each team member is working on across the monorepo
allowed-tools:
  - Read
  - Bash
---

<objective>
Display team visibility at a glance — who's working on what, their progress, and last activity.

Read-only — does not modify any files.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/team-status.md
</execution_context>

<context>
Scans all user directories under .planning/users/ and reads each user's STATE.md
frontmatter for status, progress, and last activity.
</context>

<process>
**Follow the team-status workflow** from `@~/.claude/get-shit-done/workflows/team-status.md`.

The workflow handles:
1. Initialization and planning structure detection
2. Cross-user directory scanning via gsd-tools team-status
3. Summary table formatting and display
</process>
