---
name: gsd:validate-phase
description: "[DEPRECATED] Use /gsd-review --coverage instead. This stub will be removed in a future milestone."
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

`/gsd-validate-phase` has been consolidated into `/gsd-review`.

**Use:** `/gsd-review --coverage <phase>`

This stub will be removed after a future milestone. See `CHANGELOG.md` and `commands/gsd/help.md` for the full migration table.

Now dispatching to `/gsd-review --coverage` with your arguments...
</objective>

<process>
1. Print the deprecation banner above to the user (verbatim).
2. Forward to `/gsd-review --coverage $ARGUMENTS` — execute the review workflow with the consolidated flag prepended to whatever arguments the user supplied.
</process>
</content>
