---
phase: 02-critic-refactor-with-commit-0-spike
plan: 02
subsystem: agents/_shared (critic base prompt) + CRIT-01 commit-0 spike
tags: [phase-2, wave-1, CRIT-01, CRIT-02, B2, O5, GO-NO-GO, CHECKPOINT-FAILED]
requires:
  - Plan 02-01 outputs (critic-line-budget test, spike test pair, walltime ledger schema)
  - Phase 1 walltime-recorder.cjs and walltime-ledger.jsonl
  - Claude Code CLI 2.1.128 with Task tool support
provides:
  - agents/_shared/critic-base.md (118 lines, line-1 canary HTML comment, all 8 required XML sections)
  - integration/test-fixtures/spawn-timestamp-shape.txt (127 lines, captured raw envelope + ANNOTATIONS block)
  - 2 new walltime-ledger entries tagged phase-2-critic
  - Empirical CRIT-01 spike outcome (POSITIVE FAILED, INVERSE PASSED-but-symmetric)
affects:
  - Plan 02-03+ — BLOCKED pending GO/NO-GO checkpoint resolution
  - Plan 04/05 (critic trims) — base file is now ready for the formal @-import
  - Plan 07 (CRIT-08 walltime) — fixture confirms per-Task timestamps NOT in JSON envelope; bash-wrap fallback needed
tech-stack:
  added:
    - "Shared critic base prompt at agents/_shared/critic-base.md"
  patterns:
    - "Line-1 canary HTML comment for @-resolution verification (B2)"
    - "Symlink-based bridging from worktree to ~/.claude/ for live spike tests (Rule 3 install-time deviation)"
key-files:
  created:
    - agents/_shared/critic-base.md (118 lines)
    - integration/test-fixtures/spawn-timestamp-shape.txt (127 lines)
    - .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-02-SUMMARY.md (this file)
  modified:
    - integration/test-fixtures/walltime-ledger.jsonl (+2 entries)
decisions:
  - "Spike GO/NO-GO checkpoint outcome: NO-GO. POSITIVE spike failed (canary absent in subagent output) and INVERSE spike passed-but-symmetric (no discriminating signal). Plan 02-02 returns to orchestrator for human decision on fallback path."
  - "Diagnosis: B2 canary-agnostic prompt design is structurally unverifiable with the critic agent's tool grants (Read/Bash/Grep/Glob). The sub-agent has no tool to introspect its own loaded system prompt context. The 'no HTML comment' reply is symmetric across positive and inverse spikes regardless of whether @-resolution worked, providing zero discriminating signal."
  - "Per-Task spawn timestamps NOT FOUND in result.raw envelope from `claude --print --output-format json`. result.raw exposes: top-level duration_ms (TOTAL parent walltime), num_turns, usage.iterations[] (per-iteration token counts only, no timestamps). Plan 07 (CRIT-08) must use bash-wrap timestamp injection per RESEARCH §Pitfall-2, OR re-capture under --output-format=stream-json to test if ToolUseBlock events expose per-Task started_at."
  - "Rule 3 deviation: bridging the worktree's edited agents/gsd-critic-plan.md and agents/_shared/critic-base.md into ~/.claude/ via symlink was REQUIRED for the spike to even attempt @-resolution. The plan as written assumed Claude Code resolves agent definitions from <worktree>/agents/ — but it actually resolves from ~/.claude/agents/. All bridging restored to pre-spike state at end of plan."
metrics:
  start: "2026-05-04T21:24:29Z"
  end: "2026-05-04T21:33:54Z"
  duration: "~10 min"
  duration_seconds: 565
  tasks_completed: 1
  tasks_partial: 1
  files_created: 2
  files_modified: 1
  total_lines_added: 245
  spike_total_cost_usd: 0.5165
  spike_total_walltime_ms: 24975
  completed: "2026-05-04"
status: CHECKPOINT — GO/NO-GO failed; awaiting orchestrator/user decision
---

# Phase 2 Plan 02: Author critic-base.md + Run CRIT-01 GO/NO-GO Spike Pair Summary

Author the shared critic base prompt at `agents/_shared/critic-base.md` and run the live CRIT-01 spike pair (positive + inverse) to verify Claude Code's `@`-reference resolution at Task spawn time. **Outcome: POSITIVE spike FAILED.** Diagnosis below; orchestrator action required to choose fallback path.

