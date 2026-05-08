---
id: MR-001
title: Autonomous bin/install.js invocation overwrites user customizations without explicit auth
slug: autonomous-install-without-authorization
created: 2026-05-08
area: install / harness-update
files:
  - bin/install.js
  - tests/install-autonomous-guard.test.cjs
related_incidents:
  - "2026-05-01T17:11:50Z — bin/install.js ran inside a Claude Code session, overwrote ~/.claude/get-shit-done/workflows/review.md (cross-AI peer review) with the new consolidated quality-gate dispatcher; user-mod backup at ~/.claude/gsd-local-patches/ was preserved BUT /gsd-reapply-patches was never run; loss invisible to user for 7 days"
severity: high
---

## Anti-Pattern

An assistant or autonomous test invokes `bin/install.js` (a destructive cross-runtime sync that overwrites files in `~/.claude/`, `~/.codex/`, `~/.gemini/`, etc.) as a "verification" or "validation" step inside a Claude Code session — without typing it as a user command and without setting an explicit authorization env var.

The install script:
1. Backs up modified files to `~/.claude/gsd-local-patches/` (good — the safety net works)
2. Replaces them with the new source content
3. Prints a message asking the user to run `/gsd-reapply-patches`

But step 3 is invisible during autonomous execution — the message scrolls past in transcript, no one runs reapply, and the user discovers the regression days later when they try to use the lost feature.

This pattern can also be triggered by:
- A test that calls `bin/install.js` against `$HOME/.claude` (instead of a tmp dir) by mistake
- A plan task whose verification step says "test the install" without realizing it mutates global state
- A hook (SessionStart, PreToolUse, etc.) that runs install for some reason

## Why It Matters

`bin/install.js` is a destructive operation:
- Wipes and replaces every file in `~/.claude/get-shit-done/`, `~/.claude/skills/gsd-*/`, `~/.claude/commands/gsd/`, `~/.claude/agents/gsd-*.md`, `~/.claude/hooks/gsd-*.{js,sh}`, etc.
- Affects multiple runtime config dirs (`.claude`, `.codex`, `.gemini`, `.kilo`, `.opencode`, `.cursor`, …)
- Cannot be auto-undone — the local-patches backup ONLY stores files the install detected as user-modified; anything else is just overwritten with no record
- Reapply is manual: the user must run `/gsd-reapply-patches` afterward and may have to resolve three-way merge conflicts

For the GSD project specifically, this means: **a 5-line refactor to a workflow file in source can silently delete a feature the user added locally and was depending on, with no review surface and no notification at use time.** Trust in autonomous execution depends on this not happening.

## Prevention

**Mechanism (added 2026-05-08):** `bin/install.js` now refuses to run when an autonomous-execution context is detected. Detection triggers on any of:
- `CLAUDECODE=1` or `CLAUDE_CODE_ENTRYPOINT` set
- `CI=true` or `GITHUB_ACTIONS=true`
- `CURSOR_SESSION_ID`, `CODEX_SESSION_ID`, `OPENCODE_SESSION_ID` set

Bypass requires an explicit `GSD_INSTALL_AUTHORIZED=1` env var the user types in the same shell, OR running install outside any agent session. Benign flags (`--help`, `--dry-run`, `--manifest-only`, `--skills-root`) pass through without the guard.

The guard is locked by `tests/install-autonomous-guard.test.cjs` (6 sub-tests).

**Process:**
- Critics reviewing plans should flag any task that calls `bin/install.js` without an authorization env var.
- Workflows that wrap install operations (`/gsd-update`, `/gsd-sync-skills`, `/gsd-reapply-patches`) MUST set `GSD_INSTALL_AUTHORIZED=1` explicitly when they invoke the script.
- If you see "GSD install BLOCKED" in any autonomous transcript, that is the safeguard working — investigate why an autonomous step tried to install.

**For users:**
- Local customizations to `~/.claude/get-shit-done/workflows/*.md` and friends survive across installs via `~/.claude/gsd-local-patches/`, but ONLY if you run `/gsd-reapply-patches` after each install.
- After any GSD update/install, check `~/.claude/gsd-local-patches/backup-meta.json` for newly-backed-up files and reapply.
