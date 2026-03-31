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
mkdir -p "${planning_root}/phases/${padded_phase}-${phase_slug}"
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

**Existing research check (before Step 5.1):**

When `has_research` is true (from init) AND no `--research` flag:
- If `researcher_types` from init is non-empty (registry exists): offer choice via AskUserQuestion with header "Research", question "Phase {X} already has RESEARCH.md. Dynamic researcher selection is available.", options: "Use existing" (description: "Continue with current research") / "Re-research" (description: "Run dynamic researcher selection for this phase"). If "Use existing": skip to step 6. If "Re-research": continue to Step 5.1.
- If `researcher_types` is empty (no registry): use existing research, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 5.1: Check Registry Availability

Check `researcher_types` from init JSON.
- If `researcher_types` is empty: display notice "○ Registry not found — using standard researcher." → Go to Step 5.5 (Legacy Fallback).
- If `researcher_types` has entries: → Continue to Step 5.2 (AI Selection).

### Step 5.2: AI-Powered Phase Researcher Recommendation

Read config.json for `research.always_include` and `research.max_researchers` (via `research_config` from init — defaults: max_researchers=12, always_include=[]).
Filter `always_include` against actual `researcher_types` names — silently drop unmatched.

Build phase-specific AI selection context from PHASE-ONLY artifacts (no PROJECT.md or milestone goals):
- Phase goal from ROADMAP `get-phase` section
- CONTEXT.md decisions (`context_content` from init — if null, include note: "No CONTEXT.md — research from phase goal + requirements only")
- Phase requirement IDs and descriptions
- Prior research from earlier phases: read up to 3 most recent prior phases' RESEARCH.md Summary sections (use Glob to find `*-RESEARCH.md` in earlier phase directories, extract just the Summary section, inline as brief cross-reference context)
- Available researcher types: full catalog from `researcher_types` (name + description for each)
- `always_include` list (these get high relevance by default)

AI selection prompt (generate recommendation by analyzing phase context against all types):
```
You are selecting which researchers to run for Phase {phase_number}: {phase_name}.

<phase_goal>
{phase description from ROADMAP section}
</phase_goal>

<phase_decisions>
{context_content if exists, else "No CONTEXT.md available — use phase goal and requirements for selection."}
</phase_decisions>

<phase_requirements>
Requirements this phase addresses:
{phase_req_ids with descriptions from requirements_content}
</phase_requirements>

<prior_research>
{Inlined Summary sections from up to 3 prior phases' RESEARCH.md files, prefixed with phase name}
</prior_research>

<available_researchers>
{Full type catalog — name + description for each type in researcher_types}
</available_researchers>

<instructions>
Recommend researchers for this specific PHASE (not the overall project).

Phase research focuses on HOW TO IMPLEMENT this phase:
- Technical patterns and approaches for the phase's specific work
- Libraries/tools needed for THIS phase's deliverables
- Common mistakes when implementing THIS type of change
- Architecture considerations specific to THIS phase's scope

For each type, assess relevance to THIS PHASE specifically:
- HIGH: Directly addresses the phase's core technical challenge
- MEDIUM: Provides useful supporting context for the phase
- LOW: Not relevant to this phase (exclude from recommendations)

Return ONLY types with HIGH or MEDIUM relevance.
If no types are relevant, return empty list (orchestrator will default to phase-research.md).
If only 1 type is clearly relevant, return just that 1 type.
Phase research is naturally scoped — 1-3 types is typical.
</instructions>
```

For each type, assign relevance (High/Medium/Low) and 1-sentence rationale.

**If AI recommendation fails** (LLM timeout, unparseable response): immediately fall back to manual catalog selection within the same step (do NOT proceed to Step 5.3 or fall through to Step 5.5):
```
⚠ AI recommendation unavailable ({error reason}). Select manually:

Available researchers:
| # | Researcher | Description |
|---|------------|-------------|
| 1 | {type.name} | {type.description} |
...

AskUserQuestion: header "Researchers", question "Which researchers for this phase? (e.g., 'phase-research, stack')", options: "phase-research only" (Standard phase research) / "All available" (Run all {N}) / "Other" (Type names)
```

**Apply auto-select rule based on count of recommended types:**
- 0 relevant: default to `phase-research` type (always-relevant fallback). Display: "No specific types recommended — defaulting to standard phase-research." Skip to Step 5.4.
- 1 relevant: auto-select without showing recommendation UX. Display:
  ```
  AI recommends 1 researcher for this phase:
    → {type.name}: {rationale}

  Auto-selecting (only 1 relevant type).
  ```
  Skip to Step 5.4.