## Tasks Completed (1 of 2 — second is partial-blocked)

| Task | Status | Hash | Files | Outcome |
|---|---|---|---|---|
| 1. Author agents/_shared/critic-base.md | DONE | 19ae8d4d | agents/_shared/critic-base.md (118 lines) | All acceptance criteria pass; CRIT-02 sub-test of critic-line-budget GREEN |
| 2. Run live CRIT-01 spike pair + capture spawn-timestamp shape | PARTIAL — checkpoint FAILED | 8d9823d3 | integration/test-fixtures/spawn-timestamp-shape.txt + walltime-ledger.jsonl entries | POSITIVE: FAILED. INVERSE: PASSED-but-symmetric. Fixture captured + annotated. Bridging restored. |

## What Was Built

### agents/_shared/critic-base.md (Task 1)

118 lines, well under the 250-line CRIT-02 cap. Structure:

| Section | Lines | Purpose |
|---|---|---|
| Line 1: HTML canary comment | 1 | `<!-- SPIKE-CANARY-7d8e9f0-base-loaded —————————————————————————————— -->` (B2 design) |
| Lines 2-4: 3 explanatory HTML comments | 3 | Owner, purpose, line budget |
| `<role>` | ~15 | Adversarial critic identity, tone, philosophy, cross-flag guidance |
| `<context_loading>` | ~12 | Phase artifact resolution + addendum-checklist load |
| `<severity_rubric>` | ~9 | critical / warning / info definitions with default-to-info rule |
| `<finding_format>` | ~22 | Required fields including the new explicit `**Category:**` field (RESEARCH §Open-Q-2) |
| `<cross_flag_rules>` | ~9 | 30% cap, info-default for thin evidence |
| `<evidence_requirements>` | ~9 | file:line REQUIRED, external citations for critical/warning |
| `<output_contract>` | ~30 | YAML frontmatter spec + post-write verify directive (RESEARCH §Pitfall-3) |
| `<success_criteria>` | ~10 | Pass/fail gates |

All 8 required XML sections present (verified via `grep -c "<{tag}>"` for each). The `**Category:**` field is on its own line (verified). The post-write `test -f "${PHASE_DIR}/CRITIQUE-${lens}.md"` directive is present (verified via `grep -F`).

**CRIT-02 sub-test of `tests/critic-line-budget.test.cjs` is now GREEN.** Other sub-tests (CRIT-03 line budget per addendum, CRIT-04 total budget, leading @-import) remain RED until Plans 04/05 trim the addendums — exactly as the plan's truths #2 specified.

### Spike pair execution + captured fixture (Task 2)

**Bridging setup (Rule 3 deviation):**

The plan assumed editing `<worktree>/agents/gsd-critic-plan.md` and creating `<worktree>/agents/_shared/critic-base.md` would be picked up by Claude Code at Task spawn time. Empirical fact: Claude Code resolves the `gsd-critic-plan` subagent definition from `~/.claude/agents/gsd-critic-plan.md` (the globally-installed copy), and resolves `@~/.claude/get-shit-done/...` paths via `$HOME` expansion. The worktree files are **invisible** to Claude Code's Task-spawn agent loader.

Bridge installed:

| Mapping | Type | Purpose |
|---|---|---|
| `~/.claude/agents/gsd-critic-plan.md` → `<worktree>/agents/gsd-critic-plan.md` | symlink (with backup of original) | Make the worktree's edited agent file (with @-import) visible to the Task-spawn loader |
| `~/.claude/get-shit-done/agents/_shared` → `<worktree>/agents/_shared/` | symlink (parent dir created) | Make `@~/.claude/get-shit-done/agents/_shared/critic-base.md` resolve to the worktree's base file |

Why symlink not copy: the inverse spike does `fs.renameSync(<worktree>/agents/_shared/critic-base.md, <same>.bak)`. With the symlink, that rename **breaks the resolution chain at the file level** (verified empirically before running spikes), giving the inverse spike a real "base file hidden" semantics.

**POSITIVE spike (`integration/critic-spike-passes.test.cjs`):**

