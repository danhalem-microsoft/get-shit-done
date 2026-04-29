# GSD Command Reference

> Command syntax, flags, options, and examples for stable commands. For feature details, see [Feature Reference](FEATURES.md). For workflow walkthroughs, see [User Guide](USER-GUIDE.md).

---

## Command Syntax

- **Claude Code / Gemini / Copilot:** `/gsd-command-name [args]`
- **OpenCode / Kilo:** `/gsd-command-name [args]`
- **Codex:** `$gsd-command-name [args]`

---

## Core Workflow Commands

### `/gsd-new-project`

Initialize a new project with deep context gathering.

| Flag | Description |
|------|-------------|
| `--auto @file.md` | Auto-extract from document, skip interactive questions |

**Prerequisites:** No existing `.planning/PROJECT.md`
**Produces:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `research/`, `CLAUDE.md`

```bash
/gsd-new-project                    # Interactive mode
/gsd-new-project --auto @prd.md     # Auto-extract from PRD
```

---

### `/gsd-new-workspace`

Create an isolated workspace with repo copies and independent `.planning/` directory.

| Flag | Description |
|------|-------------|
| `--name <name>` | Workspace name (required) |
| `--repos repo1,repo2` | Comma-separated repo paths or names |
| `--path /target` | Target directory (default: `~/gsd-workspaces/<name>`) |
| `--strategy worktree\|clone` | Copy strategy (default: `worktree`) |
| `--branch <name>` | Branch to checkout (default: `workspace/<name>`) |
| `--auto` | Skip interactive questions |

**Use cases:**
- Multi-repo: work on a subset of repos with isolated GSD state
- Feature isolation: `--repos .` creates a worktree of the current repo

**Produces:** `WORKSPACE.md`, `.planning/`, repo copies (worktrees or clones)

```bash
/gsd-new-workspace --name feature-b --repos hr-ui,ZeymoAPI
/gsd-new-workspace --name feature-b --repos . --strategy worktree  # Same-repo isolation
/gsd-new-workspace --name spike --repos api,web --strategy clone   # Full clones
```

---

### `/gsd-list-workspaces`

List active GSD workspaces and their status.

**Scans:** `~/gsd-workspaces/` for `WORKSPACE.md` manifests
**Shows:** Name, repo count, strategy, GSD project status

```bash
/gsd-list-workspaces
```

---

### `/gsd-remove-workspace`

Remove a workspace and clean up git worktrees.

| Argument | Required | Description |
|----------|----------|-------------|
| `<name>` | Yes | Workspace name to remove |

**Safety:** Refuses removal if any repo has uncommitted changes. Requires name confirmation.

```bash
/gsd-remove-workspace feature-b
```

---

### `/gsd-discuss-phase`

Capture implementation decisions before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

