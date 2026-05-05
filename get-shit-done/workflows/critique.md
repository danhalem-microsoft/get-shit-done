<purpose>
Run all 6 GSD critic agents (gsd-critic-{plan,code,scope,verify,discuss,strategy}) in parallel against a phase, aggregate per-critic CRITIQUE files from disk, and emit a merged report.

This workflow mitigates the parallel-Task hallucination bug ([anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181)) by reading each critic's output from disk via `gsd-sdk query critic-aggregate` instead of trusting the parent agent's text summary of the spawned Tasks.

Spawned by: `commands/gsd/review.md --critique <phase>` (passes the phase argument through as `$PHASE_ARG`).
</purpose>

<available_agent_types>
Valid GSD critic subagent types — use these exact names in `Task()` calls:

- gsd-critic-plan
- gsd-critic-code
- gsd-critic-scope
- gsd-critic-verify
- gsd-critic-discuss
- gsd-critic-strategy

Each addendum exposes a `<{lens}_specific_checklist>` block (finalized by Plan 02-04 for `strategy` and Plan 02-05 for `plan`/`code`/`scope`/`verify`/`discuss`). The Task prompts below reference those exact tag names so each critic loads its lens-specific guidance from the addendum after the shared `@_shared/critic-base.md` import.
</available_agent_types>

<process>
1. Resolve `phase_dir` from `$PHASE_ARG` via the Bash tool:

   ```bash
   gsd-sdk query find-phase $PHASE_ARG
   ```

   Capture `phase_dir` from the JSON response. The remaining steps reference it as `<phase_dir>` in prompt templates.

2. Read these phase artifacts (skip silently if any are absent — the plan may be in early-phase state):
   - `PLAN.md` (or `*-PLAN.md` files for multi-plan phases)
   - `SUMMARY.md` (or `*-SUMMARY.md` files for completed plans)
   - `VERIFICATION.md` (if the phase has run a verification pass)
   - `CONTEXT.md` (decisions made during planning)
   - prior `CRITIQUE-*.md` files (for dismissed-finding carry-forward — critics consult their own previous output to avoid re-flagging issues the user has already triaged)

3. **In a SINGLE assistant message, emit ALL 6 `Task()` calls in one contiguous block — DO NOT split across messages.** Claude Code only launches Tasks in parallel when they live inside one assistant turn. Splitting kills the walltime gain and reduces the batch to a serial pipeline (per RESEARCH §Anti-Patterns and the explicit prohibition in CRIT-06). The static guard test `tests/critique-workflow-structure.test.cjs` enforces that the 6 calls are not separated by `Wait`/`Step N`/`After … returns` prose.

   Task(subagent_type="gsd-critic-plan",     prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review the phase's PLAN.md (and *-PLAN.md plan files) for plan-quality issues per your <plan_specific_checklist>. Consult prior CRITIQUE-plan.md if present and carry forward any dismissed findings. Write CRITIQUE-plan.md to phase dir, then `test -f <phase_dir>/CRITIQUE-plan.md` to verify the file flushed before returning.")
   Task(subagent_type="gsd-critic-code",     prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review files changed across the phase's commits and the relevant src files for code-quality issues per your <code_specific_checklist>. Consult prior CRITIQUE-code.md if present. Write CRITIQUE-code.md to phase dir, then `test -f <phase_dir>/CRITIQUE-code.md` to verify the file flushed before returning.")
   Task(subagent_type="gsd-critic-scope",    prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review PLAN.md + CONTEXT.md for scope creep per your <scope_specific_checklist>. Consult prior CRITIQUE-scope.md if present. Write CRITIQUE-scope.md to phase dir, then `test -f <phase_dir>/CRITIQUE-scope.md` to verify the file flushed before returning.")
   Task(subagent_type="gsd-critic-verify",   prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review VERIFICATION.md and the must_haves frontmatter blocks across the phase's plan files per your <verify_specific_checklist>. Consult prior CRITIQUE-verify.md if present. Write CRITIQUE-verify.md to phase dir, then `test -f <phase_dir>/CRITIQUE-verify.md` to verify the file flushed before returning.")
   Task(subagent_type="gsd-critic-discuss",  prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review CONTEXT.md decisions per your <discuss_specific_checklist>. Consult prior CRITIQUE-discuss.md if present. Write CRITIQUE-discuss.md to phase dir, then `test -f <phase_dir>/CRITIQUE-discuss.md` to verify the file flushed before returning.")
   Task(subagent_type="gsd-critic-strategy", prompt="Phase: $PHASE_ARG. Phase dir: <phase_dir>. Review milestone-level strategy per your <strategy_specific_checklist>. Consult prior CRITIQUE-strategy.md if present. Write CRITIQUE-strategy.md to phase dir, then `test -f <phase_dir>/CRITIQUE-strategy.md` to verify the file flushed before returning.")

4. After all 6 Tasks return, **DO NOT trust their text summaries** ([anthropics/claude-code#29181](https://github.com/anthropics/claude-code/issues/29181) — parallel Task spawns can fabricate plausible-looking return text that does not match what was actually written to disk). Instead, read the critic output from disk via the Bash tool:

   ```bash
   gsd-sdk query critic-aggregate --phase $PHASE_ARG --json
   ```

   This globs `CRITIQUE-{plan,code,scope,verify,discuss,strategy}.md` files in `phase_dir`, parses each one's YAML frontmatter, and returns aggregated JSON of shape:

   ```
   {
     phase, phase_dir,
     critics_expected: ["plan", "code", "scope", "verify", "discuss", "strategy"],
     critics_present, critics_missing,
     severity_counts_total: { critical, warning, info, total },
     status: "pass" | "warn" | "fail",
     files: [{ path, critique_type, severity_counts, status }]
   }
   ```

5. **Skip-and-continue policy (CRIT-09):** if `critics_missing` is non-empty, emit one info-severity orchestrator finding per missing critic into the merged report, then continue. Do NOT halt the workflow — a single missing critic must not block the user's review of the surviving five.

   Finding template (one block per missing critic):

   ```
   ### [INFO] <critic-name> did not produce CRITIQUE
   **ID:** orchestrator-i-<seq>
   **File:** N/A — orchestrator-level finding
   **Severity:** info
   **Lane:** primary
   **Category:** missing-critic-output
   **Evidence:** Expected `CRITIQUE-<lens>.md` not found in phase_dir after the parallel Task batch returned. The aggregator surfaced this critic in `critics_missing`.
   **Suggested Fix:** rerun `/gsd-review --critique <phase>` (or rerun the missing critic only via a single-Task invocation if you suspect transient API failure).
   ```

6. **Merge step:** synthesize the per-critic findings (read from each file in the JSON `files[]` list) into `<phase_dir>/CRITIQUE.md` with combined YAML frontmatter (sum of `severity_counts`, derived `status`) and a body grouped first by severity (critical → warning → info), then by critic. Append the missing-critic info findings (Step 5) inline.

7. Emit a human-readable summary to stdout: total findings by severity, list of missing critics (if any), and the absolute path to the merged `CRITIQUE.md`. The user reviews the merged file and decides whether to address the findings or run `/gsd-review --critique <phase>` again.
</process>
