<purpose>
Display all mistake registry entries in a formatted table. This is display-only -- no selection,
no filtering, no actions. The registry is expected to be small enough to scan visually.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
Load mistake registry context:

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init mistakes)
```

Extract from init JSON: `mistake_count`, `mistakes`, `mistakes_dir_exists`.
</step>

<step name="check_empty">
If `mistake_count` is 0 OR `mistakes_dir_exists` is false:

```
No mistake entries yet.

Capture patterns with /gsd:add-mistake during work sessions.
Entries help critics catch recurring issues.
```

Exit.
</step>

<step name="render_table">
Display all entries using the `mistakes` array from init context (already sorted newest first by `cmdInitMistakes`).

Format the `created` field as date-only (YYYY-MM-DD) even if stored as full ISO timestamp. Use the `id`, `title`, and `created` fields from each mistake object in the array.

Output as markdown table:

```
Mistake Registry ({count} entries)

| ID     | Title                                       | Created    |
|--------|---------------------------------------------|------------|
| MR-003 | Test weakening to pass CI                   | 2026-03-03 |
| MR-002 | Bazel commands from wrong directory          | 2026-03-03 |
| MR-001 | Missing bazel sync after dependency change  | 2026-03-03 |

Entries are always active. Delete file manually if truly irrelevant.
View entry: cat .planning/mistakes/<slug>.md
```

No filters. No selection. No actions. Display-only.
</step>

</process>

<success_criteria>
- [ ] Init context loaded with mistake count and entries
- [ ] Empty/absent directory handled with helpful message (no errors)
- [ ] All entries displayed in table sorted newest first
- [ ] Table columns: ID | Title | Created (date-only)
- [ ] No interactive elements -- display-only
</success_criteria>
