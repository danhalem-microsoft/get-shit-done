<purpose>
Display the complete GSD command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<reference>
# GSD Command Reference

**GSD** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/gsd-new-project` - Initialize project (includes research, requirements, roadmap)
2. `/gsd-plan-phase 1` - Create detailed plan for first phase
3. `/gsd-execute-phase 1` - Execute the phase

## Staying Updated

GSD evolves fast. Update periodically:

```bash
npx get-shit-done-cc@latest
```

## Core Workflow

```
/gsd-new-project → /gsd-plan-phase → /gsd-execute-phase → repeat
```

### Project Initialization

**`/gsd-new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with phase breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — phases mapped to requirements
- `STATE.md` — project memory

Usage: `/gsd-new-project`

### Phase Planning

**`/gsd-discuss-phase <number>`**
Help articulate your vision for a phase before planning.

- Captures how you imagine this phase working
- Creates CONTEXT.md with your vision, essentials, and boundaries
- Use when you have ideas about how something should look/feel
- Optional `--batch` asks 2-5 related questions at a time instead of one-by-one

Usage: `/gsd-discuss-phase 2`
Usage: `/gsd-discuss-phase 2 --batch`
Usage: `/gsd-discuss-phase 2 --batch=3`

**`/gsd-research-phase <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates RESEARCH.md with "how experts build this" knowledge
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/gsd-research-phase 3`

**`/gsd-plan-phase <number>`**
Create detailed execution plan for a specific phase.

- Generates `.planning/phases/XX-phase-name/XX-YY-PLAN.md`
- Breaks phase into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per phase supported (XX-01, XX-02, etc.)

Usage: `/gsd-plan-phase 1`
Result: Creates `.planning/phases/01-foundation/01-01-PLAN.md`

**PRD Express Path:** Pass `--prd path/to/requirements.md` to skip discuss-phase entirely. Your PRD becomes locked decisions in CONTEXT.md. Useful when you already have clear acceptance criteria.

### Execution

**`/gsd-execute-phase <phase-number>`**
Execute all plans in a phase, or run a specific wave.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Optional `--wave N` flag executes only Wave `N` and stops unless the phase is now fully complete
- Verifies phase goal after all plans complete
- Updates REQUIREMENTS.md, ROADMAP.md, STATE.md

Usage: `/gsd-execute-phase 5`
Usage: `/gsd-execute-phase 5 --wave 2`

### Quick Mode

**`/gsd-quick [--full] [--validate] [--discuss] [--research]`**
Execute small, ad-hoc tasks with GSD guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier by default)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md tracking (not ROADMAP.md)

Flags enable additional quality steps:
- `--full` — Complete quality pipeline: discussion + research + plan-checking + verification
- `--validate` — Plan-checking (max 2 iterations) and post-execution verification only
- `--discuss` — Lightweight discussion to surface gray areas before planning
- `--research` — Focused research agent investigates approaches before planning

Granular flags are composable: `--discuss --research --validate` gives the same as `--full`.

Usage: `/gsd-quick`
Usage: `/gsd-quick --full`
Usage: `/gsd-quick --research --validate`
Result: Creates `.planning/quick/NNN-slug/PLAN.md`, `.planning/quick/NNN-slug/SUMMARY.md`

### Roadmap Management

**`/gsd-add-phase <description>`**
Add new phase to end of current milestone.

- Appends to ROADMAP.md
- Uses next sequential number
- Updates phase directory structure

Usage: `/gsd-add-phase "Add admin dashboard"`

**`/gsd-insert-phase <after> <description>`**
Insert urgent work as decimal phase between existing phases.

