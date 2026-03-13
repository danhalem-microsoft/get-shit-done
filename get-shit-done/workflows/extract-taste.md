<purpose>
Extract taste patterns from unprocessed decision logs. Analyzes decision exchanges
across multiple sessions to identify recurring preferences, cross-references against
existing taste entries, and creates confirmed entries in .planning/taste/.

This is the primary automated taste discovery mechanism. Manual entry via /gsd:add-taste
handles explicit preferences; this workflow discovers implicit patterns from actual decisions.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_taste_dir">
Ensure taste directory exists:

```bash
mkdir -p .planning/taste
```

Load existing taste entries for cross-referencing:

```bash
EXISTING=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" load-active-tastes --raw)
```
</step>

<step name="find_unprocessed_logs">
Find decision logs that haven't been processed yet:

```bash
UNPROCESSED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" unprocessed-logs .planning/decisions/ --raw)
COUNT=$(echo "$UNPROCESSED" | jq -r '.count')
LOGS=$(echo "$UNPROCESSED" | jq -r '.unprocessed_logs[]')
```

**If count is 0:** Display message and exit:
```
No unprocessed decision logs found.

Decision logs are created during /gsd:discuss-phase sessions.
Run at least 3 discuss-phase sessions before extracting taste patterns.
```
</step>

<step name="three_log_gate">
**3-log minimum gate:**

If `COUNT < 3`:
```
Only ${COUNT} unprocessed decision log(s) found. Minimum 3 required for pattern extraction.

Taste extraction needs enough data points to identify recurring patterns.
Continue with /gsd:discuss-phase to build up more decision history.
```
Exit workflow.

If `COUNT >= 3`: Continue to read_logs.
</step>

<step name="read_logs">
Read and parse each unprocessed decision log:

```bash
# For each log file path in LOGS:
cat "${log_path}"
```

