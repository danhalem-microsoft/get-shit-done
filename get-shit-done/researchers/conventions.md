---
name: conventions
output_file: CONVENTIONS.md
description: Coding standards, naming conventions, file organization, and enforceable style rules for the project
triggers:
  - conventions
  - style guide
  - naming conventions
  - lint
  - eslint
  - prettier
  - format
  - coding standards
  - commit conventions
  - husky
  - editorconfig
  - file organization
  - kebab-case
  - camelCase
---

<prompt_template>
Project Research — Conventions dimension for {DOMAIN}.

<milestone_context>
{MILESTONE_CONTEXT}
</milestone_context>

<question>
{RESEARCH_QUESTION}
</question>

<project_context>
{PROJECT_CONTEXT}
</project_context>

<scope_boundary>
FOCUS: Enforceable code style rules — naming, formatting, file organization, linting, commit conventions.
NOT IN SCOPE: Behavioral patterns like error handling, logging strategies, or design decisions (belongs to Architecture type).
NOT IN SCOPE: Data field naming and schema conventions (belongs to Data Model type).

HEURISTIC: If a linter can check it → Conventions. If it requires human judgment about design → Architecture.

Research the project's code style rules end-to-end: naming patterns by language, formatting configuration, linting rules, file organization, and commit conventions. Every recommendation MUST reference a specific aspect of the project context. If you cannot connect a recommendation to the project, omit it.
</scope_boundary>

<downstream_consumer>
Your CONVENTIONS.md feeds into roadmap creation and development workflow setup. Be prescriptive:
- Rule lists with enforcement mechanism (linter rule ID, pre-commit hook, manual review)
- File organization patterns with directory structure examples
- Naming patterns by language with concrete examples
- Formatter and linter configuration with specific settings
</downstream_consumer>

<quality_gate>
# Universal
- [ ] At least 3 recommendations explicitly reference project context (not generic best practices)
- [ ] Confidence level (HIGH/MEDIUM/LOW) assigned to each major recommendation with reasoning
- [ ] At least 2 sources cited per section (Context7, official docs, or URLs — not training data alone)

# Conventions specific
- [ ] Each convention specifies its enforcement mechanism (linter rule, pre-commit hook, manual review)
- [ ] Naming conventions cover at least: files, functions/methods, variables, constants, types/interfaces
</quality_gate>
</prompt_template>

<output_template>
# Conventions Research

**Domain:** {DOMAIN}
**Researched:** {DATE}
**Confidence:** [HIGH/MEDIUM/LOW]

## Naming Conventions <!-- REQUIRED -->

| Entity | Convention | Example | Enforcement |
|--------|-----------|---------|-------------|
| Files | [kebab-case/PascalCase/snake_case] | [example.ts] | [linter rule or manual review] |
| Functions/Methods | [camelCase/snake_case] | [getUserById] | [linter rule ID] |
| Variables | [camelCase/snake_case] | [userName] | [linter rule ID] |
| Constants | [SCREAMING_SNAKE/PascalCase] | [MAX_RETRIES] | [linter rule ID] |
| Types/Interfaces | [PascalCase] | [UserProfile] | [linter rule ID] |
| Components | [PascalCase] | [DashboardHeader] | [linter rule or file naming] |
| CSS classes | [BEM/kebab-case/utility] | [card__title] | [stylelint rule or manual review] |
| Database tables | [snake_case/PascalCase] | [user_sessions] | [migration linter or manual review] |
| API endpoints | [kebab-case/camelCase] | [/api/user-profiles] | [route linter or manual review] |
| Environment vars | [SCREAMING_SNAKE] | [DATABASE_URL] | [validation script] |

### Language-Specific Notes

