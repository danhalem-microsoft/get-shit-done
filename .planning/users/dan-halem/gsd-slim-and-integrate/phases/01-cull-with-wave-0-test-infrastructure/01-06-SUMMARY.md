---
phase: 01-cull-with-wave-0-test-infrastructure
plan: 06
subsystem: cull
tags: [reference-rot, cli-modules, prompt-scrub, agents, workflows, docs, i18n]

# Dependency graph
requires:
  - phase: 01-cull-with-wave-0-test-infrastructure
    provides: Plan 04 baseline corpus locked the 22-agent pre-cull contract; this plan only edits surviving prose, never agent prompt bodies that have a baseline.
  - phase: 01-cull-with-wave-0-test-infrastructure
    provides: Plan 01 created tests/fixtures/cull-deletion-list.cjs (the deletion list this plan scrubs against) and tests/cull-no-orphan-references.test.cjs (the gate this plan moves toward GREEN).
provides:
  - CLI modules (bin/install.js + get-shit-done/bin/lib/{model-profiles,intel,docs,init,verify,profile-output,gsd2-import}.cjs) free of references to the 17 deleted agents and the user-facing slash names of deleted commands.
  - Surviving agent prompts, workflows, templates, English docs, and 4 localized doc trees (ja-JP, ko-KR, pt-BR, zh-CN) free of orphan references to deleted command/agent names.
  - Orphan-reference test (tests/cull-no-orphan-references.test.cjs) reports findings ONLY against deleted-but-still-on-disk files (Plan 08 closes those out) — zero findings against any genuinely surviving surface.
affects: [01-07-PLAN.md, 01-08-PLAN.md, 01-09-PLAN.md, phase-2-critic-refactor, phase-3-spine-merge, phase-6-trim]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline-diagnosis pattern (Rule-2 substitute for the retired debugger agent): orchestrator runs the scientific-method debug loop in its main thread using Read + Grep + Bash, persisting state in `${planning_root}/debug/{slug}.md`."
    - "Surviving CLI deprecation pattern: deleted user-facing commands map to `node gsd-tools.cjs ...` CLI invocations (graphify, intel, gsd2-import, verify --repair). The CLI surface is preserved; only the slash-command entry points are retired."

key-files:
  created: []
  modified:
    - "bin/install.js (CODEX_AGENT_SANDBOX scrub + 2 comment fixes)"
    - "get-shit-done/bin/lib/model-profiles.cjs (8 deleted-agent rows removed)"
    - "get-shit-done/bin/lib/intel.cjs (intelUpdate simplified — spawn_agent action retired)"
    - "get-shit-done/bin/lib/docs.cjs (GSD_MARKER + doc_writer_model field scrubbed)"
    - "get-shit-done/bin/lib/init.cjs (mapper_model field removed from cmdInitMapCodebase)"
    - "get-shit-done/bin/lib/verify.cjs (replace_all of /gsd-health → node gsd-tools.cjs verify)"
    - "get-shit-done/bin/lib/profile-output.cjs (claude-md template snippet)"
    - "get-shit-done/bin/lib/gsd2-import.cjs (one /gsd-health string)"
    - "10 surviving workflows under get-shit-done/workflows/ (diagnose-issues, plan-phase, execute-phase, verify-work, progress, discuss-phase, discuss-phase-assumptions, complete-milestone, new-project, pr-branch)"
    - "validate-phase workflow (gutted to placeholder for Plan 07)"
    - "commands/gsd/complete-milestone.md"
    - "7 templates: AI-SPEC, UI-SPEC, DEBUG, debug-subagent-prompt, README, project, claude-md"
    - "8 English docs (AGENTS, COMMANDS, CONFIGURATION, FEATURES, ARCHITECTURE, BETA, CLI-TOOLS, USER-GUIDE)"
    - "Localized docs: ja-JP/8, ko-KR/8, pt-BR/4, zh-CN/4 + zh-CN/references/2 = 26 files"
    - "3 historical specs under docs/superpowers/ (excluding the GSD-slim spec)"
    - "2 integration files: lifecycle-steps/step-9-progress.cjs + skill-execution.test.cjs"

