# GSD User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Command Reference](#command-reference)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /gsd-new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /gsd-discuss-phase │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-plan-phase    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-execute-phase │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /gsd-verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Phase?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /gsd-audit-milestone        │
            │  /gsd-complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /gsd-new-milestone  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /gsd-plan-phase N
         │
         ├── Phase Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ PLAN files │
         │                        └────────────┘
         └── Done
```

### Validation Architecture (Nyquist Layer)

During plan-phase research, GSD now maps automated test coverage to each phase
requirement before any code is written. This ensures that when Claude's executor
commits a task, a feedback mechanism already exists to verify it within seconds.

The researcher detects your existing test infrastructure, maps each requirement to
a specific test command, and identifies any test scaffolding that must be created
before implementation begins (Wave 0 tasks).

The plan-checker enforces this as an 8th verification dimension: plans where tasks
lack automated verify commands will not be approved.

**Output:** `{phase}-VALIDATION.md` -- the feedback contract for the phase.

**Disable:** Set `workflow.nyquist_validation: false` in `/gsd-settings` for
rapid prototyping phases where test infrastructure isn't the focus.

### Retroactive Validation (`/gsd-validate-phase`)

For phases executed before Nyquist validation existed, or for existing codebases
with only traditional test suites, retroactively audit and fill coverage gaps:

```
  /gsd-validate-phase N
         |
         +-- Detect state (VALIDATION.md exists? SUMMARY.md exists?)
         |
         +-- Discover: scan implementation, map requirements to tests
         |
         +-- Analyze gaps: which requirements lack automated verification?
         |
         +-- Present gap plan for approval
         |
         +-- Spawn auditor: generate tests, run, debug (max 3 attempts)
         |
         +-- Update VALIDATION.md
               |
               +-- COMPLIANT -> all requirements have automated checks
               +-- PARTIAL -> some gaps escalated to manual-only
```

The auditor never modifies implementation code — only test files and
VALIDATION.md. If a test reveals an implementation bug, it's flagged as an
escalation for you to address.

**When to use:** After executing phases that were planned before Nyquist was
enabled, or after `/gsd-audit-milestone` surfaces Nyquist compliance gaps.

### Execution Wave Coordination

```
  /gsd-execute-phase N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against phase goals
                     │
                     ├── PASS -> VERIFICATION.md (success)
                     └── FAIL -> Issues logged for /gsd-verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /gsd-map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /gsd-new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘
```

---

## Command Reference

### Core Workflow

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd-new-project` | Full project init: questions, research, requirements, roadmap | Start of a new project |
| `/gsd-new-project --auto @idea.md` | Automated init from document | Have a PRD or idea doc ready |
| `/gsd-discuss-phase [N]` | Capture implementation decisions | Before planning, to shape how it gets built |
| `/gsd-plan-phase [N]` | Research + plan + verify | Before executing a phase |
| `/gsd-execute-phase <N>` | Execute all plans in parallel waves | After planning is complete |
| `/gsd-verify-work [N]` | Manual UAT with auto-diagnosis | After execution completes |
| `/gsd-audit-milestone` | Verify milestone met its definition of done | Before completing milestone |
| `/gsd-complete-milestone` | Archive milestone, tag release | All phases verified |
| `/gsd-new-milestone [name]` | Start next version cycle | After completing a milestone |

### Navigation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd-progress` | Show status and next steps | Anytime -- "where am I?" |
| `/gsd-resume-work` | Restore full context from last session | Starting a new session |
| `/gsd-pause-work` | Save context handoff | Stopping mid-phase |
| `/gsd-help` | Show all commands | Quick reference |
| `/gsd-update` | Update GSD with changelog preview | Check for new versions |
| `/gsd-join-discord` | Open Discord community invite | Questions or community |

### Phase Management

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd-add-phase` | Append new phase to roadmap | Scope grows after initial planning |
| `/gsd-insert-phase [N]` | Insert urgent work (decimal numbering) | Urgent fix mid-milestone |
| `/gsd-remove-phase [N]` | Remove future phase and renumber | Descoping a feature |
| `/gsd-list-phase-assumptions [N]` | Preview Claude's intended approach | Before planning, to validate direction |
| `/gsd-plan-milestone-gaps` | Create phases for audit gaps | After audit finds missing items |
| `/gsd-research-phase [N]` | Deep ecosystem research only | Complex or unfamiliar domain |

### Brownfield & Utilities

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd-map-codebase` | Analyze existing codebase | Before `/gsd-new-project` on existing code |
| `/gsd-quick` | Ad-hoc task with GSD guarantees | Bug fixes, small features, config changes |
| `/gsd-debug [desc]` | Systematic debugging with persistent state | When something breaks |
| `/gsd-add-todo [desc]` | Capture an idea for later | Think of something during a session |
| `/gsd-check-todos` | List pending todos | Review captured ideas |
| `/gsd-settings` | Configure workflow toggles and model profile | Change model, toggle agents |
| `/gsd-set-profile <profile>` | Quick profile switch | Change cost/quality tradeoff |
| `/gsd-reapply-patches` | Restore local modifications after update | After `/gsd-update` if you had local edits |

