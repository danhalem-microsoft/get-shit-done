# GSD Fork Integration Test Suite — Lifecycle Pipeline

**Date:** 2026-04-23
**Status:** Approved design
**Scope:** Expand integration test suite to cover all 6 fork features via a full GSD lifecycle pipeline running in an isolated sandbox

## Problem

The current integration tests validate that `gsd-tools.cjs` commands return correct JSON and that a few GSD skills execute. But they don't test the fork's 6 feature systems end-to-end: multi-user resolution, code-search integration, critic agents, dynamic researchers, mistake registry, and taste library. The tests also rely on the host's `~/.claude/` installation, which means they test whatever happens to be installed rather than the repo copy — the exact drift problem that caused a session-breaking failure on 2026-04-23.

## Solution

A single pipeline test (`gsd-lifecycle.test.cjs`) that:

1. Bootstraps a self-contained GSD sandbox from the repo copy (no `~/.claude/` dependency)
2. Runs the full GSD lifecycle via Claude with real tool use — project init through verification
3. Validates artifacts and state at each step, covering all 6 fork features

## Sandbox Bootstrap

### `createSandbox(name)` — new helper in `claude-runner.cjs`

Creates a temp directory with a complete, portable GSD installation:

```
{sandbox}/
  .git/
  .claude/
    get-shit-done/          ← cp -r from repo's get-shit-done/
      bin/
      workflows/
      references/
      templates/
      researchers/
      contexts/
    agents/                 ← cp -r from repo's agents/
    commands/               ← cp -r from repo's commands/
    hooks/                  ← cp -r from repo's hooks/
    settings.json           ← cp from ~/.claude/settings.json ⚠️
  .planning/
    users/
      test-user/
        .active             ← { project: null } (no project yet)
    user-map.json           ← { _schema: 1, 'test@test.com': 'test-user' }
  src/
    index.js                ← dummy source file
  package.json              ← { "name": "test-sandbox" }
  CLAUDE.md                 ← minimal project instructions
```

**Isolation mechanism:** All Claude invocations use `--bare` (skips `~/.claude/` auto-discovery) plus `--add-dir {sandbox}/.claude` (provides the local GSD installation). Combined with `GSD_USER=test-user` in env, Claude operates entirely within the sandbox.

**Known limitation (needs future work):** `settings.json` is copied from `~/.claude/` and inherits host permissions and MCP server config. A future iteration should build a minimal self-contained `settings.json` with only GSD skill registrations and necessary permissions.

## Pipeline Steps

### Pre-check: Fork Integrity (filesystem, no Claude)

Before any skill runs, validate the sandbox was built from the fork:

- Fork-only modules exist: `identity.cjs`, `context.cjs`, `taste.cjs`, `artifacts.cjs`, `config-schema.cjs`
- `core.cjs` contains `tryGetPlanningContext`
- `init.cjs` contains `active_user` and `active_project` injection
- All 6 critic agent files exist in `.claude/agents/`
- All 11 researcher files exist in `.claude/get-shit-done/researchers/`
- Code-search template markers in agent files are either expanded (MCP configured) or cleanly removed (no raw `<!-- code-search-tools -->` markers)

### Step 1: `/gsd-new-project`

**Prompt:** Initialize a project called "test-widget" — a Node.js CLI tool that generates reports.

**Assertions:**
- `PROJECT.md` exists under `.planning/users/test-user/test-widget/`
- `PROJECT.md` contains "test-widget"
- `STATE.md` exists with `gsd_state_version` in frontmatter
- `ROADMAP.md` exists with at least 1 phase listed
- `.active` file updated to `{ project: "test-widget" }` (or similar)

### Step 2: `/gsd-discuss-phase --auto` (phase 1)

**Prompt:** Discuss phase 1 with auto-defaults — skip interactive questions.

**Assertions:**
- `CONTEXT.md` created in phase 1 directory
- File contains a `<decisions>` section
- Phase directory name includes phase number

### Step 3: `/gsd-plan-phase` (phase 1)

**Prompt:** Plan phase 1.

**Assertions:**
- At least one `*-PLAN.md` file created in phase directory
- Plan file has YAML frontmatter with `wave`, `files_modified`, `autonomous`
- Plan file has `## Tasks` section with at least one `<task>` block
- If `RESEARCH.md` exists, it contains content (dynamic researcher output)
- `get-shit-done/researchers/` in sandbox contains all 11 researcher files

### Step 4: `/gsd-critique` (phase 1)

**Prompt:** Run critique on phase 1.

**Assertions:**
- `CRITIQUE.md` (or `*-CRITIQUE.md`) created in phase directory
- File has YAML frontmatter with finding counts
- File contains severity classifications — at least one of: critical, warning, info
- File structure matches critic agent output format

