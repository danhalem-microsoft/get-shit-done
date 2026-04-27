<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<available_agent_types>
- gsd-executor: Executes GSD plans with atomic commits and deviation handling
- gsd-critic-code: Adversarial code critic
- gsd-verifier: Verifies phase goal achievement through goal-backward analysis
- gsd-critic-verify: Adversarial verification critic
</available_agent_types>

<process>

**TEXT_MODE fallback:** If `--text` is present in $ARGUMENTS OR `text_mode` from init JSON is true, set TEXT_MODE=true. When TEXT_MODE is active, replace every AskUserQuestion call with a plain-text numbered list and ask the user to type their choice number.

<step name="check_blocking_antipatterns" priority="first">
**MANDATORY: Check for .continue-here.md with blocking anti-patterns before proceeding.**

```bash
CONTINUE_HERE=$(ls ${planning_root}/phases/*/.continue-here.md ${planning_root}/.continue-here.md 2>/dev/null | head -1)
```

If a .continue-here.md file exists and contains anti-patterns with severity "blocking":

1. Parse the `<anti_patterns>` section for any entries marked as `blocking`
2. For each blocking anti-pattern, the agent MUST demonstrate understanding by answering three questions. This check is MANDATORY and cannot be skipped — it is required before any other work proceeds:
   - What is this anti-pattern? (describe it in your own words)
   - How did it manifest in the previous session? (specific evidence)
   - What structural mechanism or prevention approach will you use to avoid it?
3. Only after all blocking anti-patterns have been addressed may the workflow continue
</step>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init execute-phase "${PHASE_ARG}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

**Read context window configuration:**
```bash
CONTEXT_WINDOW=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get context_window 2>/dev/null || echo "200000")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `phase_req_ids`.

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Error — no plans found in phase.
**If `state_exists` is false but `${planning_root}/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.