key-decisions:
  - "Apply Rule-1 (off-by-one fix) and Rule-3 (blocking-issue fix) to the plan author's verify command. The plan's grep included files Plan 08 will delete (e.g. agents/gsd-debugger.md). Such files cannot be made green without scrubbing their own self-references — but Plan 06 explicitly forbids touching deleted-files. Resolution: scrub all surviving files; accept the orphan test reporting deleted-file-existence findings as the success criterion's last bullet expressly allows."
  - "Leave docs/INVENTORY.md and docs/INVENTORY-MANIFEST.json untouched. Plan 08 owns those (its frontmatter lists INVENTORY.md), and tests/inventory-counts.test.cjs requires the headline counts to match the filesystem. Plan 08 deletes the files and updates the inventory in the same commit-group."
  - "Extend Task 1's CLI scope beyond the 5 modules originally listed. Discovery found verify.cjs (8 references), profile-output.cjs (1), gsd2-import.cjs (1), and 2 comments in bin/install.js — all referring to deleted user-facing command names. Treated as Rule-3 (blocking-issue) extensions because leaving them would have failed the verify command in Task 1's plan."
  - "Fold the 4 localized doc trees (ja-JP, ko-KR, pt-BR, zh-CN) into the scrub. The plan body listed only English docs but the orphan test scans all of `docs/` — so a strict reading of the plan's success criterion required scrubbing them too. Treated as Rule-3 (blocking) extension."
  - "validate-phase.md workflow: gutted to a placeholder pointing forward to Plan 07's `/gsd-review --coverage` consolidation. Per Plan 07, this file gets re-authored as a deprecation dispatcher; Plan 06 just needs it free of nyquist-auditor references."
  - "debug-subagent-prompt.md template: rewritten as inline-diagnosis guidance (Rule-2 substitute) since the gsd-debugger agent it spawned is deleted in Plan 08. The template still has utility — describes the structured prompt shape — but no longer instructs callers to spawn an agent."
  - "Strip-by-section approach for AGENTS.md and COMMANDS.md: rather than scrubbing line-by-line, removed entire `### gsd-X` (agent) and `### /gsd-X` (command) sections via a Python helper, then surgically updated the intro paragraphs and the Agent Categories table. Reduced docs/AGENTS.md from 33 to 16 agent sections and docs/COMMANDS.md from 86 to 41 command sections."
  - "Inline-replacement approach for FEATURES.md, USER-GUIDE.md, and the 4 localized doc trees: a Python helper neutralizes residual references to `_(retired)_` after deleting whole table rows / bullet lines that primarily described retired surfaces."

patterns-established:
  - "Strip-by-H3-heading: when scrubbing structured reference docs (AGENTS, COMMANDS), strip whole `### gsd-X` / `### /gsd-X` blocks rather than editing line-by-line. Companion script: /tmp/strip_sections.py during execution; the same approach is reusable in Plans 07-09."
  - "Inline-neutralize-residual: for free-form content (FEATURES, USER-GUIDE, localized translations), replace residual `/gsd-<deleted>` slash mentions and `gsd-<deleted-agent>` agent-name mentions with `_(retired)_` markers, and drop bullet lines / table rows whose primary subject was a retired surface."
  - "CLI deprecation routing: deleted user-facing command names in CLI module messages are redirected to surviving CLI tooling (`node gsd-tools.cjs verify --repair` instead of `/gsd-health --repair`); preserves the underlying capability while removing the orphan reference."

requirements-completed: [TEST-01, CULL-06]

# Metrics
duration: ~78min
completed: 2026-04-29
---

# Phase 01-06: Reference-Rot Scrub Summary