| Flag | Description |
|------|-------------|
| `--all` | Skip area selection — discuss all gray areas interactively (no auto-advance) |
| `--auto` | Auto-select recommended defaults for all questions |
| `--batch` | Group questions for batch intake instead of one-by-one |
| `--analyze` | Add trade-off analysis during discussion |
| `--power` | File-based bulk question answering from a prepared answers file |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-CONTEXT.md`, `{phase}-DISCUSSION-LOG.md` (audit trail)

```bash
/gsd-discuss-phase 1                # Interactive discussion for phase 1
/gsd-discuss-phase 1 --all          # Discuss all gray areas without selection step
/gsd-discuss-phase 3 --auto         # Auto-select defaults for phase 3
/gsd-discuss-phase --batch          # Batch mode for current phase
/gsd-discuss-phase 2 --analyze      # Discussion with trade-off analysis
/gsd-discuss-phase 1 --power        # Bulk answers from file
```

### `/gsd-plan-phase`

Research, plan, and verify a phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to next unplanned phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Skip interactive confirmations |
| `--research` | Force re-research even if RESEARCH.md exists |
| `--skip-research` | Skip domain research step |
| `--gaps` | Gap closure mode (reads VERIFICATION.md, skips research) |
| `--skip-verify` | Skip plan checker verification loop |
| `--prd <file>` | Use a PRD file instead of discuss-phase for context |
| `--reviews` | Replan with cross-AI review feedback from REVIEWS.md |
| `--validate` | Run state validation before planning begins |
| `--bounce` | Run external plan bounce validation after planning (uses `workflow.plan_bounce_script`) |
| `--skip-bounce` | Skip plan bounce even if enabled in config |

**Prerequisites:** `.planning/ROADMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`, `{phase}-VALIDATION.md`

```bash
/gsd-plan-phase 1                   # Research + plan + verify phase 1
/gsd-plan-phase 3 --skip-research   # Plan without research (familiar domain)
/gsd-plan-phase --auto              # Non-interactive planning
/gsd-plan-phase 2 --validate        # Validate state before planning
/gsd-plan-phase 1 --bounce          # Plan + external bounce validation
```

---

### `/gsd-plan-review-convergence`

Cross-AI plan convergence loop. Runs `plan-phase → review → replan → re-review` cycles until no HIGH concerns remain (max 3 cycles by default). Spawns isolated agents for planning and review; orchestrator handles loop control, HIGH-concern counting, stall detection, and escalation.

| Argument / Flag | Required | Description |
|-----------------|----------|-------------|
| `N` | **Yes** | Phase number to plan and review |
| `--codex` / `--gemini` / `--claude` / `--opencode` | No | Single-reviewer selection |
| `--all` | No | Run every configured reviewer in parallel |
| `--max-cycles N` | No | Override cycle cap (default 3) |

**Exit behavior:** Loop exits when HIGH count hits zero. Stall detection warns when HIGH count is not decreasing across cycles. Escalation gate asks the user to proceed or review manually when `--max-cycles` is hit with HIGH concerns still open.

```bash
/gsd-plan-review-convergence 3                    # Default reviewers, 3 cycles
/gsd-plan-review-convergence 3 --codex            # Codex-only review
/gsd-plan-review-convergence 3 --all --max-cycles 5
```

### `/gsd-execute-phase`

Execute all plans in a phase with wave-based parallelization, or run a specific wave.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to execute |
| `--wave N` | No | Execute only Wave `N` in the phase |
| `--validate` | No | Run state validation before execution begins |
| `--cross-ai` | No | Delegate execution to an external AI CLI (uses `workflow.cross_ai_command`) |
| `--no-cross-ai` | No | Force local execution even if cross-AI is enabled in config |

**Prerequisites:** Phase has PLAN.md files
**Produces:** per-plan `{phase}-{N}-SUMMARY.md`, git commits, and `{phase}-VERIFICATION.md` when the phase is fully complete

```bash
/gsd-execute-phase 1                # Execute phase 1
/gsd-execute-phase 1 --wave 2       # Execute only Wave 2
/gsd-execute-phase 1 --validate     # Validate state before execution
/gsd-execute-phase 2 --cross-ai     # Delegate phase 2 to external AI CLI
```

---

### `/gsd-verify-work`

User acceptance testing with auto-diagnosis.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Phase has been executed
**Produces:** `{phase}-UAT.md`, fix plans if issues found

```bash
/gsd-verify-work 1                  # UAT for phase 1
```

### `/gsd-complete-milestone`

Archive milestone, tag release.

**Prerequisites:** Milestone audit complete (recommended)
**Produces:** `MILESTONES.md` entry, git tag

```bash
/gsd-complete-milestone
```

### `/gsd-new-milestone`

Start next version cycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Milestone name |
| `--reset-phase-numbers` | No | Restart the new milestone at Phase 1 and archive old phase dirs before roadmapping |

**Prerequisites:** Previous milestone completed
**Produces:** Updated `PROJECT.md`, new `REQUIREMENTS.md`, new `ROADMAP.md`

```bash
/gsd-new-milestone                  # Interactive
/gsd-new-milestone "v2.0 Mobile"    # Named milestone
/gsd-new-milestone --reset-phase-numbers "v2.0 Mobile"  # Restart milestone numbering at 1
```

---

## Phase Management Commands

### `/gsd-add-phase`

Append new phase to roadmap.

```bash
/gsd-add-phase                      # Interactive — describe the phase
```

### `/gsd-insert-phase`

Insert urgent work between phases using decimal numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Insert after this phase number |

```bash
/gsd-insert-phase 3                 # Insert between phase 3 and 4 → creates 3.1
```

### `/gsd-remove-phase`

Remove future phase and renumber subsequent phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number to remove |

```bash
/gsd-remove-phase 7                 # Remove phase 7, renumber 8→7, 9→8, etc.
```

### `/gsd-research-phase`

Deep ecosystem research only (standalone — usually use `/gsd-plan-phase` instead).

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd-research-phase 4               # Research phase 4 domain
```