[Any naming rules that are language-specific — e.g., Python uses snake_case for functions while TypeScript uses camelCase. Reference the project's primary language(s).]

## Code Formatting <!-- REQUIRED -->

### Formatter Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Formatter | [Prettier/Black/rustfmt/gofmt] | [why this formatter for this ecosystem] |
| Line length | [80/100/120] | [readability vs density tradeoff] |
| Indentation | [2 spaces/4 spaces/tabs] | [ecosystem convention] |
| Trailing commas | [all/es5/none] | [diff-friendliness vs compatibility] |
| Semicolons | [always/never] | [ASI safety vs cleanliness] |
| Quote style | [single/double] | [consistency choice] |

### Configuration File

```
[Example .prettierrc / pyproject.toml / .editorconfig snippet]
```

### Editor Integration

[How to configure the project's recommended editor to auto-format on save]

## Linting Rules <!-- REQUIRED -->

### Linter Selection

| Linter | Purpose | Configuration |
|--------|---------|--------------|
| [ESLint/Pylint/Clippy] | [what it checks] | [config file location] |
| [additional linter] | [what it checks] | [config file location] |

### Rule Configuration

| Category | Rules Enabled | Severity | Notes |
|----------|--------------|----------|-------|
| Code quality | [rule names/presets] | error/warn | [why these rules matter] |
| Style consistency | [rule names/presets] | error/warn | [what they enforce] |
| Security | [rule names/presets] | error | [what they catch] |
| Accessibility | [rule names/presets] | warn | [when applicable] |

### Custom Rules

[Any project-specific linting rules beyond standard presets, with justification]

## Import Organization <!-- OPTIONAL — omit if language has no import system -->

### Import Ordering

| Group | Example | Notes |
|-------|---------|-------|
| 1. Built-in modules | `import os` / `import path from 'node:path'` | [standard library first] |
| 2. External packages | `import React from 'react'` | [third-party dependencies] |
| 3. Internal aliases | `import { db } from '@/lib/database'` | [path-aliased project imports] |
| 4. Relative imports | `import { helper } from './utils'` | [same-directory or nearby imports] |
| 5. Type imports | `import type { User } from '@/types'` | [type-only imports last, if applicable] |

### Enforcement

[How import ordering is enforced — eslint-plugin-import, isort, organize-imports]

## File Organization <!-- REQUIRED -->

### Directory Structure

```
src/
├── [folder]/           # [purpose — what goes here]
│   ├── [subfolder]/    # [purpose]
│   └── [pattern].ts    # [naming pattern for files in this folder]
├── [folder]/           # [purpose]
└── [folder]/           # [purpose]
```

### Co-location Rules

| Artifact | Location | Rule |
|----------|----------|------|
| Tests | [next to source / __tests__ / tests/] | [co-locate vs centralize reasoning] |
| Types | [next to source / types/] | [co-locate vs centralize reasoning] |
| Styles | [CSS modules / styled / utility] | [where style files live] |
| Constants | [constants/ / inline] | [when to extract to file] |

### File Size Guidelines

| Metric | Guideline | Action When Exceeded |
|--------|-----------|---------------------|
| Lines per file | [200-400 recommended] | [split into modules] |
| Functions per file | [5-10 recommended] | [extract to separate file] |
| Exports per file | [1-5 recommended] | [barrel file or split] |

## Commit Conventions <!-- OPTIONAL — omit if team has no VCS workflow -->

### Message Format

```
type(scope): description

[optional body]

[optional footer]
```

### Allowed Types

| Type | When to Use | Example |
|------|-------------|---------|
| feat | New functionality | `feat(auth): add password reset flow` |
| fix | Bug fix | `fix(api): handle null user in response` |
| docs | Documentation only | `docs(readme): add setup instructions` |
| style | Formatting, no logic change | `style(lint): apply prettier formatting` |
| refactor | Code change, no behavior change | `refactor(db): extract query builder` |
| test | Adding or updating tests | `test(auth): add login edge cases` |
| chore | Build, CI, deps | `chore(deps): update react to 19.1` |

### Branch Naming

| Pattern | Example | When to Use |
|---------|---------|-------------|
| [pattern] | [feature/add-auth] | [feature work] |
| [pattern] | [fix/null-user-crash] | [bug fixes] |
| [pattern] | [chore/update-deps] | [maintenance] |

### Enforcement

[How commit conventions are enforced — commitlint, husky, git hooks]

## Code Comments <!-- OPTIONAL — omit if project uses self-documenting code philosophy -->

### When to Comment

| Situation | Comment? | Example |
|-----------|----------|---------|
| Complex algorithm | Yes — explain WHY | `// Binary search on sorted intervals — O(log n) vs O(n) linear scan` |
| Business rule | Yes — explain WHAT business rule | `// Regulatory requirement: retain records for 7 years` |
| Workaround | Yes — explain WHY and link issue | `// Workaround for SDK bug #1234 — remove after v2.1` |
| Obvious code | No | ~~`// increment counter`~~ |
| API documentation | Yes — use doc comments | `/** @param userId - The user's unique identifier */` |

### Doc Comment Format

```
[Example doc comment format for the project's primary language — JSDoc, docstring, rustdoc, etc.]
```

## Anti-Patterns <!-- REQUIRED -->

| Anti-Pattern | Why It's Wrong | What To Do Instead |
|-------------|----------------|-------------------|
| Inconsistent naming across files | Increases cognitive load; developers can't predict names from patterns | Pick one convention per entity type and enforce with linter rules |
| Partial formatter adoption | Merge conflicts from mixed formatting; some files auto-formatted, others not | Format entire codebase once, enforce on pre-commit for all files |
| Linting rules set to "warn" | Warnings accumulate and get ignored; effectively no enforcement | Set rules to "error" — if it matters enough to lint, it matters enough to block |
| No import organization | Import sections grow chaotic; duplicates and dead imports accumulate | Configure auto-sorting (isort, eslint-plugin-import) and enforce on save |
| Commit messages without type prefix | Git history becomes unsearchable; no way to filter by change type | Enforce conventional commits with commitlint + husky pre-commit hook |

## Sources <!-- REQUIRED -->

- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]
- [Source with URL] — [what was verified]

---
*Conventions research for: {DOMAIN}*
</output_template>