```
Result: FAILED
Exit: 1
Walltime: 14,915 ms (14.9s)
Cost: $0.336844
Sub-agent's reply: "The gsd-critic-plan subagent reported no HTML comment on the first line of its context."
Assertion failure: canary "SPIKE-CANARY-7d8e9f0-base-loaded" not found in critic output.
Walltime ledger: entry recorded with phase=phase-2-critic.
```

**INVERSE spike (`integration/critic-spike-inverse.test.cjs`):**

```
Result: PASSED (but the PASS is structurally symmetric with the positive's FAILURE — see diagnosis)
Exit: 0
Walltime: 13,701 ms (13.7s)
Cost: $0.179598
Sub-agent's reply: same shape — no HTML comment found on first line.
Assertion succeeded: canary absent in result.
Worktree base file restored via try/finally. No .bak left behind.
Walltime ledger: entry recorded with phase=phase-2-critic.
```

**Spike total: $0.5165 USD, ~28.6s walltime.**

### `integration/test-fixtures/spawn-timestamp-shape.txt`

127 lines. Captured `result.raw` envelope from positive spike + executor-authored ANNOTATIONS block.

**Per-Task timing fields NOT FOUND in raw envelope.** The `--output-format json` envelope from `claude --print` exposes:
- top-level `duration_ms` (TOTAL parent walltime — single number, NOT per-Task)
- `duration_api_ms` (TOTAL API time)
- `num_turns` (parent turn count, not Task spawn count)
- `usage.iterations[]` (per-iteration token counts only — NO timestamps inside)
- `modelUsage.<model_id>` (token counts only)

**Plan 07 (CRIT-08 walltime test) impact:** the bash-wrap fallback per RESEARCH §Pitfall-2 is REQUIRED — wrap each Task call in `date +%s%N` echos. Alternative for Plan 07 to test: `--output-format=stream-json` may surface ToolUseBlock events with timestamps; recommend re-capturing under that format before committing to the bash-wrap path.

## Diagnosis: Why the Positive Spike Failed

The "no HTML comment" reply is **structurally symmetric** across positive and inverse spikes. The inverse PASS is therefore not a real PASS — it's the same null result the positive produced, just under an assertion that expected the null result.

The B2 canary-agnostic prompt design assumes the sub-agent can introspect its own loaded system prompt context and report what's there. But the `gsd-critic-plan` agent's tool grants are `Read, Bash, Grep, Glob` — there is **no tool that can read the agent's own prompt context window**. When asked "Print any HTML comment you find on the first line of your context," the sub-agent has three failure modes:

