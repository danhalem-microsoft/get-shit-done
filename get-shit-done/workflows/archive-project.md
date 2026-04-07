<purpose>
Archive a completed project by moving it to the _archived/ subdirectory. Confirms with user before proceeding.
</purpose>

<process>

<step name="parse_argument">
Extract project name from $ARGUMENTS.

```bash
PROJECT_NAME=$(echo "$ARGUMENTS" | xargs)
```

**If no project name provided:**
```
Error: Project name required.

Usage: /gsd:archive-project <project-name>

Use /gsd:switch to see your projects.
```
Exit workflow.
</step>

<step name="confirm_archive">
**Confirm with user before archiving:**

Use AskUserQuestion:
- header: "Archive"
- question: "Archive project '${PROJECT_NAME}'? This moves it to _archived/."
- options:
  - "Yes, archive it" — Proceed with archival
  - "Cancel" — Abort

**If "Cancel":** Display "Archive cancelled." and exit workflow.
</step>

<step name="execute_archive">
**Run archive command:**

```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" archive-project "$PROJECT_NAME" 2>&1)
EXIT_CODE=$?
```

**If successful** (`EXIT_CODE` is 0, result contains `"archived": true`):

Parse JSON result for `project`, `new_active` (if any).

Display:
```
Archived: ${project}

${new_active ? "Active project is now: ${new_active}" : "No active project. Use /gsd:switch or /gsd:new-project."}
```

**If failed** (non-zero exit or error):

Display the error message from gsd-tools.cjs.

Exit workflow.
</step>

</process>

<success_criteria>
- [ ] User confirms before archive proceeds
- [ ] Project moved to _archived/ on confirmation
- [ ] New active project displayed (if auto-selected) or prompt to switch/create
- [ ] Clear error on failure (project not found, etc.)
</success_criteria>
