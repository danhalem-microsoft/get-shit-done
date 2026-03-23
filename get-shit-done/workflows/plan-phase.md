<purpose>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification. Default flow: Research (if needed) -> Plan -> Verify -> Done. Orchestrates gsd-phase-researcher, gsd-planner, and gsd-plan-checker agents with a revision loop (max 3 iterations).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/get-shit-done/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (paths only to minimize orchestrator context):

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init plan-phase "$PHASE")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `plan_checker_enabled`, `nyquist_validation_enabled`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_research`, `has_context`, `has_plans`, `plan_count`, `planning_exists`, `roadmap_exists`, `phase_req_ids`.

**File paths (for <files_to_read> blocks):** `state_path`, `roadmap_path`, `requirements_path`, `context_path`, `research_path`, `verification_path`, `uat_path`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/gsd:new-project` first.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`, `--prd <filepath>`).

Extract `--prd <filepath>` from $ARGUMENTS. If present, set PRD_FILE to the filepath.

**If no phase number:** Detect next unplanned phase from roadmap.

**If `phase_found` is false:** Validate phase exists in ROADMAP.md. If valid, create the directory using `phase_slug` and `padded_phase` from init:
```bash
mkdir -p ".planning/phases/${padded_phase}-${phase_slug}"
```

**Existing artifacts from init:** `has_research`, `has_plans`, `plan_count`.

## 3. Validate Phase

```bash
PHASE_INFO=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "${PHASE}")
```

**If `found` is false:** Error with available phases. **If `found` is true:** Extract `phase_number`, `phase_name`, `goal` from JSON.

## 3.5. Handle PRD Express Path

**Skip if:** No `--prd` flag in arguments.

**If `--prd <filepath>` provided:**

1. Read the PRD file:
```bash
PRD_CONTENT=$(cat "$PRD_FILE" 2>/dev/null)
if [ -z "$PRD_CONTENT" ]; then
  echo "Error: PRD file not found: $PRD_FILE"
  exit 1
fi
```

2. Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PRD EXPRESS PATH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Using PRD: {PRD_FILE}
Generating CONTEXT.md from requirements...
```

3. Parse the PRD content and generate CONTEXT.md. The orchestrator should:
   - Extract all requirements, user stories, acceptance criteria, and constraints from the PRD
   - Map each to a locked decision (everything in the PRD is treated as a locked decision)
   - Identify any areas the PRD doesn't cover and mark as "Claude's Discretion"
   - Create CONTEXT.md in the phase directory

4. Write CONTEXT.md:
```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning
**Source:** PRD Express Path ({PRD_FILE})

<domain>
## Phase Boundary

[Extracted from PRD — what this phase delivers]

</domain>

<decisions>
## Implementation Decisions

{For each requirement/story/criterion in the PRD:}
### [Category derived from content]
- [Requirement as locked decision]

### Claude's Discretion
[Areas not covered by PRD — implementation details, technical choices]

</decisions>

<specifics>
## Specific Ideas

[Any specific references, examples, or concrete requirements from PRD]

</specifics>

<deferred>
## Deferred Ideas

[Items in PRD explicitly marked as future/v2/out-of-scope]
[If none: "None — PRD covers phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date] via PRD Express Path*
```