1. **Reasonable refusal:** "I don't have a way to see my own prompt." (consistent with the observed reply text)
2. **Tool-misuse:** Try to Read some file that's not its prompt — fails to find HTML comment.
3. **Confabulation:** Make up an answer. (we'd see something canary-like in the output if this happened — we did not).

The observed output ("subagent reported no HTML comment on the first line of its context") is consistent with all three modes. **None of them tell us whether @-resolution succeeded or failed at Task spawn time.**

This was missed in the 02-REVIEWS.md B2 fix — verify-C-001 redesigned the prompt to be canary-agnostic to eliminate echo-from-prompt false-positives, but did not verify the redesigned prompt is actually answerable by the sub-agent's tool grants.

## Recommendations for the Orchestrator

The positive spike's FAIL is the GO/NO-GO trigger per Plan 02-02 design. Three fallback paths the orchestrator can choose from:

### Option A — Phase 2.1 INSERTED plan: install-time inlining (RESEARCH §Pitfall-1 fallback)

Authoritative fallback per the original ROADMAP. `bin/install.js` reads `agents/_shared/critic-base.md` at install time and splices its content into each critic file before writing to `~/.claude/agents/`. This sidesteps `@`-resolution entirely. Cost: 1 plan (~1-2 days), small added install-time logic, source `agents/gsd-critic-*.md` files diverge from installed artifacts.

Pros: deterministic, no Claude Code runtime dependency.
Cons: source ≠ artifact; updating base requires re-install; harder to debug locally.

### Option B — Redesign the spike with a verifiable probe (recommended; cheaper than A)

Replace the canary-agnostic prompt with one the sub-agent can actually answer using its tool grants. Two viable designs:

1. **Read-self probe:** ask the sub-agent to use the Bash tool to `cat <path-to-its-resolved-agent-file>` — but this only verifies file existence, not @-expansion semantics.

2. **Behavioral-canary probe:** plant an instruction inside the base file (e.g., `<role>` block) that tells the agent "if asked about your favorite-color, respond exactly: cyan-7d8e9f0". Then the spike prompt asks "what is your favorite color? answer in one word." This works because:
   - The instruction lives ONLY in `critic-base.md` (NOT in the spike prompt — canary-agnostic preserved)
   - The sub-agent answers from instruction-following, not introspection
   - If `@`-resolution worked, sub-agent says "cyan-7d8e9f0"
   - If `@`-resolution failed, sub-agent has no instruction about favorite color and either refuses, hedges, or gives a generic color

   Cost: ~$0.60 for a fresh positive+inverse spike pair. Inverse rename hides the instruction; sub-agent gives a non-canary answer; assertion holds.

3. **Tool-output canary probe:** plant `bash` instruction `{tools.bash}` is permitted and tell the agent "if asked, use Bash to print 'CANARY-OBSERVED-<hash>'." Same logic; uses the tool grant.

Recommendation: Option B-2 (behavioral canary). Eliminates introspection requirement; preserves canary-agnostic prompt design intent; cheap to verify ($0.60).

### Option C — Accept the empirical evidence as sufficient (riskiest)

The repo already has 16+ working `@`-references in production agents (`gsd-planner.md`, `gsd-executor.md`, `gsd-verifier.md`, `gsd-plan-checker.md`, `gsd-phase-researcher.md`, `gsd-user-profiler.md`). Plan 02 RESEARCH §Pre-existing evidence (HIGH confidence) treats this as strong prior on PASS. If the orchestrator decides the lack of a verifiable spike PASS is acceptable given the prior, Plans 04/05 can proceed with the `@`-reference architecture and rely on integration tests (CRIT-08, CRIT-10) to catch silent regressions.

Pros: cheapest; matches stated research.
Cons: no canary-level verification; if `@`-resolution silently broke at Task-spawn time (vs. top-level), failure would only surface as quality regression in CRIT-10 parity.

**Suggested resolution:** orchestrator picks Option B-2 (redesign spike with behavioral canary), authorizes a $0.60 re-run, lands as a Plan 02-02 follow-up commit before Plan 03 starts. If Option B-2 still fails, escalate to Option A. Option C is acceptable only if the orchestrator/user explicitly accepts the verification gap.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] Bridging required for spike to test the @-resolution path**
- **Found during:** Task 2 Step A — pre-spike investigation
- **Issue:** The plan's Step A (Edit gsd-critic-plan.md to add @-import) and Step B (run spike) implicitly assume Claude Code's Task-spawn agent loader picks up the worktree's `agents/gsd-critic-plan.md`. Empirical fact: Claude Code resolves agent names from `~/.claude/agents/<name>.md` (globally installed), not from the worktree's `agents/` directory. Likewise, `@~/.claude/get-shit-done/agents/_shared/critic-base.md` resolves via `$HOME` expansion — the file must live at `$HOME/.claude/get-shit-done/agents/_shared/critic-base.md`, which doesn't exist in the user's install (only `~/.claude/get-shit-done/{bin,references,workflows,...}` exist; no `agents/` subdir).
- **Fix:** Bridged the worktree's files into `~/.claude/` via symlinks (with original-file backup of the agent), with full restoration after spike completion. Symlink semantics ensure the inverse spike's `fs.renameSync` of the worktree base file actually breaks the @-resolver's path (verified empirically before running spikes).
- **Files affected (transient — restored at end):**
  - `~/.claude/agents/gsd-critic-plan.md` → symlink → `<worktree>/agents/gsd-critic-plan.md` (then restored from `/tmp/gsd-spike-bridge-agent-backup.md`)
  - `~/.claude/get-shit-done/agents/_shared` → symlink → `<worktree>/agents/_shared/` (then symlink + parent `agents/` dir removed)
