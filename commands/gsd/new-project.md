---
name: gsd:new-project
description: Create a new project in the multi-user structure with deep context gathering
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
<runtime_note>
**Copilot (VS Code):** Use `vscode_askquestions` wherever this workflow calls `AskUserQuestion`. They are equivalent — `vscode_askquestions` is the VS Code Copilot implementation of the same interactive question API.
</runtime_note>

<context>
**Flags:**
- `--auto` — Automatic mode. After config questions, runs research → requirements → roadmap without further interaction. Expects idea document via @ reference.

**Multi-user:** Projects are created under `.planning/users/<user>/<project>/`. The workflow uses a two-step bootstrap: asks for project name first, creates directory structure, sets active context, then continues with normal project initialization.
</context>

<objective>
Create a new project in the multi-user directory structure through unified flow: project naming → questioning → research (optional) → requirements → roadmap.

**Creates (under `.planning/users/<user>/<project>/`):**
- `PROJECT.md` — project context
- `config.json` — workflow preferences (seeded from global defaults)
- `research/` — domain research (optional)
- `REQUIREMENTS.md` — scoped requirements
- `ROADMAP.md` — phase structure
- `STATE.md` — project memory

**After this command:** Run `/gsd-plan-phase 1` to start execution.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/new-project.md
@~/.claude/get-shit-done/references/questioning.md
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/templates/project.md
@~/.claude/get-shit-done/templates/requirements.md
</execution_context>

<process>
Execute the new-project workflow from @~/.claude/get-shit-done/workflows/new-project.md end-to-end.
Preserve all workflow gates (validation, approvals, commits, routing).
</process>