- 2+ relevant: show full recommendation table + "Also available" catalog. Continue to Step 5.3.

### Step 5.3: User Confirmation (only if 2+ types recommended)

Present recommendation table:
```
## Recommended Researchers

Based on this phase's context, I recommend:

| # | Researcher | Relevance | Rationale |
|---|------------|-----------|-----------|
| 1 | {name} | High | {rationale} |
| 2 | {name} | Medium | {rationale} |

### Also Available
- **{name}** — {description}
```

AskUserQuestion: header "Researchers", question "Add or remove any researchers? (e.g., 'add stack, remove pitfalls')", single-select options: "Looks good" (Use the recommended set) / "Other" (Type your changes).

If "Looks good": use recommended set as-is → validation checks.
If "Other" (free-text): enter parse-and-confirm loop:
```
LOOP:
  1. Parse additions and removals
  2. Show interpretation: "I understood: {changes}. Updated set: [{names}]"
  3. AskUserQuestion: "Is this correct?" — "Yes" / "No, let me clarify"
  4. If "Yes": exit loop
  5. If "No, let me clarify": return to top of loop
```

REG-04 unknown name detection: if a name doesn't match any type in `researcher_types`, trigger guided custom researcher creation flow (exact same 4-question pattern from new-project.md Step 6.3 — output file, research question, downstream consumer, quality gates → write to `~/.claude/get-shit-done/researchers/custom/{name}.md` → add to selection → return to confirmation loop).

Validation checks (after confirmation):
- Count > max_researchers: error, loop back
- Count == 1: warning "Only 1 researcher selected — synthesis will be limited." AskUserQuestion: "Continue with 1?" / "Select more"
- Count == 0: warning. AskUserQuestion: "Skip research entirely?" / "Select researchers"
- Validate each type file: check frontmatter (name, output_file, description) and prompt_template exists. If invalid: hard error with fix instructions.

### Step 5.4: Dynamic Spawning

For each selected researcher, build Task() prompt from the type file's `prompt_template`.

**CRITICAL — Phase-specific variable substitution.** Phase researchers use a DIFFERENT variable set than project researchers. Map accordingly:

For the `phase-research.md` type (uses native phase variables):
- `{CONTEXT_CONTENT}` → `context_content` from init
- `{PHASE_DESCRIPTION}` → phase description from ROADMAP section
- `{PHASE_REQ_IDS}` → parsed from roadmap requirements line
- `{REQUIREMENTS}` → `requirements_content` from init
- `{DECISIONS}` → state-snapshot decisions
- `{DATE}` → current date

For ALL OTHER type files (project-oriented types that use project variables):
- `{DOMAIN}` → Phase goal domain extracted from phase description
- `{MILESTONE_CONTEXT}` → "Phase implementation context: {phase_name}. Goal: {phase goal from ROADMAP}."
- `{RESEARCH_QUESTION}` → Auto-generated: "What {type.name} considerations are needed for implementing {phase deliverables}?"
- `{PROJECT_CONTEXT}` → "Phase {X}: {phase_name}. Requirements: {phase_req_ids}. Decisions: {context_content summary}."
- Unfillable variables → replace with empty string (not literal placeholder text)

Output path for each researcher: `{phase_dir}/{padded_phase}-{type_name}-RESEARCH.md`

Batch into waves of 4:
```
wave_size = 4
waves = chunk(selected_researchers, wave_size)
total_waves = len(waves)

for i, wave in enumerate(waves):
  Display:
  ◆ Spawning wave {i+1} of {total_waves}...
    → {researcher.name} research
    ...

  Spawn all in wave as parallel Task() calls:
  Task(
    prompt="First, read $HOME/.claude/agents/gsd-phase-researcher.md for your role and instructions.

    <research_type>
    Phase Research — {researcher.name} dimension for Phase {phase_number}: {phase_name}.
    </research_type>

    <phase_context>
    IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /gsd:discuss-phase.
    - **Decisions** = Locked — research THESE deeply, no alternatives
    - **Claude's Discretion** = Freedom areas — research options, recommend
    - **Deferred Ideas** = Out of scope — ignore

    {context_content}
    </phase_context>

    {researcher.prompt_template with phase variables substituted}

    <output>
    Write to: {phase_dir}/{padded_phase}-{type_name}-RESEARCH.md
    </output>
    ",
    subagent_type="general-purpose",
    model="{researcher_model}",
    description="{researcher.name} research for Phase {phase}"
  )

  Wait for all in wave.

  Display wave report:
  ✓ Wave {i+1} complete: {name} ✓, ...
```

