# Debug Investigation Prompt Template (legacy)

This template was originally used to spawn a dedicated debugger subagent. That agent has been retired. The orchestrator now runs the same diagnosis loop inline using Read, Grep, and Bash directly.

If you still want to drive a structured per-issue debug session, copy the placeholder shape below into the orchestrator's main thread and step through it manually:

---

## Inline diagnosis shape

```markdown
<objective>
Investigate issue: {issue_id}

**Summary:** {issue_summary}
</objective>

<symptoms>
expected: {expected}
actual: {actual}
errors: {errors}
reproduction: {reproduction}
timeline: {timeline}
</symptoms>

<mode>
symptoms_prefilled: {true_or_false}
goal: {find_root_cause_only | find_and_fix}
</mode>

<debug_file>
Create: {planning_root}/debug/{slug}.md
</debug_file>
```

---

## Placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{issue_id}` | Orchestrator-assigned | `auth-screen-dark` |
| `{issue_summary}` | User description | `Auth screen is too dark` |
| `{expected}` | From symptoms | `See logo clearly` |
| `{actual}` | From symptoms | `Screen is dark` |
| `{errors}` | From symptoms | `None in console` |
| `{reproduction}` | From symptoms | `Open /auth page` |
| `{timeline}` | From symptoms | `After recent deploy` |
| `{goal}` | Orchestrator sets | `find_and_fix` |
| `{slug}` | Generated | `auth-screen-dark` |

---

## Usage

Walk this shape in the orchestrator's main thread — read the suspect files, form hypotheses, and write the resulting evidence to `${planning_root}/debug/{slug}.md` as you go. Use the `DEBUG.md` template for the per-issue file structure.

---

## Continuation

For long sessions split across multiple turns, persist current state to the debug file and resume from it on the next turn:

```markdown
<objective>
Continue debugging {slug}. Evidence is in the debug file.
</objective>

<prior_state>
Debug file: @{planning_root}/debug/{slug}.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>

<mode>
goal: {goal}
</mode>
```
