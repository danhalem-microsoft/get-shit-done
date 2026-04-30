<purpose>
Consolidated phase-manipulation dispatcher. Single entry point for adding, inserting, or removing phases in the active milestone roadmap — replaces the three standalone commands `/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-remove-phase`.

Per `commands/gsd/phase.md`, this workflow dispatches on the first positional token in `$ARGUMENTS` (the subcommand). Subcommand → workflow mapping (LOCKED):

- `add`    → `add-phase.md`
- `insert` → `insert-phase.md`
- `remove` → `remove-phase.md`

This is a thin dispatch wrapper. The dispatched workflow owns roadmap mutation, slug generation, STATE.md updates, and the commit. Phase 1 consolidation unifies the user-facing command surface; the workflow bodies are unchanged.
</purpose>

<process>

<step name="parse_subcommand">
Parse `$ARGUMENTS` — the first token is the subcommand. Strip it before forwarding the remaining arguments to the dispatched workflow.

Validation:
- No subcommand supplied → error: `Unknown subcommand. Use add | insert | remove.`
- Subcommand not in {add, insert, remove} → error: `Unknown subcommand "$1". Valid: add | insert | remove.`
</step>

<step name="dispatch">
Execute the corresponding workflow file. The dispatched workflow owns all subsequent behavior. Do NOT re-implement subcommand logic here.

| Subcommand | Dispatched workflow                                       | Forwarded args                          |
| ---------- | --------------------------------------------------------- | --------------------------------------- |
| `add`      | `@~/.claude/get-shit-done/workflows/add-phase.md`         | `$2...` (description)                   |
| `insert`   | `@~/.claude/get-shit-done/workflows/insert-phase.md`      | `$2` (position) `$3...` (description)   |
| `remove`   | `@~/.claude/get-shit-done/workflows/remove-phase.md`      | `$2` (phase id)                         |
</step>

</process>

<success_criteria>
- [ ] Subcommand was identified from `$ARGUMENTS`.
- [ ] The corresponding workflow file was executed end-to-end.
- [ ] Remaining arguments reached the dispatched workflow unchanged.
</success_criteria>
</content>
