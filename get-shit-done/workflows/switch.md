<purpose>
Switch the active project context. With an argument, switches directly. Without an argument, lists projects and lets user pick.
</purpose>

<process>

**TEXT_MODE fallback:** When text_mode is active (--text flag or config), replace AskUserQuestion calls with plain-text numbered lists.

<step name="parse_argument">
Check if a project name argument was provided in $ARGUMENTS.

```bash
PROJECT_ARG=$(echo "$ARGUMENTS" | xargs)
```

If `PROJECT_ARG` is empty → go to **list_and_pick** step.
If `PROJECT_ARG` is non-empty → go to **switch_direct** step.
</step>

<step name="switch_direct">
**Switch to the specified project:**

```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" switch "$PROJECT_ARG" 2>&1)
EXIT_CODE=$?
```

**If successful** (`EXIT_CODE` is 0, result contains `"switched": true`):

Parse JSON result for `project` and `planning_root`.

Display:
```
Switched to project: ${project}
Planning root: ${planning_root}
```

**If failed** (non-zero exit or error in result):

Display the error message from gsd-tools.cjs (which includes suggestions for fuzzy matches or available projects).

Exit workflow.
</step>

<step name="list_and_pick">
**List all projects and let user pick:**

```bash
RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" switch 2>&1)
EXIT_CODE=$?
```

**If failed** (non-zero exit):
Display error and exit.

**If successful** (result contains `"switched": false` and `projects` array):

Parse `projects` array from JSON. Each project has: `name`, `current_phase`, `phase_count`, `completed_phases`, `last_activity`, `description`.

Display numbered list:

```
Your projects:

1. ${name} — Phase ${current_phase} of ${phase_count} (${completed_phases}/${phase_count} complete) — Last active: ${last_activity}
   ${description}
2. ${name} — Phase ${current_phase} of ${phase_count} (${completed_phases}/${phase_count} complete) — Last active: ${last_activity}
   ${description}
```

**If projects array is empty:**
```
No projects found. Run /gsd-new-project to create one.
```
Exit workflow.

**Ask user to pick:**

Use AskUserQuestion:
- header: "Switch"
- question: "Which project do you want to switch to?"
- options: Generate one option per project: `{ label: "${name}", description: "Phase ${current_phase} of ${phase_count}" }`

**Switch to selected project:**

```bash
SWITCH_RESULT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" switch "$SELECTED_NAME" 2>&1)
```

Parse result. Display:
```
Switched to project: ${project}
Planning root: ${planning_root}
```
</step>

</process>

<success_criteria>
- [ ] With argument: project switched or clear error with suggestions
- [ ] Without argument: numbered project list displayed, user picks, switch executed
- [ ] Empty project list handled with /gsd-new-project suggestion
- [ ] Result displayed with project name and planning root
</success_criteria>