### Project Management (Multi-User)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd-switch [project]` | Switch active project (or list all with no args) | Working on multiple projects |
| `/gsd-team-status` | See all users' active projects, phases, progress | Check teammate activity |
| `/gsd-archive-project` | Archive a completed project to `_archived/` | Project finished, reduce clutter |
| `/gsd-restore-project` | Restore an archived project | Revisit completed work |

---

## Configuration Reference

GSD stores project settings in `.planning/config.json`. Configure during `/gsd-new-project` or update later with `/gsd-settings`.

### Full config.json Schema

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "nyquist_validation": true
  },
  "git": {
    "branching_strategy": "none",
    "phase_branch_template": "gsd/phase-{phase}-{slug}",
    "milestone_branch_template": "gsd/{milestone}-{slug}"
  }
}
```

### Core Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` auto-approves decisions; `interactive` confirms at each step |
| `granularity` | `coarse`, `standard`, `fine` | `standard` | Phase granularity: how finely scope is sliced (3-5, 5-8, or 8-12 phases) |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | Model tier for each agent (see table below) |

### Planning Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | `true`, `false` | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

> **Note:** If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of the config value.

### Workflow Toggles

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | Domain investigation before planning |
| `workflow.plan_check` | `true`, `false` | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | `true`, `false` | `true` | Post-execution verification against phase goals |
| `workflow.nyquist_validation` | `true`, `false` | `true` | Validation architecture research during plan-phase; 8th plan-check dimension |

Disable these to speed up phases in familiar domains or when conserving tokens.

### Git Branching

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | When and how branches are created |
| `git.phase_branch_template` | Template string | `gsd/phase-{phase}-{slug}` | Branch name for phase strategy |
| `git.milestone_branch_template` | Template string | `gsd/{milestone}-{slug}` | Branch name for milestone strategy |

**Branching strategies explained:**

| Strategy | Creates Branch | Scope | Best For |
|----------|---------------|-------|----------|
| `none` | Never | N/A | Solo development, simple projects |
| `phase` | At each `execute-phase` | One phase per branch | Code review per phase, granular rollback |
| `milestone` | At first `execute-phase` | All phases share one branch | Release branches, PR per version |

**Template variables:** `{phase}` = zero-padded number (e.g., "03"), `{slug}` = lowercase hyphenated name, `{milestone}` = version (e.g., "v1.0").

### Model Profiles (Per-Agent Breakdown)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| gsd-planner | Opus | Opus | Sonnet |
| gsd-roadmapper | Opus | Sonnet | Sonnet |
| gsd-executor | Opus | Sonnet | Sonnet |
| gsd-phase-researcher | Opus | Sonnet | Haiku |
| gsd-project-researcher | Opus | Sonnet | Haiku |
| gsd-research-synthesizer | Sonnet | Sonnet | Haiku |
| gsd-debugger | Opus | Sonnet | Sonnet |
| gsd-codebase-mapper | Sonnet | Haiku | Haiku |
| gsd-verifier | Sonnet | Sonnet | Haiku |
| gsd-plan-checker | Sonnet | Sonnet | Haiku |
| gsd-integration-checker | Sonnet | Sonnet | Haiku |

**Profile philosophy:**
- **quality** -- Opus for all decision-making agents, Sonnet for read-only verification. Use when quota is available and the work is critical.
- **balanced** -- Opus only for planning (where architecture decisions happen), Sonnet for everything else. The default for good reason.
- **budget** -- Sonnet for anything that writes code, Haiku for research and verification. Use for high-volume work or less critical phases.

---

## Multi-User Monorepo Support

> **Fork feature.** Multiple users run independent GSD projects in the same repo without conflicts.

### Directory Structure

Each user gets their own planning universe:

