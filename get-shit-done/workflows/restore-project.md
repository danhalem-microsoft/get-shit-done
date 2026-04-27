<purpose>
Restore a previously archived project from _archived/ back to the active projects directory.
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

Usage: /gsd-restore-project <project-name>
```
Exit workflow.
</step>

<step name="execute_restore">
**Run restore command:**

```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" restore-project "$PROJECT_NAME" 2>&1)
EXIT_CODE=$?
```

**If successful** (`EXIT_CODE` is 0, result contains `"restored": true`):

Parse JSON result for `project`.

Display:
```
Restored: ${project}
Project is now active.

Use /gsd-progress to check project status.
```

**If failed** (non-zero exit or error):

Display the error message from gsd-tools.cjs (e.g., project not found in _archived/, duplicate name conflict).

Exit workflow.
</step>

</process>

<success_criteria>
- [ ] Project restored from _archived/ to active directory
- [ ] Restored project set as active
- [ ] Clear error on failure (not found, duplicate, etc.)
</success_criteria>
