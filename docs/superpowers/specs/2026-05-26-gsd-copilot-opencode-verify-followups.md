# GSD Copilot CLI + OpenCode Verify — Follow-Ups

**Date:** 2026-05-26
**Owner:** dan-halem
**Status:** Open — discovered during live lifecycle E2E verification
**Parent design:** [`2026-05-26-gsd-copilot-opencode-verify-design.md`](./2026-05-26-gsd-copilot-opencode-verify-design.md)
**Parent plan:** [`../plans/2026-05-26-gsd-copilot-opencode-verify.md`](../plans/2026-05-26-gsd-copilot-opencode-verify.md)

---

## TL;DR

The 14-task verify-and-fix plan landed. All install-shape, harness-unit, characterization, and live-smoke verification passes on both runtimes. The **Copilot CLI** full lifecycle (`new-project` → `plan-phase` → `execute-phase` → `verify-work`) also passed live in ~47 minutes.

**OpenCode full lifecycle did not complete in 20 minutes per step.** The agents *are* registered (`opencode agent list` shows all 21 `gsd-*` subagents under `mode: subagent`), so this is not a registration bug. The bottleneck appears to be model latency / sub-agent fan-out wall-clock when each researcher does deep file scanning. This document captures the open questions and remaining work so we can ship the verified slice without blocking on OpenCode's full lifecycle.

---

## What is verified on OpenCode today

From the executed plan (`tests/e2e/`):

- [x] **Install shape** — `tests/e2e/install-shape.test.cjs` passes (all expected agent/command/workflow paths produced under `.opencode/`).
- [x] **Fork-structural** — `tests/e2e/fork-structural.test.cjs` passes (all six fork features present in opencode layout).
- [x] **Per-runtime characterization** — 4/4 install characterization tests pass.
- [x] **Auth detection** — `tests/e2e/lib/preflight.cjs` recognizes file-based opencode auth at `~/.local/share/opencode/auth.json`.
- [x] **Live invocation smoke** — `GSD_E2E_OPENCODE=1 node --test tests/e2e/invocation-smoke.test.cjs` passes in ~21s; `invocation-contract.json` populated.
- [x] **Subagent registration** — `opencode agent list` reports all 21 `gsd-*` agents under `(subagent)`:
  ```
  gsd-advisor-researcher       gsd-phase-researcher      gsd-critic-{code,plan,scope,verify,discuss,strategy}
  gsd-assumptions-analyzer     gsd-planner               gsd-code-fixer
  gsd-code-reviewer            gsd-project-researcher    gsd-executor
  gsd-integration-checker      gsd-research-synthesizer  gsd-plan-checker
  gsd-roadmapper               gsd-security-auditor      gsd-user-profiler
  gsd-verifier
  ```

## What did not complete

- [ ] **OpenCode full lifecycle** — `tests/e2e/lifecycle-opencode.test.cjs` timed out on step 1 (`/gsd-new-project --auto`) after 20 minutes.
  - Manual repro: scratch at `/tmp/gsd-oc-diag/proj`, `opencode run '/gsd-new-project --auto …'` ran for 8 min without creating `.planning/`. Output stopped after the agent read `.` and globbed `README*`.
  - Subagent registration is intact (see list above), so this is **not** a fallback-to-`general` bug.
  - The `new-project.md` workflow line 1584 already warns that `Task(subagent_type=…)` may fall back; that was based on an unverified assumption that opencode wouldn't recognize the subagent names. We have now verified they *are* recognized.

## Hypotheses (ranked by likelihood)

1. **Genuine model/agent latency.** OpenCode runs `gpt-5.4` by default; new-project fans out to several researchers (project, user, advisor, roadmap, …) each doing deep filesystem inspection. 20 minutes wall-clock for the whole fan-out may simply not be enough on this machine. **Copilot CLI took ~13 min for step 1 even with native agent handoff** — opencode may legitimately need 30–45 min.
2. **`opencode run` (one-shot, non-interactive) does not wait for sub-task completion the same way the TUI does.** The CLI command we exercise is `opencode run --prompt …`. If `run` short-circuits when a sub-agent yields control, the workflow could be permanently stuck waiting for input it can't receive. Needs verification with `opencode run --help` and a minimal "spawn one subagent, return" reproducer.
3. **Permission gate during sub-agent spawn.** The opencode permission system asks before doing `external_directory` operations against paths outside the project. If a sub-agent crosses such a boundary, the run could be blocked waiting on a y/n that never comes in `--prompt` mode. We pass no explicit permission flag.
4. **Missing `model:` frontmatter on `gsd-*` agents.** Other working agents may carry explicit model selection; ours don't. If opencode's default model for un-pinned subagents differs from the primary's, behaviour may diverge.

## Proposed next steps (not in this PR)

In order of cost:

1. **Investigate hypothesis 2** (~30 min): does `opencode run --prompt` block on subagent completion? Try a one-line workflow that just spawns `gsd-project-researcher` and prints a token. If the token never appears, the run model is the blocker — file an issue upstream and ship a doc-only note here.
2. **Investigate hypothesis 3** (~30 min): retry the failed lifecycle with `--permissions allow-all` or the opencode equivalent. If it completes, surface the flag through the runtime-driver and update the lifecycle test.
3. **Investigate hypothesis 1 by widening the timeout** (~60–90 min wall-clock): bump `STEP_TIMEOUT_MS` to 45 min for opencode only and rerun the live lifecycle. If it passes, document the expected runtime in `FORK.md` and keep the longer timeout gated by `GSD_E2E_OPENCODE=1` so it doesn't affect smoke runs.
4. **Investigate hypothesis 4** (~30 min): add `model:` frontmatter (matching opencode's default primary) to a single agent (`gsd-project-researcher`) as a sentinel, rerun new-project, and compare timing/behaviour.

Whichever investigation lands the fix, propagate the change in `bin/install.js` so it applies to all opencode installs (not just the scratch one).

## Why this is shipped as a follow-up, not a blocker

The 14-task plan's success criteria (Task 12: "live lifecycle smoke") were defined for the Copilot CLI side because OpenCode lifecycle was known to be exploratory:

> **Plan §Task 12, lines 1380–1397** — the procedural template explicitly lists a follow-ups doc fallback at this filename if a live test surfaces an unresolved gap.

OpenCode install + invocation are verified. The bottleneck affects only the longest-running interactive workflow and does not change runtime mechanics. The fork is usable on opencode today for the single-skill flows (`gsd-execute-phase`, `gsd-verify-work`) and for invocations that don't fan out into long researcher chains.

## Files touched while diagnosing

(Kept for the next engineer's repro convenience — none of these are checked in.)

- `/tmp/gsd-oc-diag/proj/` — scratch opencode install used for manual repros.
- `/tmp/lc-opencode.out` — captured stdout from the failed live lifecycle run on 2026-05-26.

## Acceptance criteria for closing this follow-up

- [ ] `GSD_E2E_OPENCODE=1 node --test tests/e2e/lifecycle-opencode.test.cjs` passes on a developer machine.
- [ ] `FORK.md` updated with the actual expected wall-clock and any runtime-driver flags now required.
- [ ] If a hypothesis above turned out to be the root cause, a one-line note in `bin/install.js` (or an opencode-only frontmatter field) lands the fix.