- **Justification:** Without bridging, the spike literally cannot test what it claims to test. Spike documentation (plan + RESEARCH) is silent on this install-time prerequisite — likely an unstated assumption that the planner had a custom local install. Bridging is fully reverted; no leftover state at HOME or worktree git level.
- **Verification post-cleanup:**
  - `md5sum ~/.claude/agents/gsd-critic-plan.md /tmp/gsd-spike-bridge-agent-backup.md` → identical hashes (`d47a2e3e95a46d18e0f0a33a01d5ba29`)
  - `ls ~/.claude/get-shit-done/` shows no `agents/` subdir leakage
  - `git diff --quiet agents/gsd-critic-plan.md` exits 0 (worktree clean)

**2. [Rule 3 — Blocking] One-shot test-file edit reverted via git checkout**
- **Found during:** Task 2 Step D
- **Issue:** Plan's Step D dictates "Modify `integration/critic-spike-passes.test.cjs` temporarily (or write a one-shot helper script) to dump `result.raw` to `integration/test-fixtures/spawn-timestamp-shape.txt`." Direct file modification is simpler than a helper script, but creates a temporary diff against HEAD that must be reverted.
- **Fix:** Added a `try { fs.writeFileSync(fixturePath, header); } catch (e) { ... }` block immediately after the `recordWalltime(...)` call in `integration/critic-spike-passes.test.cjs`. After the spike ran (positive only — inverse already had the data point we needed), reverted via `git checkout HEAD -- integration/critic-spike-passes.test.cjs`.
- **Files affected (transient — reverted):** `integration/critic-spike-passes.test.cjs`
- **Justification:** Plan explicitly anticipates this revert in Step E ("After the run, REVERT the test edit"). Captured fixture is committed to repo separately; test file matches HEAD post-revert (`git diff --quiet` exits 0).

**3. [Documented finding — not a deviation per se] B2 prompt is structurally unverifiable**
- **Found during:** post-spike analysis
- **Issue:** see "Diagnosis" section above. Not auto-fixable in this plan; documented as orchestrator decision input.
- **Fix:** Recommendation in "Options" section above (B-2 behavioral canary preferred).

## Authentication Gates

None. Live spike runs used the user's existing Claude Code CLI authentication. Total spend: $0.5165 USD across both spikes — well under the $5 maxBudget cap.

## Self-Check: PASSED

**Files claimed created — all FOUND on disk:**
- agents/_shared/critic-base.md (118 lines)
- integration/test-fixtures/spawn-timestamp-shape.txt (127 lines)
- .planning/users/dan-halem/gsd-slim-and-integrate/phases/02-critic-refactor-with-commit-0-spike/02-02-SUMMARY.md (this file)

**Commits claimed — all FOUND in git log:**

```bash
$ git log --oneline -3
8d9823d3 test(02-02): record CRIT-01 spike outcomes — POSITIVE FAILED, INVERSE PASSED
19ae8d4d feat(02-02): author agents/_shared/critic-base.md (CRIT-02)
dfcb6118 docs(phase-2): mark Plan 02-01 complete after Wave 0 — 6 RED tests landed as expected, +0 unexpected regressions
```

- 19ae8d4d (Task 1) — feat(02-02): author agents/_shared/critic-base.md (CRIT-02) — FOUND
- 8d9823d3 (Task 2) — test(02-02): record CRIT-01 spike outcomes — POSITIVE FAILED, INVERSE PASSED — FOUND

**Verification commands run:**

