<purpose>

Start a new milestone cycle for an existing project. Loads project context, gathers milestone goals (from MILESTONE-CONTEXT.md or conversation), updates PROJECT.md and STATE.md, optionally runs parallel research, defines scoped requirements with REQ-IDs, spawns the roadmapper to create phased execution plan, and commits all artifacts. Brownfield equivalent of new-project.

</purpose>

<required_reading>

Read all files referenced by the invoking prompt's execution_context before starting.

</required_reading>

<process>

## 1. Load Context

- Read PROJECT.md (existing project, validated requirements, decisions)
- Read MILESTONES.md (what shipped previously)
- Read STATE.md (pending todos, blockers)
- Check for MILESTONE-CONTEXT.md (from /gsd:discuss-milestone)

## 2. Gather Milestone Goals

**If MILESTONE-CONTEXT.md exists:**
- Use features and scope from discuss-milestone
- Present summary for confirmation

**If no context file:**
- Present what shipped in last milestone
- Ask inline (freeform, NOT AskUserQuestion): "What do you want to build next?"
- Wait for their response, then use AskUserQuestion to probe specifics
- If user selects "Other" at any point to provide freeform input, ask follow-up as plain text — not another AskUserQuestion

## 3. Determine Milestone Version

- Parse last version from MILESTONES.md
- Suggest next version (v1.0 → v1.1, or v2.0 for major)
- Confirm with user

## 4. Update PROJECT.md

Add/update:

```markdown
## Current Milestone: v[X.Y] [Name]

**Goal:** [One sentence describing milestone focus]

**Target features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]
```

Update Active requirements section and "Last updated" footer.

## 5. Update STATE.md

```markdown
## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: [today] — Milestone v[X.Y] started
```

Keep Accumulated Context section from previous milestone.

## 6. Cleanup and Commit

Delete MILESTONE-CONTEXT.md if exists (consumed).

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: start milestone v[X.Y] [Name]" --files .planning/PROJECT.md .planning/STATE.md
```

## 7. Load Context and Resolve Models

```bash
INIT=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" init new-milestone)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `researcher_model`, `synthesizer_model`, `roadmapper_model`, `commit_docs`, `research_enabled`, `current_milestone`, `project_exists`, `roadmap_exists`.

**Scan researcher registry:**
```bash
RESEARCHERS=$(node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" researcher scan --raw 2>/dev/null || echo '{"count":0,"researchers":[]}')
```

Parse `RESEARCHERS` JSON for: `count`, `researchers` (array of `{name, output_file, description, file_path}` objects).

## 8. Research Decision

AskUserQuestion: "Research the domain ecosystem for new features before defining requirements?"
- "Research first (Recommended)" — Discover patterns, features, architecture for NEW capabilities
- "Skip research" — Go straight to requirements

**Persist choice to config** (so future `/gsd:plan-phase` honors it):

```bash
# If "Research first": persist true
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow.research true

# If "Skip research": persist false
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-set workflow.research false
```

**If "Research first":**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
mkdir -p .planning/research
```

### Step 8.1: Check Registry Availability

Check `researchers` from the researcher scan result.

**If `researchers` is empty** (directory doesn't exist OR no valid types found):

Display fallback notice:
```
○ Registry not found — using standard researchers.
  Tip: The researchers/ directory enables dynamic selection.
```

→ Go to **Step 8.5 (Legacy Fallback)**

**If `researchers` has entries:**

→ Continue to **Step 8.2 (AI Selection)**

### Step 8.2: AI-Powered Researcher Recommendation

Read config for `research.always_include` and `research.max_researchers`:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get research.always_include 2>/dev/null || echo "[]"
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" config-get research.max_researchers 2>/dev/null || echo "12"
```

Filter `always_include` against actual `researchers` names — silently drop any names that don't match a discovered type (config may reference types not yet installed).

**Build AI selection context from:**
- PROJECT.md summary (core value, constraints, existing validated requirements)
- Current milestone goals and target features
- What shipped in previous milestone (from MILESTONES.md)
- Codebase signals from init
- If codebase map exists: read `.planning/codebase/ARCHITECTURE.md` and `STACK.md` — **de-prioritize** stack/architecture researchers when existing stack/architecture is well-documented
- Available researcher types from `researchers` (name + description for each)
- `always_include` list from config (these get "high" relevance by default)

**Try AI recommendation.** Analyze the milestone context and available researcher types. Score each researcher's relevance (high/medium/low) and generate a 1-sentence rationale. Always-include types automatically receive "high" relevance. Consider what's already built — researchers for well-documented existing capabilities should be scored lower.