```
.planning/
  config.json                    # Shared global defaults
  user-map.json                  # Git identity → directory mapping
  users/
    dan/
      .active                    # Current project (gitignored)
      frontend/                  # ← ${planning_root} when active
        PROJECT.md, ROADMAP.md, STATE.md, config.json, phases/
      auth-service/
        PROJECT.md, ROADMAP.md, ...
    alice/
      .active
      frontend/
        PROJECT.md, ROADMAP.md, ...
```

### Identity Resolution

GSD identifies you automatically from `git config user.name`:

1. **Resolve** — reads `user.name`, falls back to email local-part, then OS username
2. **Sanitize** — converts to filesystem-safe slug (lowercase, hyphens)
3. **Lock** — stored in `.planning/user-map.json` on first use
4. **Override** — use `GSD_USER` env var for CI/scripting

### Config Layering (4-Tier Precedence)

Config values resolve through 4 layers — highest priority wins:

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | Environment variables | `GSD_MODEL_PROFILE=budget` |
| 2 | Per-project config | `.planning/users/dan/frontend/config.json` |
| 3 | Shared global config | `.planning/config.json` |
| 4 (lowest) | Hardcoded defaults | Built into gsd-tools.cjs |

**Debug with:** `gsd-tools.cjs config-resolve <key>` — shows resolved value, source layer, and all layers checked.

**Supported env vars:** `GSD_USER`, `GSD_PROJECT`, `GSD_MODEL_PROFILE`, `GSD_PARALLELIZATION`, `GSD_COMMIT_DOCS`, `GSD_RESEARCH`, `GSD_PLAN_CHECK`, `GSD_VERIFIER`, `GSD_BRANCHING_STRATEGY`, `GSD_SEARCH_GITIGNORED`

### Team Visibility

```bash
/gsd-team-status
```

Displays a summary table of all users' activity:

```
| User  | Project   | Phase          | Progress | Last Active |
|-------|-----------|----------------|----------|-------------|
| dan   | frontend  | 3/4 Lifecycle  | 75%      | 2 hours ago |
| alice | auth-svc  | 1/3 Foundation | 33%      | yesterday   |
```

- Reads only STATE.md YAML frontmatter (fast, lightweight)
- Never modifies other users' files
- Shows "(no active project)" when `.active` is missing (e.g., after fresh clone)

### Commit Attribution

Planning artifact commits automatically include user/project context:

```
docs(dan/frontend/phase-03): complete phase execution
feat(03-01): redesign listProjects          # ← code commits stay clean
```

Only commits for planning files (STATE.md, ROADMAP.md, VERIFICATION.md, etc.) get the attribution prefix.

### Migration from Single-User

If you have an existing flat `.planning/PROJECT.md` structure, any GSD command will detect it and offer migration:

- **Auto-migrate** — moves files to `.planning/users/<you>/<project>/`, commits the change
- **Manual instructions** — step-by-step guide if you prefer to do it yourself
- Uses `--project-name <slug>` flag if PROJECT.md is missing or unreadable

### Multi-User Workflows

**Setting up a multi-user project:**

```bash
/gsd-new-project                # Creates under .planning/users/<you>/<project>/
/gsd-switch                     # List your projects
/gsd-switch auth-service        # Switch to another project
/gsd-team-status                # See what teammates are doing
```

**Project lifecycle:**