### Step 5: `/gsd-execute-phase` (phase 1)

**Prompt:** Execute phase 1.

**Assertions:**
- `*-SUMMARY.md` exists for at least one plan
- SUMMARY has YAML frontmatter with `key_files`
- Git log shows commits from execution (grep for phase number)
- At least one source file was created or modified (from `key_files`)

### Step 6: `/gsd:add-mistake`

**Prompt:** Record a mistake — "test assertions were too loose, checking only string length instead of structural correctness, which let broken skills pass silently."

**Assertions:**
- File created in `.planning/users/test-user/test-widget/mistakes/`
- Filename matches `{NNN}-*.md` pattern
- Frontmatter has `id`, `area`, `status: active`
- Body contains `## What Happened`

### Step 7: `/gsd:add-taste`

**Prompt:** Add a taste preference — "always use assert.strictEqual over assert.ok for value comparisons. Loose assertions hide bugs."

**Assertions:**
- File created in `.planning/users/test-user/test-widget/taste/`
- Frontmatter has `id`, `domain`, `confidence`, `status: active`
- Body contains a pattern description

### Step 8: `/gsd-verify-work` (phase 1)

**Prompt:** Verify phase 1.

**Assertions:**
- `*-VERIFICATION.md` created in phase directory
- Frontmatter has `status` field (one of: `passed`, `gaps_found`, `human_needed`)

### Step 9: `/gsd-progress`

**Prompt:** Show progress.

**Assertions:**
- Output references the project name ("test-widget" or similar)
- Output mentions phase completion or progress
- `turns >= 2` (Claude used tools, not canned response)

### Step 10: `/gsd-stats`

**Prompt:** Show stats.

**Assertions:**
- Output contains phase/plan/commit/file counts
- `turns >= 2`

## Fork Feature Coverage Matrix

| Feature | Validated By | Assertion Type |
|---------|-------------|----------------|
| Multi-user resolution | Steps 1, 9 + pre-check | Artifacts under `users/test-user/`, output references project |
| Code-search integration | Pre-check | Template markers expanded or cleanly removed |
| Critic agents | Step 4 | CRITIQUE.md with severity tiers |
| Dynamic researchers | Step 3 | RESEARCH.md output, researcher files present |
| Adaptive synthesizer | Step 3 | Research output format (if synthesizer runs during plan) |
| Mistake registry | Step 6 | Entry file with correct format and frontmatter |
| Taste library | Step 7 | Entry file with correct format and frontmatter |

## Test Infrastructure

### Bazel Configuration

```python
js_test(
    name = "gsd-lifecycle",
    entry_point = "gsd-lifecycle.test.cjs",
    data = ["//integration/helpers:test_helpers"],
    size = "enormous",
    tags = ["integration", "local", "requires-api-key", "lifecycle"],
    timeout = "eternal",  # 3600s
)
```

The `lifecycle` tag enables selective execution:
- Run only lifecycle: `bazel test //integration:gsd-lifecycle`
- Exclude lifecycle: `bazel test //integration/... --test_tag_filters=-lifecycle`

### Claude Invocation Pattern

All pipeline steps use `runClaudeWithTools()` with:

```javascript
const claudeOpts = {
  cwd: sandbox,
  timeout: 300_000,    // 5 min per step
  maxBudget: 10,       // $10 cap per step
  env: { GSD_USER: 'test-user' },
};
```

Additional flags passed to Claude CLI: `--bare --add-dir {sandbox}/.claude`

### Failure Handling

Each `test()` block checks if the prior step's required artifacts exist before running. If a prerequisite is missing, the test skips with `{ skip: 'Step N failed — required artifact missing' }` rather than running against broken state. Node's `test()` API supports this natively.

### Cost and Timing

- Estimated cost: $50-80 per full run
- Estimated duration: 20-30 minutes
- Runs in CI tagged `lifecycle` — can be gated on schedule or manual trigger

## Existing Tests

These files are unchanged:

- `fork-preservation.test.cjs` — continues checking `~/.claude/` matches repo copy (installed drift detection)
- `gsd-tools-workflow.test.cjs` — continues testing gsd-tools.cjs commands directly (fast, free)
- `multi-user-resolution.test.cjs` — continues testing multi-user path resolution (fast, free)
- `skill-execution.test.cjs` — continues testing individual skill execution against real repo (moderate cost)

## Implementation Scope

### New files:
- `integration/gsd-lifecycle.test.cjs` — the pipeline test
- `integration/fixtures/` — empty directory, placeholder for future static seed data

### Modified files:
- `integration/helpers/claude-runner.cjs` — add `createSandbox()` function
- `integration/BUILD.bazel` — add lifecycle test target with appropriate tags/timeout

### Not modified:
- Existing test files
- GSD tooling code
- Agent/workflow files