### `/gsd-validate-phase`

Retroactively audit and fill Nyquist validation gaps.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/gsd-validate-phase 2               # Audit test coverage for phase 2
```

---

## Navigation Commands

### `/gsd-progress`

Show status and next steps.

| Flag | Description |
|------|-------------|
| `--forensic` | Append a 6-check integrity audit after the standard report (STATE consistency, orphaned handoffs, deferred scope drift, memory-flagged pending work, blocking todos, uncommitted code) |

```bash
/gsd-progress                       # "Where am I? What's next?"
/gsd-progress --forensic            # Standard report + integrity audit
```

### `/gsd-resume-work`

Restore full context from last session.

```bash
/gsd-resume-work                    # After context reset or new session
```

### `/gsd-pause-work`

Save context handoff when stopping mid-phase.

```bash
/gsd-pause-work                     # Creates continue-here.md
```

### `/gsd-help`

Show all commands and usage guide.

```bash
/gsd-help                           # Quick reference
```

---

## Utility Commands

### `/gsd-quick`

Execute ad-hoc task with GSD guarantees.

| Flag | Description |
|------|-------------|
| `--full` | Enable the complete quality pipeline — discussion + research + plan-checking + verification |
| `--validate` | Plan-checking (max 2 iterations) + post-execution verification only; no discussion or research |
| `--discuss` | Lightweight pre-planning discussion |
| `--research` | Spawn focused researcher before planning |

Granular flags are composable: `--discuss --research --validate` is equivalent to `--full`.

| Subcommand | Description |
|------------|-------------|
| `list` | List all quick tasks with status |
| `status <slug>` | Show status of a specific quick task |
| `resume <slug>` | Resume a specific quick task by slug |

```bash
/gsd-quick                          # Basic quick task
/gsd-quick --discuss --research     # Discussion + research + planning
/gsd-quick --validate               # Plan-checking + verification only
/gsd-quick --full                   # Complete quality pipeline
/gsd-quick list                     # List all quick tasks
/gsd-quick status my-task-slug      # Show status of a quick task
/gsd-quick resume my-task-slug      # Resume a quick task
```

### `/gsd-add-todo`

Capture idea or task for later.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Todo description |

```bash
/gsd-add-todo "Consider adding dark mode support"
```

### `/gsd-check-todos`

List pending todos and select one to work on.

```bash
/gsd-check-todos
```

### `/gsd-profile-user`

Generate a developer behavioral profile from Claude Code session analysis across 8 dimensions (communication style, decision patterns, debugging approach, UX preferences, vendor choices, frustration triggers, learning style, explanation depth). Produces artifacts that personalize Claude's responses.

| Flag | Description |
|------|-------------|
| `--questionnaire` | Use interactive questionnaire instead of session analysis |
| `--refresh` | Re-analyze sessions and regenerate profile |

**Generated artifacts:**
- `USER-PROFILE.md` — Full behavioral profile
- `/gsd-dev-preferences` command — Load preferences in any session
- `CLAUDE.md` profile section — Auto-discovered by Claude Code

```bash
/gsd-profile-user                   # Analyze sessions and build profile
/gsd-profile-user --questionnaire   # Interactive questionnaire fallback
/gsd-profile-user --refresh         # Re-generate from fresh analysis
```

## Spiking & Sketching Commands

## Diagnostics Commands

### `/gsd-extract-learnings`

Extract reusable patterns, anti-patterns, and architectural decisions from completed phase work.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to extract learnings from |

| Flag | Description |
|------|-------------|
| `--all` | Extract learnings from all completed phases |
| `--format` | Output format: `markdown` (default), `json` |

**Prerequisites:** Phase has been executed (SUMMARY.md files exist)
**Produces:** `.planning/learnings/{phase}-LEARNINGS.md`

**Extracts:**
- Architectural decisions and their rationale
- Patterns that worked well (reusable in future phases)
- Anti-patterns encountered and how they were resolved
- Technology-specific insights
- Performance and testing observations

```bash
/gsd-extract-learnings 3                    # Extract learnings from phase 3
/gsd-extract-learnings --all                # Extract from all completed phases
```

---

## Workstream Management

### `/gsd-workstreams`

Manage parallel workstreams for concurrent work on different milestone areas.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `list` | List all workstreams with status (default if no subcommand) |
| `create <name>` | Create a new workstream |
| `status <name>` | Detailed status for one workstream |
| `switch <name>` | Set active workstream |
| `progress` | Progress summary across all workstreams |
| `complete <name>` | Archive a completed workstream |
| `resume <name>` | Resume work in a workstream |

**Prerequisites:** Active GSD project
**Produces:** Workstream directories under `.planning/`, state tracking per workstream

```bash
/gsd-workstreams                    # List all workstreams
/gsd-workstreams create backend-api # Create new workstream
/gsd-workstreams switch backend-api # Set active workstream
/gsd-workstreams status backend-api # Detailed status
/gsd-workstreams progress           # Cross-workstream progress overview
/gsd-workstreams complete backend-api  # Archive completed workstream
/gsd-workstreams resume backend-api    # Resume work in workstream
```

---

## Configuration Commands

### `/gsd-settings`

Interactive configuration of workflow toggles and model profile.

```bash
/gsd-settings                       # Interactive config
```

### `/gsd-set-profile`

Quick profile switch.

| Argument | Required | Description |
|----------|----------|-------------|
| `profile` | **Yes** | `quality`, `balanced`, `budget`, or `inherit` |

```bash
/gsd-set-profile budget             # Switch to budget profile
/gsd-set-profile quality            # Switch to quality profile
```

---

## Brownfield Commands

## AI Integration Commands

## Update Commands

### `/gsd-update`

Update GSD with changelog preview.

```bash
/gsd-update                         # Check for updates and install
```

### `/gsd-reapply-patches`

Restore local modifications after a GSD update.

```bash
/gsd-reapply-patches                # Merge back local changes
```

---

## Code Quality Commands

### `/gsd-code-review`

Review source files changed during a phase for bugs, security vulnerabilities, and code quality problems.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number whose changes to review (e.g., `2` or `02`) |
| `--depth=quick\|standard\|deep` | No | Review depth level (overrides `workflow.code_review_depth` config). `quick`: pattern-matching only (~2 min). `standard`: per-file analysis with language-specific checks (~5–15 min, default). `deep`: cross-file analysis including import graphs and call chains (~15–30 min) |
| `--files file1,file2,...` | No | Explicit comma-separated file list; skips SUMMARY/git scoping entirely |

**Prerequisites:** Phase has been executed and has SUMMARY.md or git history
**Produces:** `{phase}-REVIEW.md` in phase directory with severity-classified findings
**Spawns:** `gsd-code-reviewer` agent

```bash
/gsd-code-review 3                          # Standard review for phase 3
/gsd-code-review 2 --depth=deep             # Deep cross-file review
/gsd-code-review 4 --files src/auth.ts,src/token.ts  # Explicit file list
```

---

### `/gsd-code-review-fix`

Auto-fix issues found by `/gsd-code-review`. Reads `REVIEW.md`, spawns a fixer agent, commits each fix atomically, and produces a `REVIEW-FIX.md` summary.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number whose REVIEW.md to fix |
| `--all` | No | Include Info findings in fix scope (default: Critical + Warning only) |
| `--auto` | No | Enable fix + re-review iteration loop, capped at 3 iterations |

**Prerequisites:** Phase has a `{phase}-REVIEW.md` file (run `/gsd-code-review` first)
**Produces:** `{phase}-REVIEW-FIX.md` with applied fixes summary
**Spawns:** `gsd-code-fixer` agent

```bash
/gsd-code-review-fix 3                      # Fix Critical + Warning findings for phase 3
/gsd-code-review-fix 3 --all               # Include Info findings
/gsd-code-review-fix 3 --auto              # Fix and re-review until clean (max 3 iterations)
```

## Fast & Inline Commands

### `/gsd-review`

Cross-AI peer review of phase plans from external AI CLIs.

| Argument | Required | Description |
|----------|----------|-------------|
| `--phase N` | **Yes** | Phase number to review |

| Flag | Description |
|------|-------------|
| `--gemini` | Include Gemini CLI review |
| `--claude` | Include Claude CLI review (separate session) |
| `--codex` | Include Codex CLI review |
| `--coderabbit` | Include CodeRabbit review |
| `--opencode` | Include OpenCode review (via GitHub Copilot) |
| `--qwen` | Include Qwen Code review (Alibaba Qwen models) |
| `--cursor` | Include Cursor agent review |
| `--all` | Include all available CLIs |

**Produces:** `{phase}-REVIEWS.md` — consumable by `/gsd-plan-phase --reviews`

```bash
/gsd-review --phase 3 --all
/gsd-review --phase 2 --gemini
```

---

### `/gsd-pr-branch`

Create a clean PR branch by filtering out `.planning/` commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `target branch` | No | Base branch (default: `main`) |

**Purpose:** Reviewers see only code changes, not GSD planning artifacts.

```bash
/gsd-pr-branch                     # Filter against main
/gsd-pr-branch develop             # Filter against develop
```

### `/gsd-secure-phase`

Retroactively verify threat mitigations for a completed phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `phase number` | No | Phase to audit (default: last completed phase) |

**Prerequisites:** Phase must have been executed. Works with or without existing SECURITY.md.
**Produces:** `{phase}-SECURITY.md` with threat verification results
**Spawns:** `gsd-security-auditor` agent

Three operating modes:
1. SECURITY.md exists — audit and verify existing mitigations
2. No SECURITY.md but PLAN.md has threat model — generate from artifacts
3. Phase not executed — exits with guidance

```bash
/gsd-secure-phase                   # Audit last completed phase
/gsd-secure-phase 5                 # Audit specific phase
```

## Backlog & Thread Commands

## State Management Commands

### `state validate`

Detect drift between STATE.md and the actual filesystem.

**Prerequisites:** `.planning/STATE.md` exists
**Produces:** Validation report showing any drift between STATE.md fields and filesystem reality

```bash
node gsd-tools.cjs state validate
```

---

### `state sync [--verify]`

Reconstruct STATE.md from actual project state on disk.

| Flag | Description |
|------|-------------|
| `--verify` | Dry-run mode — show proposed changes without writing |

**Prerequisites:** `.planning/` directory exists
**Produces:** Updated `STATE.md` reflecting filesystem reality

```bash
node gsd-tools.cjs state sync             # Reconstruct STATE.md from disk
node gsd-tools.cjs state sync --verify    # Dry-run: show changes without writing
```

---

### `state planned-phase`

Record state transition after plan-phase completes (Planned/Ready to execute).

| Flag | Description |
|------|-------------|
| `--phase N` | Phase number that was planned |
| `--plans N` | Number of plans generated |

**Prerequisites:** Phase has been planned
**Produces:** Updated `STATE.md` with post-planning state

```bash
node gsd-tools.cjs state planned-phase --phase 3 --plans 2
```

---

## Community Commands

### Community Hooks

Optional git and session hooks gated behind `hooks.community: true` in `.planning/config.json`. All are no-ops unless explicitly enabled.

| Hook | Purpose |
|------|---------|
| `gsd-validate-commit.sh` | Enforce Conventional Commits format on git commit messages |
| `gsd-session-state.sh` | Track session state transitions |
| `gsd-phase-boundary.sh` | Enforce phase boundary checks |

Enable with:
```json
{ "hooks": { "community": true } }
```

---

### `/gsd-switch`

Switch active project context in a multi-project workspace.

### `/gsd-join-discord`

Open Discord community invite.

```bash
/gsd-join-discord
```