Error handling per wave:
- 1 researcher fails: AskUserQuestion — Retry / Skip / Abort
- ALL researchers in wave fail: AskUserQuestion — Retry wave / Select different (returns to Step 5.3) / Continue without research
- Total failure (all researchers across all waves fail): halt and ask user what to do — do NOT silently fall back or skip

After all waves complete:

**Pre-flight validation:** Read each per-type output file, verify exists and non-empty. Exclude missing/empty from synthesis. If 0 files have content: skip synthesis, planner handles missing research gracefully.

**If 1 researcher completed (single-researcher fast path):**
Copy the per-type file to the final RESEARCH.md:
```bash
cp "${PHASE_DIR}/${PADDED_PHASE}-${type_name}-RESEARCH.md" "${PHASE_DIR}/${PADDED_PHASE}-RESEARCH.md"
```
Display: "Single researcher — using output directly (no synthesis needed)."
Per-type file kept for reference.

**If 2+ researchers completed:**
Build phase-specific synthesizer prompt with inlined content:
```
Task(
  prompt="First, read $HOME/.claude/agents/gsd-research-synthesizer.md for your role.

  <synthesis_context>
  You are synthesizing phase-level research for Phase {phase_number}: {phase_name}.
  This is NOT a project-level ecosystem summary. This is implementation-focused research
  for a SINGLE PHASE consumed by the planner.

  Produce a single RESEARCH.md integrating findings from {N} research files.

  The output MUST follow standard phase RESEARCH.md structure:
  - Summary (executive overview of implementation approach)
  - Standard Stack (libraries/tools needed for THIS phase)
  - Architecture Patterns (patterns applicable to THIS phase's work)
  - Don't Hand-Roll (existing solutions relevant to THIS phase)
  - Common Pitfalls (mistakes relevant to THIS phase)
  - Code Examples (verified patterns for THIS phase)
  - Open Questions (unresolved gaps)
  - Sources (research provenance)
  </synthesis_context>

  <research_files>
  <research_file name=\"{padded_phase}-{type1_name}-RESEARCH.md\">
  {content of per-type file 1}
  </research_file>
  <research_file name=\"{padded_phase}-{type2_name}-RESEARCH.md\">
  {content of per-type file 2}
  </research_file>
  <!-- one block per completed research file -->
  </research_files>

  <output>
  Write to: {phase_dir}/{padded_phase}-RESEARCH.md
  </output>
  ",
  subagent_type="gsd-research-synthesizer",
  model="{researcher_model}",
  description="Synthesize Phase {phase} research"
)
```

Partial success: synthesize from whatever researchers completed successfully.

Handle synthesizer return: display confirmation, continue to step 6.

### Step 5.5: Legacy Fallback (exact current behavior when registry absent)

Display notice: "○ Registry not found — using standard researcher."

```bash
PHASE_DESC=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "${PHASE}" | jq -r '.section')
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
PHASE_REQ_IDS=$(echo "$INIT" | jq -r '.roadmap_content // empty' | grep -i "Requirements:" | head -1 | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
STATE_SNAP=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" state-snapshot)
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
  prompt="First, read $HOME/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
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
Produce CRITIQUE-plan.md following ${planning_root}/critique-template.md format.
</objective>

<files_to_read>
Read these files at start using the Read tool:
- Phase directory contents: {phase_dir}/ (list with Glob, then read PLANs, CONTEXT, RESEARCH)
- Roadmap: ${planning_root}/ROADMAP.md
- Requirements: ${planning_root}/REQUIREMENTS.md
- Severity ref: ${planning_root}/severity-reference.md
- Critique template: ${planning_root}/critique-template.md
- Project context: ${planning_root}/codebase/ARCHITECTURE.md, CONVENTIONS.md, STACK.md (if they exist)
</files_to_read>

<output>
Write your critique report to: {phase_dir}/CRITIQUE-plan.md
Follow ${planning_root}/critique-template.md format EXACTLY.
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
- cat ${planning_root}/phases/{phase-dir}/*-PLAN.md — review plans
- /gsd:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] ${planning_root}/ directory validated
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
- [ ] Dynamic researcher selection used when registry available
</success_criteria>
