<purpose>
Create a taste entry (user preference pattern) through guided Q&A input. Taste entries
capture recurring implementation preferences so they can be consulted during future
discuss-phase sessions, reducing repeated questions.

Manual entries start at HIGH confidence (decision_count: 3, source_phases: ["manual"])
because the user is explicitly documenting a known preference.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
Load taste context and existing entries:

```bash
TASTES=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" load-active-tastes --raw)
```

Ensure directory exists:
```bash
mkdir -p .planning/taste
```

Get current timestamp and date:
```bash
TIMESTAMP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp full --raw)
DATE=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" current-timestamp date --raw)
```

Note existing taste entry slugs for collision detection.
</step>

<step name="guided_input">
Collect taste entry content through structured questions.

1. **Domain question:**
   Ask: "What domain does this preference apply to? (e.g., ui, architecture, testing, naming, error-handling, workflow, tooling)"
   - Use AskUserQuestion with common domains as options + "Other"

2. **Title question:**
   Ask: "Give this taste a short title (5-12 words, e.g., 'Prefer explicit error messages over codes')"
   - Free-form input

3. **Pattern question:**
   Ask: "Describe the preference pattern. What do you prefer and why?"
   - This becomes the `## Pattern` body section
   - 2-5 sentences describing the preference and its rationale

4. **Tags question:**
   Ask: "What tags should this taste have? (comma-separated, e.g., error-handling, user-feedback, validation)"
   - Auto-suggest tags based on domain and title
   - User can accept suggestions or provide their own

5. **When to apply question:**
   Ask: "When should this taste be applied? Describe the situations or triggers."
   - This becomes the `## When To Apply` body section
   - 1-3 sentences describing when this preference is relevant

6. **Show inline preview** of the complete entry and confirm with AskUserQuestion:
   - header: "Save taste entry?"
   - question: "Review the entry above. What would you like to do?"
   - options: "Save" / "Edit" / "Reject"
   - If "Edit": ask what to change, revise, re-preview
   - If "Reject": exit with "Entry discarded."
</step>

<step name="generate_slug">
Generate filename slug from title:

```bash
SLUG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" generate-slug "$TITLE" --raw)
```

**Collision detection:**
If `.planning/taste/${SLUG}.md` already exists:
- Try `${SLUG}-2.md`, `${SLUG}-3.md`, etc.
- Auto-resolve with incrementing suffix (no user prompt needed per Phase 21 decision)
- Use first available slug
</step>

<step name="create_file">
Write the taste entry file to `.planning/taste/${SLUG}.md`.

**File format (9 frontmatter fields + 2 body sections):**

```markdown
---
id: ${SLUG}
domain: ${domain}
title: ${title}
status: active
confidence: HIGH
decision_count: 3
source_phases:
  - "manual"
tags:
  - ${tag1}
  - ${tag2}
times_applied: 0
times_overridden: 0
---

## Pattern

${pattern_description}

## When To Apply

${when_to_apply}
```

**Schema requirements (Phase 21):**
- 9 required frontmatter fields: id, domain, title, status, confidence, decision_count, source_phases, tags, times_applied, times_overridden
- Note: times_applied and times_overridden may not be listed in some schema counts but are required for counter tracking
- 2 required body sections: Pattern, When To Apply
- Manual entries: confidence=HIGH, decision_count=3, source_phases=["manual"]
</step>

<step name="git_commit">
Commit the entry:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: add taste entry - ${TITLE}" --files .planning/taste/${SLUG}.md
```

Tool respects `commit_docs` config automatically.
</step>

<step name="confirm">
Display confirmation:

```
Taste entry created: .planning/taste/${SLUG}.md

  Domain: ${domain}
  Title: ${title}
  Confidence: HIGH (manual entry)
  Tags: ${tags}

This taste will be consulted during future /gsd:discuss-phase sessions.

---

Would you like to:
1. Continue with current work
2. Add another taste (/gsd:add-taste)
3. Extract tastes from decision logs (/gsd:extract-taste)
```
</step>

</process>

<success_criteria>
- [ ] Domain, title, pattern, tags, and when-to-apply collected via guided Q&A
- [ ] Inline preview shown and user confirmed
- [ ] Slug generated and collision resolved (auto-increment suffix)
- [ ] File created with 9 frontmatter fields + 2 body sections
- [ ] Manual entry defaults applied (HIGH confidence, decision_count: 3)
- [ ] Entry committed to git
- [ ] Confirmation displayed with entry details
</success_criteria>
