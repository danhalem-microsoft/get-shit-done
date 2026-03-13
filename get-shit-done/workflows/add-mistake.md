<purpose>
Capture a mistake pattern from conversation context or guided input, create a structured
entry in .planning/mistakes/, and commit. Supports two capture modes: conversation extraction
("what just happened?") and guided Q&A (deliberate documentation). Both produce identical output.
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

Extract from init JSON: `commit_docs`, `timestamp`, `date`, `mistake_count`, `mistakes`, `next_id`, `mistakes_dir_exists`.

Ensure directory exists:
```bash
mkdir -p .planning/mistakes
```

Note existing entries from the mistakes array for slug collision detection.
</step>

<step name="determine_mode">
Choose capture mode based on arguments and conversation context:

**Conversation extraction mode** (default):
- If argument is "extract" or no argument given -> attempt conversation extraction
- Claude analyzes recent conversation for mistake patterns: errors encountered, anti-patterns discussed, debugging sessions, "we should have" moments, lessons learned

**Guided Q&A mode**:
- If argument is a description string -> use it as starting point for guided Q&A
- If conversation extraction fails (not enough context found) -> fall back with message:
  "Not enough context to extract a mistake pattern. Let's build one step by step."

**Routing logic:**
1. No argument or "extract" -> try conversation extraction (step 3a)
2. Description argument -> guided Q&A (step 3b)
3. Extraction finds nothing useful -> fall back to guided Q&A (step 3b) with fallback message
</step>

<step name="conversation_extraction">
**Mode: Conversation Extraction**

1. **Analyze conversation** for mistake patterns -- look for:
   - Errors encountered and debugged
   - Anti-patterns discussed or discovered
   - "We should have..." or "next time we should..." moments
   - Debugging sessions that revealed root causes
   - Lessons learned from failed approaches
   - Repeated mistakes or recurring issues

2. **Draft a complete entry** with all fields:
   - `title`: 5-12 word descriptive title (action/problem-oriented)
   - `area`: inferred from file paths or topic (e.g., build-system, testing, api, deployment, tooling, database, auth, ui)
   - `files`: relevant file paths from conversation
   - `pattern`: 1-3 sentences describing what goes wrong (root cause, not symptom)
   - `detection`: 1-3 sentences with specific signals -- file paths, function names, error messages, behavioral indicators (STOR-04 specificity requirement)
   - `prevention`: 1-3 sentences describing actionable steps to avoid (concrete, not aspirational)
   - Optional `context`: incident details, provenance, or backstory if available

3. **Show inline preview** -- print the full formatted markdown entry in conversation:

```
Here's the mistake entry I've drafted:

---
id: MR-003
created: 2026-03-03T14:30:00.000Z
title: Missing bazel sync after dependency change
area: build-system
files:
  - requirements.txt
  - MODULE.bazel.lock
---

## Pattern

Adding packages to requirements.txt without running `bazel sync` causes...

## Detection

Check for recent changes to requirements.txt...

## Prevention

After ANY change to dependency files...

---

Save this entry? (confirm / give feedback / reject)
```

4. **Confirm with user** using AskUserQuestion:
   - header: "Save mistake entry?"
   - question: "Review the entry above. What would you like to do?"
   - options:
     - "Save" -> proceed to generate_slug step
     - "Edit" -> ask what to change, revise entry, show preview again
     - "Reject" -> exit with "Entry discarded."

If user chooses "Edit": ask what they'd like to change, revise the affected fields/sections, show updated preview, and re-confirm. Repeat until user saves or rejects.
</step>

<step name="guided_qa">
**Mode: Guided Q&A**

Build the entry step by step through structured questions.

1. **Pattern question:**
   Ask: "What pattern or mistake do you want to capture? Describe what goes wrong."
   -> Generates `title` (5-12 words, action/problem-oriented) and `## Pattern` section (1-3 sentences, root cause)

2. **Detection question:**
   Ask: "How would you detect this in code or process? Include specific file paths, function names, or error messages if possible."
   -> Generates `## Detection` section (1-3 sentences with specifics per STOR-04)

3. **Prevention question:**
   Ask: "How should this be prevented going forward?"
   -> Generates `## Prevention` section (1-3 sentences, actionable steps)

4. **Infer metadata:**
   - Auto-infer `area` from file paths mentioned or topic discussed
   - Auto-infer `files` from any paths mentioned in answers
   - If area is unclear, ask briefly: "What area does this relate to? (e.g., build-system, testing, api, deployment)"

5. **Show inline preview** (same format as conversation extraction mode) -> confirm/edit/reject flow using AskUserQuestion (same as step 3a.4)
</step>

<step name="generate_slug">
Generate filename slug and check for collisions:

```bash
slug=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" generate-slug "$title" --raw)
```

**Collision check:**
If `.planning/mistakes/${slug}.md` already exists:
- Use AskUserQuestion:
  - header: "Slug collision"
  - question: "A mistake entry named '${slug}.md' already exists. Please provide a different name or modify the title."
  - Allow free-form input
- Re-generate slug from new input
- Re-check for collision (loop until unique)
</step>

<step name="create_file">
Write the entry file to `.planning/mistakes/${slug}.md`.

**File format:**
```markdown
---
id: ${next_id}
created: ${timestamp}
title: ${title}
area: ${area}
files:
  - ${file1}
  - ${file2}
---

## Pattern

${pattern_description}

## Detection

${detection_guidance}

## Prevention

${prevention_steps}
```

**Optional Context section** -- include only if incident details or provenance were captured:
```markdown
## Context

${provenance_notes}
```

**Quality targets (STOR-04):**
- Total entry: 200-600 words
- Each body section: 1-3 concise sentences
- Detection section: must include specifics (exact file names, function signatures, error messages, or behavioral indicators) -- never vague "check for issues"
- Pattern section: describes root cause, not symptom
- Prevention section: describes actionable steps, not aspirational goals
</step>

<step name="validate_entry">
Validate the created file against the mistake schema:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" frontmatter validate .planning/mistakes/${slug}.md --schema mistake
```

If validation fails:
1. Read the error message
2. Fix the identified issue (missing required field, malformed YAML, etc.)
3. Re-validate until passing
</step>

<step name="git_commit">
Commit the entry:

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: capture mistake - ${title}" --files .planning/mistakes/${slug}.md
```

Tool respects `commit_docs` config and gitignore automatically.
</step>

<step name="confirm">
Display confirmation to user:

```
Mistake captured: .planning/mistakes/${slug}.md

  ${id}: ${title}
  Area: ${area}
  Files: ${file_count} referenced

---

Would you like to:
1. Continue with current work
2. Add another mistake (/gsd:add-mistake)
3. View all mistakes (/gsd:mistakes)
```
</step>

</process>

<success_criteria>
- [ ] Capture mode determined (conversation extraction or guided Q&A)
- [ ] Entry content gathered through chosen mode
- [ ] Inline preview shown and user confirmed
- [ ] Slug generated and verified unique
- [ ] File created with valid YAML frontmatter (id, created, title, area, files)
- [ ] File has 3 required body sections (Pattern, Detection, Prevention)
- [ ] Entry validated via frontmatter validate --schema mistake
- [ ] Entry committed to git
- [ ] Confirmation displayed with entry details
</success_criteria>