**If the AI recommendation step fails** (LLM timeout, unparseable response), **immediately fall back to manual catalog selection within this same step** (do NOT proceed to Step 8.3 or fall through to Step 8.5):

```
⚠ AI recommendation unavailable ({error reason}). Select manually:

Available researchers:
| # | Researcher | Description |
|---|------------|-------------|
| 1 | {name} | {description} |
| 2 | {name} | {description} |
| ... | ... | ... |
```

```
AskUserQuestion([
  {
    header: "Researchers",
    question: "Which researchers would you like to run? (e.g., 'stack, features, architecture')",
    multiSelect: false,
    options: [
      { label: "Core 4 (stack, features, architecture, pitfalls)", description: "Standard research set" },
      { label: "All available", description: "Run all {N} researchers" },
      { label: "Other", description: "Type researcher names (e.g., 'stack, features, security')" }
    ]
  }
])
```

If "Core 4": select stack, features, architecture, pitfalls (filter to only those that exist in `researchers`).
If "All available": select all discovered types (up to max cap).
If "Other" (free-text): parse names, apply the same parse-and-confirm pattern as Step 8.3.

After manual selection, skip to Step 8.3 validation checks then Step 8.4 (spawning).

**If AI recommendation succeeds**, present recommendation as a table:

```
## Recommended Researchers

Based on your milestone context, I recommend:

| # | Researcher | Relevance | Rationale |
|---|------------|-----------|-----------|
| 1 | {name} | High | [1-sentence rationale] |
| 2 | {name} | High | [1-sentence rationale] |
| 3 | {name} | Medium | [1-sentence rationale] |
| 4 | {name} | Medium | [1-sentence rationale] |

### Full Catalog

Also available (not recommended for this milestone):
- **{type-name}** — {description}
- **{type-name}** — {description}
```

→ Continue to Step 8.3

### Step 8.3: User Confirmation (with parse-and-confirm loop)

Ask "Add or remove any?" using AskUserQuestion with single-select (NOT multiSelect):

```
AskUserQuestion([
  {
    header: "Researchers",
    question: "Add or remove any researchers? (e.g., 'add security, remove pitfalls')",
    multiSelect: false,
    options: [
      { label: "Looks good", description: "Use the recommended set" },
      { label: "Other", description: "Type your changes (e.g., 'add security, remove pitfalls')" }
    ]
  }
])
```

**If "Looks good":** Use recommended set as-is. → Go to validation checks below.

**If "Other" (free-text):** Enter parse-and-confirm loop:

```
LOOP:
  1. Parse additions and removals from free-text

  2. **Unknown researcher name detection (REG-04):**
     If a name doesn't match any type in researchers:

     I don't see a "{name}" researcher type yet. Would you like to:

     AskUserQuestion([
       {
         header: "New Type",
         question: "Create a custom '{name}' researcher?",
         multiSelect: false,
         options: [
           { label: "Create it now", description: "I'll guide you through a 4-question setup (takes ~2 minutes)" },
           { label: "Skip it", description: "Continue without {name} research" }
         ]
       }
     ])

     If "Create it now": Run guided creation flow:
       Q1: "What should this researcher's output file be named? (e.g., SECURITY.md)"
           Default: uppercased name + .md
       Q2: "What should this researcher investigate?"
           Show examples relevant to the name
       Q3: "How will this research be used? (downstream consumer)"
           Show examples
       Q4: "What makes this research high-quality? (List 3 checkboxes)"
           Show examples

       Write type file to: ~/.claude/get-shit-done/researchers/custom/{name}.md
       (Use _template.md format: frontmatter with name, output_file, description + <prompt_template> + <output_template>)

       Display: ✓ Created: ~/.claude/get-shit-done/researchers/custom/{name}.md
       Add to current selection and researchers.

     If "Skip it": Remove that name from the additions.

  3. Show interpretation:
     "I understood: add {X}, remove {Y}. Updated set: [{list}]"
     "Correct?"

  4. AskUserQuestion([
       {
         header: "Confirm",
         question: "Is this correct?",
         multiSelect: false,
         options: [
           { label: "Yes", description: "Proceed with this set" },
           { label: "No, let me clarify", description: "I'll re-enter my changes" }
         ]
       }
     ])

  5. If "Yes": exit loop with confirmed set
  6. If "No, let me clarify": return to top of loop — show current set again
     and re-prompt with same AskUserQuestion ("Looks good" / "Other")
```

**Validation checks (after confirmation):**

