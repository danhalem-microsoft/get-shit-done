# FORK.md - GSD Fork Documentation

This fork of [get-shit-done](https://github.com/glittercowboy/get-shit-done) extends the base system with 6 integrated feature systems, all delivered natively via `git clone` + `node install.js`.

## Overview

This fork adds the following systems on top of upstream GSD:

1. **Code-Search Integration** - Optional MCP-based code search tools injected into agents
2. **Critic Agents** - 6 specialized critic agents (plan, code, scope, verify, discuss, strategy) for quality gates
3. **Dynamic Researchers** - 11 researcher types with AI-powered selection and adaptive synthesis
4. **Adaptive Synthesizer** - Synthesizer agent that adapts output format to researcher findings
5. **Mistake Registry** - Structured mistake capture, storage, and critic integration
6. **Taste Library** - Decision preference extraction, storage, and consultation during planning

## Installation

### From Fork (Recommended)

```bash
git clone https://github.com/danhalem-microsoft/get-shit-done.git
cd get-shit-done
node bin/install.js --global
```

### Supported Runtimes

| Runtime | Status | Install command | Install root |
|---------|--------|-----------------|--------------|
| Claude Code | Supported (original target) | `node bin/install.js --claude --global` | `~/.claude/` |
| **Copilot CLI** | **Verified — full lifecycle live (~47 min)** | `node bin/install.js --copilot --global` (or `--local`) | `.github/` |
| **OpenCode** | **Verified — install + invocation; full lifecycle pending** ([follow-ups](docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md)) | `node bin/install.js --opencode --global` (or `--local`) | `.opencode/` |
| Gemini | Available, unverified | `node bin/install.js --gemini --global` | runtime-specific |
| Codex | Available, unverified | `node bin/install.js --codex --global` | runtime-specific |

```bash
node bin/install.js --global          # Install to ~/.claude/ (default)
node bin/install.js --local           # Install to ./.claude/
node bin/install.js --claude --global # Explicit Claude Code
node bin/install.js --copilot --global
node bin/install.js --opencode --global
node bin/install.js --gemini --global
node bin/install.js --codex --global
```

### Copilot CLI + OpenCode verification

**Copilot CLI** is verified end-to-end: install shape, fork-feature
characterization, live invocation smoke, and the full E2E lifecycle slice
(`/gsd-new-project --auto` → `/gsd-plan-phase 1 --auto` → `/gsd-execute-phase 1`
→ `/gsd-verify-work 1`) against the fixture under
`tests/e2e/fixtures/lifecycle/`. The full live lifecycle takes ~47 min on
this machine (4 steps × variable wall-clock per step).

**OpenCode** is verified for install shape, fork-feature characterization,
and live invocation smoke. The full E2E lifecycle did not complete within
the per-step timeout — see
[`docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md`](docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-followups.md)
for the open hypotheses and proposed next steps. Single-skill flows
(`/gsd-execute-phase`, `/gsd-verify-work`, etc.) and any invocation that
doesn't fan out into long researcher chains are usable on OpenCode today.

Both runtimes invoke skills using `/gsd-<command>` slash syntax (hyphen,
no namespace), e.g. `/gsd-new-project --auto`. The Claude-style
`/gsd:<command>` colon namespace is Claude-specific.

Each runtime installs the same fork features under its own native
layout — `bin/install.js` is not parity-forced:

| Feature | Copilot (`.github/`) | OpenCode (`.opencode/`) | Claude (`.claude/`) |
|---------|----------------------|--------------------------|----------------------|
| Critic agents | `agents/gsd-critic-*.agent.md` | `agents/gsd-critic-*.md` | `agents/gsd-critic-*.md` |
| Synthesizer | `agents/gsd-research-synthesizer.agent.md` | `agents/gsd-research-synthesizer.md` | `agents/gsd-research-synthesizer.md` |
| Researchers | `get-shit-done/researchers/*.md` | `get-shit-done/researchers/*.md` | `get-shit-done/researchers/*.md` |
| Mistake / taste commands | `skills/gsd-<cmd>/SKILL.md` | `command/gsd-<cmd>.md` (flat) | `commands/gsd/<cmd>.md` |
| `gsd-tools.cjs` / `taste.cjs` | `get-shit-done/bin/...` | `get-shit-done/bin/...` | `get-shit-done/bin/...` |

The structural check `tests/e2e/lib/fork-structural.cjs` understands all
three layouts; running `node --test tests/e2e/copilot-install.test.cjs`
or `tests/e2e/opencode-install.test.cjs` against a scratch project
proves all 5 fork features land where each runtime expects them.

For the verification methodology, see
[`docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-design.md`](docs/superpowers/specs/2026-05-26-gsd-copilot-opencode-verify-design.md)
and the executed plan in
[`docs/superpowers/plans/2026-05-26-gsd-copilot-opencode-verify.md`](docs/superpowers/plans/2026-05-26-gsd-copilot-opencode-verify.md).

### Running the E2E harness

The fork ships with an E2E harness under `tests/e2e/` that verifies
install + invocation + lifecycle for each non-Claude runtime.

```bash
# Harness unit tests (always run, no credentials needed)
bazel test //tests/e2e/lib/...

# Structural install checks (no live LLM call needed)
node --test tests/e2e/copilot-install.test.cjs
node --test tests/e2e/opencode-install.test.cjs

# Live smoke + lifecycle (requires `copilot` / `opencode` on PATH + auth)
GSD_E2E_COPILOT=1  node --test tests/e2e/invocation-smoke.test.cjs tests/e2e/lifecycle-copilot.test.cjs
GSD_E2E_OPENCODE=1 node --test tests/e2e/invocation-smoke.test.cjs tests/e2e/lifecycle-opencode.test.cjs
```

Live tests skip cleanly when the gating env var is unset, so the
default `node --test` and `bazel test //tests/...` runs stay green
without credentials.

## Code-Search Integration

Code-search MCP server access is **optional** and auto-detected during installation.

### How It Works

1. Agent files in the fork contain template markers: `<!-- code-search-tools -->` and `<!-- code-search-guidance -->`
2. During `node install.js`, the installer checks `~/.claude/settings.json` for a `code-search` key in `mcpServers`
3. **If detected**: Markers are replaced with `, mcp__code-search__*` tools and a guidance block
4. **If not detected**: Markers are removed cleanly (agents work without code-search)

### Affected Agents

- `gsd-codebase-mapper.md` - Uses code-search during codebase analysis
- `gsd-executor.md` - Uses code-search during implementation
- `gsd-planner.md` - Uses code-search during plan creation
- `gsd-debugger.md` - Uses code-search during debugging
- `gsd-verifier.md` - Uses code-search during verification
- `gsd-phase-researcher.md` - Uses code-search during phase research
- `gsd-project-researcher.md` - Uses code-search during project research

### Setting Up Code-Search

To enable code-search, add it to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "code-search": {
      "command": "node",
      "args": ["/path/to/code-search-server/index.js"]
    }
  }
}
```

Then re-run `node bin/install.js --global` to inject the tools.

## Upstream Sync

### Adding Upstream Remote

```bash
cd /path/to/your/get-shit-done
git remote add upstream https://github.com/glittercowboy/get-shit-done.git
```

### Syncing with Upstream

Use the built-in command:

```
/gsd-sync-upstream
```

Or manually:

```bash
git fetch upstream
git merge upstream/main
# Resolve any conflicts
node bin/install.js --global
```

### Conflict Resolution

Files most likely to conflict during upstream sync:

| File | Why | Resolution |
|------|-----|------------|
| `bin/install.js` | Template expansion functions added | Keep fork additions, merge upstream changes |
| `get-shit-done/bin/gsd-tools.cjs` | Critic/researcher/mistake/taste commands | Keep fork additions, merge upstream changes |
| `agents/gsd-*.md` | Template markers added | Keep fork markers, merge upstream agent changes |
| `get-shit-done/workflows/update.md` | Fork update section added | Keep fork section, merge upstream changes |

## Fork Architecture

### install-manifest.json

Declarative manifest mapping source paths to installation destinations:

```
install-manifest.json
  sources:
    workflows/    -> get-shit-done/workflows/   (copy-with-path-replacement)
    researchers/  -> get-shit-done/researchers/  (copy-with-path-replacement)
    bin/          -> get-shit-done/bin/           (copy-raw)
    references/   -> get-shit-done/references/   (copy-with-path-replacement)
    templates/    -> get-shit-done/templates/     (copy-with-path-replacement)
    agents/       -> agents/                     (copy-with-path-replacement + template markers)
    commands/gsd/ -> commands/gsd/               (copy-with-path-replacement)