**Sync chain flag with intent** — if user invoked manually (no `--auto`), clear the ephemeral chain flag from any previous interrupted `--auto` chain. This does NOT touch `workflow.auto_advance` (the user's persistent settings preference). Must happen before any config reads (checkpoint handling also reads auto-advance flags):
```bash
if [[ ! "$ARGUMENTS" =~ --auto ]]; then
  node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active false 2>/dev/null
fi
```

Parse `--force-critic` from $ARGUMENTS:
- If present, set `FORCE_CRITIC=true`
- Default: `FORCE_CRITIC=false`

Optional `--wave N` argument: parse WAVE_FILTER from $ARGUMENTS. If `--wave N` is present, only execute Wave N.

**Read USE_WORKTREES config:**
```bash
USE_WORKTREES=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.use_worktrees 2>/dev/null || echo "true")
```
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"phase" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**Wave safety check:** If WAVE_FILTER is set, verify that all waves lower than WAVE_FILTER are complete (all plans have summaries). If lower waves are incomplete, finish earlier waves first — do not skip ahead.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

1.5. **Capture wave start SHA:**

   ```bash
   WAVE_START_SHA=$(git rev-parse HEAD)
   ```

2. **Spawn executor agents:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   **Context enrichment for large context models:**
   If CONTEXT_WINDOW >= 500000, include prior_wave_summaries and additional cross-phase context:
   - Read CONTEXT.md from the phase directory for decision context
   - Read RESEARCH.md from the phase directory for technical context
   - Include prior wave SUMMARY.md files for continuity

   **Prompt thinning for small context models:**
   If CONTEXT_WINDOW < 200000, strip extended examples from executor prompts and reference executor-examples.md for on-demand loading instead.

   **Worktree mode** (when USE_WORKTREES is true):

   ```
   Task(
     subagent_type="gsd-executor",
     model="{executor_model}",
     isolation="worktree",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md.
       </objective>

       <execution_context>
       @~/.claude/get-shit-done/workflows/execute-plan.md
       @~/.claude/get-shit-done/templates/summary.md
       @~/.claude/get-shit-done/references/checkpoints.md
       @~/.claude/get-shit-done/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - {phase_dir}/{plan_file} (Plan)
       - ${planning_root}/STATE.md (State)
       - ${planning_root}/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists — follow project-specific guidelines and coding conventions)
       - .claude/skills/ or .agents/skills/ (Project skills, if either exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       </success_criteria>
     "
   )
   ```

   After worktree merge, orchestrator runs `roadmap update-plan-progress` for each completed plan (single-writer pattern — avoids last-merge-wins conflicts on shared artifacts).

   **Post-merge deletion audit (#2384):**
   After merging each worktree branch, run a post-merge deletion audit:
   ```bash
   MERGE_DELETED=$(git diff --diff-filter=D --name-only HEAD~1 HEAD)
   MERGE_DEL_COUNT=$(echo "$MERGE_DELETED" | grep -vc '^\\.planning/' || true)
   if [ "$MERGE_DEL_COUNT" -gt 5 ] && [ "${ALLOW_BULK_DELETE:-0}" != "1" ]; then
     echo "⛔ Post-merge deletion audit: $MERGE_DEL_COUNT non-.planning files deleted"
     echo "Set ALLOW_BULK_DELETE=1 to override"
     git reset --hard HEAD~1
   fi
   ```

   **Test command detection for post-merge verification:**
   ```bash
   TEST_CMD=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.test_command 2>/dev/null || echo "")
   if [ -z "$TEST_CMD" ]; then
     if [ -f "Makefile" ] && grep -q "^test:" Makefile; then
       TEST_CMD="make test"
     elif [ -f "package.json" ]; then
       TEST_CMD="npm test"
     fi
   fi
   ```

   **Sequential mode** (when USE_WORKTREES is false):

   ```
   Task(
     subagent_type="gsd-executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.
       </objective>

       <execution_context>
       @~/.claude/get-shit-done/workflows/execute-plan.md
       @~/.claude/get-shit-done/templates/summary.md
       @~/.claude/get-shit-done/references/checkpoints.md
       @~/.claude/get-shit-done/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - {phase_dir}/{plan_file} (Plan)
       - ${planning_root}/STATE.md (State)
       - ${planning_root}/config.json (Config, if exists)
       - ./CLAUDE.md (Project instructions, if exists — follow project-specific guidelines and coding conventions)
       - .claude/skills/ or .agents/skills/ (Project skills, if either exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with plan progress (via `roadmap update-plan-progress`)
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

3.5. **Capture wave end SHA:**

   ```bash
   WAVE_END_SHA=$(git rev-parse HEAD)
   WAVE_DIFF_FILES=$(git diff --name-only ${WAVE_START_SHA}..${WAVE_END_SHA})
   ```

4. **Code-Critic Review (per-wave quality gate)**

   **4a. Config check:**
   ```bash
   AUTO_SPAWN=$(node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs config-get workflow.critics.auto_spawn 2>/dev/null || echo "true")
   ```

   If `AUTO_SPAWN` is "false" AND `FORCE_CRITIC` is NOT true: skip to sub-operation 5. Log: "○ Code-critic skipped (auto-spawn disabled)".

   **4b. Risk-based file classification:**

   Check if wave diff contains code files:

   ```bash
   HAS_CODE_FILES=false
   for file in $WAVE_DIFF_FILES; do
     case "$file" in
       *.py|*.ts|*.tsx|*.js|*.jsx|*.rs|*.go|*.java|*.rb|*.sh|*.bash)
         HAS_CODE_FILES=true; break ;;
       *.sql|*.graphql|*.proto)
         HAS_CODE_FILES=true; break ;;
       BUILD.bazel|*.bzl|Dockerfile|docker-compose.yml|docker-compose.yaml)
         HAS_CODE_FILES=true; break ;;
       requirements.txt|requirements.in|package.json|pnpm-lock.yaml)
         HAS_CODE_FILES=true; break ;;
       *.toml|*.cfg|Makefile|Justfile)
         HAS_CODE_FILES=true; break ;;
     esac
   done
   ```

   If `HAS_CODE_FILES` is false AND `FORCE_CRITIC` is NOT true:
     Log: "○ Code-critic skipped (no code changes in wave {N})"
     Skip to sub-operation 5.

   **4c. Resolve critic model:**
   ```bash
   CRITIC_MODEL=$(node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs resolve-model gsd-critic-code --raw 2>/dev/null || echo "inherit")
   ```

   **4d. Assemble critic context paths:**

   Gather paths for cross-artifact detection (QUAL-01):
   - `WAVE_PLAN_PATHS`: Paths to PLAN.md files executed in this wave (from plan index)
   - `CONTEXT_PATH`: `${PHASE_DIR}/*-CONTEXT.md` (phase-specific CONTEXT.md)
   - `SUMMARY_PATH`: Most recent SUMMARY.md in phase dir (if any exist from prior waves)
   - `STATE_PATH`: `${planning_root}/STATE.md`
   - `DEVIATION_COMMITS`: Wave commit messages for deviation exemption check:
     ```bash
     DEVIATION_COMMITS=$(git log --format="%s%n%b" ${WAVE_START_SHA}..${WAVE_END_SHA})
     ```

   **4e. Spawn code-critic:**

   Display banner:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    GSD ► CODE-CRITIC REVIEW (Wave {N})
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   ◆ Reviewing {file_count} files from wave {N} diff...
   ```

   Code-critic prompt:
   ```markdown
   <objective>
   You are being invoked as part of execute-phase for Phase {phase_number}: {phase_name}.
   Review wave {wave_num} implementation for code quality AND cross-artifact contradictions.
   Produce CRITIQUE-code.md following ${planning_root}/critique-template.md format.
   Timeout: 5 minutes.
   </objective>

   <scope>
   Review ONLY these files (wave {wave_num} diff):
   {wave_diff_files_list}

   Do NOT review files from previous waves or unrelated files.
   </scope>

   <files_to_read>
   Read these files at start using the Read tool:
   - Wave diff files: {wave_diff_files_list}
   - Plan(s) executed in this wave: {wave_plan_paths}
   - Phase CONTEXT.md: {context_path} (if exists — for cross-artifact check)
   - Severity ref: ${planning_root}/severity-reference.md
   - Critique template: ${planning_root}/critique-template.md
   - Project context: ${planning_root}/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
   {if SUMMARY.md exists from prior waves:}
   - Prior SUMMARY.md: {summary_path} (check Deviations section for exemptions)
   {endif}
   - STATE.md: ${planning_root}/STATE.md (check for executor deviation notes)
   </files_to_read>

   <cross_artifact_context>
   Wave commit messages (for deviation exemption checking):
   {deviation_commits}
   </cross_artifact_context>

   <output>
   Write to: {phase_dir}/CRITIQUE-code.md
   critique_type: code
   plan: "{wave_plan_ids}"
   </output>
   ```

   ```
   Task(
     subagent_type="gsd-critic-code",
     model="{CRITIC_MODEL}",
     prompt=code_critic_prompt,
     description="Code-critic review for Phase {phase} wave {wave_num}",
     timeout=300000
   )
   ```

   **4f. Parse critic results:**

   After critic completes (or times out):

   ```bash
   # Check if CRITIQUE-code.md was produced
   ls "${PHASE_DIR}/CRITIQUE-code.md" 2>/dev/null
   ```

   If no file produced (timeout or error):
     Log: "⚠ Code-critic did not produce output (timeout or error). Continuing without critic findings."
     Skip to sub-operation 5.

   If file exists:
   ```bash
   CRITIC_PARSED=$(node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs critique parse "${PHASE_DIR}/CRITIQUE-code.md")
   ```

   Extract severity counts from parsed JSON. Apply severity gating:
   - **Critical findings (count > 0):** Block next wave. Route to gap closure (4g).
   - **Warning findings:** Display inline in wave report. Do NOT block.
   - **Info findings:** Silent (not displayed in execute-phase flow).

   Display results:
   ```
   Code-Critic: {N} critical, {M} warning, {K} info
   {If critical > 0: ⛔ Critical findings block next wave — initiating gap closure}
   {If critical == 0: ✓ No blocking findings}

   {If warnings exist:}
   ### Warnings (logged, non-blocking)

   | ID | Finding | File |
   |----|---------|------|
   | code-W-001 | {title} | {file} |
   ```

   If no critical findings: Skip to sub-operation 5.

   **4g. Gap closure loop (max 2 fix cycles per wave):**

   Initialize counter: `CODE_CRITIC_FIX_CYCLES=0`

   **LOOP START (while critical findings exist AND CODE_CRITIC_FIX_CYCLES < 2):**

   Increment: `CODE_CRITIC_FIX_CYCLES += 1`

   Display:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    GSD ► GAP CLOSURE — Code Critic Fix Cycle {M}/2
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   **Step 1: Spawn gsd-planner in gap_closure mode:**

   ```
   Task(
     prompt="First, read $HOME/.claude/agents/gsd-planner.md for your role and instructions.

   <planning_context>

   **Phase:** {phase_number}
   **Mode:** gap_closure

   **Code-critic findings (critical only):**
   {critical_findings_text}

   **Files affected:**
   {wave_diff_files_with_findings}

   **Fix cycle:** {M}/2

   **Project State:**
   @${planning_root}/STATE.md

   </planning_context>

   <downstream_consumer>
   Output consumed by execute-phase inline execution.
   Fix plans must be small (1-3 tasks) and targeted at resolving the critical findings.
   Fix plan file: {phase_dir}/{next_plan_number}-PLAN.md
   </downstream_consumer>",
     subagent_type="general-purpose",
     model="{PLANNER_MODEL}",
     description="Plan code-critic fixes for Phase {phase} wave {wave_num} (cycle {M}/2)"
   )
   ```

   Where `next_plan_number` is determined by scanning existing plans in phase_dir and incrementing.

   **Step 2: Execute fix plan:**

   Capture fix start SHA:
   ```bash
   FIX_START_SHA=$(git rev-parse HEAD)
   ```

   Spawn executor for the fix plan (same pattern as regular wave execution):
   ```
   Task(
     subagent_type="gsd-executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute fix plan {fix_plan_number} of phase {phase_number}-{phase_name}.
       This is a gap closure fix for code-critic findings.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md.
       </objective>

       <execution_context>
       @$HOME/.claude/get-shit-done/workflows/execute-plan.md
       @$HOME/.claude/get-shit-done/templates/summary.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - Plan: {phase_dir}/{fix_plan_file}
       - State: ${planning_root}/STATE.md
       - Config: ${planning_root}/config.json (if exists)
       </files_to_read>

       <success_criteria>
       - [ ] All fix tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created
       - [ ] STATE.md updated
       </success_criteria>
     ",
     description="Execute code-critic fix plan {fix_plan_number}"
   )
   ```

   If executor fails (no SUMMARY.md, uncaught error):
     Count as consumed fix cycle. Log: "⚠ Fix execution failed (cycle {M}/2)."
     If `CODE_CRITIC_FIX_CYCLES >= 2`: break to circuit breaker (4h).
     Else: continue loop (try another fix cycle).

   **Step 3: Re-run code-critic on fix diff only:**

   ```bash
   FIX_END_SHA=$(git rev-parse HEAD)
   FIX_DIFF_FILES=$(git diff --name-only ${FIX_START_SHA}..${FIX_END_SHA})
   ```

   Spawn code-critic with SAME prompt structure but scoped to FIX_DIFF_FILES:
   - Replace `wave_diff_files_list` with `FIX_DIFF_FILES`
   - Add instruction: "This is a re-run after gap closure. Review ONLY the fix diff. New findings unrelated to the original critical findings should be classified as warnings, NOT criticals."

   Parse re-run results. If still has critical findings: continue loop. If no criticals: break loop, continue to sub-operation 5.

   **LOOP END**

   **4h. Circuit breaker (if loop exhausted):**

   If `CODE_CRITIC_FIX_CYCLES >= 2` AND critical findings still exist:

   Display:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    CIRCUIT BREAKER — Code Critic (Wave {N}, 2/2 fix cycles)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Remaining critical findings:

   | ID | Finding | File |
   |----|---------|------|
   | code-C-001 | {title} | {file} |
   ```

   {If both fix cycles were execution failures, add: "(fix execution failed)"}

   Use AskUserQuestion:
   - header: "Circuit Breaker — Code Critic"
   - question: "Wave {N}: {M} critical finding(s) remain after 2 fix cycles{if execution_failed: ' (fix execution failed)'}. How to proceed?"
   - options:
     - "Fix manually — pause execution for manual intervention"
     - "Accept tech debt — log findings to STATE.md, continue to wave {N+1}"
     - "Abort phase — stop execution, report partial completion"

   **If "Fix manually":**
   - Log to STATE.md: current wave, remaining waves, findings
   - Present: "Execution paused. Fix the issues manually, then resume with `/gsd-execute-phase {phase}`"
   - Stop execution (return partial completion to aggregate_results)

   **If "Accept tech debt":**
   - Log each remaining critical finding to STATE.md Pending Todos:
     ```
     - [ ] [code-C-001] {finding_title} (from Phase {N} wave {W} code-critic, accepted as tech debt {date})
     ```
   - Continue to sub-operation 5 (proceed with wave completion)

   **If "Abort phase":**
   - Log abort to STATE.md
   - Present: "Phase execution aborted at wave {N}."
   - Stop execution (return partial completion to aggregate_results)

5. **Report completion — spot-check claims first:**

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Terrain system complete. Proceeding to next."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

   <completion_gate priority="before next wave">
   **MANDATORY PER-WAVE CHECK — Do NOT proceed to next wave without verifying:**
   - [ ] Code-critic decision was made for this wave:
     - If auto_spawn=true AND wave has code files: code-critic was spawned, results parsed, critical findings handled (gap closure or accept)
     - If auto_spawn=false: logged "○ Code-critic skipped (auto-spawn disabled)"
     - If wave has no code files: logged "○ Code-critic skipped (no code changes in wave {N})"
   - [ ] SUMMARY.md spot-checks passed for all plans in this wave

   Failure to evaluate the code-critic step is a workflow violation — the config check (sub-operation 4a) MUST run for every wave, even if the result is a skip.
   </completion_gate>

6. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a GSD or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 5 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

7. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

8. **Proceed to next wave.**

<step name="handle_partial_wave_execution">
When WAVE_FILTER is set and only a subset of waves was executed:
- Do NOT run phase verification (verify_phase_goal) — the phase is not fully complete
- Do NOT mark the phase complete in ROADMAP.md
- Report which wave was executed and what remains

Present:
```
Wave {N} execution complete. {remaining_waves} wave(s) remaining.
Continue: /gsd-execute-phase {phase} --wave {N+1}
```
</step>

</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Auto-mode checkpoint handling:**

Read auto-advance config (chain flag + user preference):
```bash
AUTO_CHAIN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
AUTO_CFG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
```

When executor returns a checkpoint AND (`AUTO_CHAIN` is `"true"` OR `AUTO_CFG` is `"true"`):
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Standard flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Phase {X}: {Name} Execution Complete

**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="close_parent_artifacts">
**For decimal/polish phases only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** phase number has no decimal (e.g., `3`, `04`) — only applies to gap-closure phases like `4.1`, `03.1`.

**1. Detect decimal phase and derive parent:**
```bash
# Check if phase_number contains a decimal
if [[ "$PHASE_NUMBER" == *.* ]]; then
  PARENT_PHASE="${PHASE_NUMBER%%.*}"
fi
```

**2. Find parent UAT file:**
```bash
PARENT_INFO=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" find-phase "${PARENT_PHASE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Update UAT gap statuses:**

Read the parent UAT file's `## Gaps` section. For each gap entry with `status: failed`:
- Update to `status: resolved`

**4. Update UAT frontmatter:**

If all gaps now have `status: resolved`:
- Update frontmatter `status: diagnosed` → `status: resolved`
- Update frontmatter `updated:` timestamp

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Update frontmatter `status:` → `resolved`
- Update frontmatter `updated:` timestamp
- Move to resolved directory:
```bash
mkdir -p ${planning_root}/debug/resolved
mv ${planning_root}/debug/{slug}.md ${planning_root}/debug/resolved/
```

**6. Commit updated artifacts:**
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(phase-${PARENT_PHASE}): resolve UAT gaps and debug sessions after ${PHASE_NUMBER} gap closure" --files ${planning_root}/phases/*${PARENT_PHASE}*/*-UAT.md ${planning_root}/debug/resolved/*.md
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Phase requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from PLAN frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.

<files_to_read>
Read these files at verification start using the Read tool:
- {phase_dir}/*-PLAN.md (Plans)
- {phase_dir}/*-SUMMARY.md (Summaries)
- ${planning_root}/REQUIREMENTS.md (Requirements)
</files_to_read>
",
  subagent_type="gsd-verifier",
  model="{verifier_model}"
)
```

### Verification Audit (post-verifier, pre-status-read)

**Sub-operation A: Config check**

```bash
AUTO_SPAWN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.critics.auto_spawn 2>/dev/null || echo "true")
```

If `AUTO_SPAWN` is `"false"`: skip auditor with one-line notice "○ Verification-auditor skipped (auto-spawn disabled)". Jump to status reading.

**Sub-operation B: Skip heuristic (no verification artifacts)**

Check if VERIFICATION.md AND SUMMARY.md exist for this phase:
```bash
ls "$PHASE_DIR"/*-VERIFICATION.md "$PHASE_DIR"/*-SUMMARY.md 2>/dev/null
```

If NEITHER exists: skip with notice "○ Verification-auditor skipped (no VERIFICATION.md or SUMMARY.md)". Jump to status reading.
Note: If VERIFICATION.md exists but no SUMMARY.md, auditor STILL runs (doc-only phases may have VERIFICATION.md without SUMMARY.md).

**Sub-operation C: Resolve auditor model**

```bash
AUDITOR_MODEL=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" resolve-model gsd-critic-verify --raw 2>/dev/null || echo "inherit")
```

**Sub-operation D: Assemble auditor context paths**

Gather paths for the verification chain:
- `VERIFICATION_PATH`: `${PHASE_DIR}/*-VERIFICATION.md`
- `PLAN_PATHS`: All PLAN.md files in phase dir (for must_haves extraction)
- `SUMMARY_PATHS`: All SUMMARY.md files in phase dir (for claim spot-checking)
- `CONTEXT_PATH`: `${PHASE_DIR}/*-CONTEXT.md`
- `RESEARCH_PATH`: `${PHASE_DIR}/*-RESEARCH.md`
- `ROADMAP_PATH`: `${planning_root}/ROADMAP.md`

**Sub-operation E: Spawn verification-auditor**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFICATION AUDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Auditing verification claims for Phase {phase_number}...
```

Auditor prompt (assembled from context paths):
```markdown
<objective>
You are being invoked as part of execute-phase verification audit for Phase {phase_number}: {phase_name}.
Review the verifier's VERIFICATION.md for weak assertions, missed paths, false passes, and SUMMARY.md claim accuracy.
Produce CRITIQUE-verify.md following ${planning_root}/critique-template.md format.
Timeout: 5 minutes.
</objective>

<scope>
Audit the FULL phase verification — all plans' must_haves, cross-plan integration, key_links wiring.
Use ROADMAP.md phase success criteria as the top-level frame.
Read test files and evaluate assertion quality (not just existence checks).
Spot-check at least 3 SUMMARY.md claimed files against actual codebase.

For doc-only phases (no test files): shift focus to document correctness against research findings and project goals.
</scope>

<files_to_read>
Read these files at start using the Read tool:
- VERIFICATION.md: {verification_path} — the verification claims to audit
- Plan(s): {plan_paths} — for must_haves truths, artifacts, key_links
- SUMMARY.md(s): {summary_paths} — claims to spot-check against codebase
- Phase CONTEXT.md: {context_path} (if exists — locked decisions that must be verified)
- Phase RESEARCH.md: {research_path} (if exists — known pitfalls that tests should cover)
- ROADMAP.md: ${planning_root}/ROADMAP.md — phase success criteria as top-level frame
- Severity ref: ${planning_root}/severity-reference.md
- Critique template: ${planning_root}/critique-template.md
- Project context: ${planning_root}/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
</files_to_read>

<output>
Write to: {phase_dir}/CRITIQUE-verify.md
critique_type: verify
plan: "full-phase"

If no test files found, note in executive_summary: "No test files — audit focused on document correctness"
</output>
```

Task() call:
```
Task(
  subagent_type="gsd-critic-verify",
  model="{AUDITOR_MODEL}",
  prompt=auditor_prompt,
  description="Verification-auditor for Phase {phase_number}",
  timeout=300000
)
```

**Sub-operation F: Handle auditor result — HARD GATE**

Check if CRITIQUE-verify.md was produced:
```bash
ls "${PHASE_DIR}/CRITIQUE-verify.md" 2>/dev/null
```

**If no file produced (timeout or error):**
Auditor failure = verification cannot be trusted.
Log: "⛔ Verification-auditor failed (timeout or error). Verification cannot proceed without audit."
Do NOT proceed to read verifier status. Do NOT report status to user.
Prompt user with AskUserQuestion:
- header: "Verification Audit Failed"
- question: "The verification-auditor did not produce output (timeout or error). Verification cannot be trusted without audit. How to proceed?"
- options:
  - "Retry audit — re-run the verification-auditor"
  - "Abort — stop verification, report phase as incomplete"
If "Retry audit": re-run sub-operation E (spawn auditor again). Only allow ONE retry (total max 2 attempts).
If "Abort": log to STATE.md, present "Phase verification aborted. Audit required for completion." Return to offer_next without marking phase complete.

**If file exists:** Parse results:
```bash
AUDIT_PARSED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique parse "${PHASE_DIR}/CRITIQUE-verify.md")
```

Extract severity counts. Apply severity gating:
- **Critical findings (count > 0):** Add `audit_status: gaps_found` and `audit_date: {timestamp}` to VERIFICATION.md frontmatter. Route to gap closure (sub-operation G).
- **Warning findings:** Display inline in verification output. Do NOT change status.
- **Info findings:** Silent (not displayed in execute-phase flow).

Display results:
```
Verification-Auditor: {N} critical, {M} warning, {K} info
{If critical > 0: ⛔ Critical findings — downgrading verification status to gaps_found}
{If critical == 0: ✓ Verification audit passed — no critical findings}

{If warnings exist:}
### Audit Warnings (logged, non-blocking)

| ID | Finding | File |
|----|---------|------|
| verify-W-001 | {title} | {file} |
```

**Adding audit_status to VERIFICATION.md frontmatter (when critical findings exist):**
Read VERIFICATION.md, find the closing `---` of frontmatter, insert `audit_status: gaps_found` and `audit_date: {current_date}` before it. This preserves the original `status` field while recording the auditor's disagreement. Example result:
```yaml
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed              # Verifier's original claim (preserved)
audit_status: gaps_found    # Auditor's assessment (added by auditor)
audit_date: YYYY-MM-DDTHH:MM:SSZ
score: N/M must-haves verified
---
```

If no critical findings: skip to status reading (no audit_status field added — absence means auditor concurs with verifier).

**Sub-operation G: Gap closure loop (max 2 fix cycles)**

Initialize counter: `AUDIT_FIX_CYCLES=0`

**LOOP START (while critical findings exist AND AUDIT_FIX_CYCLES < 2):**

Increment: `AUDIT_FIX_CYCLES += 1`

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► GAP CLOSURE — Verification Audit Fix Cycle {M}/2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Step 1: Spawn gsd-planner in gap_closure mode with critical audit findings.
Step 2: Execute fix plan with gsd-executor.
Step 3: Re-run full verifier (not just auditor) — the verifier rewrites VERIFICATION.md.
Step 4: Re-run auditor on new VERIFICATION.md. Parse results.
If still has critical findings: continue loop.
If no criticals: remove `audit_status` from VERIFICATION.md (since verifier re-ran and auditor now concurs). Break loop.

**LOOP END**

Note: Gap closure for audit findings differs from code-critic gap closure. Code-critic re-runs critic only on fix diff. Audit gap closure re-runs the FULL verifier (since gaps are in verification, not code) then re-runs the auditor on the fresh verification. The planner produces fix tasks addressing what the auditor found (weak tests, missing paths), executor implements them, verifier re-checks everything, and auditor re-audits.

**Sub-operation H: Circuit breaker (if loop exhausted)**

If `AUDIT_FIX_CYCLES >= 2` AND critical findings still exist:

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CIRCUIT BREAKER — Verification Audit (2/2 fix cycles)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remaining critical findings:

| ID | Finding | File |
|----|---------|------|
| verify-C-001 | {title} | {file} |
```

Use AskUserQuestion:
- header: "Circuit Breaker — Verification Audit"
- question: "{M} critical audit finding(s) remain after 2 fix cycles. How to proceed?"
- options:
  - "Fix manually — pause for manual intervention"
  - "Accept tech debt — log findings to STATE.md, continue"
  - "Abort phase — stop, report partial completion"

If "Fix manually": Log to STATE.md, present pause message. Return without marking phase complete.
If "Accept tech debt": Log each remaining critical finding to STATE.md Pending Todos:
  ```
  - [ ] [verify-C-001] {finding_title} (from Phase {N} verification audit, accepted as tech debt {date})
  ```
  Remove `audit_status` from VERIFICATION.md (tech debt accepted — let original status stand).
  Proceed to status reading.
If "Abort phase": Log abort to STATE.md. Present "Phase verification aborted." Return without marking complete.

### Status Reading (post-audit)

Read status — prefer audit_status (auditor's assessment) over status (verifier's claim) when present:
```bash
# Prefer audit_status (auditor's assessment) over status (verifier's claim) when present
AUDIT_STATUS=$(grep "^audit_status:" "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
VERIFIER_STATUS=$(grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
STATUS=${AUDIT_STATUS:-$VERIFIER_STATUS}
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd-plan-phase {phase} --gaps` |

**If human_needed:**
```
## ✓ Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From VERIFICATION.md human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## ⚠ Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase_num}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## ▶ Next Up

`/gsd-plan-phase {X} --gaps`

`/clear` then:

Also: `cat {phase_dir}/{phase_num}-VERIFICATION.md` — full report
Also: `/gsd-verify-work {X}` — manual testing first
```

Gap closure cycle: `/gsd-plan-phase {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/gsd-execute-phase {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
**Mark phase complete and update all tracking files:**

```bash
COMPLETION=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "${PHASE_NUMBER}")
```

The CLI handles:
- Marking phase checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating plan count to final
- Advancing STATE.md to next phase
- Updating REQUIREMENTS.md traceability

Extract from result: `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(phase-{X}): complete phase execution" --files ${planning_root}/ROADMAP.md ${planning_root}/STATE.md ${planning_root}/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
</step>

<completion_gate priority="before offer_next">
**MANDATORY CHECK — Do NOT proceed to offer_next / auto-advance without verifying:**
- [ ] verify_phase_goal step completed — verifier was spawned and VERIFICATION.md produced
- [ ] Verification-auditor decision was made (sub-operation A):
  - If auto_spawn=true: auditor was spawned (sub-operation E), results parsed, critical findings handled (gap closure, accept tech debt, or abort)
  - If auto_spawn=false: logged "○ Verification-auditor skipped (auto-spawn disabled)"
- [ ] Status was read using the audit-aware logic (prefer audit_status over status when present)

Failure to evaluate the verification-auditor step is a workflow violation — sub-operation A MUST run after every verifier spawn.
</completion_gate>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_phase_goal` step already presents the gap-closure path (`/gsd-plan-phase {X} --gaps`). No additional routing needed — skip auto-advance.

**No-transition check (spawned by auto-advance chain):**

Parse `--no-transition` flag from $ARGUMENTS.

**If `--no-transition` flag present:**

Execute-phase was spawned by plan-phase's auto-advance. Do NOT run transition.md.
After verification passes and roadmap is updated, return completion status to parent:

```
## PHASE COMPLETE

Phase: ${PHASE_NUMBER} - ${PHASE_NAME}
Plans: ${completed_count}/${total_count}
Verification: {Passed | Gaps Found}

[Include aggregate_results output]
```

STOP. Do not proceed to auto-advance or transition.

**If `--no-transition` flag is NOT present:**

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read both the chain flag and user preference (chain flag already synced in init step):
   ```bash
   AUTO_CHAIN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
   AUTO_CFG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CHAIN` is true OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Phase {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs phase completion data already in context):

Read and follow `~/.claude/get-shit-done/workflows/transition.md`, passing through the `--auto` flag so it propagates to the next phase invocation.

**If neither `--auto` nor `AUTO_CFG` is true:**

The workflow ends. The user runs `/gsd-progress` or invokes the transition workflow manually.
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not GSD. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md
</failure_handling>

<success_criteria>
- Verification-auditor spawns after verifier when auto_spawn is true
- Critical audit findings inject audit_status: gaps_found into VERIFICATION.md
- Auditor failure is hard gate (Retry/Abort only, no skip)
- Status reading prefers audit_status over status when present
- Audit gap closure loop limited to 2 cycles with circuit breaker
- Tech debt from audit circuit breaker logged to STATE.md Pending Todos
- Code-critic spawned after each wave when auto_spawn is true and wave has code changes
- Critical code-critic findings block next wave, trigger gap closure
- Circuit breaker prevents infinite fix loops (max 2 cycles per wave)
- Doc-only waves skip code-critic
- Cross-artifact contradiction context passed to critic prompt
- Tech debt from circuit breaker logged to STATE.md Pending Todos
</success_criteria>

<resumption>
Re-run `/gsd-execute-phase {phase}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints, code-critic fix cycle counter per wave.

The fix cycle counter is wave-scoped — it resets to 0 at the start of each new wave.

Audit state: If verification passed but audit found critical findings (audit_status: gaps_found in VERIFICATION.md), re-running execute-phase will re-trigger the verifier and auditor. The audit_status field persists in VERIFICATION.md to indicate the phase is not truly complete.
</resumption>

<runtime_compatibility>
**Copilot fallback:** When subagent spawning is not available, use sequential inline execution — run each plan's tasks in order within the current context. Use spot-check verification after each plan completes to confirm goal achievement before proceeding.
</runtime_compatibility>