5. Commit:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(${padded_phase}): generate context from PRD" --files "${phase_dir}/${padded_phase}-CONTEXT.md"
```

6. Set `context_content` to the generated CONTEXT.md content and continue to step 5 (Handle Research).

**Effect:** This completely bypasses step 4 (Load CONTEXT.md) since we just created it. The rest of the workflow (research, planning, verification) proceeds normally with the PRD-derived context.

## 4. Load CONTEXT.md

**Skip if:** PRD express path was used (CONTEXT.md already created in step 3.5).

Check `context_path` from init JSON.

If `context_path` is not null, display: `Using phase context from: ${context_path}`

**If `context_path` is null (no CONTEXT.md exists):**

Use AskUserQuestion:
- header: "No context"
- question: "No CONTEXT.md found for Phase {X}. Plans will use research and requirements only — your design preferences won't be included. Continue or capture context first?"
- options:
  - "Continue without context" — Plan using research + requirements only
  - "Run discuss-phase first" — Capture design decisions before planning

If "Continue without context": Proceed to step 5.
If "Run discuss-phase first": Display `/gsd:discuss-phase {X}` and exit workflow.

## 5. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

### Spawn gsd-phase-researcher

```bash
PHASE_DESC=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "${PHASE}" | jq -r '.section')
```

Research prompt:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<files_to_read>
- {context_path} (USER DECISIONS from /gsd:discuss-phase)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

<additional_context>
**Phase description:** {phase_description}
**Phase requirement IDs (MUST address):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists — follow project-specific guidelines
**Project skills:** Check .claude/skills/ or .agents/skills/ directory (if either exists) — read SKILL.md files, research should account for project skill patterns
</additional_context>

<output>
Write to: {phase_dir}/{phase_num}-RESEARCH.md
</output>
```