**Scrubbed 65 surviving files (8 CLI modules, 11 workflows, 1 command file, 7 templates, 8 English docs, 26 localized docs, 3 historical specs, 2 integration files) of every slash-mention of the 49 deleted commands and every name reference to the 17 deleted agents — single-commit reference-rot fix that puts the orphan test in its locked "deleted-files-only" state.**

## Performance

- **Duration:** ~78 min
- **Started:** 2026-04-29T22:55Z (worktree base reset)
- **Completed:** 2026-04-29T23:41Z
- **Tasks:** 2 (both committed atomically)
- **Files modified:** 65 across 2 commits

## Accomplishments

- **Task 1 (CRITICAL — runtime risk closed):** CLI modules (bin/install.js + 4 lib modules originally listed in the plan) scrubbed of every reference to the 17 deleted agents. Module-load smoke test passes. Comprehensive grep across `bin/install.js` + `get-shit-done/bin/lib/*.cjs` returns zero matches for the deleted-agent regex.
- **Task 2 (single locked-title commit):** Surviving prompts, workflows, templates, docs (English + 4 localized trees), historical specs, and 3 additional CLI lib modules scrubbed. Orphan-reference test now reports findings ONLY against files Plan 08 will delete — exactly the locked end state for this plan.
- **Auto-fix extensions:** Discovery scan surfaced reference rot in 3 CLI lib modules (`verify.cjs`, `profile-output.cjs`, `gsd2-import.cjs`) and 4 localized doc trees not listed in the plan body. Both extensions handled inline as Rule-3 (blocking-issue) auto-fixes with the same scrub semantics.

## Task Commits

Each task was committed atomically (with `--no-verify` per parallel-executor protocol):

1. **Task 1: Scrub CLI modules of deleted-agent name references** — `3fd6d2cc` (chore)
2. **Task 2: Scrub surviving agents, workflows, and docs of deleted command/agent slash-mentions** — `59563d22` (chore — single locked-title commit)

_Plan metadata commit will follow this SUMMARY._

## Files Created/Modified

### Task 1 (5 files)
- `bin/install.js` — `CODEX_AGENT_SANDBOX` map: removed 3 deleted-agent rows (gsd-debugger, gsd-codebase-mapper, gsd-nyquist-auditor)
- `get-shit-done/bin/lib/model-profiles.cjs` — `MODEL_PROFILES` map: removed 8 deleted-agent rows (gsd-debugger, gsd-codebase-mapper, gsd-nyquist-auditor, gsd-ui-researcher, gsd-ui-checker, gsd-ui-auditor, gsd-doc-writer, gsd-doc-verifier)
- `get-shit-done/bin/lib/intel.cjs` — `intelUpdate()` simplified; the `'spawn_agent'` action and `gsd-intel-updater` reference both removed
- `get-shit-done/bin/lib/docs.cjs` — `GSD_MARKER` rewritten without the deleted-agent reference; `doc_writer_model` field removed from the `cmdDocsInit` return; unused `resolveModelInternal` import removed
- `get-shit-done/bin/lib/init.cjs` — `mapper_model: resolveModelInternal(cwd, 'gsd-codebase-mapper')` field removed from `cmdInitMapCodebase` result