```

### Template Markers

Template markers in agent files enable conditional feature injection:

- `<!-- code-search-tools -->` - Replaced with MCP tool list or removed
- `<!-- code-search-guidance -->` - Replaced with guidance block or removed

Detection happens at install time, not runtime.

### verify-install.js

After installation, verify integrity:

```bash
node scripts/verify-install.js  # If available
```

## Files Modified from Upstream

### Agents (14 files)

| File | Modification |
|------|-------------|
| `agents/gsd-codebase-mapper.md` | Template markers for code-search tools |
| `agents/gsd-executor.md` | Template markers for code-search tools |
| `agents/gsd-planner.md` | Template markers for code-search tools |
| `agents/gsd-debugger.md` | Template markers for code-search tools |
| `agents/gsd-verifier.md` | Template markers for code-search tools |
| `agents/gsd-phase-researcher.md` | Template markers for code-search tools |
| `agents/gsd-project-researcher.md` | Template markers for code-search tools |
| `agents/gsd-critic-code.md` | New: code quality critic agent |
| `agents/gsd-critic-discuss.md` | New: discussion quality critic agent |
| `agents/gsd-critic-plan.md` | New: plan quality critic agent |
| `agents/gsd-critic-scope.md` | New: scope creep critic agent |
| `agents/gsd-critic-strategy.md` | New: strategy critic agent |
| `agents/gsd-critic-verify.md` | New: verification critic agent |
| `agents/gsd-research-synthesizer.md` | Modified: adaptive synthesis |

### Core (3 files)

| File | Modification |
|------|-------------|
| `bin/install.js` | Code-search detection + template expansion functions |
| `get-shit-done/bin/gsd-tools.cjs` | Mistake/taste/critic commands + routing |
| `get-shit-done/bin/lib/commands.cjs` | Researcher scan/load functions |

### Workflows (9 files)

| File | Modification |
|------|-------------|
| `get-shit-done/workflows/update.md` | Fork update section, repatch references removed |
| `get-shit-done/workflows/new-project.md` | Synthesizer integration |
| `get-shit-done/workflows/new-milestone.md` | Synthesizer integration |
| `get-shit-done/workflows/discuss-phase.md` | Taste consultation + decision logging |
| `get-shit-done/workflows/complete-milestone.md` | Taste extraction hook |
| `get-shit-done/workflows/critique.md` | Critic routing workflow |
| `get-shit-done/workflows/add-taste.md` | New: add taste entry workflow |
| `get-shit-done/workflows/extract-taste.md` | New: extract taste from logs |
| `get-shit-done/workflows/sync-upstream.md` | New: upstream sync workflow |

### New Directories

| Directory | Contents |
|-----------|----------|
| `get-shit-done/researchers/` | 11 researcher type definitions |
| `get-shit-done/bin/lib/taste.cjs` | Taste library module |
| `get-shit-done/templates/code-search-guidance.md` | Template for code-search guidance block |
| `commands/gsd/` | 6 new command stubs (add-taste, extract-taste, mistakes, add-mistake, sync-upstream, reapply-patches) |

## Troubleshooting

### Code-search not injected into agents

1. Verify `~/.claude/settings.json` has `mcpServers` with a `code-search` key
2. Re-run `node bin/install.js --global`
3. Check installed agents: `grep "mcp__code-search" ~/.claude/agents/gsd-executor.md`

### Template markers visible in installed agents

If you see `<!-- code-search-tools -->` in installed agent files, the template expansion didn't run. Re-run `node bin/install.js --global`.

### Upstream merge conflicts

1. `git fetch upstream && git merge upstream/main`
2. Resolve conflicts keeping fork additions (template markers, new functions)
3. `node bin/install.js --global` to re-install
4. Verify: no template markers visible in `~/.claude/agents/`

### Commands not found

1. Verify `~/.claude/commands/gsd/` contains all command files
2. Restart Claude Code to reload commands
3. Re-run `node bin/install.js --global`