```
Task(
  prompt=research_prompt,
  subagent_type="gsd-phase-researcher",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Handle Researcher Return

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

## 5.5. Create Validation Strategy

MANDATORY unless `nyquist_validation_enabled` is false.

```bash
grep -l "## Validation Architecture" "${PHASE_DIR}"/*-RESEARCH.md 2>/dev/null
```

**If found:**
1. Read template: `~/.claude/get-shit-done/templates/VALIDATION.md`
2. Write to `${PHASE_DIR}/${PADDED_PHASE}-VALIDATION.md` (use Write tool)
3. Fill frontmatter: `{N}` → phase number, `{phase-slug}` → slug, `{date}` → current date
4. Verify:
```bash
test -f "${PHASE_DIR}/${PADDED_PHASE}-VALIDATION.md" && echo "VALIDATION_CREATED=true" || echo "VALIDATION_CREATED=false"
```
5. If `VALIDATION_CREATED=false`: STOP — do not proceed to Step 6
6. If `commit_docs`: `commit-docs "docs(phase-${PHASE}): add validation strategy"`

**If not found:** Warn and continue — plans may fail Dimension 8.

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.

## 7. Use Context Paths from INIT

Extract from INIT JSON:

```bash
STATE_PATH=$(printf '%s\n' "$INIT" | jq -r '.state_path // empty')
ROADMAP_PATH=$(printf '%s\n' "$INIT" | jq -r '.roadmap_path // empty')
REQUIREMENTS_PATH=$(printf '%s\n' "$INIT" | jq -r '.requirements_path // empty')
RESEARCH_PATH=$(printf '%s\n' "$INIT" | jq -r '.research_path // empty')
VERIFICATION_PATH=$(printf '%s\n' "$INIT" | jq -r '.verification_path // empty')
UAT_PATH=$(printf '%s\n' "$INIT" | jq -r '.uat_path // empty')
CONTEXT_PATH=$(printf '%s\n' "$INIT" | jq -r '.context_path // empty')
```

## 7.5. Verify Nyquist Artifacts

Skip if `nyquist_validation_enabled` is false.

```bash
VALIDATION_EXISTS=$(ls "${PHASE_DIR}"/*-VALIDATION.md 2>/dev/null | head -1)
```

If missing and Nyquist enabled — ask user:
1. Re-run: `/gsd:plan-phase {PHASE} --research`
2. Disable Nyquist in config
3. Continue anyway (plans fail Dimension 8)

Proceed to Step 8 only if user selects 2 or 3.

## 8. Spawn gsd-planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

Planner prompt:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

<files_to_read>
- {state_path} (Project State)
- {roadmap_path} (Roadmap)
- {requirements_path} (Requirements)
- {context_path} (USER DECISIONS from /gsd:discuss-phase)
- {research_path} (Technical Research)
- {verification_path} (Verification Gaps - if --gaps)
- {uat_path} (UAT Gaps - if --gaps)
</files_to_read>

**Phase requirement IDs (every ID MUST appear in a plan's `requirements` field):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists — follow project-specific guidelines
**Project skills:** Check .claude/skills/ or .agents/skills/ directory (if either exists) — read SKILL.md files, plans should account for project skill rules
</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt=filled_prompt,
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

## 9. Handle Planner Return

- **`## PLANNING COMPLETE`:** Display plan count. If `--skip-verify` or `plan_checker_enabled` is false (from init): skip to step 13. Otherwise: step 10.
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

## 9.5. Check Auto-Spawn Config

Check if adversarial critics should auto-spawn:

```bash
AUTO_SPAWN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.critics.auto_spawn 2>/dev/null || echo "true")
```

Default: `true` (on by default). If config key doesn't exist, default to `true`.

Set `SPAWN_PLAN_CRITIC` based on result:
- `AUTO_SPAWN` is "true" → `SPAWN_PLAN_CRITIC=true`
- `AUTO_SPAWN` is "false" → `SPAWN_PLAN_CRITIC=false`

## 10. Spawn Plan Verification Agents

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
{if SPAWN_PLAN_CRITIC: ◆ Spawning plan critic...}
```

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

**Always spawn plan-checker** (existing behavior, unchanged):

Checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

<files_to_read>
- {PHASE_DIR}/*-PLAN.md (Plans to verify)
- {roadmap_path} (Roadmap)
- {requirements_path} (Requirements)
- {context_path} (USER DECISIONS from /gsd:discuss-phase)
- {research_path} (Technical Research — includes Validation Architecture)
</files_to_read>

**Phase requirement IDs (MUST ALL be covered):** {phase_req_ids}

**Project instructions:** Read ./CLAUDE.md if exists — verify plans honor project guidelines
**Project skills:** Check .claude/skills/ or .agents/skills/ directory (if either exists) — verify plans account for project skill rules
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

**Conditionally spawn plan-critic in parallel** (if SPAWN_PLAN_CRITIC is true):

Plan-critic prompt:
```markdown
<objective>
You are being invoked as part of plan-phase for Phase {phase_number}: {phase_name}.
Review all plans in this phase for quality issues.
Produce CRITIQUE-plan.md following .planning/critique-template.md format.
</objective>

<files_to_read>
Read these files at start using the Read tool:
- Phase directory contents: {phase_dir}/ (list with Glob, then read PLANs, CONTEXT, RESEARCH)
- Roadmap: .planning/ROADMAP.md
- Requirements: .planning/REQUIREMENTS.md
- Severity ref: .planning/severity-reference.md
- Critique template: .planning/critique-template.md
- Project context: .planning/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
</files_to_read>

<output>
Write your critique report to: {phase_dir}/CRITIQUE-plan.md
Follow .planning/critique-template.md format EXACTLY.
Use critique_type: plan in frontmatter.
Use finding ID prefix: plan-
</output>
```

```
Task(
  subagent_type="gsd-critic-plan",
  model="{critic_model}",
  prompt=plan_critic_prompt,
  description="Critique Phase {phase} plans"
)
```

Both Task() calls MUST be spawned simultaneously (parallel, not sequential).

Wait for both to complete.

## 11. Handle Verification Results

### Plan-Checker Results (existing logic, unchanged)
- **`## VERIFICATION PASSED`:** No plan-checker issues.
- **`## ISSUES FOUND`:** Parse structured issues from plan-checker output.

### Plan-Critic Results (new — only if SPAWN_PLAN_CRITIC was true)

If plan-critic was spawned, check for CRITIQUE-plan.md:

```bash
ls "${PHASE_DIR}/CRITIQUE-plan.md" 2>/dev/null
```

If exists, parse findings:
```bash
CRITIC_PARSED=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" critique parse "${PHASE_DIR}/CRITIQUE-plan.md")
```

Apply severity gating to plan-critic findings:
- **Critical findings:** Add to unified blocker list (trigger revision)
- **Warning findings:** Display inline but do NOT add to blocker list
- **Info findings:** Silent (not displayed in plan-phase flow)

### Merge into Unified Blocker List

Combine:
1. Plan-checker issues (all are blockers by existing logic)
2. Plan-critic CRITICAL findings only

### Display Unified Results

Display all results in one block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN VERIFICATION RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plan Checker: {PASSED | N issues found}
Plan Critic: {N critical, M warning | not spawned}

{If unified blocker list is non-empty:}
### Blockers (require revision)

| Source | ID | Issue |
|--------|----|-------|
| checker | - | {checker issue description} |
| critic | plan-C-001 | {critical finding title} |

{If warning findings from plan-critic exist:}
### Warnings (logged, no revision required)

| ID | Finding | File |
|----|---------|------|
| plan-W-001 | {warning title} | {file reference} |
```

### Route Decision

- **Unified blocker list is empty:** Proceed to step 13 (done).
- **Unified blocker list has items:** Check iteration counts, proceed to step 12.

## 12. Revision Loop (Dual Counter with Circuit Breaker)

Track TWO separate counters:
- `plan_checker_iterations`: existing max 3 iterations (unchanged behavior)
- `plan_critic_cycles`: new max 2 cycles (circuit breaker per HOOK-06)

A plan-critic cycle is defined as: plan-critic found criticals → planner revised → plan-critic re-ran.
The plan_critic_cycles counter ONLY increments when the revision was triggered by plan-critic critical findings.

### Counter Logic

If the unified blocker list contains:
- **Only plan-checker issues:** Increment `plan_checker_iterations` only. This is the existing behavior.
- **Only plan-critic criticals:** Increment `plan_critic_cycles` only.
- **Both:** Increment BOTH counters.

### Circuit Breaker Check (HOOK-06)

**Before starting revision,** check if plan-critic circuit breaker has tripped:

If `plan_critic_cycles >= 2` AND unified blocker list still contains plan-critic criticals:

Display circuit breaker summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CIRCUIT BREAKER — Plan Critic (2/2 cycles)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remaining critical findings from plan-critic:

| ID | Finding | File |
|----|---------|------|
| plan-C-001 | {title} | {file} |
| plan-C-002 | {title} | {file} |
```

Use AskUserQuestion:
- header: "Circuit Breaker"
- question: "{N} critical finding(s) remain after 2 revision cycles. Accept as tech debt or do one more revision?"
- options:
  - "Accept as tech debt" — Log findings to STATE.md Pending Todos, continue without revision
  - "One more revision" — Allow one additional plan-critic cycle (user override)

**If "Accept as tech debt":**
- Remove plan-critic criticals from the unified blocker list
- Log each finding to STATE.md "Pending Todos" section:
  ```
  - [ ] [{finding_id}] {finding_title} (from Phase {N} plan-critic, accepted as tech debt {date})
  ```
- If remaining blocker list (plan-checker only) is empty: proceed to step 13
- If plan-checker issues remain: continue revision for plan-checker issues only

**If "One more revision":**
- Allow one more revision cycle (do NOT increment plan_critic_cycles — this is a user override)
- Continue normal revision flow below

### Existing Plan-Checker Max Iterations Check

If `plan_checker_iterations >= 3`:

Display: `Max iterations reached. {N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon

(This is the EXISTING behavior, unchanged.)

### Normal Revision Flow

If neither circuit breaker has tripped:

Display: `Sending back to planner for revision... (checker iteration {N}/3, critic cycle {M}/2)`

Re-spawn planner with combined issues (existing revision prompt plus plan-critic findings):

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision

**Existing plans:** {plans_content}
**Plan-checker issues:** {structured_issues_from_checker}
**Plan-critic critical findings:** {critical_findings_from_critic}

**Phase Context:**
Revisions MUST still honor user decisions.
{context_content}
</revision_context>

<instructions>
Make targeted updates to address ALL issues from both plan-checker and plan-critic.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read $HOME/.claude/agents/gsd-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns → re-spawn BOTH checker and critic in parallel (step 10), increment appropriate counters based on what triggered revision.

### Cycle Counter Persistence

Store the plan_critic_cycles counter in STATE.md for cross-context persistence:

At the start of plan-phase (step 1), read existing counter:
```bash
# Parse from STATE.md Circuit Breaker section if it exists
```

After each revision cycle completes, update STATE.md:
```
### Circuit Breaker
Phase {N} plan-critic cycles: {M}/2
```

When plan-phase completes successfully (step 13), clear the counter from STATE.md.

<completion_gate priority="before step 13">
**MANDATORY CHECK — Do NOT proceed to Present Final Status without verifying:**
- [ ] gsd-plan-checker was spawned (step 10) — unless `--skip-verify` or `plan_checker_enabled` is false
  - Results collected and acted on (revision loop or pass-through)
- [ ] Plan-critic spawn decision was made (step 9.5):
  - If auto_spawn=true: plan-critic was spawned in parallel with plan-checker in step 10, results parsed, critical findings merged into unified blocker list
  - If auto_spawn=false: `SPAWN_PLAN_CRITIC` set to false, logged as "Plan critic: not spawned (auto_spawn disabled)"
- [ ] Unified blocker list resolved: either empty (proceed) or all items handled via revision loop / circuit breaker / user override

Failure to execute the plan-critic spawn check (step 9.5) is a workflow violation — even when auto_spawn=false, the config MUST be read and the decision logged.
</completion_gate>

## 13. Present Final Status

Route to `<offer_next>` OR `auto_advance` depending on flags/config.

## 14. Auto-Advance Check

Check for auto-advance trigger:

1. Parse `--auto` flag from $ARGUMENTS
2. **Sync chain flag with intent** — if user invoked manually (no `--auto`), clear the ephemeral chain flag from any previous interrupted `--auto` chain. This does NOT touch `workflow.auto_advance` (the user's persistent settings preference):
   ```bash
   if [[ ! "$ARGUMENTS" =~ --auto ]]; then
     node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow._auto_chain_active false 2>/dev/null
   fi
   ```
3. Read both the chain flag and user preference:
   ```bash
   AUTO_CHAIN=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow._auto_chain_active 2>/dev/null || echo "false")
   AUTO_CFG=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CHAIN` is true OR `AUTO_CFG` is true:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► AUTO-ADVANCING TO EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plans ready. Launching execute-phase...
```

Launch execute-phase using the Skill tool to avoid nested Task sessions (which cause runtime freezes due to deep agent nesting):
```
Skill(skill="gsd:execute-phase", args="${PHASE} --auto --no-transition")
```

The `--no-transition` flag tells execute-phase to return status after verification instead of chaining further. This keeps the auto-advance chain flat — each phase runs at the same nesting level rather than spawning deeper Task agents.

**Handle execute-phase return:**
- **PHASE COMPLETE** → Display final summary:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GSD ► PHASE ${PHASE} COMPLETE ✓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Auto-advance pipeline finished.

  Next: /gsd:discuss-phase ${NEXT_PHASE} --auto
  ```
- **GAPS FOUND / VERIFICATION FAILED** → Display result, stop chain:
  ```
  Auto-advance stopped: Execution needs review.

  Review the output above and continue manually:
  /gsd:execute-phase ${PHASE}
  ```

**If neither `--auto` nor config enabled:**
Route to `<offer_next>` (existing behavior).

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/gsd:execute-phase {X}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase-dir}/*-PLAN.md — review plans
- /gsd:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] gsd-phase-researcher spawned with CONTEXT.md
- [ ] Existing plans checked
- [ ] gsd-planner spawned with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] gsd-plan-checker spawned with CONTEXT.md
- [ ] Plan-critic spawned when auto_spawn enabled
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] Circuit breaker respected at 2 cycles
- [ ] Tech debt logged to STATE.md when accepted
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>