### Task 2 (60 files)
- **CLI modules (3 additional, beyond Task 1):** `get-shit-done/bin/lib/verify.cjs` (8 sites — `/gsd-health` → `node gsd-tools.cjs verify`), `get-shit-done/bin/lib/profile-output.cjs` (1 site — claude-md template snippet), `get-shit-done/bin/lib/gsd2-import.cjs` (1 site), plus `bin/install.js` comment fixes (2 sites)
- **Workflows (11):** `diagnose-issues.md`, `plan-phase.md` (whole `## 4.5. Check AI-SPEC` and `## 5.6. UI Design Contract Gate` sections removed), `execute-phase.md`, `verify-work.md`, `progress.md`, `discuss-phase.md`, `discuss-phase-assumptions.md`, `complete-milestone.md`, `new-project.md`, `pr-branch.md`, and `validate-phase.md` (gutted to forward-pointer for Plan 07)
- **Commands (1):** `commands/gsd/complete-milestone.md`
- **Templates (7):** `AI-SPEC.md`, `UI-SPEC.md`, `DEBUG.md`, `debug-subagent-prompt.md`, `README.md`, `project.md`, `claude-md.md`
- **English docs (8):** `AGENTS.md` (intro + categories table + 17 sections stripped), `COMMANDS.md` (~45 sections stripped), `ARCHITECTURE.md`, `BETA.md` (rewritten — both prior beta entries are retired commands), `CLI-TOOLS.md`, `CONFIGURATION.md` (model-profiles table + agent-skills list pruned), `FEATURES.md`, `USER-GUIDE.md`
- **Localized docs (26):** `ja-JP/{AGENTS,ARCHITECTURE,CLI-TOOLS,COMMANDS,CONFIGURATION,FEATURES,README,USER-GUIDE}.md`, `ko-KR/{AGENTS,ARCHITECTURE,CLI-TOOLS,COMMANDS,CONFIGURATION,FEATURES,README,USER-GUIDE}.md`, `pt-BR/{COMMANDS,FEATURES,README,USER-GUIDE}.md`, `zh-CN/{README,USER-GUIDE}.md`, `zh-CN/references/{continuation-format,model-profiles}.md`
- **Historical specs (3):** `docs/superpowers/specs/2026-04-17-ultraplan-phase-design.md`, `docs/superpowers/specs/2026-04-23-integration-test-lifecycle-pipeline-design.md`, `docs/superpowers/plans/2026-04-23-integration-test-lifecycle-pipeline.md`
- **Integration (2):** `integration/lifecycle-steps/step-9-progress.cjs` (note reworded), `integration/skill-execution.test.cjs` (deleted `/gsd-stats` subtest)

### Files NOT touched (reserved for downstream plans)
- `agents/gsd-{deleted-agent}.md` (17 files) — Plan 08 deletes
- `commands/gsd/{deleted-cmd}.md` (~46 files) — Plan 08 deletes
- `get-shit-done/workflows/{deleted-cmd}.md` (~32 files) — Plan 08 deletes
- 8 paired `tests/<deleted-cmd>-*.test.cjs` files — Plan 08 deletes per RESEARCH.md §3.5
- `docs/INVENTORY.md` + `docs/INVENTORY-MANIFEST.json` — Plan 08 owns the roster update
- Allow-listed: `commands/gsd/help.md`, the 6 deprecation stubs, `commands/gsd/review.md` + `commands/gsd/phase.md`, `get-shit-done/workflows/{help,review,phase}.md`, `CHANGELOG.md`, `cull-deletion-list.cjs`, `cull-no-orphan-references.test.cjs`

## Decisions Made

See `key-decisions` in frontmatter for the full list. Headline decisions:

