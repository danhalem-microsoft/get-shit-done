---
name: gsd:critique
description: "[DEPRECATED] Use /gsd-review --critique instead. This stub will be removed in a future milestone."
argument-hint: "<phase> [other flags]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
---
<objective>
**⚠ DEPRECATED**

`/gsd-critique` has been consolidated into `/gsd-review`.

**Use:** `/gsd-review --critique <phase>`

This stub will be removed after a future milestone. See `CHANGELOG.md` and `commands/gsd/help.md` for the full migration table.

Now dispatching to `/gsd-review --critique` with your arguments...
</objective>

<process>
1. Print the deprecation banner above to the user (verbatim).
2. Forward to `/gsd-review --critique $ARGUMENTS` — execute the review workflow with the consolidated flag prepended to whatever arguments the user supplied.
</process>
</content>
