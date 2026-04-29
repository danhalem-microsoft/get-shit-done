# GSD Agent Reference

> Full role cards for the surviving 19 primary agents plus concise stubs for 3 advanced/specialized agents (22 shipped agents total after the Phase 1 cull). The `agents/` directory and [`docs/INVENTORY.md`](INVENTORY.md) are the authoritative roster; see [Architecture](ARCHITECTURE.md) for context.

---

## Overview

GSD uses a multi-agent architecture where thin orchestrators (workflow files) spawn specialized agents with fresh context windows. Each agent has a focused role, limited tool access, and produces specific artifacts.

### Agent Categories

> The table below covers the **19 primary agents** detailed in this section. Three additional shipped agents (pattern-mapper, code-reviewer, code-fixer) have concise stubs in the [Advanced and Specialized Agents](#advanced-and-specialized-agents) section below. For the authoritative 22-agent roster, see [`docs/INVENTORY.md`](INVENTORY.md) and the `agents/` directory.

| Category | Count | Agents |
|----------|-------|--------|
| Researchers | 2 | project-researcher, phase-researcher |
| Analyzers | 2 | assumptions-analyzer, advisor-researcher |
| Synthesizers | 1 | research-synthesizer |
| Planners | 1 | planner |
| Roadmappers | 1 | roadmapper |
| Executors | 1 | executor |
| Checkers | 2 | plan-checker, integration-checker |
| Verifiers | 1 | verifier |
| Auditors | 1 | security-auditor |
| Profilers | 1 | user-profiler |
| Critics | 6 | critic-plan, critic-code, critic-scope, critic-verify, critic-discuss, critic-strategy |

---

## Agent Details

### gsd-project-researcher

**Role:** Researches domain ecosystem before roadmap creation.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project`, `/gsd-new-milestone` |
| **Parallelism** | 4 instances (stack, features, architecture, pitfalls) |
| **Tools** | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model (balanced)** | Sonnet |
| **Produces** | `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` |

**Capabilities:**
- Web search for current ecosystem information
- Context7 MCP integration for library documentation
- Writes research documents directly to disk (reduces orchestrator context load)

---

### gsd-phase-researcher

**Role:** Researches how to implement a specific phase before planning.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` |
| **Parallelism** | 4 instances (same focus areas as project researcher) |
| **Tools** | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model (balanced)** | Sonnet |
| **Produces** | `{phase}-RESEARCH.md` |

**Capabilities:**
- Reads CONTEXT.md to focus research on user's decisions
- Investigates implementation patterns for the specific phase domain
- Detects test infrastructure for Nyquist validation mapping

### gsd-assumptions-analyzer

**Role:** Deeply analyzes codebase for a phase and returns structured assumptions with evidence, confidence levels, and consequences if wrong.

| Property | Value |
|----------|-------|
| **Spawned by** | `discuss-phase-assumptions` workflow (when `workflow.discuss_mode = 'assumptions'`) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | Cyan |
| **Produces** | Structured assumptions with decision statements, evidence file paths, confidence levels |

**Key behaviors:**
- Reads ROADMAP.md phase description and prior CONTEXT.md files
- Searches codebase for files related to the phase (components, patterns, similar features)
- Reads 5-15 most relevant source files to form evidence-based assumptions
- Classifies confidence: Confident (clear from code), Likely (reasonable inference), Unclear (could go multiple ways)
- Flags topics that need external research (library compatibility, ecosystem best practices)
- Output calibrated by tier: full_maturity (3-5 areas), standard (3-4), minimal_decisive (2-3)

---

### gsd-advisor-researcher

**Role:** Researches a single gray area decision during discuss-phase advisor mode and returns a structured comparison table.

| Property | Value |
|----------|-------|
| **Spawned by** | `discuss-phase` workflow (when ADVISOR_MODE = true) |
| **Parallelism** | Multiple instances (one per gray area) |
| **Tools** | Read, Bash, Grep, Glob, WebSearch, WebFetch, mcp (context7) |
| **Model (balanced)** | Sonnet |
| **Color** | Cyan |
| **Produces** | 5-column comparison table (Option / Pros / Cons / Complexity / Recommendation) with rationale paragraph |

**Key behaviors:**
- Researches a single assigned gray area using Claude's knowledge, Context7, and web search
- Produces genuinely viable options — no padding with filler alternatives
- Complexity column uses impact surface + risk (never time estimates)
- Recommendations are conditional ("Rec if X", "Rec if Y") — never single-winner ranking
- Output calibrated by tier: full_maturity (3-5 options with maturity signals), standard (2-4), minimal_decisive (2 options, decisive recommendation)

---

### gsd-research-synthesizer

**Role:** Combines outputs from parallel researchers into a unified summary.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project` (after 4 researchers complete) |
| **Parallelism** | Single instance (sequential after researchers) |
| **Tools** | Read, Write, Bash |
| **Model (balanced)** | Sonnet |
| **Color** | Purple |
| **Produces** | `.planning/research/SUMMARY.md` |

---

### gsd-planner

**Role:** Creates executable phase plans with task breakdown, dependency analysis, and goal-backward verification.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase`, `/gsd-quick` |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Glob, Grep, WebFetch, mcp (context7) |
| **Model (balanced)** | Opus |
| **Color** | Green |
| **Produces** | `{phase}-{N}-PLAN.md` files |

**Key behaviors:**
- Reads PROJECT.md, REQUIREMENTS.md, CONTEXT.md, RESEARCH.md
- Creates 2-3 atomic task plans sized for single context windows
- Uses XML structure with `<task>` elements
- Includes `read_first` and `acceptance_criteria` sections
- Groups plans into dependency waves
- Performs reachability check to validate plan steps reference accessible files and APIs (v1.32)

---

### gsd-roadmapper

**Role:** Creates project roadmaps with phase breakdown and requirement mapping.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-new-project` |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Glob, Grep |
| **Model (balanced)** | Sonnet |
| **Color** | Purple |
| **Produces** | `ROADMAP.md` |

**Key behaviors:**
- Maps requirements to phases (traceability)
- Derives success criteria from requirements
- Respects granularity setting for phase count
- Validates coverage (every v1 requirement mapped to a phase)

---

### gsd-executor

**Role:** Executes GSD plans with atomic commits, deviation handling, and checkpoint protocols.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase`, `/gsd-quick` |
| **Parallelism** | Multiple (parallel within waves, sequential across waves) |
| **Tools** | Read, Write, Edit, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | Yellow |
| **Produces** | Code changes, git commits, `{phase}-{N}-SUMMARY.md` |

**Key behaviors:**
- Fresh 200K context window per plan
- Follows XML task instructions precisely
- Atomic git commit per completed task
- Handles checkpoint types: auto, human-verify, decision, human-action
- Reports deviations from plan in SUMMARY.md
- Invokes node repair on verification failure

---

### gsd-plan-checker

**Role:** Verifies plans will achieve phase goals before execution.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` (verification loop, max 3 iterations) |
| **Parallelism** | Single instance (iterative) |
| **Tools** | Read, Bash, Glob, Grep |
| **Model (balanced)** | Sonnet |
| **Color** | Green |
| **Produces** | PASS/FAIL verdict with specific feedback |

**8 Verification Dimensions:**
1. Requirement coverage
2. Task atomicity
3. Dependency ordering
4. File scope
5. Verification commands
6. Context fit
7. Gap detection
8. Nyquist compliance (when enabled)

---

### gsd-integration-checker

**Role:** Verifies cross-phase integration and end-to-end flows.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-verify-work` (and milestone-completion flows) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | Blue |
| **Produces** | Integration verification report |

### gsd-verifier

**Role:** Verifies phase goal achievement through goal-backward analysis.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-execute-phase` (after all executors complete) |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | Green |
| **Produces** | `{phase}-VERIFICATION.md` |

**Key behaviors:**
- Checks codebase against phase goals, not just task completion
- PASS/FAIL with specific evidence
- Logs issues for `/gsd-verify-work` to address
- Milestone scope filtering: gaps addressed in later phases are marked as "deferred", not reported as failures (v1.32)
- **Test quality audit** (v1.32): verifies that tests prove what they claim by checking for disabled/skipped tests on requirements, circular test patterns (system generating its own expected values), assertion strength (existence vs. value vs. behavioral), and expected value provenance. Blockers from test quality audit override an otherwise passing verification

### gsd-user-profiler

**Role:** Analyzes session messages across 8 behavioral dimensions to produce a scored developer profile.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-profile-user` |
| **Parallelism** | Single instance |
| **Tools** | Read |
| **Model (balanced)** | Sonnet |
| **Color** | Magenta |
| **Produces** | `USER-PROFILE.md`, `/gsd-dev-preferences`, `CLAUDE.md` profile section |

**Behavioral Dimensions:**
Communication style, decision patterns, debugging approach, UX preferences, vendor choices, frustration triggers, learning style, explanation depth.

**Key behaviors:**
- Read-only agent — analyzes extracted session data, does not modify files
- Produces scored dimensions with confidence levels and evidence citations
- Questionnaire fallback when session history is unavailable

### gsd-security-auditor

**Role:** Verifies threat mitigations from PLAN.md threat model exist in implemented code.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-secure-phase` |
| **Parallelism** | Single instance |
| **Tools** | Read, Write, Edit, Bash, Glob, Grep |
| **Model (balanced)** | Sonnet |
| **Color** | `#EF4444` (red) |
| **Produces** | `{phase}-SECURITY.md` |

**Key behaviors:**
- Verifies each threat by its declared disposition (mitigate / accept / transfer)
- Does NOT scan blindly for new vulnerabilities — verifies declared mitigations only
- Implementation files are read-only — never patches implementation code
- Unmitigated threats reported as OPEN_THREATS or ESCALATE
- Supports ASVS levels 1/2/3 for verification depth

---

## Advanced and Specialized Agents

Three additional agents ship under `agents/gsd-*.md` and are used by the planner pipeline plus the consolidated quality-gate review (`/gsd-review --code` and `--code-fix`). Each carries full frontmatter in its agent file; the stubs below are concise by design. The authoritative roster (with spawner and primary-doc status per agent) lives in [`docs/INVENTORY.md`](INVENTORY.md).

### gsd-pattern-mapper

**Role:** Read-only codebase analysis that maps files-to-be-created or modified to their closest existing analogs, producing `PATTERNS.md` for the planner to consume.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-plan-phase` (between research and planning) |
| **Parallelism** | Single instance |
| **Tools** | Read, Bash, Glob, Grep, Write |
| **Model (balanced)** | Sonnet |
| **Color** | Magenta |
| **Produces** | `PATTERNS.md` in the phase directory |

**Key behaviors:**
- Extracts file list from CONTEXT.md and RESEARCH.md; classifies each by role (controller, component, service, model, middleware, utility, config, test) and data flow (CRUD, streaming, file I/O, event-driven, request-response)
- Searches for the closest existing analog per file and extracts concrete code excerpts (imports, auth patterns, core pattern, error handling)
- Strictly read-only against source; only writes `PATTERNS.md`

### gsd-code-reviewer

**Role:** Reviews source files for bugs, security vulnerabilities, and code-quality problems; produces a structured `REVIEW.md` with severity-classified findings.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-code-review` |
| **Parallelism** | Typically single instance per review scope |
| **Tools** | Read, Write, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | `#F59E0B` (amber) |
| **Produces** | `REVIEW.md` in the phase directory |

**Key behaviors:**
- Detects bugs (logic errors, null/undefined checks, off-by-one, type mismatches, unreachable code), security issues (injection, XSS, hardcoded secrets, insecure crypto), and quality issues
- Honors `CLAUDE.md` project conventions and `.claude/skills/` / `.agents/skills/` rules when present
- Read-only against implementation source — never modifies code under review

---

### gsd-code-fixer

**Role:** Applies fixes to findings from `REVIEW.md` with intelligent (non-blind) patching and atomic per-fix commits; produces `REVIEW-FIX.md`.

| Property | Value |
|----------|-------|
| **Spawned by** | `/gsd-code-review-fix` |
| **Parallelism** | Single instance |
| **Tools** | Read, Edit, Write, Bash, Grep, Glob |
| **Model (balanced)** | Sonnet |
| **Color** | `#10B981` (emerald) |
| **Produces** | `REVIEW-FIX.md`; one atomic git commit per applied fix |

**Key behaviors:**
- Treats `REVIEW.md` suggestions as guidance, not a patch to apply literally
- Commits each fix atomically so review and rollback stay granular
- Honors `CLAUDE.md` and project-skill rules during fixes

## Agent Tool Permissions Summary

> **Scope:** this table covers the 21 primary agents only. The 12 advanced/specialized agents listed above carry their own tool surfaces in their `agents/gsd-*.md` frontmatter (summarized in the per-agent stubs above and in [`docs/INVENTORY.md`](INVENTORY.md)).

| Agent | Read | Write | Edit | Bash | Grep | Glob | WebSearch | WebFetch | MCP |
|-------|------|-------|------|------|------|------|-----------|----------|-----|
| project-researcher | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| phase-researcher | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ui-researcher | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| assumptions-analyzer | ✓ | | | ✓ | ✓ | ✓ | | | |
| advisor-researcher | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| research-synthesizer | ✓ | ✓ | | ✓ | | | | | |
| planner | ✓ | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ |
| roadmapper | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| executor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| plan-checker | ✓ | | | ✓ | ✓ | ✓ | | | |
| integration-checker | ✓ | | | ✓ | ✓ | ✓ | | | |
| ui-checker | ✓ | | | ✓ | ✓ | ✓ | | | |
| verifier | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| nyquist-auditor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| ui-auditor | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| codebase-mapper | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| debugger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| user-profiler | ✓ | | | | | | | | |
| doc-writer | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| doc-verifier | ✓ | ✓ | | ✓ | ✓ | ✓ | | | |
| security-auditor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |

**Principle of Least Privilege:**
- Checkers are read-only (no Write/Edit) — they evaluate, never modify
- Researchers have web access — they need current ecosystem information
- Executors have Edit — they modify code but not web access
- Mappers have Write — they write analysis documents but not Edit (no code changes)