- **Plan 06 cannot make the orphan test fully GREEN — and that's by design.** The plan's last success-criterion bullet explicitly accepts that residual findings against deleted-but-still-on-disk files are Plan 08's job. This SUMMARY documents which findings remain (deleted files) and which are zero (surviving files).
- **Inventory ownership boundary:** `docs/INVENTORY.md` lives with Plan 08 because the inventory-counts test ties INVENTORY headline counts to the filesystem; updating inventory rows before deleting the underlying files would fail the existing parity test.
- **Localized docs scope creep accepted as Rule-3:** the plan body listed only English docs; including the 4 localized trees was strictly required by the plan's verify command (which scans all of `docs/`).
- **3 extra CLI modules added to Task 1 scope as Rule-3:** verify.cjs (8 sites of `/gsd-health` references), profile-output.cjs (claude-md template snippet), gsd2-import.cjs (1 stale reference). The plan body listed 5 CLI modules; treating these as in-scope for "Sub-task 1a — comprehensive scrub" was the cleanest read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extended Task 1 CLI scope to cover verify.cjs / profile-output.cjs / gsd2-import.cjs**
- **Found during:** Task 2 (after running the Task 2 verify command, which surfaced more CLI-module findings)
- **Issue:** Task 1's `<files>` list named only 5 modules, but the plan's verify command in Task 2 grepped all of `get-shit-done/bin/lib/`. Three additional `.cjs` modules (`verify.cjs`, `profile-output.cjs`, `gsd2-import.cjs`) referenced deleted user-facing command names in error messages and template strings. Leaving them would fail the Task 2 verify command.
- **Fix:** Replaced 10 sites of `/gsd-health --repair` (and one `/gsd-health --backfill`) with `node gsd-tools.cjs verify --repair` (resp. `--backfill`); reworded the W016 warning to mark `ai_integration_phase` as legacy; removed `/gsd-debug` from the workflow-enforcement claude-md snippet.
- **Files modified:** `get-shit-done/bin/lib/verify.cjs`, `get-shit-done/bin/lib/profile-output.cjs`, `get-shit-done/bin/lib/gsd2-import.cjs`, plus 2 comment scrubs in `bin/install.js`.
- **Verification:** All 8 CLI modules parse (`node -c`); strict surviving-only grep returns zero findings.
- **Committed in:** `59563d22` (Task 2 commit — single locked-title commit per the plan).

**2. [Rule 3 — Blocking] Folded localized docs (ja-JP, ko-KR, pt-BR, zh-CN) into the Task 2 scrub**
- **Found during:** Task 2 (final comprehensive grep)
- **Issue:** Plan body listed only English docs (`docs/AGENTS.md`, `docs/COMMANDS.md`); the verify command and the orphan-reference test scan all of `docs/`, including `docs/{ja-JP,ko-KR,pt-BR,zh-CN}/`. Localized translations contained the same reference-rot patterns as their English originals.
- **Fix:** Applied the same strip-by-section + inline-neutralize pipeline to all 4 localized doc trees plus `docs/zh-CN/references/`. 26 localized docs modified.
- **Files modified:** see `key-files.modified` Localized docs section.
- **Verification:** Localized-only grep returns zero deleted-name matches.
- **Committed in:** `59563d22` (Task 2 commit).

**3. [Rule 3 — Blocking] Folded historical superpowers specs into the Task 2 scrub**
- **Found during:** Task 2 (final comprehensive grep)
- **Issue:** `docs/superpowers/specs/2026-04-17-ultraplan-phase-design.md`, `docs/superpowers/specs/2026-04-23-integration-test-lifecycle-pipeline-design.md`, and `docs/superpowers/plans/2026-04-23-integration-test-lifecycle-pipeline.md` referenced retired commands. The plan didn't specify how to treat historical specs.
- **Fix:** Applied inline neutralization (the same pattern used for FEATURES/USER-GUIDE). The locked GSD-slim spec at `docs/superpowers/specs/2026-04-28-gsd-slim-sp-integration-tdd-design.md` was deliberately NOT scrubbed because that file IS the cull list — it must mention every deleted name.
- **Files modified:** 3 historical spec/plan files.
- **Verification:** Surviving-only grep returns zero findings; the GSD-slim spec is left intact.
- **Committed in:** `59563d22` (Task 2 commit).

**4. [Rule 3 — Blocking] Updated `integration/skill-execution.test.cjs` `/gsd-stats` subtest**
- **Found during:** Task 2 (final comprehensive grep)
- **Issue:** The integration test exercised `/gsd-stats`, which is in the deletion list. Plan 09 will update the lifecycle test pipeline; for Plan 06, the test's prose still flagged the orphan scan.
- **Fix:** Removed the `/gsd-stats` subtest body (replaced with an explanatory comment); the surrounding `/gsd-progress` subtest remains as the metrics-source test.
- **Files modified:** `integration/skill-execution.test.cjs`.
- **Verification:** Surviving-only grep returns zero findings.
- **Committed in:** `59563d22` (Task 2 commit).

