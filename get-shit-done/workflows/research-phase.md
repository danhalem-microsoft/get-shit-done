<purpose>
Research how to implement a phase. Spawns gsd-phase-researcher with phase context.

Standalone research command. For most workflows, use `/gsd-plan-phase` which integrates research automatically.
</purpose>

<available_agent_types>
- gsd-phase-researcher: Researches implementation approach for a specific phase
- gsd-research-synthesizer: Combines parallel researcher outputs into unified SUMMARY.md
</available_agent_types>

<process>

## Step 0: Resolve Model Profile

@~/.claude/get-shit-done/references/model-profile-resolution.md

Resolve model for:
- `gsd-phase-researcher`
- `gsd-research-synthesizer`

## Step 1: Normalize and Validate Phase

@~/.claude/get-shit-done/references/phase-argument-parsing.md

```bash
PHASE_INFO=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap get-phase "${PHASE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls ${planning_root}/phases/${PHASE}-*/RESEARCH.md 2>/dev/null
```

If exists: Offer update/view/skip options.

## Step 3: Gather Phase Context

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init phase-op "${PHASE}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
# Extract: phase_dir, padded_phase, phase_number, state_path, requirements_path, context_path
```

## Step 4: Handle Research

First, call init to get researcher registry and phase context:
```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init plan-phase "${PHASE}" --include context,research,requirements)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```
Parse `researcher_types`, `research_config`, `context_content`, `requirements_content` from INIT JSON.

### Step 4.1: Check Registry Availability

Check `researcher_types` from init JSON.
- If `researcher_types` is empty: display "○ Registry not found — using standard researcher." → Go to Step 4.5 (Legacy Fallback).
- If `researcher_types` has entries: → Continue to Step 4.2.

### Step 4.2: AI-Powered Phase Researcher Recommendation

Read config.json for `research.always_include` and `research.max_researchers` (via `research_config` from init — defaults: max_researchers=12, always_include=[]).
Filter `always_include` against actual `researcher_types` names — silently drop unmatched.

Build phase-specific AI selection context from PHASE-ONLY artifacts (no PROJECT.md or milestone goals):
- Phase goal from ROADMAP `get-phase` section (already loaded in PHASE_INFO from Step 1)
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

**If AI recommendation fails** (LLM timeout, unparseable response): immediately fall back to manual catalog selection within the same step (do NOT proceed to Step 4.3 or fall through to Step 4.5):
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
- 0 relevant: default to `phase-research` type (always-relevant fallback). Display: "No specific types recommended — defaulting to standard phase-research." Skip to Step 4.4.
- 1 relevant: auto-select without showing recommendation UX. Display:
  ```
  AI recommends 1 researcher for this phase:
    → {type.name}: {rationale}

  Auto-selecting (only 1 relevant type).
  ```
  Skip to Step 4.4.
- 2+ relevant: show full recommendation table + "Also available" catalog. Continue to Step 4.3.

### Step 4.3: User Confirmation (only if 2+ types recommended)

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

### Step 4.4: Dynamic Spawning

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
    IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /gsd-discuss-phase.
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
- ALL researchers in wave fail: AskUserQuestion — Retry wave / Select different (returns to Step 4.3) / Continue without research
- Total failure (all researchers across all waves fail): halt and ask user what to do — do NOT silently fall back or skip

After all waves complete:

**Pre-flight validation:** Read each per-type output file, verify exists and non-empty. Exclude missing/empty from synthesis. If 0 files have content: skip synthesis, handle missing research gracefully.

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

Handle synthesizer return: display confirmation, continue to Step 5.

### Step 4.5: Legacy Fallback (exact current behavior when registry absent)

Display notice: "○ Registry not found — using standard researcher."

```
Task(
  prompt="<objective>
Research implementation approach for Phase {phase}: {name}
</objective>

<files_to_read>
- {context_path} (USER DECISIONS from /gsd-discuss-phase)
- {requirements_path} (Project requirements)
- {state_path} (Project decisions and history)
</files_to_read>

<additional_context>
Phase description: {description}
</additional_context>

<output>
Write to: ${planning_root}/phases/${PHASE}-{slug}/${PHASE}-RESEARCH.md
</output>",
  subagent_type="gsd-phase-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — Display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>