- If count > `config.research.max_researchers` (default 12): "Error: {N} researchers selected (max: {max}). Remove at least {N - max}." Loop back to "Add or remove?" prompt.
- If count == 1: "Warning: Only 1 researcher selected — synthesis will be limited." Show AskUserQuestion: "Continue with 1?" / "Select more". If "Select more": loop back.
- If count == 0: "Warning: No researchers selected." Show AskUserQuestion: "Skip research entirely?" / "Select researchers". If "Select researchers": loop back.
- Validate each selected type file: check frontmatter has name, output_file, description and prompt_template exists. If invalid: "Error: Type file {name} has invalid format: {errors}. Fix or remove it." Hard error — don't continue until fixed or removed.

### Step 8.4: Dynamic Spawning in Waves of 4

For each selected researcher, load the full type file to get its prompt_template:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" researcher load {name}
```

Build Task() prompt from the type file's prompt_template:
- Replace `{DOMAIN}` with project domain (from PROJECT.md)
- Replace `{MILESTONE_CONTEXT}` with: `SUBSEQUENT MILESTONE — Adding [target features] to existing app. Existing validated capabilities (DO NOT re-research): [from PROJECT.md].`
- Replace `{RESEARCH_QUESTION}` with dimension-appropriate question (from prompt_template)
- Replace `{PROJECT_CONTEXT}` with PROJECT.md summary including current milestone goals
- Set output path: `.planning/research/{output_file}`
- Use template: `~/.claude/get-shit-done/templates/research-project/{output_file}` (if it exists, otherwise let researcher create from output_template in type file)

Batch into waves of 4:

```
wave_size = 4
waves = chunk(selected_researchers, wave_size)
total_waves = len(waves)

