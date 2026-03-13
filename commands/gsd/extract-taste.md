---
name: gsd:extract-taste
description: Extract taste patterns from decision logs
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Analyze unprocessed decision logs to identify recurring preference patterns,
cross-reference against existing taste entries, and create confirmed entries
in .planning/taste/.

Routes to the extract-taste workflow which handles:
- 11-step extraction flow from init through confirm
- 3-log minimum gate
- Three-outcome cross-referencing (new, reinforcing, contradicting)
- User confirmation before writing entries
- Processed log archival
</objective>

<execution_context>
@.planning/STATE.md
@~/.claude/get-shit-done/workflows/extract-taste.md
</execution_context>

<process>
**Follow the extract-taste workflow** from `@~/.claude/get-shit-done/workflows/extract-taste.md`.

The workflow handles all logic including:
1. Init taste directory and find unprocessed logs
2. 3-log minimum gate check
3. Read and parse decision logs
4. Identify recurring patterns
5. Cross-reference with existing taste entries
6. Present candidates with three-outcome classification
7. User confirms or rejects each candidate
8. Write confirmed entries to .planning/taste/
9. Archive processed logs
10. Show summary
</process>
