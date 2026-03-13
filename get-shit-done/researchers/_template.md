---
# RESEARCHER TYPE DEFINITION
# Copy this file to create a custom researcher type.
#
# Required fields:
#   name: unique identifier (kebab-case recommended)
#   output_file: filename this researcher writes (e.g., SECURITY.md)
#   description: one-line description of what this researcher investigates
#
# Optional fields:
#   triggers: keyword list for AI relevance matching (recommended for discoverability)
#
# Save to: ~/.claude/get-shit-done/researchers/custom/your-type.md
# It will be automatically discovered on next /gsd:new-project or /gsd:new-milestone.

name: my-custom-research
output_file: MY-RESEARCH.md
description: What this researcher investigates and why it matters
# triggers: (optional — helps AI match your type to relevant projects)
#   - keyword one
#   - keyword two
#   - keyword three
---

<prompt_template>
Project Research — {name} dimension for {DOMAIN}.

<milestone_context>
{MILESTONE_CONTEXT}
</milestone_context>

<question>
What do I need to know about [your research dimension] for {DOMAIN}?
</question>

<project_context>
{PROJECT_CONTEXT}
</project_context>

<downstream_consumer>
Your {output_file} feeds into [what consumes this output]. Be prescriptive:
- [Specific guidance for this research dimension]
- [What format the output should take]
- [What the consumer needs to make decisions]
</downstream_consumer>

<quality_gate>
# Universal (recommended for all types)
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Custom (add your domain-specific checks)
- [ ] [Quality criterion 1]
- [ ] [Quality criterion 2]
- [ ] [Quality criterion 3]
</quality_gate>
</prompt_template>

<output_template>
# [Research Dimension Name]

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## [Main Section]

[Your output template structure here]

## Sources

- [Sources]

---
*[Dimension] research for: {DOMAIN}*
*Researched: {DATE}*
</output_template>
