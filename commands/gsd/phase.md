---
name: gsd:phase
description: Phase manipulation — add, insert, or remove phases in the active milestone roadmap
argument-hint: "<add | insert | remove> [args...]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
<objective>
Phase manipulation in the active milestone roadmap.

Subcommands:
- `add <description>` — Append a new phase at the end of the current milestone (replaces the legacy `/gsd-add-phase` command)
- `insert <position> <description>` — Insert a phase at a specific position (replaces the legacy `/gsd-insert-phase` command)
- `remove <phase-id>` — Remove a phase from the roadmap (replaces the legacy `/gsd-remove-phase` command)
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/phase.md
</execution_context>

<context>
Subcommand: $ARGUMENTS (first positional arg).
</context>

<process>
Parse `$ARGUMENTS` — first token is the subcommand:

1. If `$1` is `add`    → execute `@~/.claude/get-shit-done/workflows/add-phase.md` with `$2...` as description.
2. If `$1` is `insert` → execute `@~/.claude/get-shit-done/workflows/insert-phase.md` with `$2` as position, `$3...` as description.
3. If `$1` is `remove` → execute `@~/.claude/get-shit-done/workflows/remove-phase.md` with `$2` as phase-id.
4. Otherwise: error "Unknown subcommand. Use add | insert | remove."
</process>
</content>