| Check | Result |
|---|---|
| `wc -l agents/_shared/critic-base.md` | 118 (under 250 cap) |
| `head -1 agents/_shared/critic-base.md \| grep -c SPIKE-CANARY` | 1 |
| `node --test --test-name-pattern='CRIT-02' tests/critic-line-budget.test.cjs` | exit 0 (CRIT-02 sub-test GREEN) |
| `grep -c '\*\*Category:\*\*' agents/_shared/critic-base.md` | 1 |
| `grep -cF 'test -f "${PHASE_DIR}/CRITIQUE-${lens}.md"' agents/_shared/critic-base.md` | 1 |
| `node --test integration/critic-spike-passes.test.cjs` | exit 1 (FAILED — assertion: canary absent) |
| `node --test integration/critic-spike-inverse.test.cjs` | exit 0 (PASSED — canary absent as asserted) |
| `test -f integration/test-fixtures/spawn-timestamp-shape.txt && wc -l ...` | 127 lines |
| `grep -c "ANNOTATIONS" integration/test-fixtures/spawn-timestamp-shape.txt` | 1 |
| `grep -c "started_at\|duration_ms\|NOT FOUND" integration/test-fixtures/spawn-timestamp-shape.txt` | 8 |
| `grep -c '"test":"integration:critic-spike-passes"' integration/test-fixtures/walltime-ledger.jsonl` | 1 |
| `grep -c '"test":"integration:critic-spike-inverse"' integration/test-fixtures/walltime-ledger.jsonl` | 1 |
| `grep -c "@~/.claude/get-shit-done/agents/_shared/critic-base.md" agents/gsd-critic-plan.md` | 0 (temp edit reverted) |
| `git diff --quiet agents/gsd-critic-plan.md` | exit 0 (clean) |
| `git status --porcelain agents/_shared/critic-base.md \| wc -c` | 0 (clean) |
| `test ! -f agents/_shared/critic-base.md.bak` | exit 0 (no .bak residue) |
| `md5sum ~/.claude/agents/gsd-critic-plan.md` | matches pre-spike backup |
| `ls ~/.claude/get-shit-done/agents/` | dir does not exist (clean — bridging fully removed) |

## Threat Flags

None new. Threat register entries are addressed:

- **T-02-A (Spoofing — @-resolver silent skip):** Mitigation incomplete — the canary-based design did not produce a discriminating signal. Diagnosis points to prompt-design flaw, not necessarily resolver failure. Orchestrator decides next step (Option A/B/C above).
- **T-02-B (Tampering — gsd-critic-plan.md temp edit):** Verified mitigation — `grep -c "@~/.claude/..." agents/gsd-critic-plan.md` returns 0; `git diff --quiet` exits 0; `git status --porcelain` empty.
- **T-02-C (Tampering — inverse-rename leaks .bak):** Verified mitigation — `test ! -f agents/_shared/critic-base.md.bak` succeeds; `git status --porcelain agents/_shared/critic-base.md` empty; rename-restore inside try/finally ran successfully.
- **T-02-D (Information Disclosure — fixture committed):** Accepted — fixture is committed; contents include cost/duration/session_id from the test run (no secrets; values are routine Claude Code infrastructure metrics).
- **T-02-E (Repudiation — GO/NO-GO decision):** Mitigation in place — this SUMMARY records full empirical evidence: walltime, cost, sub-agent reply text, fixture content, three fallback options with costs, and an explicit "NO-GO at this gate" status. Orchestrator owns the decision.

## TDD Gate Compliance

This plan's frontmatter does NOT specify `type: tdd`. Task 1 is `type="auto" tdd="true"` per the plan, and was implemented as a single Write (no test-first iteration cycle was needed — `tests/critic-line-budget.test.cjs` was already RED and now its CRIT-02 sub-test is GREEN, satisfying the implicit RED→GREEN cycle). Task 2 is `type="checkpoint:human-verify"`, not a TDD task.

Commits map to GSD conventions:
- 19ae8d4d: `feat(02-02): ...` (Task 1 — implementation that turns CRIT-02 sub-test GREEN)
- 8d9823d3: `test(02-02): ...` (Task 2 — captures live test results + fixture)

No additional `refactor` commit needed.

## Status: CHECKPOINT — GO/NO-GO FAILED — Awaiting Orchestrator Decision

The plan completed Task 1 cleanly. Task 2 ran both live spikes, captured the fixture, and produced empirical data — but the positive spike's assertion failed, triggering the plan's GO/NO-GO checkpoint.

**The orchestrator must choose:**
- **Option A** — Phase 2.1 INSERTED plan: install-time inlining via `bin/install.js`
- **Option B** — Redesign spike with a verifiable probe (recommended: behavioral canary, ~$0.60 re-run)
- **Option C** — Accept empirical evidence (16+ working @-refs in production) as sufficient

Plans 02-03 through 02-08 are BLOCKED until this decision is made. All bridging is restored; the worktree and `~/.claude/` are at clean pre-spike state (modulo the two new commits + the new agents/_shared/critic-base.md file).