```bash
/gsd-archive-project            # Archive completed project
/gsd-restore-project            # Bring back an archived project
```

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/gsd-new-project            # Answer questions, configure, approve roadmap
/clear
/gsd-discuss-phase 1        # Lock in your preferences
/gsd-plan-phase 1           # Research + plan + verify
/gsd-execute-phase 1        # Parallel execution
/gsd-verify-work 1          # Manual UAT
/clear
/gsd-discuss-phase 2        # Repeat for each phase
...
/gsd-audit-milestone        # Check everything shipped
/gsd-complete-milestone     # Archive, tag, done
```

### New Project from Existing Document

```bash
/gsd-new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/gsd-discuss-phase 1               # Normal flow from here
```

### Existing Codebase

```bash
/gsd-map-codebase           # Analyze what exists (parallel agents)
/gsd-new-project            # Questions focus on what you're ADDING
# (normal phase workflow from here)
```

### Quick Bug Fix

```bash
/gsd-quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/gsd-progress               # See where you left off and what's next
# or
/gsd-resume-work            # Full context restoration from last session
```

### Preparing for Release

```bash
/gsd-audit-milestone        # Check requirements coverage, detect stubs
/gsd-plan-milestone-gaps    # If audit found gaps, create phases to close them
/gsd-complete-milestone     # Archive, tag, done
```

### Speed vs Quality Presets

| Scenario | Mode | Granularity | Profile | Research | Plan Check | Verifier |
|----------|------|-------|---------|----------|------------|----------|
| Prototyping | `yolo` | `coarse` | `budget` | off | off | off |
| Normal dev | `interactive` | `standard` | `balanced` | on | on | on |
| Production | `interactive` | `fine` | `quality` | on | on | on |

### Mid-Milestone Scope Changes

```bash
/gsd-add-phase              # Append a new phase to the roadmap
# or
/gsd-insert-phase 3         # Insert urgent work between phases 3 and 4
# or
/gsd-remove-phase 7         # Descope phase 7 and renumber
```

---

## Troubleshooting

### "Project already initialized"

You ran `/gsd-new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. GSD is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/gsd-resume-work` or `/gsd-progress` to restore state.

### Plans Seem Wrong or Misaligned

Run `/gsd-discuss-phase [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/gsd-list-phase-assumptions [N]` to see what Claude intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/gsd-progress`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/gsd-execute-phase`. Use `/gsd-quick` for targeted fixes, or `/gsd-verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Switch to budget profile: `/gsd-set-profile budget`. Disable research and plan-check agents via `/gsd-settings` if the domain is familiar to you (or to Claude).

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/gsd-new-project` or via `/gsd-settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### GSD Update Overwrote My Local Changes

Since v1.17, the installer backs up locally modified files to `gsd-local-patches/`. Run `/gsd-reapply-patches` to merge your changes back.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. GSD's orchestrators (execute-phase, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

### Multi-User: "No active project" Error

Run `/gsd-switch` to see available projects and select one. If you have only one project, it auto-selects. If you have zero projects, run `/gsd-new-project` first.

### Multi-User: Team-Status Shows No Data for Teammates

`.active` files are gitignored — they only exist on machines where users have run GSD. After a fresh clone, team-status shows "(no active project)" for other users until they run GSD locally. This is by design (git identity is local).

### Multi-User: Legacy .planning/ Structure Detected

If you see a legacy detection message, run the migration flow offered by the command. Auto-migrate moves your files to `.planning/users/<you>/<project>/` safely. If PROJECT.md is missing, use `gsd-tools.cjs migrate --project-name <slug>` to specify the project name manually.

---

## Recovery Quick Reference

| Problem | Solution |
|---------|----------|
| Lost context / new session | `/gsd-resume-work` or `/gsd-progress` |
| Phase went wrong | `git revert` the phase commits, then re-plan |
| Need to change scope | `/gsd-add-phase`, `/gsd-insert-phase`, or `/gsd-remove-phase` |
| Milestone audit found gaps | `/gsd-plan-milestone-gaps` |
| Something broke | `/gsd-debug "description"` |
| Quick targeted fix | `/gsd-quick` |
| Plan doesn't match your vision | `/gsd-discuss-phase [N]` then re-plan |
| Costs running high | `/gsd-set-profile budget` and `/gsd-settings` to toggle agents off |
| Update broke local changes | `/gsd-reapply-patches` |

---

## Project File Structure

For reference, here is what GSD creates in your project:

```
.planning/
  config.json              # Shared global defaults
  user-map.json            # Git identity → directory mapping
  MILESTONES.md            # Completed milestone archive
  RETROSPECTIVE.md         # Living retrospective (updated per milestone)
  users/
    <username>/
      .active              # Current project selection (gitignored)
      <project>/           # ← ${planning_root}
        PROJECT.md         # Project vision and context
        REQUIREMENTS.md    # Scoped v1/v2 requirements with IDs
        ROADMAP.md         # Phase breakdown with status tracking
        STATE.md           # Decisions, blockers, session memory
        config.json        # Per-project config overrides
        research/          # Domain research from /gsd-new-project
        todos/
          pending/         # Captured ideas awaiting work
          done/            # Completed todos
        debug/             # Active debug sessions
          resolved/        # Archived debug sessions
        phases/
          XX-phase-name/
            XX-YY-PLAN.md      # Atomic execution plans
            XX-YY-SUMMARY.md   # Execution outcomes and decisions
            CONTEXT.md         # Your implementation preferences
            RESEARCH.md        # Ecosystem research findings
            VERIFICATION.md    # Post-execution verification results
  codebase/                # Brownfield codebase mapping (from /gsd-map-codebase)
    STACK.md, ARCHITECTURE.md, CONVENTIONS.md, etc.
  milestones/              # Archived milestone data
    v1.0-ROADMAP.md, v1.0-REQUIREMENTS.md, v1.0-phases/
```