For each log, extract:
- Phase number (from filename or frontmatter)
- Decision exchanges (question asked, options presented, user's choice, rationale)
- Domain/area of each decision
- Any taste source metadata (from Phase 21 integration)

Build internal `<parsed_decisions>` structure with all exchanges across all logs.
</step>

<step name="identify_patterns">
Analyze parsed decisions to find recurring patterns:

1. **Group by domain/topic** -- cluster decisions that address similar areas
2. **Detect repetition** -- find choices that appear 2+ times across different phases
3. **Identify consistency** -- user consistently chooses similar options in similar situations
4. **Note strength** -- how many times the pattern appears (feeds into confidence)

For each candidate pattern, draft:
- `domain`: inferred from decision context
- `title`: 5-12 word description of the preference
- `pattern`: what the user consistently prefers
- `tags`: relevant keywords
- `when_to_apply`: situations that trigger this preference
- `decision_count`: number of supporting decisions
- `source_phases`: list of phases where pattern was observed

**deriveConfidence helper:**
- HIGH: 3+ supporting decisions
- MEDIUM: 2 supporting decisions
- LOW: 1 supporting decision (shouldn't reach here due to 3-log gate, but defensive)
</step>

<step name="cross_reference">
Compare each candidate against existing taste entries using semantic matching.

**Three outcomes:**

1. **New** -- No existing entry matches this pattern
   - Candidate proceeds to user confirmation as a new entry

2. **Reinforcing** -- Existing entry matches and new evidence supports it
   - Candidate shown as reinforcement: "This supports existing taste: {existing.title}"
   - If confirmed: atomic merge -- increment existing entry's decision_count, add source_phases
   - Use `updateTasteCounters` for counter updates

3. **Contradicting** -- Existing entry matches but new evidence contradicts it
   - Side-by-side diff shown: existing pattern vs new evidence
   - Cross-phase contradiction detection uses Phase field from exchanges
   - User decides: keep existing, replace with new, or keep both as context-dependent

**Semantic matching approach:**
- Use Claude's contextual understanding (not rigid domain/tag filtering)
- Prefer over-matching to under-matching -- user can reject false positives
- Partial matches valid: "error messages" taste can match "user feedback" context
</step>

<step name="present_candidates">
Show all candidates to user, grouped by outcome type:

```
## Taste Extraction Candidates

Found ${N} potential taste patterns from ${COUNT} decision logs:

### New Patterns
1. **${title}** (${confidence} confidence, ${decision_count} decisions)
   Domain: ${domain}
   Pattern: ${pattern_summary}
   Source phases: ${source_phases}

### Reinforcing Existing
2. **${title}** reinforces existing: "${existing_title}"
   Additional evidence from phases: ${new_source_phases}

### Contradicting Existing
3. **${title}** contradicts existing: "${existing_title}"
   Existing: ${existing_pattern}
   New evidence: ${new_pattern}
```

For each candidate, ask user to confirm or reject:
- header: "Taste candidate"
- question: "${title} -- Accept this taste entry?"
- options vary by outcome type:
  - New: "Accept" / "Edit" / "Reject"
  - Reinforcing: "Merge into existing" / "Create separate" / "Reject"
  - Contradicting: "Keep existing" / "Replace with new" / "Keep both" / "Reject both"
</step>

<step name="write_entries">
For each confirmed candidate:

**New entries:**
```bash
SLUG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" generate-slug "$TITLE" --raw)
```

Collision detection with incrementing suffix (-2, -3).

Write to `.planning/taste/${SLUG}.md`:
```markdown
---
id: ${SLUG}
domain: ${domain}
title: ${title}
status: active
confidence: ${confidence}
decision_count: ${decision_count}
source_phases:
  - "${phase1}"
  - "${phase2}"
tags:
  - ${tag1}
  - ${tag2}
times_applied: 0
times_overridden: 0
---

## Pattern

${pattern}

## When To Apply

${when_to_apply}
```

**Reinforcing merges:**
- Update existing entry's decision_count (add new evidence count)
- Append new source_phases to existing
- Update confidence if decision_count threshold crossed (e.g., MEDIUM -> HIGH at 3+)

**Contradicting replacements:**
- Archive old entry (rename with `.archived` suffix)
- Write new entry with combined source_phases
</step>

<step name="archive_logs">
Mark all processed logs as processed, regardless of whether any candidates were confirmed:

For each processed log file:
- Append `<!-- processed: yes -->` marker at the end of the file

This ensures logs aren't re-processed in future extraction runs.
</step>

<step name="git_commit">
Commit all new/modified taste entries and archived logs:

```bash
# Stage all new taste entries
# Stage all modified taste entries (reinforcing merges)
# Stage all modified log files (processed markers)
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: extract ${N} taste patterns from decision logs" --files .planning/taste/*.md .planning/decisions/*.md
```
</step>

<step name="show_summary">
Display extraction summary:

```
Taste extraction complete.

  Logs processed: ${COUNT}
  Candidates identified: ${total_candidates}
  New entries created: ${new_count}
  Existing entries reinforced: ${reinforced_count}
  Contradictions resolved: ${contradiction_count}
  Rejected by user: ${rejected_count}

New taste entries:
  - .planning/taste/${slug1}.md -- ${title1}
  - .planning/taste/${slug2}.md -- ${title2}

These tastes will be consulted during future /gsd:discuss-phase sessions.
```
</step>

</process>

<success_criteria>
- [ ] Taste directory initialized
- [ ] Unprocessed logs found and counted
- [ ] 3-log minimum gate enforced (exits gracefully if insufficient)
- [ ] All unprocessed logs read and parsed
- [ ] Recurring patterns identified across decision logs
- [ ] Candidates cross-referenced against existing entries
- [ ] Three-outcome classification applied (new, reinforcing, contradicting)
- [ ] Each candidate presented to user for confirmation
- [ ] Confirmed entries written to .planning/taste/
- [ ] All processed logs archived (<!-- processed: yes --> marker)
- [ ] Git commit with all changes
- [ ] Summary displayed with counts
</success_criteria>