for i, wave in enumerate(waves):
  Display:
  ◆ Spawning wave {i+1} of {total_waves}...
    → {researcher.name} research
    → {researcher.name} research
    → {researcher.name} research
    → {researcher.name} research

  Spawn all researchers in this wave as parallel Task() calls:

  Task(prompt="First, read $HOME/.claude/agents/gsd-project-researcher.md for your role and instructions.

  <research_type>
  Project Research — {researcher.name} dimension for [new features].
  </research_type>

  <milestone_context>
  SUBSEQUENT MILESTONE — Adding [target features] to existing app.
  {existing_context_from_project_md}
  Focus ONLY on what's needed for the NEW features.
  </milestone_context>

  {researcher.prompt_template with variables substituted}

  <output>
  Write to: .planning/research/{researcher.output_file}
  Use template (if exists): ~/.claude/get-shit-done/templates/research-project/{researcher.output_file}
  </output>
  ", subagent_type="gsd-project-researcher", model="{researcher_model}", description="{researcher.name} research")

  Wait for all tasks in wave to complete.

  Display wave report:
  ✓ Wave {i+1} complete: {researcher1.name} ✓, {researcher2.name} ✓, ...

  **Error handling per wave:**

  If 1 researcher fails:
    Display:
    ⚠ Researcher Failed: {name}
    Error: {error_message}

    AskUserQuestion([
      {
        header: "Failed",
        question: "Researcher '{name}' failed. What would you like to do?",
        multiSelect: false,
        options: [
          { label: "Retry", description: "Re-spawn the failed researcher" },
          { label: "Skip", description: "Continue without this researcher's output" },
          { label: "Abort", description: "Stop research entirely" }
        ]
      }
    ])

  If ALL researchers in wave fail:
    Display:
    ❌ Wave {i+1} Failed — all {wave_size} researchers failed.

    AskUserQuestion([
      {
        header: "Wave Failed",
        question: "All researchers in this wave failed. What would you like to do?",
        multiSelect: false,
        options: [
          { label: "Retry wave", description: "Wait and retry all researchers in this wave" },
          { label: "Select different", description: "Return to researcher selection" },
          { label: "Continue without research", description: "Skip remaining research, proceed to requirements" }
        ]
      }
    ])

    If "Select different": return to Step 8.3 user confirmation with current selection displayed.
```

**After all waves complete:** Continue to the synthesizer step below.

### Step 8.5: Legacy Fallback

**This path is only reached when `researchers` is empty (Step 8.1).**

```
◆ Spawning 4 researchers in parallel...
  → Stack, Features, Architecture, Pitfalls
```

Spawn 4 parallel gsd-project-researcher agents. Each uses this template with dimension-specific fields:

**Common structure for all 4 researchers:**
```
Task(prompt="
<research_type>Project Research — {DIMENSION} for [new features].</research_type>

<milestone_context>
SUBSEQUENT MILESTONE — Adding [target features] to existing app.
{EXISTING_CONTEXT}
Focus ONLY on what's needed for the NEW features.
</milestone_context>

<question>{QUESTION}</question>

<files_to_read>
- .planning/PROJECT.md (Project context)
</files_to_read>

<downstream_consumer>{CONSUMER}</downstream_consumer>

<quality_gate>{GATES}</quality_gate>

<output>
Write to: .planning/research/{FILE}
Use template: ~/.claude/get-shit-done/templates/research-project/{FILE}
</output>
", subagent_type="gsd-project-researcher", model="{researcher_model}", description="{DIMENSION} research")
```

**Dimension-specific fields:**

| Field | Stack | Features | Architecture | Pitfalls |
|-------|-------|----------|-------------|----------|
| EXISTING_CONTEXT | Existing validated capabilities (DO NOT re-research): [from PROJECT.md] | Existing features (already built): [from PROJECT.md] | Existing architecture: [from PROJECT.md or codebase map] | Focus on common mistakes when ADDING these features to existing system |
| QUESTION | What stack additions/changes are needed for [new features]? | How do [target features] typically work? Expected behavior? | How do [target features] integrate with existing architecture? | Common mistakes when adding [target features] to [domain]? |
| CONSUMER | Specific libraries with versions for NEW capabilities, integration points, what NOT to add | Table stakes vs differentiators vs anti-features, complexity noted, dependencies on existing | Integration points, new components, data flow changes, suggested build order | Warning signs, prevention strategy, which phase should address it |
| GATES | Versions current (verify with Context7), rationale explains WHY, integration considered | Categories clear, complexity noted, dependencies identified | Integration points identified, new vs modified explicit, build order considers deps | Pitfalls specific to adding these features, integration pitfalls covered, prevention actionable |
| FILE | STACK.md | FEATURES.md | ARCHITECTURE.md | PITFALLS.md |

### Step 8.6: Synthesize Research

**This step runs after either Step 8.4 (dynamic) or Step 8.5 (legacy fallback).**

After all researchers complete, read and validate research files, then spawn synthesizer with inlined content:

**Pre-flight validation:** Before building the synthesizer prompt, read each research output file and verify it exists and is non-empty. For the dynamic path, the files are determined by the selected researchers' `output_file` fields. For the legacy path, the files are STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

```
For each selected researcher:
  Read .planning/research/{researcher.output_file} → ${FILE_CONTENT}
```

If any file is missing or empty, fail with clear error:
```
Error: Research file missing or empty: .planning/research/{FILE}.md
All research files must exist before synthesis. Check researcher agent output.
```

**Build synthesizer prompt with inlined content:**
```
Task(prompt="First, read the gsd-research-synthesizer agent file for your role and instructions.

<research_files>

<research_file name="{output_file_1}">
{content of .planning/research/{output_file_1}}
</research_file>

<research_file name="{output_file_2}">
{content of .planning/research/{output_file_2}}
</research_file>

...repeat for each research file...

</research_files>

<output>
Write to: .planning/research/SUMMARY.md
Commit all research files in .planning/research/ after writing.
</output>
", subagent_type="gsd-research-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

**Handle contradiction return from synthesizer:**

After synthesizer returns, check for `<contradictions>` block in the return:

- **If no contradictions:** Proceed normally.
- **If contradictions detected:** Show each to user via AskUserQuestion and resolve.
  Track synthesis count — max 2 total (initial + 1 re-synthesis).

Display key findings from SUMMARY.md:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCH COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Stack additions:** [from SUMMARY.md]
**Feature table stakes:** [from SUMMARY.md]
**Watch Out For:** [from SUMMARY.md]
```

**If "Skip research":** Continue to Step 9.

## 9. Define Requirements

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEFINING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Read PROJECT.md: core value, current milestone goals, validated requirements (what exists).

**If research exists:** Read FEATURES.md, extract feature categories.

Present features by category:
```
## [Category 1]
**Table stakes:** Feature A, Feature B
**Differentiators:** Feature C, Feature D
**Research notes:** [any relevant notes]
```

**If no research:** Gather requirements through conversation. Ask: "What are the main things users need to do with [new features]?" Clarify, probe for related capabilities, group into categories.

**Scope each category** via AskUserQuestion (multiSelect: true, header max 12 chars):
- "[Feature 1]" — [brief description]
- "[Feature 2]" — [brief description]
- "None for this milestone" — Defer entire category

Track: Selected → this milestone. Unselected table stakes → future. Unselected differentiators → out of scope.

**Identify gaps** via AskUserQuestion:
- "No, research covered it" — Proceed
- "Yes, let me add some" — Capture additions

**Generate REQUIREMENTS.md:**
- v1 Requirements grouped by category (checkboxes, REQ-IDs)
- Future Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, NOTIF-02). Continue numbering from existing.

**Requirement quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

Present FULL requirements list for confirmation:

```
## Milestone v[X.Y] Requirements

### [Category 1]
- [ ] **CAT1-01**: User can do X
- [ ] **CAT1-02**: User can do Y

### [Category 2]
- [ ] **CAT2-01**: User can do Z

Does this capture what you're building? (yes / adjust)
```

If "adjust": Return to scoping.

**Commit requirements:**
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: define milestone v[X.Y] requirements" --files .planning/REQUIREMENTS.md
```

## 10. Create Roadmap

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CREATING ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning roadmapper...
```

**Starting phase number:** Read MILESTONES.md for last phase number. Continue from there (v1.0 ended at phase 5 → v1.1 starts at phase 6).

```
Task(prompt="
<planning_context>
<files_to_read>
- .planning/PROJECT.md
- .planning/REQUIREMENTS.md
- .planning/research/SUMMARY.md (if exists)
- .planning/config.json
- .planning/MILESTONES.md
</files_to_read>
</planning_context>

<instructions>
Create roadmap for milestone v[X.Y]:
1. Start phase numbering from [N]
2. Derive phases from THIS MILESTONE's requirements only
3. Map every requirement to exactly one phase
4. Derive 2-5 success criteria per phase (observable user behaviors)
5. Validate 100% coverage
6. Write files immediately (ROADMAP.md, STATE.md, update REQUIREMENTS.md traceability)
7. Return ROADMAP CREATED with summary

Write files first, then return.
</instructions>
", subagent_type="gsd-roadmapper", model="{roadmapper_model}", description="Create roadmap")
```

**Handle return:**

**If `## ROADMAP BLOCKED`:** Present blocker, work with user, re-spawn.

**If `## ROADMAP CREATED`:** Read ROADMAP.md, present inline:

```
## Proposed Roadmap

**[N] phases** | **[X] requirements mapped** | All covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| [N] | [Name] | [Goal] | [REQ-IDs] | [count] |

### Phase Details

**Phase [N]: [Name]**
Goal: [goal]
Requirements: [REQ-IDs]
Success criteria:
1. [criterion]
2. [criterion]
```

**Ask for approval** via AskUserQuestion:
- "Approve" — Commit and continue
- "Adjust phases" — Tell me what to change
- "Review full file" — Show raw ROADMAP.md

**If "Adjust":** Get notes, re-spawn roadmapper with revision context, loop until approved.
**If "Review":** Display raw ROADMAP.md, re-ask.

**Commit roadmap** (after approval):
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs: create milestone v[X.Y] roadmap ([N] phases)" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
```

## 11. Done

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MILESTONE INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone v[X.Y]: [Name]**

| Artifact       | Location                    |
|----------------|-----------------------------|
| Project        | `.planning/PROJECT.md`      |
| Research       | `.planning/research/`       |
| Requirements   | `.planning/REQUIREMENTS.md` |
| Roadmap        | `.planning/ROADMAP.md`      |

**[N] phases** | **[X] requirements** | Ready to build ✓

## ▶ Next Up

**Phase [N]: [Phase Name]** — [Goal]

`/gsd:discuss-phase [N]` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

Also: `/gsd:plan-phase [N]` — skip discussion, plan directly
```

</process>

<success_criteria>
- [ ] PROJECT.md updated with Current Milestone section
- [ ] STATE.md reset for new milestone
- [ ] MILESTONE-CONTEXT.md consumed and deleted (if existed)
- [ ] Research completed (if selected) — dynamic researcher selection with registry, or legacy 4-researcher fallback, milestone-aware
- [ ] Requirements gathered and scoped per category
- [ ] REQUIREMENTS.md created with REQ-IDs
- [ ] gsd-roadmapper spawned with phase numbering context
- [ ] Roadmap files written immediately (not draft)
- [ ] User feedback incorporated (if any)
- [ ] ROADMAP.md phases continue from previous milestone
- [ ] All commits made (if planning docs committed)
- [ ] User knows next step: `/gsd:discuss-phase [N]`

**Atomic commits:** Each phase commits its artifacts immediately.
</success_criteria>