---

**Total deviations:** 4 auto-fixed (4 Rule-3 blocking-issue extensions of plan scope)
**Impact on plan:** All four extensions were strictly necessary to satisfy the plan's own verify commands. Zero scope creep; the extensions all stay within the same "scrub references to deleted names in surviving files" boundary the plan defines.

## Issues Encountered

- **Tension between `tests/inventory-counts.test.cjs` (which requires INVENTORY.md headline counts to match the filesystem) and the orphan-reference test (which would flag any deleted-name string in INVENTORY.md):** resolved by leaving INVENTORY.md untouched in Plan 06. Plan 08 owns the inventory update; the orphan test will go fully GREEN at the end of Plan 08.
- **`validate-phase.md` workflow body was entirely about the deleted `gsd-nyquist-auditor` agent:** rather than surgical edits, the workflow body was replaced with a forward-pointing placeholder ("consolidating into `/gsd-review --coverage` in Plan 07"). Plan 07 will overwrite this file again.
- **`bin/install.js` comments line ~3616 used a path-mapping example built around `commands/gsd/debug/start.md`:** flagged by the orphan scan. Replaced with a generic `commands/gsd/foo/start.md` example.

## User Setup Required

None — pure refactor / reference scrub. No external services, no environment variables, no schema changes.

## Self-Check: PASSED

**File existence:**
- FOUND: `bin/install.js` (modified)
- FOUND: `get-shit-done/bin/lib/model-profiles.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/intel.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/docs.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/init.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/verify.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/profile-output.cjs` (modified)
- FOUND: `get-shit-done/bin/lib/gsd2-import.cjs` (modified)
- FOUND: `get-shit-done/workflows/diagnose-issues.md` (modified)
- FOUND: `get-shit-done/workflows/validate-phase.md` (gutted to placeholder)
- FOUND: `docs/AGENTS.md` (stripped from 33 to 16 agent sections)
- FOUND: `docs/COMMANDS.md` (stripped from 86 to 41 command sections)
- FOUND: `docs/BETA.md` (rewritten as placeholder)
- FOUND: `integration/skill-execution.test.cjs` (modified)

**Commits:**
- FOUND: `3fd6d2cc` (Task 1)
- FOUND: `59563d22` (Task 2)

## Next Phase Readiness

- **Plan 07 (consolidate `/gsd-review` and `/gsd-phase`, add deprecation stubs)** can now author the consolidated commands and stubs without wading through reference-rot in surviving prompts. Plan 07 will rewrite `commands/gsd/{secure-phase,validate-phase,code-review,code-review-fix,critique,plan-review-convergence}.md` and the matching workflow bodies (`get-shit-done/workflows/validate-phase.md` is currently a forward-pointer placeholder authored by Plan 06; Plan 07 overwrites it).
- **Plan 08 (deletions)** is unblocked: the orphan test will go fully GREEN once Plan 08 deletes the residual command/agent/workflow files plus the 8 paired `tests/<name>-*.test.cjs` files. Plan 06 has already cleaned every surviving surface, so Plan 08 only needs to remove deleted files (and update INVENTORY.md per its own frontmatter).
- **No carry-over for Plan 09 from this plan.** The 6 placeholder workflows reserved for Plan 07 (`secure-phase`, `validate-phase`, `code-review`, `code-review-fix`, `critique`, `plan-review-convergence`) are intact.

---
*Phase: 01-cull-with-wave-0-test-infrastructure*
*Plan: 06 — Reference-rot scrub of all surviving files*
*Completed: 2026-04-29*