- Creates intermediate phase (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone
- Maintains phase ordering

Usage: `/gsd-insert-phase 7 "Fix critical auth bug"`
Result: Creates Phase 7.1

**`/gsd-remove-phase <number>`**
Remove a future phase and renumber subsequent phases.

- Deletes phase directory and all references
- Renumbers all subsequent phases to close the gap
- Only works on future (unstarted) phases
- Git commit preserves historical record

Usage: `/gsd-remove-phase 17`
Result: Phase 17 deleted, phases 18-20 become 17-19

### Milestone Management

**`/gsd-new-milestone <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with scoping
- Roadmap creation with phase breakdown
- Optional `--reset-phase-numbers` flag restarts numbering at Phase 1 and archives old phase dirs first for safety

Mirrors `/gsd-new-project` flow for brownfield projects (existing PROJECT.md).

Usage: `/gsd-new-milestone "v2.0 Features"`
Usage: `/gsd-new-milestone --reset-phase-numbers "v2.0 Features"`

**`/gsd-complete-milestone <version>`**
Archive completed milestone and prepare for next version.

- Creates MILESTONES.md entry with stats
- Archives full details to milestones/ directory
- Creates git tag for the release
- Prepares workspace for next version

Usage: `/gsd-complete-milestone 1.0.0`

### Progress Tracking

**`/gsd-progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from SUMMARY files
- Displays current position and what's next
- Lists key decisions and open issues
- Offers to execute next plan or create it if missing
- Detects 100% milestone completion

Usage: `/gsd-progress`

### Session Management

**`/gsd-resume-work`**
Resume work from previous session with full context restoration.

- Reads STATE.md for project context
- Shows current position and recent progress
- Offers next actions based on project state

Usage: `/gsd-resume-work`

**`/gsd-pause-work`**
Create context handoff when pausing work mid-phase.

- Creates .continue-here file with current state
- Updates STATE.md session continuity section
- Captures in-progress work context

Usage: `/gsd-pause-work`

### Todo Management

**`/gsd-add-todo [description]`**
Capture idea or task as todo from current conversation.

- Extracts context from conversation (or uses provided description)
- Creates structured todo file in `.planning/todos/pending/`
- Infers area from file paths for grouping
- Checks for duplicates before creating
- Updates STATE.md todo count

Usage: `/gsd-add-todo` (infers from conversation)
Usage: `/gsd-add-todo Add auth token refresh`

**`/gsd-check-todos [area]`**
List pending todos and select one to work on.

- Lists all pending todos with title, area, age
- Optional area filter (e.g., `/gsd-check-todos api`)
- Loads full context for selected todo
- Routes to appropriate action (work now, add to phase, brainstorm)
- Moves todo to done/ when work begins

Usage: `/gsd-check-todos`
Usage: `/gsd-check-todos api`

### User Acceptance Testing

**`/gsd-verify-work [phase]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (yes/no responses)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/gsd-verify-work 3`

---

**`/gsd-peer-review N [--copilot] [--gemini] [--claude] [--codex] [--coderabbit] [--opencode] [--qwen] [--cursor] [--all]`**
Cross-AI peer review — invoke external AI CLIs to independently review phase plans.

- Detects available CLIs (copilot, gemini, claude, codex, coderabbit, opencode, qwen, cursor)
- Each CLI reviews plans independently with the same structured prompt
- CodeRabbit reviews the current git diff (not a prompt) — may take up to 5 minutes
- Produces REVIEWS.md with per-reviewer feedback and consensus summary
- Feed reviews back into planning: `/gsd-plan-phase N --reviews`
- Distinct from `/gsd-review` (the consolidated quality-gate dispatcher with `--code | --security | --critique | --converge` for GSD's internal critic agents)

Usage: `/gsd-peer-review 3 --all`

---

**`/gsd-pr-branch [target]`**
Create a clean branch for pull requests by filtering out .planning/ commits.

- Classifies commits: code-only (include), planning-only (exclude), mixed (include sans .planning/)
- Cherry-picks code commits onto a clean branch
- Reviewers see only code changes, no GSD artifacts

Usage: `/gsd-pr-branch` or `/gsd-pr-branch main`

### Configuration

**`/gsd-settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, plan checker, verifier agents
- Select model profile (quality/balanced/budget/inherit)
- Updates `.planning/config.json`

Usage: `/gsd-settings`

**`/gsd-set-profile <profile>`**
Quick switch model profile for GSD agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification
- `inherit` — Use current session model for all agents (OpenCode `/model`)

Usage: `/gsd-set-profile budget`

### Utility Commands

**`/gsd-help`**
Show this command reference.

**`/gsd-update`**
Update GSD to latest version with changelog preview.

- Shows installed vs latest version comparison
- Displays changelog entries for versions you've missed
- Highlights breaking changes
- Confirms before running install
- Better than raw `npx get-shit-done-cc`

Usage: `/gsd-update`

**`/gsd-join-discord`**
Join the GSD Discord community.

- Get help, share what you're building, stay updated
- Connect with other GSD users

Usage: `/gsd-join-discord`

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
├── STATE.md              # Project memory & context
├── RETROSPECTIVE.md      # Living retrospective (updated per milestone)
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
│   ├── pending/          # Todos waiting to be worked on
│   └── done/             # Completed todos
├── spikes/               # Spike experiments (/gsd-spike)
│   ├── MANIFEST.md       # Spike inventory and verdicts
│   └── NNN-name/         # Individual spike directories
├── sketches/             # Design sketches (/gsd-sketch)
│   ├── MANIFEST.md       # Sketch inventory and winners
│   ├── themes/           # Shared CSS theme files
│   └── NNN-name/         # Individual sketch directories (HTML + README)
├── debug/                # Active debug sessions
│   └── resolved/         # Archived resolved issues
├── milestones/
│   ├── v1.0-ROADMAP.md       # Archived roadmap snapshot
│   ├── v1.0-REQUIREMENTS.md  # Archived requirements
│   └── v1.0-phases/          # Archived phase dirs (via /gsd-cleanup or --archive-phases)
│       ├── 01-foundation/
│       └── 02-core-features/
├── codebase/             # Codebase map (brownfield projects)
│   ├── STACK.md          # Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md   # Patterns, layers, data flow
│   ├── STRUCTURE.md      # Directory layout, key files
│   ├── CONVENTIONS.md    # Coding standards, naming
│   ├── TESTING.md        # Test setup, patterns
│   ├── INTEGRATIONS.md   # External services, APIs
│   └── CONCERNS.md       # Tech debt, known issues
└── phases/
    ├── 01-foundation/
    │   ├── 01-01-PLAN.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-PLAN.md
        └── 02-01-SUMMARY.md
```

## Workflow Modes

Set during `/gsd-new-project`:

**Interactive Mode**

- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**

- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `.planning/config.json`

## Planning Configuration

Configure how planning artifacts are managed in `.planning/config.json`:

**`planning.commit_docs`** (default: `true`)
- `true`: Planning artifacts committed to git (standard workflow)
- `false`: Planning artifacts kept local-only, not committed

When `commit_docs: false`:
- Add `.planning/` to your `.gitignore`
- Useful for OSS contributions, client projects, or keeping planning private
- All planning files still work normally, just not tracked in git

**`planning.search_gitignored`** (default: `false`)
- `true`: Add `--no-ignore` to broad ripgrep searches
- Only needed when `.planning/` is gitignored and you want project-wide searches to include it

Example config:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## Common Workflows

**Starting a new project:**

```
/gsd-new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/gsd-plan-phase 1       # Create plans for first phase
/clear
/gsd-execute-phase 1    # Execute all plans in phase
```

**Resuming work after a break:**

```
/gsd-progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/gsd-phase insert 5 "Critical security fix"
/gsd-plan-phase 5.1
/gsd-execute-phase 5.1
```

**Completing a milestone:**

```
/gsd-complete-milestone 1.0.0
/clear
/gsd-new-milestone  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/gsd-add-todo                    # Capture from conversation context
/gsd-add-todo Fix modal z-index  # Capture with explicit description
/gsd-check-todos                 # Review and work on todos
/gsd-check-todos api             # Filter by area
```

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/gsd-progress` to check where you're up to

## Command Migration (Phase 1 Cull)

The following commands were removed in Phase 1 of the GSD Slim milestone. Use the replacement listed below.

### 49 commands removed outright

| Removed Command | Replacement | Notes |
|-----------------|-------------|-------|
| `/gsd-audit-fix`               | _(none)_                       | Removed; functionality not replaced. |
| `/gsd-audit-uat`               | _(none)_                       | Removed. |
| `/gsd-forensics`               | _(none)_                       | Removed. |
| `/gsd-health`                  | _(none)_                       | Removed. |
| `/gsd-stats`                   | _(none)_                       | Removed; use `git log` directly. |
| `/gsd-scan`                    | _(none)_                       | Removed. |
| `/gsd-intel`                   | _(none)_                       | Removed; intel subsystem retired. |
| `/gsd-map-codebase`            | _(none)_                       | Removed; use editor + Grep + `gsd-pattern-mapper`. |
| `/gsd-graphify`                | _(none)_                       | Removed. |
| `/gsd-ai-integration-phase`    | _(none)_                       | Removed; AI-integration subsystem retired. |
| `/gsd-ui-phase`                | _(none)_                       | Removed; UI subsystem retired. |
| `/gsd-ui-review`               | _(none)_                       | Removed. |
| `/gsd-eval-review`             | _(none)_                       | Removed. |
| `/gsd-spike`                   | _(none)_                       | Removed. |
| `/gsd-sketch`                  | _(none)_                       | Removed. |
| `/gsd-spike-wrap-up`           | _(none)_                       | Removed. |
| `/gsd-sketch-wrap-up`          | _(none)_                       | Removed. |
| `/gsd-debug`                   | _(none)_                       | Removed; use a debugging tool of choice. |
| `/gsd-explore`                 | _(none)_                       | Removed; use `/gsd-progress` or read STATE.md. |
| `/gsd-note`                    | _(none)_                       | Removed; ad-hoc note-taking should live in your editor. |
| `/gsd-plant-seed`              | _(none)_                       | Removed. |
| `/gsd-add-backlog`             | _(none)_                       | Removed. |
| `/gsd-thread`                  | _(none)_                       | Removed. |
| `/gsd-review-backlog`          | _(none)_                       | Removed. |
| `/gsd-audit-milestone`         | _(none)_                       | Removed. |
| `/gsd-plan-milestone-gaps`     | _(none)_                       | Removed. |
| `/gsd-milestone-summary`       | _(none)_                       | Removed. |
| `/gsd-archive-project`         | _(none)_                       | Removed. |
| `/gsd-restore-project`         | _(none)_                       | Removed. |
| `/gsd-ship`                    | _(none)_                       | Removed. |
| `/gsd-undo`                    | _(none)_                       | Removed. |
| `/gsd-inbox`                   | _(none)_                       | Removed. |
| `/gsd-review` (old)            | _(none)_                       | Removed (the old `/gsd-review` git/PR helper; the new `/gsd-review` is the consolidated quality-gate review entry point — different functionality, same name). |
| `/gsd-manager`                 | _(none)_                       | Removed. |
| `/gsd-autonomous`              | _(none)_                       | Removed. |
| `/gsd-fast`                    | _(none)_                       | Removed. |
| `/gsd-do`                      | _(none)_                       | Removed. |
| `/gsd-next`                    | _(none)_                       | Removed. |
| `/gsd-session-report`          | _(none)_                       | Removed. |
| `/gsd-spec-phase`              | _(none)_                       | Removed; Phase 5 introduces `--from-spec` integration. |
| `/gsd-import`                  | _(none)_                       | Removed. |
| `/gsd-ultraplan-phase`         | _(none)_                       | Removed. |
| `/gsd-list-phase-assumptions`  | _(none)_                       | Removed. |
| `/gsd-docs-update`             | _(none)_                       | Removed; doc subsystem retired. |
| `/gsd-ingest-docs`             | _(none)_                       | Removed. |
| `/gsd-from-gsd2`               | _(none)_                       | Removed. |
| `/gsd-add-tests`               | _(none — Phase 4 TDD discipline)_ | Removed. Phase 4 lands tests-first discipline at executor + plan-checker + hook layers. |
| `/gsd-analyze-dependencies`    | _(none)_                       | Removed. |
| `/gsd-cleanup`                 | _(none)_                       | Removed. |

### 9 commands consolidated

| Removed Command | Replacement | Notes |
|-----------------|-------------|-------|
| `/gsd-secure-phase`              | `/gsd-review --security`         | **Stub kept** for one milestone. Dispatches automatically. |
| `/gsd-validate-phase`            | `/gsd-review --coverage`         | **Stub kept** for one milestone. |
| `/gsd-code-review`               | `/gsd-review --code`             | **Stub kept** for one milestone. |
| `/gsd-code-review-fix`           | `/gsd-review --code-fix`         | **Stub kept** for one milestone. |
| `/gsd-critique`                  | `/gsd-review --critique`         | **Stub kept** for one milestone. |
| `/gsd-plan-review-convergence`   | `/gsd-review --converge`         | **Stub kept** for one milestone. |
| `/gsd-add-phase`                 | `/gsd-phase add`                 | Old command removed; no stub. |
| `/gsd-insert-phase`              | `/gsd-phase insert`              | Old command removed; no stub. |
| `/gsd-remove-phase`              | `/gsd-phase remove`              | Old command removed; no stub. |

## Agent Removals (Phase 1 Cull)

| Removed Agent | Replacement / Notes |
|---------------|---------------------|
| `gsd-debugger`              | Removed. Use main thread reasoning + Task tool. |
| `gsd-debug-session-manager` | Removed. |
| `gsd-doc-writer`            | Removed. Documentation work happens in main thread. |
| `gsd-doc-classifier`        | Removed (doc subsystem retired). |
| `gsd-doc-synthesizer`       | Removed (doc subsystem retired). |
| `gsd-doc-verifier`          | Removed (doc subsystem retired). |
| `gsd-domain-researcher`     | Removed (AI-integration subsystem retired). |
| `gsd-eval-auditor`          | Removed (AI-integration subsystem retired). |
| `gsd-eval-planner`          | Removed (AI-integration subsystem retired). |
| `gsd-framework-selector`    | Removed (AI-integration subsystem retired). |
| `gsd-ai-researcher`         | Removed (AI-integration subsystem retired). |
| `gsd-ui-auditor`            | Removed (UI subsystem retired). |
| `gsd-ui-checker`            | Removed (UI subsystem retired). |
| `gsd-ui-researcher`         | Removed (UI subsystem retired). |
| `gsd-codebase-mapper`       | Removed. Use Grep + Read directly. |
| `gsd-intel-updater`         | Removed (intel subsystem retired). |
| `gsd-nyquist-auditor`       | Removed. Test-coverage gap detection lands in Phase 4 TDD layer. |
</reference>
