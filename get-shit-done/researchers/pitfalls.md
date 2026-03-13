---
name: pitfalls
output_file: PITFALLS.md
description: Common mistakes, technical debt traps, and domain-specific gotchas to avoid
triggers:
  - pitfalls
  - common mistakes
  - gotchas
  - anti-patterns
  - technical debt
  - failure modes
  - edge cases
  - scaling issues
  - security risks
---

<prompt_template>
Project Research — Pitfalls dimension for {DOMAIN}.

<milestone_context>
{MILESTONE_CONTEXT}
</milestone_context>

<question>
{RESEARCH_QUESTION}
</question>

<project_context>
{PROJECT_CONTEXT}
</project_context>

<downstream_consumer>
Your PITFALLS.md prevents mistakes in roadmap/planning. For each pitfall:
- Warning signs (how to detect early)
- Prevention strategy (how to avoid)
- Which phase should address it
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Pitfalls specific
- [ ] Pitfalls are specific to this domain (not generic advice)
- [ ] Prevention strategies are actionable
- [ ] Phase mapping included where relevant
</quality_gate>
</prompt_template>

<output_template>
# Pitfalls Research

**Domain:** [domain type]
**Researched:** [date]
**Confidence:** [HIGH/MEDIUM/LOW]

## Critical Pitfalls

### Pitfall 1: [Name]

**What goes wrong:**
[Description of the failure mode]

**Why it happens:**
[Root cause — why developers make this mistake]

**How to avoid:**
[Specific prevention strategy]

**Warning signs:**
[How to detect this early before it becomes a problem]

**Phase to address:**
[Which roadmap phase should prevent this]

---

### Pitfall 2: [Name]

**What goes wrong:**
[Description of the failure mode]

**Why it happens:**
[Root cause — why developers make this mistake]

**How to avoid:**
[Specific prevention strategy]

**Warning signs:**
[How to detect this early before it becomes a problem]

**Phase to address:**
[Which roadmap phase should prevent this]

---

### Pitfall 3: [Name]

**What goes wrong:**
[Description of the failure mode]

**Why it happens:**
[Root cause — why developers make this mistake]

**How to avoid:**
[Specific prevention strategy]

**Warning signs:**
[How to detect this early before it becomes a problem]

**Phase to address:**
[Which roadmap phase should prevent this]

---

[Continue for all critical pitfalls...]

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| [shortcut] | [benefit] | [cost] | [conditions, or "never"] |
| [shortcut] | [benefit] | [cost] | [conditions, or "never"] |
| [shortcut] | [benefit] | [cost] | [conditions, or "never"] |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| [service] | [what people do wrong] | [what to do instead] |
| [service] | [what people do wrong] | [what to do instead] |
| [service] | [what people do wrong] | [what to do instead] |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| [trap] | [how you notice] | [how to avoid] | [scale threshold] |
| [trap] | [how you notice] | [how to avoid] | [scale threshold] |
| [trap] | [how you notice] | [how to avoid] | [scale threshold] |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| [mistake] | [what could happen] | [how to avoid] |
| [mistake] | [what could happen] | [how to avoid] |
| [mistake] | [what could happen] | [how to avoid] |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| [pitfall] | [how users suffer] | [what to do instead] |
| [pitfall] | [how users suffer] | [what to do instead] |
| [pitfall] | [how users suffer] | [what to do instead] |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **[Feature]:** Often missing [thing] — verify [check]
- [ ] **[Feature]:** Often missing [thing] — verify [check]
- [ ] **[Feature]:** Often missing [thing] — verify [check]
- [ ] **[Feature]:** Often missing [thing] — verify [check]

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| [pitfall] | LOW/MEDIUM/HIGH | [what to do] |
| [pitfall] | LOW/MEDIUM/HIGH | [what to do] |
| [pitfall] | LOW/MEDIUM/HIGH | [what to do] |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| [pitfall] | Phase [X] | [how to verify prevention worked] |
| [pitfall] | Phase [X] | [how to verify prevention worked] |
| [pitfall] | Phase [X] | [how to verify prevention worked] |

## Sources

- [Post-mortems referenced]
- [Community discussions]
- [Official "gotchas" documentation]
- [Personal experience / known issues]

---
*Pitfalls research for: [domain]*
*Researched: [date]*
</output_template>
